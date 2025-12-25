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

// Adventure status enum values
export const adventureStatusValues = ['active', 'completed', 'abandoned'] as const;
export type AdventureStatus = typeof adventureStatusValues[number];

// Adventure ending type enum values
export const endingTypeValues = ['victory', 'death', 'limit_reached'] as const;
export type EndingType = typeof endingTypeValues[number];

// Adventures table - stores game sessions for signed-in users only
export const adventures = pgTable("adventures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(), // Required - signed-in users only
  
  // Character info
  characterName: text("character_name").notNull(),
  characterRace: text("character_race").notNull(),
  characterClass: text("character_class").notNull(),
  characterGender: text("character_gender").notNull(),
  characterDescription: text("character_description"), // AI-generated visual description
  
  // Campaign data (AI-generated)
  campaignTitle: text("campaign_title"),
  campaignData: jsonb("campaign_data"), // {act1, act2, act3, possible_endings, world_backstory, character_backstory}
  themeSeeds: text("theme_seeds"), // Random keywords or custom theme
  
  // Current game state
  currentHp: integer("current_hp").notNull(),
  gold: integer("gold").notNull().default(10),
  inventory: jsonb("inventory").notNull().default([]), // Array of items
  
  // Progress tracking
  turnCount: integer("turn_count").notNull().default(0),
  maxTurns: integer("max_turns").notNull().default(-1), // -1 = unlimited for signed-in users
  
  // Adventure status
  status: text("status").notNull().default('active'), // 'active' | 'completed' | 'abandoned'
  endingType: text("ending_type"), // 'victory' | 'death' | 'limit_reached' | null
  
  // Last scene image (base64)
  lastImage: text("last_image"), // Store the last generated image for resume
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastPlayedAt: timestamp("last_played_at").defaultNow(),
}, (table) => [
  index("idx_adventures_user_id").on(table.userId),
  index("idx_adventures_status").on(table.status),
  index("idx_adventures_last_played").on(table.lastPlayedAt),
]);

export const insertAdventureSchema = createInsertSchema(adventures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastPlayedAt: true,
});

export type InsertAdventure = z.infer<typeof insertAdventureSchema>;
export type Adventure = typeof adventures.$inferSelect;

// Adventure turns table - stores each turn's data for history reconstruction
export const adventureTurns = pgTable("adventure_turns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adventureId: varchar("adventure_id").references(() => adventures.id, { onDelete: 'cascade' }).notNull(),
  turnNumber: integer("turn_number").notNull(),
  
  // Player input
  playerAction: text("player_action").notNull(),
  diceRoll: integer("dice_roll"),  // D20 roll for this turn (null for intro/no-roll turns)
  
  // AI response
  narrative: text("narrative").notNull(),
  visualPrompt: text("visual_prompt"),
  
  // State after this turn
  hpAfter: integer("hp_after").notNull(),
  goldAfter: integer("gold_after").notNull(),
  inventoryAfter: jsonb("inventory_after").notNull().default([]),
  options: jsonb("options").notNull().default([]), // Available options after this turn
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_turns_adventure_id").on(table.adventureId),
  index("idx_turns_number").on(table.adventureId, table.turnNumber),
]);

export const insertAdventureTurnSchema = createInsertSchema(adventureTurns).omit({
  id: true,
  createdAt: true,
});

export type InsertAdventureTurn = z.infer<typeof insertAdventureTurnSchema>;
export type AdventureTurn = typeof adventureTurns.$inferSelect;

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
