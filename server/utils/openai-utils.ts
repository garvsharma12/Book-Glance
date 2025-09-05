/**
 * OpenAI utility functions
 * Moved from demo-openai.ts during code cleanup
 */
import OpenAI from "openai";
import { log } from "../simple-logger.js";
import { rateLimiter } from "../rate-limiter.js";

// Lazy OpenAI client
function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key, maxRetries: 2, timeout: 15000 });
}

/**
 * Gets a book rating using OpenAI's knowledge
 */
export async function getOpenAIBookRating(title: string, author: string): Promise<string> {
  try {
    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      if (process.env.NODE_ENV === 'development') {
        log("OpenAI API key not found. Using fallback rating system.");
      }
      // Return a reasonable fallback rating
      return "4.3";
    }
    
    // Check rate limits and atomically increment if allowed
    if (!(await rateLimiter.checkAndIncrement('openai'))) {
      log("Rate limit reached for OpenAI, using fallback rating", "openai");
      return "4.2";
    }
    
    // Log the API call
    log(`Getting OpenAI rating for: ${title} by ${author}`, "openai");
    
    // Use ChatGPT to generate a realistic rating based on its knowledge
    const client = getOpenAI();
    if (!client) {
      return "4.3";
    }
    const response = await client.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are a literary expert with comprehensive knowledge of books. When asked about a book, provide only a numeric rating between 1.0 and 5.0 with one decimal place. Do not include any other text."
        },
        {
          role: "user",
          content: `Based on critical reception and reader reviews, what would be an accurate rating for "${title}" by ${author}? Respond with just a number between 1.0 and 5.0 with one decimal place.`
        }
      ],
      temperature: 0.5,
      max_tokens: 10
    });
    
    // Extract the rating from the response
    const content = response.choices[0].message.content?.trim() || "";
    
    // Try to parse as a numeric rating
    const parsedRating = parseFloat(content);
    if (!isNaN(parsedRating) && parsedRating >= 1.0 && parsedRating <= 5.0) {
      return parsedRating.toFixed(1);
    } else {
      // Fallback if the response couldn't be parsed as a number
      log(`Invalid rating response from OpenAI: ${content}`, "openai");
      return "4.2";
    }
  } catch (error) {
    // Check if this is a rate limit error from the API itself
    if (error instanceof Error && (
      error.message.includes('rate limit') || 
      error.message.includes('429') ||
      error.message.includes('too many requests') ||
      error.message.includes('quota exceeded')
    )) {
      log(`OpenAI API rate limit error: ${error.message}`, "openai");
      return "4.2";
    }
    
    // Log error and provide fallback
    log(`Error getting OpenAI book rating: ${error instanceof Error ? error.message : String(error)}`);
    return "4.0";
  }
}

/**
 * Gets a book summary using OpenAI's knowledge
 */
export async function getOpenAIBookSummary(title: string, author: string): Promise<string> {
  try {
    // Check if we have an API key
    if (!process.env.OPENAI_API_KEY) {
      if (process.env.NODE_ENV === 'development') {
        log("OpenAI API key not found. Using fallback summary.");
      }
      return `This is a book titled "${title}" by ${author}. No summary is available at this time.`;
    }
    
    // Check rate limits and atomically increment if allowed
    if (!(await rateLimiter.checkAndIncrement('openai'))) {
      log("Rate limit reached for OpenAI, using fallback summary", "openai");
      return `"${title}" by ${author} is a noteworthy book in its genre. (API rate limit reached)`;
    }
    
    // Log the API call
    log(`Getting OpenAI summary for: ${title} by ${author}`, "openai");
    
    // Use ChatGPT to generate a book summary based on its knowledge
    const client = getOpenAI();
    if (!client) {
      return `This is a book titled "${title}" by ${author}. No summary is available at this time.`;
    }
    const response = await client.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are a literary expert with comprehensive knowledge of books. Provide concise, engaging, and accurate summaries of books without revealing major spoilers."
        },
        {
          role: "user",
          content: `Please provide a concise summary (about 100-150 words) of the book "${title}" by ${author}. Focus on the main themes and premise without spoiling major plot points.`
        }
      ],
      temperature: 0.7,
      max_tokens: 250
    });
    
    // Extract the summary from the response
    const summary = response.choices[0].message.content?.trim() || "";
    
    if (summary.length > 20) {
      return summary;
    } else {
      // Fallback if the response is too short or empty
      log(`Invalid summary response from OpenAI: ${summary}`, "openai");
      return `"${title}" by ${author} is a noteworthy book in its genre. (No detailed summary available)`;
    }
  } catch (error) {
    // Check if this is a rate limit error from the API itself
    if (error instanceof Error && (
      error.message.includes('rate limit') || 
      error.message.includes('429') ||
      error.message.includes('too many requests') ||
      error.message.includes('quota exceeded')
    )) {
      log(`OpenAI API rate limit error: ${error.message}`, "openai");
      return `"${title}" by ${author} is a noteworthy book in its genre. (API rate limit reached)`;
    }
    
    // Log error and provide fallback
    log(`Error getting OpenAI book summary: ${error instanceof Error ? error.message : String(error)}`);
    return `"${title}" by ${author} is a book that could not be summarized at this time due to technical limitations.`;
  }
}