import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertGameStateSchema } from "@shared/schema";
import { z } from "zod";

// Helper to get client IP address
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Helper to check if IP has exceeded daily game limit (free tier)
async function checkIpRateLimit(ipAddress: string): Promise<{ allowed: boolean; message?: string }> {
  const rateLimit = await storage.getIpRateLimit(ipAddress);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!rateLimit) {
    // First time for this IP
    return { allowed: true };
  }

  const lastResetDate = new Date(rateLimit.lastResetDate || new Date());
  lastResetDate.setHours(0, 0, 0, 0);

  // Reset if it's a new day
  if (today > lastResetDate) {
    return { allowed: true };
  }

  // Check daily limit (e.g., 3 games per day for free tier)
  const DAILY_GAME_LIMIT = 3;
  if (rateLimit.gamesStartedToday >= DAILY_GAME_LIMIT) {
    return {
      allowed: false,
      message: `Daily limit reached. Free players can start ${DAILY_GAME_LIMIT} games per day. Log in for unlimited play!`
    };
  }

  return { allowed: true };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Game state routes

  // Create new game (authenticated or anonymous)
  app.post('/api/game/start', async (req: any, res) => {
    try {
      const ipAddress = getClientIp(req);
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      
      // Validate request body
      const validationResult = insertGameStateSchema.safeParse({
        ...req.body,
        userId,
        ipAddress: userId ? null : ipAddress, // Only track IP for anonymous users
        maxTurns: userId ? -1 : 5, // Unlimited for logged in, 5 for free
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid game data", 
          errors: validationResult.error.errors 
        });
      }

      // Check IP rate limit for anonymous users
      if (!userId) {
        const rateLimitCheck = await checkIpRateLimit(ipAddress);
        if (!rateLimitCheck.allowed) {
          return res.status(429).json({ message: rateLimitCheck.message });
        }

        // Update IP rate limit
        const rateLimit = await storage.getIpRateLimit(ipAddress);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastResetDate = rateLimit ? new Date(rateLimit.lastResetDate || new Date()) : today;
        lastResetDate.setHours(0, 0, 0, 0);
        
        const isNewDay = today > lastResetDate;
        const newCount = isNewDay ? 1 : (rateLimit?.gamesStartedToday || 0) + 1;
        
        await storage.updateIpRateLimit(ipAddress, newCount, today);
      }

      const gameState = await storage.createGameState(validationResult.data);
      res.json(gameState);
    } catch (error) {
      console.error("Error starting game:", error);
      res.status(500).json({ message: "Failed to start game" });
    }
  });

  // Get game state by ID
  app.get('/api/game/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const gameState = await storage.getGameState(id);
      
      if (!gameState) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Verify ownership (for authenticated users) or IP match (for anonymous)
      const ipAddress = getClientIp(req);
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      
      if (gameState.userId && gameState.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!gameState.userId && gameState.ipAddress !== ipAddress) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(gameState);
    } catch (error) {
      console.error("Error fetching game:", error);
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  // Update game state (take a turn)
  app.patch('/api/game/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const gameState = await storage.getGameState(id);
      
      if (!gameState) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Verify ownership
      const ipAddress = getClientIp(req);
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      
      if (gameState.userId && gameState.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!gameState.userId && gameState.ipAddress !== ipAddress) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check turn limit
      if (gameState.maxTurns !== -1 && gameState.turnCount >= gameState.maxTurns) {
        return res.status(403).json({ 
          message: "Turn limit reached. Log in for unlimited turns!" 
        });
      }

      const updates = req.body;
      const updatedGameState = await storage.updateGameState(id, updates);
      res.json(updatedGameState);
    } catch (error) {
      console.error("Error updating game:", error);
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  // Get user's game history (authenticated only)
  app.get('/api/game/user/history', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const gameStates = await storage.getUserGameStates(userId);
      res.json(gameStates);
    } catch (error) {
      console.error("Error fetching game history:", error);
      res.status(500).json({ message: "Failed to fetch game history" });
    }
  });

  // Delete game
  app.delete('/api/game/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const gameState = await storage.getGameState(id);
      
      if (!gameState) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Verify ownership
      const ipAddress = getClientIp(req);
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      
      if (gameState.userId && gameState.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!gameState.userId && gameState.ipAddress !== ipAddress) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteGameState(id);
      res.json({ message: "Game deleted" });
    } catch (error) {
      console.error("Error deleting game:", error);
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  // Check rate limit status (for UI to show remaining games)
  app.get('/api/rate-limit/status', async (req: any, res) => {
    try {
      const ipAddress = getClientIp(req);
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;

      if (userId) {
        return res.json({
          unlimited: true,
          gamesRemaining: -1,
        });
      }

      const rateLimit = await storage.getIpRateLimit(ipAddress);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!rateLimit) {
        return res.json({
          unlimited: false,
          gamesRemaining: 3,
          totalAllowed: 3,
        });
      }

      const lastResetDate = new Date(rateLimit.lastResetDate || new Date());
      lastResetDate.setHours(0, 0, 0, 0);

      const isNewDay = today > lastResetDate;
      const gamesUsed = isNewDay ? 0 : rateLimit.gamesStartedToday;
      const DAILY_GAME_LIMIT = 3;

      res.json({
        unlimited: false,
        gamesRemaining: Math.max(0, DAILY_GAME_LIMIT - gamesUsed),
        totalAllowed: DAILY_GAME_LIMIT,
        gamesUsed,
      });
    } catch (error) {
      console.error("Error checking rate limit:", error);
      res.status(500).json({ message: "Failed to check rate limit" });
    }
  });

  return httpServer;
}
