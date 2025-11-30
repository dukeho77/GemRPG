import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Stripe fields (prepared for future integration - TODO)
  stripeCustomerId: varchar("stripe_customer_id"),
  isPremium: boolean("is_premium").default(false),
  premiumExpiresAt: timestamp("premium_expires_at"),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Game state table - stores individual game sessions
export const gameStates = pgTable("game_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  ipAddress: varchar("ip_address"), // For anonymous/free players
  characterName: text("character_name").notNull(),
  characterRace: text("character_race").notNull(),
  characterClass: text("character_class").notNull(),
  characterStats: jsonb("character_stats").notNull(), // { strength, dexterity, etc. }
  currentStory: text("current_story").notNull(),
  inventory: jsonb("inventory").notNull().default([]), // Array of items
  loreEntries: jsonb("lore_entries").notNull().default([]), // Array of discovered lore
  turnCount: integer("turn_count").notNull().default(0),
  maxTurns: integer("max_turns").notNull().default(5), // 5 for free, unlimited (-1) for premium
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_id").on(table.userId),
  index("idx_ip_address").on(table.ipAddress),
]);

export const insertGameStateSchema = createInsertSchema(gameStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type GameState = typeof gameStates.$inferSelect;

// IP rate limiting table - tracks free tier usage by IP
export const ipRateLimits = pgTable("ip_rate_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: varchar("ip_address").notNull().unique(),
  gamesStartedToday: integer("games_started_today").notNull().default(0),
  lastResetDate: timestamp("last_reset_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_ip_rate_limit").on(table.ipAddress),
]);

export const insertIpRateLimitSchema = createInsertSchema(ipRateLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIpRateLimit = z.infer<typeof insertIpRateLimitSchema>;
export type IpRateLimit = typeof ipRateLimits.$inferSelect;
