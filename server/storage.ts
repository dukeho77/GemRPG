import {
  users,
  gameStates,
  ipRateLimits,
  type User,
  type UpsertUser,
  type GameState,
  type InsertGameState,
  type IpRateLimit,
  type InsertIpRateLimit,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Game state operations
  getGameState(id: string): Promise<GameState | undefined>;
  getUserGameStates(userId: string): Promise<GameState[]>;
  getActiveGameStateByIp(ipAddress: string): Promise<GameState | undefined>;
  createGameState(gameState: InsertGameState): Promise<GameState>;
  updateGameState(id: string, updates: Partial<GameState>): Promise<GameState | undefined>;
  deleteGameState(id: string): Promise<void>;

  // IP rate limiting operations
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

  // Game state operations
  async getGameState(id: string): Promise<GameState | undefined> {
    const [gameState] = await db
      .select()
      .from(gameStates)
      .where(eq(gameStates.id, id));
    return gameState;
  }

  async getUserGameStates(userId: string): Promise<GameState[]> {
    return await db
      .select()
      .from(gameStates)
      .where(eq(gameStates.userId, userId))
      .orderBy(desc(gameStates.updatedAt));
  }

  async getActiveGameStateByIp(ipAddress: string): Promise<GameState | undefined> {
    const [gameState] = await db
      .select()
      .from(gameStates)
      .where(
        and(
          eq(gameStates.ipAddress, ipAddress),
          eq(gameStates.isActive, true)
        )
      )
      .orderBy(desc(gameStates.updatedAt))
      .limit(1);
    return gameState;
  }

  async createGameState(gameStateData: InsertGameState): Promise<GameState> {
    const [gameState] = await db
      .insert(gameStates)
      .values(gameStateData)
      .returning();
    return gameState;
  }

  async updateGameState(id: string, updates: Partial<GameState>): Promise<GameState | undefined> {
    const [gameState] = await db
      .update(gameStates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(gameStates.id, id))
      .returning();
    return gameState;
  }

  async deleteGameState(id: string): Promise<void> {
    await db.delete(gameStates).where(eq(gameStates.id, id));
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
