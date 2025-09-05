import { log } from './simple-logger.js';
import { logError, logWarning, logRateLimit } from './simple-error-logger.js';

// Define interfaces for better type safety
interface KVStore {
  get(key: string): Promise<number | null>;
  set(key: string, value: number): Promise<number | "OK" | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

interface UsageStats {
  windowUsage: number;
  windowSeconds: number;
  dailyUsage: number;
  dailyLimit: number;
  withinLimits: boolean;
}

// Dynamic import for Vercel KV - only available in Vercel environment
let kv: KVStore | null = null;

async function getKV(): Promise<KVStore> {
  if (kv === null) {
    try {
      if (process.env.VERCEL || process.env.KV_URL) {
        // Only import in Vercel environment or when KV is available
        const { kv: vercelKV } = await import('@vercel/kv');
        kv = vercelKV;
        log('Using Vercel KV for rate limiting', 'rate-limiter');
      } else {
        // Local development fallback - use in-memory store
        const localStore = new Map<string, number>();
        kv = {
          get: (key: string) => Promise.resolve(localStore.get(key) || null),
          set: (key: string, value: number) => { localStore.set(key, value); return Promise.resolve('OK' as const); },
          incr: (key: string) => {
            const current = localStore.get(key) || 0;
            const newValue = current + 1;
            localStore.set(key, newValue);
            return Promise.resolve(newValue);
          },
          expire: (_key: string, _seconds: number) => Promise.resolve(1), // No-op for local
        };
        log('Using local fallback for rate limiting (development)', 'rate-limiter');
      }
    } catch (error) {
      log(`KV not available, using local fallback: ${error}`, 'rate-limiter');
      // Fallback to basic object - ensure we never return null
      kv = {
        get: (_key: string) => Promise.resolve(null),
        set: (_key: string, _value: number) => Promise.resolve('OK' as const),
        incr: (_key: string) => Promise.resolve(1),
        expire: (_key: string, _seconds: number) => Promise.resolve(1),
      };
    }
  }
  return kv!; // We ensure kv is never null above
}

/**
 * Vercel KV-based rate limiter for serverless environments
 */
export class VercelKVRateLimiter {
  private readonly limits = {
    'openai': { perMinute: 60, perDay: 12000 }, // Reduced daily limit for better cost control (~$120-360/day max)
    'google-books': { perMinute: 100, perDay: 5000 }, // More realistic for free tier usage
    'google-vision': { perMinute: 100, perDay: 5000 }, // Much more generous - Google Vision can handle this easily
  'open-library': { perMinute: 60, perDay: 2000 }, // Slightly increased daily limit while respecting free service
  // Gemini free tier commonly allows ~15 requests/min per model; keep a buffer below hard limit
  'gemini': { perMinute: 12, perDay: 1500 }
  };

  /**
   * Check if a request to the API is allowed based on rate limits
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds (default: 60)
   * @returns boolean indicating if the request is allowed
   */
  public async isAllowed(apiName: string, windowSeconds = 60): Promise<boolean> {
    try {
      const kvStore = await getKV();
      const now = Date.now();
      const windowStart = Math.floor(now / (windowSeconds * 1000));
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const limits = this.limits[apiName as keyof typeof this.limits];
      if (!limits) {
        log(`Unknown API: ${apiName}, allowing request`, 'rate-limiter');
        return true;
      }

      // Keys for window and daily limits
      const windowKey = `rate:${apiName}:${windowStart}`;
      const dailyKey = `rate:${apiName}:daily:${today}`;

      // Get current counts
      const [windowCount, dailyCount] = await Promise.all([
        kvStore.get(windowKey),
        kvStore.get(dailyKey),
      ]);

      const currentWindowCount = windowCount || 0;
      const currentDailyCount = dailyCount || 0;

      // Check limits
      const withinWindowLimit = currentWindowCount < limits.perMinute;
      const withinDailyLimit = currentDailyCount < limits.perDay;

      if (!withinWindowLimit) {
        logRateLimit(apiName, 'window', limits.perMinute, currentWindowCount);
      }

      if (!withinDailyLimit) {
        logRateLimit(apiName, 'daily', limits.perDay, currentDailyCount);
      }

      // Check for alerts
      this.checkForAlerts(apiName, currentWindowCount, limits.perMinute, currentDailyCount, limits.perDay);

      return withinWindowLimit && withinDailyLimit;
    } catch (error) {
      log(`Rate limiter error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
      // On error, allow the request (fail open)
      return true;
    }
  }

  /**
   * Increment the count for an API after successful usage
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds (default: 60)
   */
  public async increment(apiName: string, windowSeconds = 60): Promise<void> {
    try {
      const kvStore = await getKV();
      const now = Date.now();
      const windowStart = Math.floor(now / (windowSeconds * 1000));
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Keys for window and daily limits
      const windowKey = `rate:${apiName}:${windowStart}`;
      const dailyKey = `rate:${apiName}:daily:${today}`;

      // Increment both counters atomically
      const [windowCount, dailyCount] = await Promise.all([
        kvStore.incr(windowKey),
        kvStore.incr(dailyKey),
      ]);

      // Set expiry on first increment
      if (windowCount === 1) {
        await kvStore.expire(windowKey, windowSeconds);
      }
      if (dailyCount === 1) {
        await kvStore.expire(dailyKey, 86400); // 24 hours
      }

      log(`API call to ${apiName}: window=${windowCount}, daily=${dailyCount}`, 'rate-limiter');
    } catch (error) {
      log(`Rate limiter increment error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
    }
  }

  /**
   * Check if alerts should be logged based on usage thresholds
   */
  private checkForAlerts(
    apiName: string, 
    currentCount: number, 
    limit: number, 
    dailyUsage: number, 
    dailyLimit: number
  ): void {
    const usagePercent = (dailyUsage / dailyLimit) * 100;

    // Alert on high daily usage
    if (usagePercent >= 80) {
      logWarning(`High API usage for ${apiName}: ${usagePercent.toFixed(1)}%`, {
        api: apiName,
        current: dailyUsage,
        limit: dailyLimit,
        metadata: { type: 'daily', usagePercent }
      });

      if (usagePercent >= 90) {
        logError(`${apiName} API quota is nearly exhausted (${usagePercent.toFixed(1)}%)`, undefined, {
          api: apiName,
          current: dailyUsage,
          limit: dailyLimit,
          metadata: { usagePercent, critical: true }
        });
      }
    }
  }

  /**
   * Get current API usage statistics
   */
  public async getUsageStats(): Promise<Record<string, UsageStats>> {
    try {
      const kvStore = await getKV();
      const stats: Record<string, UsageStats> = {};
      const now = Date.now();
      const currentWindow = Math.floor(now / 60000); // 1-minute window
      const today = new Date().toISOString().split('T')[0];

      for (const [apiName, limits] of Object.entries(this.limits)) {
        const windowKey = `rate:${apiName}:${currentWindow}`;
        const dailyKey = `rate:${apiName}:daily:${today}`;

        const [windowUsage, dailyUsage] = await Promise.all([
          kvStore.get(windowKey),
          kvStore.get(dailyKey),
        ]);

        const currentWindowUsage = windowUsage || 0;
        const currentDailyUsage = dailyUsage || 0;

        stats[apiName] = {
          windowUsage: currentWindowUsage,
          windowSeconds: 60,
          dailyUsage: currentDailyUsage,
          dailyLimit: limits.perDay,
          withinLimits: currentWindowUsage < limits.perMinute && currentDailyUsage < limits.perDay
        };
      }

      return stats;
    } catch (error) {
      log(`Error getting usage stats: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
      return {};
    }
  }

  /**
   * Reset a specific API's rate limits (useful for testing or manual reset)
   */
  public async resetLimits(apiName: string): Promise<void> {
    try {
      const kvStore = await getKV();
      const now = Date.now();
      const currentWindow = Math.floor(now / 60000);
      const today = new Date().toISOString().split('T')[0];

      const windowKey = `rate:${apiName}:${currentWindow}`;
      const dailyKey = `rate:${apiName}:daily:${today}`;

      await Promise.all([
        kvStore.set(windowKey, 0),
        kvStore.set(dailyKey, 0),
      ]);

      log(`Reset rate limits for ${apiName}`, 'rate-limiter');
    } catch (error) {
      log(`Error resetting limits for ${apiName}: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
    }
  }

  /**
   * Atomically check if a request is allowed and increment if so
   * This prevents race conditions between check and increment
   * @param apiName API identifier
   * @param windowSeconds Time window in seconds (default: 60)
   * @returns Promise<boolean> indicating if the request was allowed and incremented
   */
  public async checkAndIncrement(apiName: string, windowSeconds = 60): Promise<boolean> {
    try {
      const kvStore = await getKV();
      const now = Date.now();
      const windowStart = Math.floor(now / (windowSeconds * 1000));
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      const limits = this.limits[apiName as keyof typeof this.limits];
      if (!limits) {
        log(`Unknown API: ${apiName}, allowing request`, 'rate-limiter');
        return true;
      }

      // Keys for window and daily limits
      const windowKey = `rate:${apiName}:${windowStart}`;
      const dailyKey = `rate:${apiName}:daily:${today}`;

      // First get current counts to check limits
      const [windowCount, dailyCount] = await Promise.all([
        kvStore.get(windowKey),
        kvStore.get(dailyKey),
      ]);

      const currentWindowCount = windowCount || 0;
      const currentDailyCount = dailyCount || 0;

      // Check if we would exceed limits with this request
      const wouldExceedWindow = currentWindowCount >= limits.perMinute;
      const wouldExceedDaily = currentDailyCount >= limits.perDay;

      if (wouldExceedWindow) {
        logRateLimit(apiName, 'window', limits.perMinute, currentWindowCount);
        return false;
      }

      if (wouldExceedDaily) {
        logRateLimit(apiName, 'daily', limits.perDay, currentDailyCount);
        return false;
      }

      // If we're within limits, increment both counters
      const [newWindowCount, newDailyCount] = await Promise.all([
        kvStore.incr(windowKey),
        kvStore.incr(dailyKey),
      ]);

      // Set expiry on first increment
      if (newWindowCount === 1) {
        await kvStore.expire(windowKey, windowSeconds);
      }
      if (newDailyCount === 1) {
        await kvStore.expire(dailyKey, 86400); // 24 hours
      }

      // Check for alerts
      this.checkForAlerts(apiName, newWindowCount, limits.perMinute, newDailyCount, limits.perDay);

      log(`API call to ${apiName}: window=${newWindowCount}, daily=${newDailyCount}`, 'rate-limiter');
      return true;
    } catch (error) {
      log(`Rate limiter error: ${error instanceof Error ? error.message : String(error)}`, 'rate-limiter');
      // On error, allow the request (fail open)
      return true;
    }
  }
}

// Create a singleton instance
export const rateLimiter = new VercelKVRateLimiter();