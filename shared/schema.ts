import { pgTable, text, serial, integer, jsonb, timestamp, varchar, pgSchema } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Get the schema name based on environment and deployment context
const getSchemaName = () => {
  // For Vercel deployments, check VERCEL_ENV and git branch
  if (process.env.VERCEL_ENV) {
    // On Vercel production (main branch)
    if (process.env.VERCEL_ENV === 'production') {
      return 'public';
    }
    
    // On Vercel preview deployments (feature branches) or development
    if (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'development') {
      return 'development';
    }
  }
  
  // For local development, check git branch
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  }
  
  // Check git branch name (useful for local and CI/CD)
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || process.env.BRANCH;
  if (gitBranch && gitBranch !== 'main' && gitBranch !== 'master') {
    return 'development';
  }
  
  // Default to public schema for production/main branch
  if (process.env.NODE_ENV === 'production') {
    return 'public';
  }
  
  // Default to development for everything else
  return 'development';
};

// Create the schema object
const currentSchemaName = getSchemaName();

// Log which schema is being used for debugging
if (typeof console !== 'undefined') {
  const _context = process.env.VERCEL_ENV ? `Vercel ${process.env.VERCEL_ENV}` : 
                process.env.NODE_ENV === 'development' ? 'Local development' : 'Unknown';
  const _branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || process.env.BRANCH || 'unknown';
  // console.log(`📊 Database Schema: "${currentSchemaName}" | Context: ${_context} | Branch: ${_branch}`); // REMOVED: DB config may expose sensitive deployment info
}

export const appSchema = currentSchemaName === 'public' 
  ? undefined  // Use default (public) schema
  : pgSchema(currentSchemaName);

// Helper function to create table in the correct schema
const createTable = (name: string, columns: any) => {
  return appSchema ? appSchema.table(name, columns) : pgTable(name, columns);
};

// User schema
export const users = createTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Book preferences schema
export const preferences = createTable("preferences", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  genres: text("genres").array().notNull(),
  authors: text("authors").array(),
  // Optional list of favorite book titles provided by user
  books: text("books").array(),
  goodreadsData: jsonb("goodreads_data"),
});

export const insertPreferenceSchema = createInsertSchema(preferences).pick({
  deviceId: true,
  genres: true,
  authors: true,
  books: true,
  goodreadsData: true,
});

// Book cache schema for storing book metadata to reduce external API calls
// We'll create a unique book identifier from ISBN if available, or title+author if not
export const bookCache = createTable("book_cache", {
  id: serial("id").primaryKey(),
  // Make title and author required for all books
  title: text("title").notNull(),
  author: text("author").notNull(),
  // ISBN is optional but unique when provided
  isbn: varchar("isbn", { length: 30 }).unique(),
  // Generate a unique book identifier as title+author for books without ISBN
  bookId: text("book_id").notNull().unique(),
  coverUrl: text("cover_url"),
  rating: varchar("rating", { length: 10 }),
  summary: text("summary"),
  source: varchar("source", { length: 20 }).notNull(), // 'google', 'amazon', 'openai'
  metadata: jsonb("metadata"),
  cachedAt: timestamp("cached_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // Cache expiration time
});

export const insertBookCacheSchema = createInsertSchema(bookCache).pick({
  title: true,
  author: true,
  isbn: true,
  bookId: true,
  coverUrl: true,
  rating: true,
  summary: true,
  source: true,
  metadata: true,
  expiresAt: true,
});

export type BookCache = typeof bookCache.$inferSelect;
export type InsertBookCache = z.infer<typeof insertBookCacheSchema>;

// Saved books schema - now with reference to book_cache table
export const savedBooks = createTable("saved_books", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  bookCacheId: integer("book_cache_id").references(() => bookCache.id),
  title: text("title").notNull(),
  author: text("author").notNull(),
  coverUrl: text("cover_url"),
  rating: text("rating"),
  summary: text("summary"),
  savedAt: timestamp("saved_at").defaultNow(),
});

export const insertSavedBookSchema = createInsertSchema(savedBooks).pick({
  deviceId: true,
  bookCacheId: true,
  title: true,
  author: true,
  coverUrl: true,
  rating: true,
  summary: true,
});

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Preference = typeof preferences.$inferSelect;
export type InsertPreference = z.infer<typeof insertPreferenceSchema>;

// Book type definitions have been removed

export type SavedBook = typeof savedBooks.$inferSelect;
export type InsertSavedBook = z.infer<typeof insertSavedBookSchema>;

// Recommendation types are now defined as interfaces since we're using ephemeral recommendations
export interface Recommendation {
  title: string;
  author: string;
  coverUrl?: string;
  rating?: string;
  summary?: string;
  matchScore?: number;
  matchReason?: string;
}

