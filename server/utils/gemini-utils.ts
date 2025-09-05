import { GoogleGenerativeAI } from "@google/generative-ai";
import { rateLimiter } from "../rate-limiter.js";
import { log } from "../simple-logger.js";

function getClient() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenerativeAI(apiKey);
  } catch (e) {
    log(`Failed to init Gemini client: ${e instanceof Error ? e.message : String(e)}`, 'gemini');
    return null;
  }
}

export async function generateGeminiSummary(title: string, author: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    if (!(await rateLimiter.checkAndIncrement('gemini'))) {
      log('Gemini rate limit reached, skipping summary', 'gemini');
      return null;
    }
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const prompt = `You are a literary expert. Write a concise 3-4 sentence summary of the book "${title}" by ${author}. Be informative, highlight core themes, and avoid spoilers.`;
    const res = await model.generateContent(prompt);
    const text = res.response.text().trim();
    return text || null;
  } catch (e) {
    log(`Gemini summary error: ${e instanceof Error ? e.message : String(e)}`, 'gemini');
    return null;
  }
}

export async function generateGeminiRating(title: string, author: string): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    if (!(await rateLimiter.checkAndIncrement('gemini'))) {
      log('Gemini rate limit reached, skipping rating', 'gemini');
      return null;
    }
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
    const prompt = `Rate the book "${title}" by ${author} from 1.0 to 5.0 with one decimal place based on critical and reader reception. Reply with only the number.`;
    const res = await model.generateContent(prompt);
    const text = res.response.text().trim();
    const m = text.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    if (isNaN(num) || num < 1 || num > 5) return null;
    return num.toFixed(1);
  } catch (e) {
    log(`Gemini rating error: ${e instanceof Error ? e.message : String(e)}`, 'gemini');
    return null;
  }
}
