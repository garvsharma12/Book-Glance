import { db } from './db.js';
import { bookCache, type BookCache } from '../shared/schema.js';
import { eq, and, or, sql, lte, isNotNull, not, isNull } from 'drizzle-orm';
import { getEstimatedBookRating } from './utils/book-utils.js';
import { log } from './simple-logger.js';
import OpenAI from 'openai';
import { generateGeminiRating, generateGeminiSummary } from './utils/gemini-utils.js';
import { rateLimiter } from './rate-limiter.js';
import { storage } from './storage.js';

// Lazy OpenAI client creator (optional fallback when Gemini unavailable)
function getOpenAI(): OpenAI | null {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    return new OpenAI({ apiKey: key, maxRetries: 2, timeout: 15000 });
  } catch {
    return null;
  }
}

// Cache expiration durations (ms)
const DAY = 24 * 60 * 60 * 1000;
const CACHE_DURATION = {
  GOOGLE: 365 * DAY,
  AMAZON: 180 * DAY,
  OPENAI: 365 * DAY,
} as const;
const DEFAULT_EXPIRATION = 180 * DAY;

export class BookCacheService {
  // Lookups (delegate to storage for consistency)
  async findInCache(title: string, author: string): Promise<BookCache | undefined> {
    return storage.findBookInCache(title, author);
  }
  async findByISBN(isbn: string): Promise<BookCache | undefined> {
    return storage.findBookByISBN(isbn);
  }
  async cacheBook(bookData: any): Promise<BookCache> {
    // Delegate to storage (handles id/source/expiry defaults)
    return storage.cacheBook(bookData);
  }

  // Remove expired entries
  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date();
      const result = await db.delete(bookCache).where(lte(bookCache.expiresAt, now)).returning();
      const count = result.length;
      if (count > 0) log(`Removed ${count} expired entries from book cache`, 'cache');
      return count;
    } catch (error) {
      log(`Error cleaning up expired cache: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }

  // Generate or fetch enhanced summary (Gemini-first; OpenAI fallback if configured)
  async getEnhancedSummary(title: string, author: string, existingSummary?: string): Promise<string | null> {
    try {
      // Prefer cached LLM summary
      const cached = await this.findInCache(title, author);
      if (cached?.summary && cached.source === 'openai') {
        log(`Using cached LLM summary for "${title}"`, 'cache');
        return cached.summary;
      }

      // Try Gemini first
      let summary = await generateGeminiSummary(title, author);

      // Optional OpenAI fallback (respect rate limit only if we actually call it)
      if (!summary) {
        const client = getOpenAI();
        if (client) {
          if (!(await rateLimiter.checkAndIncrement('openai'))) {
            log('Rate limit reached for OpenAI, skipping summary generation', 'cache');
          } else {
            log(`Generating summary via OpenAI for "${title}"`, 'cache');
            try {
              const resp = await client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: 'You are a literary expert providing engaging book summaries. Craft a concise 3-4 sentence summary that captures the essence of the book, its main themes, and what makes it notable. Be informative yet brief.' },
                  { role: 'user', content: `Summarize the book "${title}" by ${author} in 3-4 sentences. Avoid spoilers.` },
                ],
                max_tokens: 220,
                temperature: 0.6,
              });
              summary = resp.choices?.[0]?.message?.content?.trim() || null;
            } catch (e) {
              log(`OpenAI summary error: ${e instanceof Error ? e.message : String(e)}`, 'cache');
            }
          }
        }
      }

      // If nothing, fall back to provided summary if any
      summary = summary || existingSummary || null;

      if (summary) {
        const expiresAt = new Date(Date.now() + 120 * DAY);
        await this.cacheBook({ title: title.trim(), author: author.trim(), summary, source: 'openai', expiresAt });
        log(`Cached summary for "${title}"`, 'cache');
      }

      return summary;
    } catch (error) {
      log(`Error generating summary: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return existingSummary || null;
    }
  }

  // Generate or fetch enhanced rating (Gemini-first; fallback to heuristic)
  async getEnhancedRating(title: string, author: string, isbn?: string): Promise<string> {
    try {
      const cached = await this.findInCache(title, author);
      if (cached?.rating && cached.source === 'openai') {
        log(`Using cached LLM rating for "${title}": ${cached.rating}`, 'cache');
        return cached.rating;
      }

      if (isbn) {
        const byIsbn = await this.findByISBN(isbn);
        if (byIsbn?.rating) {
          const n = parseFloat(byIsbn.rating);
          if (!isNaN(n) && n >= 1 && n <= 5) return byIsbn.rating;
        }
      }

      // Gemini-first rating
      let rating = await generateGeminiRating(title, author);
      if (!rating) rating = getEstimatedBookRating(title, author);

      const expiresAt = new Date(Date.now() + 90 * DAY);
      await this.cacheBook({ title: title.trim(), author: author.trim(), isbn, rating, source: 'openai', expiresAt });
      log(`Cached rating for "${title}": ${rating}`, 'cache');
      return rating;
    } catch (error) {
      log(`Error getting enhanced rating: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return getEstimatedBookRating(title, author);
    }
  }

  // Periodic maintenance
  async runMaintenance(): Promise<void> {
    try {
      await this.cleanupExpired();
    } catch (error) {
      log(`Error during cache maintenance: ${error instanceof Error ? error.message : String(error)}`, 'cache');
    }
  }

  // Ensure we only keep LLM-generated ratings as authoritative
  async cleanupNonOpenAIRatings(): Promise<number> {
    try {
      const entries = await db
        .select()
        .from(bookCache)
        .where(
          and(
            isNotNull(bookCache.rating),
            or(not(eq(bookCache.source, 'openai')), isNull(bookCache.source))
          )
        );
      if (!entries.length) {
        log('No non-OpenAI ratings found in cache', 'cache');
        return 0;
      }
      let updated = 0;
      for (const e of entries) {
        await db.update(bookCache).set({ rating: null }).where(eq(bookCache.id, e.id));
        updated++;
      }
      log(`Cleared ratings from ${updated} non-OpenAI cache entries`, 'cache');
      return updated;
    } catch (error) {
      log(`Error clearing non-OpenAI ratings: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }

  // Testing utility: expire or clear cache entries
  async clearCacheForTesting(options: { preserveDescriptions?: boolean; titleFilter?: string } = {}): Promise<number> {
    try {
      const { preserveDescriptions = true, titleFilter } = options;
      if (preserveDescriptions || titleFilter) {
        const base = db.select().from(bookCache);
        const rows = titleFilter
          ? await base.where(sql`LOWER(${bookCache.title}) LIKE ${`%${titleFilter.toLowerCase()}%`}`)
          : await base;
        if (!rows.length) return 0;
        const expiry = new Date(Date.now() - 60_000);
        let count = 0;
        for (const row of rows) {
          const updateData: any = preserveDescriptions
            ? { expiresAt: expiry }
            : { expiresAt: expiry, summary: null };
          await db.update(bookCache).set(updateData).where(eq(bookCache.id, row.id));
          count++;
        }
        log(`Updated ${count} cache entries for testing (preserveDescriptions=${preserveDescriptions})`, 'cache');
        return count;
      } else {
        const result = await db.delete(bookCache).returning();
        const count = result.length;
        log(`Cleared ${count} entries from book cache`, 'cache');
        return count;
      }
    } catch (error) {
      log(`Error clearing cache for testing: ${error instanceof Error ? error.message : String(error)}`, 'cache');
      return 0;
    }
  }
}

export const bookCacheService = new BookCacheService();