import { rateLimiter } from './rate-limiter';

/**
 * Returns the current status of API rate limits and usage
 * This is used for monitoring purposes
 */
export function getApiUsageStats(): Record<string, any> {
  const hasVision = !!(
    process.env.GOOGLE_VISION_API_KEY ||
    process.env.GOOGLE_CLOUD_VISION_API_KEY ||
    process.env.VISION_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GCP_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY
  );
  const hasGemini = !!(
    (process.env.GOOGLE_GEMINI_API_KEY && process.env.GOOGLE_GEMINI_API_KEY.length > 5) ||
    (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5)
  );
  return {
    timestamp: new Date().toISOString(),
    stats: rateLimiter.getUsageStats(),
    // Include environment configuration status (without leaking actual API keys)
    config: {
      openaiEnabled: process.env.ENABLE_OPENAI !== 'false',
      openaiConfigured: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 5, 
      googleVisionConfigured: hasVision,
      // Gemini configuration for summaries/ratings
      geminiConfigured: hasGemini,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    }
  };
}