import {
  users,
  adventures,
  adventureTurns,
  ipRateLimits,
  type User,
  type UpsertUser,
  type Adventure,
  type InsertAdventure,
  type AdventureTurn,
  type InsertAdventureTurn,
  type IpRateLimit,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Adventure operations (signed-in users only)
  getAdventure(id: string): Promise<Adventure | undefined>;
  getUserAdventures(userId: string, limit?: number): Promise<Adventure[]>;
  getActiveAdventure(userId: string): Promise<Adventure | undefined>;
  createAdventure(adventure: InsertAdventure): Promise<Adventure>;
  updateAdventure(id: string, updates: Partial<Adventure>): Promise<Adventure | undefined>;
  deleteAdventure(id: string): Promise<void>;

  // Adventure turn operations
  getAdventureTurns(adventureId: string, limit?: number): Promise<AdventureTurn[]>;
  createTurn(turn: InsertAdventureTurn): Promise<AdventureTurn>;
  getLatestTurn(adventureId: string): Promise<AdventureTurn | undefined>;
  deleteAdventureTurns(adventureId: string): Promise<void>;

  // IP rate limiting operations (for anonymous users)
  getIpRateLimit(ipAddress: string): Promise<IpRateLimit | undefined>;
  updateIpRateLimit(ipAddress: string, gamesStarted: number, resetDate: Date): Promise<IpRateLimit>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Adventure operations
  async getAdventure(id: string): Promise<Adventure | undefined> {
    const [adventure] = await db
      .select()
      .from(adventures)
      .where(eq(adventures.id, id));
    return adventure;
  }

  async getUserAdventures(userId: string, limit?: number): Promise<Adventure[]> {
    let query = db
      .select()
      .from(adventures)
      .where(eq(adventures.userId, userId))
      .orderBy(desc(adventures.lastPlayedAt));
    
    if (limit) {
      query = query.limit(limit) as typeof query;
    }
    
    return await query;
  }

  async getActiveAdventure(userId: string): Promise<Adventure | undefined> {
    const [adventure] = await db
      .select()
      .from(adventures)
      .where(
        and(
          eq(adventures.userId, userId),
          eq(adventures.status, 'active')
        )
      )
      .orderBy(desc(adventures.lastPlayedAt))
      .limit(1);
    return adventure;
  }

  async createAdventure(adventureData: InsertAdventure): Promise<Adventure> {
    const [adventure] = await db
      .insert(adventures)
      .values(adventureData)
      .returning();
    return adventure;
  }

  async updateAdventure(id: string, updates: Partial<Adventure>): Promise<Adventure | undefined> {
    const [adventure] = await db
      .update(adventures)
      .set({ 
        ...updates, 
        updatedAt: new Date(),
        lastPlayedAt: new Date(),
      })
      .where(eq(adventures.id, id))
      .returning();
    return adventure;
  }

  async deleteAdventure(id: string): Promise<void> {
    // Turns are deleted automatically via CASCADE
    await db.delete(adventures).where(eq(adventures.id, id));
  }

  // Adventure turn operations
  async getAdventureTurns(adventureId: string, limit?: number): Promise<AdventureTurn[]> {
    let query = db
      .select()
      .from(adventureTurns)
      .where(eq(adventureTurns.adventureId, adventureId))
      .orderBy(asc(adventureTurns.turnNumber));
    
    if (limit) {
      // Get the last N turns by ordering desc, limiting, then we'll reverse
      const turns = await db
        .select()
        .from(adventureTurns)
        .where(eq(adventureTurns.adventureId, adventureId))
        .orderBy(desc(adventureTurns.turnNumber))
        .limit(limit);
      return turns.reverse(); // Return in ascending order
    }
    
    return await query;
  }

  async createTurn(turnData: InsertAdventureTurn): Promise<AdventureTurn> {
    const [turn] = await db
      .insert(adventureTurns)
      .values(turnData)
      .returning();
    return turn;
  }

  async getLatestTurn(adventureId: string): Promise<AdventureTurn | undefined> {
    const [turn] = await db
      .select()
      .from(adventureTurns)
      .where(eq(adventureTurns.adventureId, adventureId))
      .orderBy(desc(adventureTurns.turnNumber))
      .limit(1);
    return turn;
  }

  async deleteAdventureTurns(adventureId: string): Promise<void> {
    await db.delete(adventureTurns).where(eq(adventureTurns.adventureId, adventureId));
  }

  // IP rate limiting operations
  async getIpRateLimit(ipAddress: string): Promise<IpRateLimit | undefined> {
    const [rateLimit] = await db
      .select()
      .from(ipRateLimits)
      .where(eq(ipRateLimits.ipAddress, ipAddress));
    return rateLimit;
  }

  async updateIpRateLimit(
    ipAddress: string,
    gamesStarted: number,
    resetDate: Date
  ): Promise<IpRateLimit> {
    const [rateLimit] = await db
      .insert(ipRateLimits)
      .values({
        ipAddress,
        gamesStartedToday: gamesStarted,
        lastResetDate: resetDate,
      })
      .onConflictDoUpdate({
        target: ipRateLimits.ipAddress,
        set: {
          gamesStartedToday: gamesStarted,
          lastResetDate: resetDate,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rateLimit;
  }
}

export const storage = new DatabaseStorage();
