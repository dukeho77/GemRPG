import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { insertAdventureSchema, insertAdventureTurnSchema } from "@shared/schema";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

// Schema for adventure updates
const adventureUpdateSchema = z.object({
  currentHp: z.number().optional(),
  gold: z.number().optional(),
  inventory: z.array(z.string()).optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
  endingType: z.enum(['victory', 'death', 'limit_reached']).optional(),
});

// Schema for creating a new turn
const createTurnSchema = z.object({
  playerAction: z.string().min(1),
  narrative: z.string().min(1),
  visualPrompt: z.string().optional(),
  hpAfter: z.number(),
  goldAfter: z.number(),
  inventoryAfter: z.array(z.string()),
  options: z.array(z.string()),
});

// Helper to get client IP address (for anonymous rate limiting)
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
    return { allowed: true };
  }

  const lastResetDate = new Date(rateLimit.lastResetDate || new Date());
  lastResetDate.setHours(0, 0, 0, 0);

  if (today > lastResetDate) {
    return { allowed: true };
  }

  const DAILY_GAME_LIMIT = 10; // TODO: Change back to 3 after testing
  if (rateLimit.gamesStartedToday >= DAILY_GAME_LIMIT) {
    return {
      allowed: false,
      message: `Daily limit reached. Free players can start ${DAILY_GAME_LIMIT} games per day. Sign in for unlimited play!`
    };
  }

  return { allowed: true };
}

// Constants for subscription limits
const FREE_USER_MAX_ADVENTURES = 3; // Free signed-in users can have up to 3 saved adventures
const FREE_USER_HISTORY_LIMIT = 3;  // Free users see last 3 adventures

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ============== AUTH ROUTES ==============
  
  app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ============== ADVENTURE ROUTES (Authenticated only) ==============

  // List user's adventures
  app.get('/api/adventures', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      const isPremium = user?.isPremium || false;
      
      // Premium users get all adventures, free users get limited history
      const limit = isPremium ? undefined : FREE_USER_HISTORY_LIMIT;
      const adventures = await storage.getUserAdventures(userId, limit);
      
      res.json({
        adventures,
        isPremium,
        limit: isPremium ? null : FREE_USER_HISTORY_LIMIT,
      });
    } catch (error) {
      console.error("Error fetching adventures:", error);
      res.status(500).json({ message: "Failed to fetch adventures" });
    }
  });

  // Get active adventure (for "Continue" functionality)
  app.get('/api/adventures/active', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const adventure = await storage.getActiveAdventure(userId);
      
      if (!adventure) {
        return res.json({ adventure: null });
      }

      // Get turns for this adventure
      const turns = await storage.getAdventureTurns(adventure.id);
      
      res.json({ adventure, turns });
    } catch (error) {
      console.error("Error fetching active adventure:", error);
      res.status(500).json({ message: "Failed to fetch active adventure" });
    }
  });

  // Get specific adventure with turns (for resuming)
  app.get('/api/adventures/:id/resume', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      // Verify ownership
      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get all turns for this adventure
      const turns = await storage.getAdventureTurns(adventure.id);
      
      // Update last played timestamp
      await storage.updateAdventure(id, {});
      
      res.json({ adventure, turns });
    } catch (error) {
      console.error("Error resuming adventure:", error);
      res.status(500).json({ message: "Failed to resume adventure" });
    }
  });

  // Create new adventure
  app.post('/api/adventures', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      const isPremium = user?.isPremium || false;

      // Check adventure limit for free users
      if (!isPremium) {
        const existingAdventures = await storage.getUserAdventures(userId);
        const activeAdventures = existingAdventures.filter(a => a.status === 'active');
        
        if (activeAdventures.length >= 1) {
          return res.status(403).json({ 
            message: "Free users can only have 1 active adventure. Complete or abandon your current adventure first, or upgrade to premium.",
            activeAdventureId: activeAdventures[0].id,
          });
        }

        // Check total adventures limit
        if (existingAdventures.length >= FREE_USER_MAX_ADVENTURES) {
          return res.status(403).json({ 
            message: `Free users can save up to ${FREE_USER_MAX_ADVENTURES} adventures. Delete an old adventure or upgrade to premium.`,
          });
        }
      }

      // Validate request body
      const validationResult = insertAdventureSchema.safeParse({
        ...req.body,
        userId,
        maxTurns: -1, // Unlimited turns for signed-in users
        status: 'active',
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid adventure data", 
          errors: validationResult.error.errors 
        });
      }

      const adventure = await storage.createAdventure(validationResult.data);
      res.json(adventure);
    } catch (error) {
      console.error("Error creating adventure:", error);
      res.status(500).json({ message: "Failed to create adventure" });
    }
  });

  // Update adventure (status, HP, gold, inventory, etc.)
  app.patch('/api/adventures/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate update data
      const validationResult = adventureUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid update data",
          errors: validationResult.error.errors 
        });
      }

      const updatedAdventure = await storage.updateAdventure(id, validationResult.data);
      res.json(updatedAdventure);
    } catch (error) {
      console.error("Error updating adventure:", error);
      res.status(500).json({ message: "Failed to update adventure" });
    }
  });

  // Delete adventure
  app.delete('/api/adventures/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteAdventure(id);
      res.json({ message: "Adventure deleted" });
    } catch (error) {
      console.error("Error deleting adventure:", error);
      res.status(500).json({ message: "Failed to delete adventure" });
    }
  });

  // Restart adventure (delete all turns and reset to turn 0)
  app.post('/api/adventures/:id/restart', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Delete all turns for this adventure
      await storage.deleteAdventureTurns(id);

      // Reset adventure state
      const updatedAdventure = await storage.updateAdventure(id, {
        turnCount: 0,
        currentHp: 30,
        gold: 10,
        inventory: [],
        status: 'active',
        endingType: null,
      });

      res.json({ adventure: updatedAdventure, message: "Adventure restarted" });
    } catch (error) {
      console.error("Error restarting adventure:", error);
      res.status(500).json({ message: "Failed to restart adventure" });
    }
  });

  // ============== TURN ROUTES ==============

  // Save a new turn
  app.post('/api/adventures/:id/turn', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (adventure.status !== 'active') {
        return res.status(400).json({ message: "Adventure is not active" });
      }

      // Validate turn data
      const validationResult = createTurnSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid turn data",
          errors: validationResult.error.errors 
        });
      }

      const turnData = validationResult.data;
      const newTurnNumber = adventure.turnCount + 1;

      // Create the turn
      const turn = await storage.createTurn({
        adventureId: id,
        turnNumber: newTurnNumber,
        playerAction: turnData.playerAction,
        narrative: turnData.narrative,
        visualPrompt: turnData.visualPrompt || null,
        hpAfter: turnData.hpAfter,
        goldAfter: turnData.goldAfter,
        inventoryAfter: turnData.inventoryAfter,
        options: turnData.options,
      });

      // Update adventure state
      await storage.updateAdventure(id, {
        turnCount: newTurnNumber,
        currentHp: turnData.hpAfter,
        gold: turnData.goldAfter,
        inventory: turnData.inventoryAfter,
      });

      res.json({ turn, turnNumber: newTurnNumber });
    } catch (error) {
      console.error("Error saving turn:", error);
      res.status(500).json({ message: "Failed to save turn" });
    }
  });

  // Get turns for an adventure
  app.get('/api/adventures/:id/turns', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { id } = req.params;
      const adventure = await storage.getAdventure(id);
      
      if (!adventure) {
        return res.status(404).json({ message: "Adventure not found" });
      }

      if (adventure.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const limitParam = req.query.limit;
      const limit = limitParam ? parseInt(limitParam as string, 10) : undefined;
      const turns = await storage.getAdventureTurns(id, limit);
      
      res.json({ turns });
    } catch (error) {
      console.error("Error fetching turns:", error);
      res.status(500).json({ message: "Failed to fetch turns" });
    }
  });

  // ============== RATE LIMIT ROUTES (for anonymous users) ==============

  app.get('/api/rate-limit/status', async (req, res) => {
    try {
      const ipAddress = getClientIp(req);
      const isAuth = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
      const userId = isAuth && req.user ? req.user.id : null;

      if (userId) {
        const user = await storage.getUser(userId);
        return res.json({
          authenticated: true,
          unlimited: user?.isPremium || false,
          isPremium: user?.isPremium || false,
        });
      }

      const rateLimit = await storage.getIpRateLimit(ipAddress);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!rateLimit) {
        return res.json({
          authenticated: false,
          unlimited: false,
          gamesRemaining: 10, // TODO: Change back to 3 after testing
          totalAllowed: 10,
        });
      }

      const lastResetDate = new Date(rateLimit.lastResetDate || new Date());
      lastResetDate.setHours(0, 0, 0, 0);

      const isNewDay = today > lastResetDate;
      const gamesUsed = isNewDay ? 0 : rateLimit.gamesStartedToday;
      const DAILY_GAME_LIMIT = 10; // TODO: Change back to 3 after testing

      res.json({
        authenticated: false,
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

  // Track anonymous game start (for rate limiting)
  app.post('/api/rate-limit/track', async (req, res) => {
    try {
      const isAuth = typeof req.isAuthenticated === 'function' && req.isAuthenticated();
      if (isAuth) {
        // Authenticated users don't need rate limiting
        return res.json({ tracked: false, reason: "authenticated" });
      }

      const ipAddress = getClientIp(req);
      const rateLimitCheck = await checkIpRateLimit(ipAddress);
      
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ message: rateLimitCheck.message });
      }

      // Update rate limit count
      const rateLimit = await storage.getIpRateLimit(ipAddress);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const lastResetDate = rateLimit ? new Date(rateLimit.lastResetDate || new Date()) : today;
      lastResetDate.setHours(0, 0, 0, 0);
      
      const isNewDay = today > lastResetDate;
      const newCount = isNewDay ? 1 : (rateLimit?.gamesStartedToday || 0) + 1;
      
      await storage.updateIpRateLimit(ipAddress, newCount, today);
      
      res.json({ tracked: true, gamesUsed: newCount });
    } catch (error) {
      console.error("Error tracking game start:", error);
      res.status(500).json({ message: "Failed to track game start" });
    }
  });

  // ============== AI PROXY ROUTES (Server-side Gemini calls) ==============
  
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
  const MODEL_TEXT = "gemini-2.0-flash";
  const MODEL_IMAGE = "gemini-2.5-flash-image";
  
  // Initialize Google GenAI SDK
  const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

  // AI Logging helper
  function logAI(role: string, status: 'start' | 'done' | 'error', startTime?: number) {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    
    if (status === 'start') {
      console.log(`${timestamp} [AI][${role}] Generating...`);
    } else if (status === 'done' && startTime) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`${timestamp} [AI][${role}] Completed [API: ${elapsed}s]`);
    } else if (status === 'error' && startTime) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`${timestamp} [AI][${role}] Failed [API: ${elapsed}s]`);
    }
  }

  // Helper to call Gemini text API using SDK
  async function callGemini(prompt: string, jsonMode = false): Promise<string> {
    if (!genAI) {
      throw new Error("GEMINI_API_KEY not configured");
    }
    
    const response = await genAI.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      config: jsonMode ? {
        responseMimeType: "application/json",
      } : undefined,
    });
    
    return response.text || "";
  }

  // Generate character name
  app.post('/api/ai/name', async (req, res) => {
    const startTime = Date.now();
    const role = "Name Generator";
    
    try {
      const { gender, race, class: charClass } = req.body;
      
      if (!GEMINI_API_KEY) {
        const names = ["Thorgar", "Elara", "Kaelen", "Nyx", "Valen", "Sylas", "Aria", "Dorn"];
        return res.json({ name: names[Math.floor(Math.random() * names.length)] });
      }

      logAI(role, 'start');
      const prompt = `Generate a SINGLE creative fantasy name for a ${gender} ${race} ${charClass}. Output ONLY the name (e.g., "Thorgar"). No text like "Here is a name:".`;
      const text = await callGemini(prompt, false);
      const name = text.replace(/["']/g, "").trim() || "Adventurer";
      
      logAI(role, 'done', startTime);
      res.json({ name });
    } catch (error) {
      logAI(role, 'error', startTime);
      res.status(500).json({ message: "Failed to generate name", name: "Hero" });
    }
  });

  // Generate campaign data
  app.post('/api/ai/campaign', async (req, res) => {
    const startTime = Date.now();
    const role = "World Builder";
    
    try {
      const { name, gender, race, class: charClass, customInstructions } = req.body;
      
      if (!GEMINI_API_KEY) {
        return res.json({
          title: "The Shadow of the Void",
          act1: "You awaken in a cold, dark cell with no memory of how you arrived.",
          act2: "A mysterious artifact whispers to you, promising power at a terrible cost.",
          act3: "You must choose between saving the realm or becoming its new tyrant.",
          possible_endings: ["Hero", "Tyrant", "Martyr"],
          world_backstory: "The world of Aethelgard is crumbling under the weight of an ancient curse.",
          character_backstory: `${name} was once a respected ${charClass} before the darkness fell.`
        });
      }

      logAI(role, 'start');
      const prompt = `You are a master RPG Architect. Create a rich, 3-Act Campaign Structure and Backstories.
      Player Name: "${name}".
      Details: ${gender} ${race} ${charClass}.
      Theme: "${customInstructions || 'dark fantasy adventure'}".
      
      Output JSON ONLY:
      {
          "title": "Campaign Title",
          "act1": "The Setup & Inciting Incident (1 sentence)",
          "act2": "The Twist & Rising Action (1 sentence)",
          "act3": "The Climax & Final Boss (1 sentence)",
          "possible_endings": ["Good Ending", "Bad Ending", "Twist Ending"],
          "world_backstory": "1 short paragraph (3-4 sentences) describing the world.",
          "character_backstory": "1 short paragraph (3-4 sentences) describing ${name}'s past and motivation."
      }`;

      const text = await callGemini(prompt, true);
      let campaign = JSON.parse(text);
      
      if (Array.isArray(campaign)) {
        campaign = campaign[0];
      }
      
      logAI(role, 'done', startTime);
      res.json(campaign);
    } catch (error) {
      logAI(role, 'error', startTime);
      res.status(500).json({ 
        message: "Failed to generate campaign",
        title: "The Shadow of the Void",
        act1: "You awaken in a cold, dark cell with no memory of how you arrived.",
        act2: "A mysterious artifact whispers to you, promising power at a terrible cost.",
        act3: "You must choose between saving the realm or becoming its new tyrant.",
        possible_endings: ["Hero", "Tyrant", "Martyr"],
        world_backstory: "The world of Aethelgard is crumbling under the weight of an ancient curse.",
        character_backstory: "A stranger from distant lands..."
      });
    }
  });

  // Generate character visual description
  app.post('/api/ai/visuals', async (req, res) => {
    const startTime = Date.now();
    const role = "Character Artist";
    
    try {
      const { gender, race, class: charClass } = req.body;
      
      if (!GEMINI_API_KEY) {
        return res.json({ description: `A ${gender} ${race} ${charClass} standing in a dimly lit dungeon.` });
      }

      logAI(role, 'start');
      const prompt = `Generate a concise (max 25 words) visual description for a dark fantasy RPG character. Role: ${gender} ${race} ${charClass}. Requirements: Describe physique, hair, eyes, and clothing/armor. Output: Just the description text.`;
      const description = await callGemini(prompt, false);
      
      logAI(role, 'done', startTime);
      res.json({ description });
    } catch (error) {
      logAI(role, 'error', startTime);
      const { gender, race, class: charClass } = req.body;
      res.status(500).json({ description: `${gender} ${race} ${charClass}` });
    }
  });

  // Main chat/turn generation
  // Note: Rate limiting is done at game START (/api/rate-limit/track), not per-turn
  // This allows players to finish games they've already started
  app.post('/api/ai/chat', async (req, res) => {
    const startTime = Date.now();
    const role = "Dungeon Master";
    
    try {
      const { history, context, userInput } = req.body;
      
      if (!GEMINI_API_KEY) {
        const turnCount = (context?.turn || 0) + 1;
        return res.json({
          narrative: `You venture deeper into the darkness. The air grows colder. (Turn ${turnCount})\n\n*"What do you seek?"* a voice echoes.`,
          hp_current: context?.hp || 30,
          gold: (context?.gold || 0) + Math.floor(Math.random() * 5),
          inventory: context?.inventory || [],
          options: ["Search the area", "Call out", "Draw weapon"],
          game_over: false,
          visual_prompt: "A dark corridor with glowing runes"
        });
      }

      const turnCount = (context?.turn || 0) + 1;
      const maxTurns = context?.maxTurns || 5;
      
      // Block if over turn limit (for anonymous users)
      if (maxTurns > 0 && turnCount > maxTurns) {
        return res.status(403).json({
          message: "Turn limit reached. Sign in for unlimited turns!",
          narrative: "Your free trial has ended. Sign in to continue your adventure!",
          hp_current: context?.hp || 30,
          gold: context?.gold || 0,
          inventory: context?.inventory || [],
          options: [],
          game_over: true
        });
      }

      const c = context?.endgame;
      if (!c || !c.possible_endings) {
        return res.status(400).json({ message: "Missing campaign data" });
      }

      logAI(role, 'start');
      
      const systemPrompt = `Role: Dungeon Master. Theme: ${context.customInstructions}. Character: ${context.name} (${context.gender} ${context.race} ${context.class}). Visual DNA: "${context.characterDescription}". CAMPAIGN: ${c.title}. Act 1: ${c.act1}. Act 2: ${c.act2}. Act 3: ${c.act3}. Endings: ${c.possible_endings.join(' | ')}. Instructions: 1. STRICT JSON. 2. Narrative: 2nd Person ("You..."). 4-6 sentences. Evocative. Use the name "${context.name}" occasionally. 3. Visual Prompt: Describe CURRENT scene. Decide First vs Third person. 4. Logic: IF HP <= 0 OR Story ends -> "game_over": true. JSON Schema: { "narrative": "Story text (Markdown)", "visual_prompt": "Image prompt", "hp_current": Number, "gold": Number, "inventory": [], "options": ["Option 1", "Option 2", "Option 3"], "game_over": Boolean } Context: Player Inventory: ${(context.inventory || []).join(', ')}. Current HP: ${context.hp}.`;

      if (!genAI) {
        throw new Error("GEMINI_API_KEY not configured");
      }

      let geminiHistory = (history || []).map((h: { role: string; parts: { text: string }[] }) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: h.parts
      }));

      if (geminiHistory.length === 0 && userInput) {
        geminiHistory = [{ role: 'user', parts: [{ text: userInput }] }];
      } else if (geminiHistory.length === 0) {
        geminiHistory = [{ role: 'user', parts: [{ text: `Begin the adventure. ${c.act1}` }] }];
      }

      const apiResponse = await genAI.models.generateContent({
        model: MODEL_TEXT,
        contents: geminiHistory,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });
      
      const text = apiResponse.text;
      if (!text) {
        throw new Error("No content in response");
      }
      
      const response = JSON.parse(text);
      logAI(role, 'done', startTime);
      res.json(response);

    } catch (error) {
      logAI(role, 'error', startTime);
      res.status(500).json({ 
        message: "Failed to generate response",
        narrative: "The mists of fate swirl around you...",
        hp_current: req.body?.context?.hp || 30,
        gold: req.body?.context?.gold || 0,
        inventory: req.body?.context?.inventory || [],
        options: ["Continue cautiously", "Rest", "Look around"],
        game_over: false
      });
    }
  });

  // Image generation using Google GenAI SDK
  app.post('/api/ai/image', async (req, res) => {
    const startTime = Date.now();
    const role = "Image Artist";
    
    try {
      const { prompt } = req.body;
      
      if (!genAI) {
        return res.json({ image: null });
      }

      logAI(role, 'start');
      const finalPrompt = `${prompt}, cinematic lighting, 8k, masterpiece, detailed`;
      
      const response = await genAI.models.generateContent({
        model: MODEL_IMAGE,
        contents: [
          {
            role: 'user',
            parts: [{ text: finalPrompt }],
          },
        ],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      });
      
      // Extract image from response parts
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts && parts.length > 0) {
        for (const part of parts) {
          if (part.inlineData?.data) {
            logAI(role, 'done', startTime);
            return res.json({ image: part.inlineData.data });
          }
        }
      }
      
      logAI(role, 'error', startTime);
      res.json({ image: null });
    } catch (error) {
      logAI(role, 'error', startTime);
      res.json({ image: null });
    }
  });

  return httpServer;
}
