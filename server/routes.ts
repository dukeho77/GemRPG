import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { insertAdventureSchema, insertAdventureTurnSchema } from "@shared/schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GoogleGenAI } from "@google/genai";

// Schema for adventure updates
const adventureUpdateSchema = z.object({
  currentHp: z.number().optional(),
  gold: z.number().optional(),
  inventory: z.array(z.string()).optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
  endingType: z.enum(['victory', 'death', 'limit_reached']).optional(),
  lastImage: z.string().optional(),
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

// Schema for AI campaign generation response (structured output)
const campaignResponseSchema = z.object({
  title: z.string().describe("Campaign title"),
  act1: z.string().describe("The Setup & Inciting Incident (1 sentence)"),
  act2: z.string().describe("The Twist & Rising Action (1 sentence)"),
  act3: z.string().describe("The Climax & Final Boss (1 sentence)"),
  possible_endings: z.array(z.string()).describe("3 possible endings"),
  world_backstory: z.string().describe("World description (3-4 sentences)"),
  character_backstory: z.string().describe("Character's past and motivation (3-4 sentences)"),
});

// Schema for AI chat/turn generation response (structured output)
const chatResponseSchema = z.object({
  narrative: z.string().describe("Story text in 2nd person, 4-6 sentences with Markdown"),
  visual_prompt: z.string().describe("Image prompt describing current scene"),
  hp_current: z.number().describe("Current HP after this turn"),
  gold: z.number().describe("Current gold after this turn"),
  inventory: z.array(z.string()).describe("Current inventory items"),
  options: z.array(z.string()).describe("3 action options for the player"),
  game_over: z.boolean().describe("True if HP <= 0 or story ends"),
});

// Schema for epilogue generation response (structured output)
const epilogueResponseSchema = z.object({
  epilogue_title: z.string().describe("A poetic title for the ending (e.g., 'The Dawn After Darkness')"),
  epilogue_text: z.string().describe("2-3 paragraphs describing what happens after the story ends, written in past tense, reflecting on the character's journey and their ultimate fate"),
  ending_type: z.enum(['victory', 'death', 'bittersweet', 'mysterious']).describe("The type of ending achieved"),
  legacy: z.string().describe("A single sentence describing how the character will be remembered"),
  visual_prompt: z.string().describe("A cinematic image prompt for the epilogue scene"),
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

// Constants for subscription limits (not currently enforced - all logged-in users unlimited)
const _FREE_USER_MAX_ADVENTURES = 3; // Reserved for future premium tier
const FREE_USER_HISTORY_LIMIT = 3;  // Free users see last 3 adventures in history list

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

  // Get adventure's last image as binary (efficient, cacheable)
  app.get('/api/adventures/:id/image', isAuthenticated, async (req, res) => {
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

      if (!adventure.lastImage) {
        return res.status(404).json({ message: "No image available" });
      }

      // Convert base64 to binary and serve with proper content-type
      const imageBuffer = Buffer.from(adventure.lastImage, 'base64');
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      });
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving adventure image:", error);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  // Create new adventure
  app.post('/api/adventures', isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // All logged-in users get unlimited adventures for now
      // Premium tier limits can be added later if needed

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
      
      if (!GEMINI_API_KEY || !genAI) {
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
      const prompt = `You are a master RPG Architect specializing in immersive storytelling and character-driven narratives.

      Create a compelling 3-Act Campaign Structure with deep backstories.

      **Character Details:**
      - Name: "${name}"
      - Race: ${race}
      - Class: ${charClass}
      - Gender: ${gender}

      **Campaign Theme:** "${customInstructions || 'dark fantasy adventure'}"

      **Requirements:**

      1. **Campaign Title:** Create an evocative title that hints at the central conflict or mystery

      2. **Three-Act Structure:**
        - Act 1: Establish the ordinary world, introduce a personal hook for ${name}, and present the inciting incident that disrupts their life
        - Act 2: Escalate stakes with a major revelation or betrayal that challenges ${name}'s beliefs; introduce moral dilemmas
        - Act 3: Bring ${name} face-to-face with the ultimate antagonist in a climactic confrontation where their choices throughout the campaign matter

      3. **Three Distinct Endings:** 
        - Each should reflect different moral choices or priorities (e.g., power vs. sacrifice, revenge vs. mercy, duty vs. freedom)
        - Ensure endings have meaningful consequences for the world and ${name}

      4. **World Backstory (3-4 sentences):**
        - Establish the current state of the world and its recent history
        - Include a lurking threat or unresolved conflict that sets the stage
        - Hint at ancient lore, fallen kingdoms, or forgotten magic relevant to the theme

      5. **Character Backstory (3-4 sentences):**
        - Give ${name} a personal tragedy, mystery, or unfulfilled oath that drives them
        - Connect their ${race} heritage and ${charClass} skills to their past
        - Include a relationship (mentor, rival, lost loved one) that can resurface in the campaign
        - Make their motivation align organically with the campaign's central conflict

      **Tone:** Match the "${customInstructions || 'dark fantasy adventure'}" theme. 
      Be specific with names, locations, and factions. 
      Create hooks that make the player care personally about the outcome.`;

      const response = await genAI.models.generateContent({
        model: MODEL_TEXT,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: zodToJsonSchema(campaignResponseSchema),
        },
      });

      const text = response.text || "";
      const campaign = campaignResponseSchema.parse(JSON.parse(text));
      
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
      const prompt = `You are a visual concept artist creating a character description for AI image generation in a dark fantasy RPG setting.

**CHARACTER:** ${gender} ${race} ${charClass}

**INSTRUCTIONS:**
Generate a precise, vivid visual description (60-80 words) optimized for consistent AI image generation. MUST begin with gender identifier (male, female, non-binary). Include ALL of the following elements:
**Gender & Physical Build:** START with "Male" or "Female" or "Non-binary", then describe build. Male (broad-shouldered, muscular, stocky, lean, battle-scarred, powerful) | Female (athletic, lithe, strong, muscular, warrior's build, battle-hardened, powerful) | Non-binary (androgynous, balanced, graceful yet strong). Include height: tall, average, short, towering, compact.
**Face & Skin:** Specify skin tone (pale, tan, olive, dark brown, bronze, ebony, fair, ruddy, etc.), face shape (angular, weathered, sharp-featured, square-jawed, feminine, masculine, androgynous), and distinctive marks (scars, tattoos, war paint, ritual markings). Add race-specific features: Elf (pointed ears - CRITICAL), Dwarf (thick beard for males, rugged features, stocky), Orc/Half-Orc (tusks, green/gray skin, powerful build), Tiefling (horns, tail, unusual skin color like red/purple/blue), Dragonborn (scales, reptilian eyes, draconic features), Halfling (small 3-4 feet, youthful), Gnome (tiny 3 feet, large eyes).
**Hair (CRITICAL for consistency):** MUST specify exact color (jet black, silver-white, auburn, copper, raven, golden blonde, gray-streaked, platinum, crimson, dark brown) AND exact style (long flowing, braided, short cropped, shaved sides with topknot, mohawk, wild and unkempt, ponytail, bald, shoulder-length, waist-length, etc.). Be very specific - this is essential for visual consistency across images.
**Eyes (CRITICAL for consistency):** MUST specify exact color (piercing blue, amber, emerald green, silver, violet, heterochromatic [one blue one green], steel-gray, golden, crimson, ice-blue, sapphire) and quality/expression (steely gaze, haunted look, fierce stare, kind eyes, calculating, determined, weary).
**Clothing/Armor (class-appropriate with colors):** Warrior (heavy plate armor, chainmail, battle-worn steel, fur-trimmed pauldrons, iron gauntlets) | Rogue (dark leather armor, hooded cloak, studded leather, shadow-black garments, flexible gear) | Mage (flowing robes, arcane symbols, pointed hat, star-patterned cloak, mystical jewelry, spell tome) | Cleric/Paladin (holy symbols, blessed armor, white/silver accents, sacred vestments, divine iconography) | Ranger (practical leather, forest colors green/brown, travel-worn gear, bow and quiver). MUST include specific colors (crimson cloak, midnight blue robes, weathered brown leather, tarnished silver armor, black steel) and 1-2 distinctive signature items (ornate belt buckle, skull pauldrons, glowing amulet, runed blade, enchanted rings, family crest shield).
**Dark Fantasy Aesthetic:** Include weathered, battle-worn, or grim details showing experience and hardship. Mention scars, wear, age marks, or trauma when appropriate. Use dark, muted, or rich color palettes (avoid bright cheerful colors). Focus on practical, functional gear over ornate decoration. Convey a sense of history, survival, and the weight of their journey.

**GENDER REPRESENTATION GUIDELINES:**
- **Male characters:** Can include facial hair (beard, stubble, mustache), broader shoulders, square jaw, masculine features, but also show vulnerability or weariness
- **Female characters:** Strong, capable, battle-ready descriptions; athletic/muscular builds are appropriate; avoid sexualization; focus on competence and warrior presence
- **Non-binary characters:** Androgynous features, balanced masculine/feminine traits, ambiguous beauty, neither overtly male nor female presentation

**OUTPUT FORMAT:** Provide ONLY the description text (60-80 words). MUST start with "Male" or "Female" or "Non-binary" followed by race. No preamble, labels, or extra explanatory text—just the pure visual description.

**EXAMPLE OUTPUTS:**
"Male human with broad shoulders and battle-scarred tan skin, square jaw. Short-cropped black hair with gray at temples. Piercing steel-blue eyes, jagged scar across left cheek. Wears battered plate armor with crimson wolf sigil, dark leather underneath. Heavy greatsword with notched blade. Thick beard braided with iron rings. Weathered face shows years of combat."
"Female elf with lithe athletic build, pale porcelain skin, sharp angular features. Long silver-white hair flowing past shoulders, adorned with crystal beads. Luminous violet eyes, otherworldly gaze. Pointed ears visible. Wears deep purple robes embroidered with silver arcane runes, pointed hood. Carries gnarled oak staff topped with glowing sapphire. Slender hands bear mystical tattoos."
"Male half-orc with towering muscular frame, gray-green skin, prominent lower tusks. Bald head with ritual scars across scalp. Fierce amber eyes beneath heavy brow. Wears crude iron plate armor with bone ornaments, fur shoulder pads. Massive double-bladed axe strapped to back. Battle-worn, intimidating presence."`;
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
      const { history, context, userInput, diceRoll } = req.body;
      
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
      
      const systemPrompt = `You are an expert Dungeon Master crafting an immersive RPG experience.

**CAMPAIGN CONTEXT:**
- Title: "${c.title}"
- Theme: ${context.customInstructions}
- Act 1: ${c.act1}
- Act 2: ${c.act2}
- Act 3: ${c.act3}
- Possible Endings: ${c.possible_endings.join(' | ')}

**WORLD BACKSTORY:**
${c.world_backstory || 'A mysterious realm shrouded in darkness and ancient magic.'}

**CHARACTER:**
- Name: ${context.name}
- Gender: ${context.gender}
- Role: ${context.race} ${context.class}
- Visual Features: ${context.characterDescription}
- Current HP: ${context.hp}
- Gold: ${context.gold}
- Inventory: ${(context.inventory || []).length > 0 ? (context.inventory || []).join(', ') : 'Empty'}

**CHARACTER BACKSTORY:**
${c.character_backstory || `${context.name} is an adventurer seeking fortune and glory.`}

**NARRATIVE REQUIREMENTS (4-6 sentences):**
1. Write in 2nd person perspective ("You...")
2. Only use the character's name when someone addresses the character directly or when the character is mentioned in the narrative.
3. Create vivid sensory details (sights, sounds, smells, textures, atmosphere)
4. Show consequences of previous actions when relevant
5. Build tension and emotional stakes
6. Include environmental storytelling (weather, time of day, ambient details)
7. Vary pacing: balance action, exploration, dialogue, and introspection
8. Use strong verbs and evocative language that matches the ${context.customInstructions} theme
9. Make the world feel alive with NPCs, creatures, or environmental reactions
10. Format with Markdown for emphasis (*italics* for thoughts/whispers, **bold** for important items/names)

**VISUAL PROMPT REQUIREMENTS:**
Generate a detailed cinematic prompt for image generation of the CURRENT scene.

**CRITICAL: DO NOT USE THE CHARACTER'S NAME IN VISUAL PROMPTS. Instead, describe them using their physical features from the character.Visual Features.**

**CHARACTER VISUAL IDENTITY:**
Always describe the protagonist using these exact features: "${context.characterDescription}"
- Build all visual descriptions around these physical characteristics
- Reference specific details: hair color/style, eye color, distinctive features, build, etc.
- If HP < 50%: Add visible injuries, blood, exhaustion, torn clothing consistent with their appearance
- Include visible inventory items that make sense for the scene

**PERSPECTIVE SELECTION GUIDE - Choose the BEST angle for dramatic impact:**

**1. FIRST-PERSON POV (Player's Eyes):**
Use for: Intimate moments, discovering secrets, reading documents, tense confrontations, horror/suspense, aiming weapons/spells, opening doors/chests, looking down from heights

STRUCTURE: "First-person POV: [What player sees directly ahead]. [Player's hands/weapons visible in frame - describe using features from characterDescription like skin tone, scars, tattoos]. [Environment details]. [Lighting and atmosphere]."

EXAMPLES:
- "First-person POV: Calloused hands with silver rings grip a flickering torch, illuminating a narrow stone corridor ahead. Ancient hieroglyphs cover damp walls, water dripping from stalactites above. A distant growl echoes from the darkness beyond the torch's reach. Claustrophobic framing, cold blue ambient light mixing with warm torchlight, moisture glistening on stone. Dark fantasy, high detail, atmospheric horror."

- "First-person POV: Looking down the shaft of a drawn bow, arrow nocked and aimed at a massive troll emerging from forest shadows 30 meters ahead. Leather-wrapped hands with faded tribal tattoos steady the weapon. Dappled sunlight through ancient trees, morning mist swirling around the troll's feet. Shallow depth of field, troll slightly blurred in background. Heroic fantasy, cinematic composition, concept art."

- "First-person POV: Gauntleted hands reach toward an ornate golden chalice on a velvet cushion atop a stone pedestal. Rays of divine light stream through stained glass windows, illuminating dancing dust motes. Shadowy cathedral interior, vaulted ceiling barely visible above. Sense of reverence and temptation. Warm dramatic lighting, high detail, digital painting style."

**2. THIRD-PERSON OVER-THE-SHOULDER:**
Use for: Combat positioning, navigating environments, conversing with NPCs, showing context while keeping player central, transitional moments

STRUCTURE: "Over-the-shoulder third-person: [Camera position behind character]. [Character visible features from behind: hair, armor, weapons, build]. [What character faces]. [Environmental context]."

EXAMPLES:
- "Over-the-shoulder third-person view: Camera behind a figure with long braided red hair and leather armor studded with iron, showing their back and right shoulder. They face a towering dragon perched atop a treasure hoard, its amber eyes glowing in the firelit cavern. Their hand rests on sword hilt, muscular shoulders tensed. Scattered gold coins and gems reflect firelight. Low angle emphasizing dragon's size. Epic scale, dramatic lighting, dark fantasy art."

- "Over-the-shoulder view from left side: A robed figure with a distinctive wide-brimmed hat and gnarled wooden staff stands before an ancient wizard in star-covered robes, both in a circular library with floor-to-ceiling bookshelves spiraling upward. Floating candles illuminate dusty tomes. Purple cloak with silver trim visible, staff crackling with arcane energy. Mysterious atmosphere, warm candlelight, magical realism, detailed background."

**3. THIRD-PERSON SIDE VIEW (Profile):**
Use for: Showing movement/travel, cliff edges, balancing acts, dramatic entrances, stealth sequences, showcasing character design against environment

STRUCTURE: "Third-person side profile view: [Character's full profile showing features from character.Visual Features]. [Direction of movement/gaze]. [Environmental context on both sides]. [Atmospheric elements]."

EXAMPLES:
- "Third-person side profile view: A tall warrior with a scarred face and close-cropped black hair walks along a narrow mountain ledge, body pressed against the cliff face, arms spread for balance. Chain mail visible beneath tattered green cloak. To the left, sheer rock wall covered in ice; to the right, a dizzying drop into clouds below. Harsh wind whips cloak and hair horizontally. Late afternoon light, golden hour glow on distant peaks. Vertigo-inducing composition, adventure fantasy, photorealistic detail."

- "Side view silhouette: A lithe figure with a distinctive ponytail and dual daggers crouches in tall grass, moving stealthily from left to right across frame. In background, an enemy encampment with campfires and tents visible. Moonlit night, character backlit by distant fires creating dramatic rim lighting. Stars visible in clear sky. Tense atmosphere, cool blue and warm orange color palette, cinematic stealth aesthetic."

**4. THIRD-PERSON WIDE/ESTABLISHING SHOT:**
Use for: Showing scale, introducing new locations, environmental hazards, army battles, showcasing landscape, beginning of scenes

STRUCTURE: "Wide establishing shot: [Full environment description]. [Character position in scene described by visual features, relatively small in frame]. [Environmental details and scope]. [Atmospheric conditions]."

EXAMPLES:
- "Wide establishing shot, high angle: Vast ruined temple complex sprawls across a jungle clearing, crumbling stone pillars and vine-covered statues scattered throughout. A lone figure in bronze armor with a distinctive red cape stands at the entrance stairs, dwarfed by massive carved doorway. Mist rises from surrounding jungle canopy, ancient trees tower overhead. Overcast sky, diffused lighting, sense of lost civilization. Epic fantasy, matte painting style, intricate detail."

- "Extreme wide shot: Desolate battlefield at dusk, hundreds of broken weapons and armor scattered across muddy ground. A solitary warrior with flowing white hair and dark plate armor walks alone through the carnage, small figure in center-frame moving toward the horizon. Burning siege towers smoke in background, ravens circle overhead. Purple-orange sunset bleeding through storm clouds. Melancholic atmosphere, desaturated colors, grimdark fantasy, painterly style."

**5. THIRD-PERSON CLOSE-UP (Face/Upper Body):**
Use for: Emotional moments, character reactions, injuries, exhaustion, triumph, despair, important dialogue

STRUCTURE: "Close-up third-person: [Character's face and upper body using exact features from character.Visual Features]. [Emotional state and expression]. [Visible details: wounds, dirt, tears, determination]. [Immediate background blur or relevant close detail]."

EXAMPLES:
- "Close-up third-person shot: A face with piercing green eyes and a jagged scar across the left cheek fills frame, eyes wide with shock and fear. Blood trickles from a cut above the brow, dirt and sweat smeared across tan skin. Short auburn hair matted with grime. Behind them, out of focus flames and smoke. Harsh side lighting from fire, creating dramatic shadows across angular features. Raw emotion, high detail on skin texture and eyes. Cinematic realism, gritty dark fantasy."

- "Medium close-up: A youthful face framed by wild curly black hair shows triumphant expression, head tilted back slightly, victorious smile despite exhaustion. Rain streams down dark skin, washing away grime. Golden eyes gleaming with victory. Behind them, blurred silhouette of defeated enemy collapsing. Dramatic storm lighting, lightning flash illuminating scene. Cathartic moment, heroic fantasy, dynamic composition."

**6. THIRD-PERSON LOW ANGLE (Looking Up):**
Use for: Emphasizing power/intimidation, facing giants/dragons, climbing, moments of triumph, boss encounters

STRUCTURE: "Low angle looking up: [Camera positioned below character]. [Character's dominant positioning described by build, armor, weapon]. [Towering threats or environment above]. [Sky/ceiling visible]."

EXAMPLES:
- "Dramatic low angle: Camera looks up at a broad-shouldered warrior with a distinctive horned helmet and flowing crimson cape standing atop a pile of defeated enemies, massive war-axe raised high against a stormy sky. Lightning cracks behind them creating a heroic silhouette. Cape billows dramatically in wind. Rain falls diagonally across frame. Powerful composition, epic fantasy, inspirational tone, high contrast lighting."

- "Low angle perspective: A lithe figure in dark leather armor with intricate silver patterns stands at the base of a colossal stone golem awakening from centuries of slumber, camera looking up showing both character and the massive construct's lower body and torso extending beyond frame. Long platinum blonde hair whips in the disturbed air. Dust and small rocks fall from the golem's movements. Underground cavern setting, bioluminescent fungi providing eerie green glow. Sense of scale and danger, dark fantasy, detailed textures."

**7. THIRD-PERSON HIGH ANGLE (Looking Down):**
Use for: Showing tactical situations, vulnerability, falling, maze-like environments, strategic overview, character isolation

STRUCTURE: "High angle looking down: [Bird's eye or elevated view]. [Character position from above using visible features like hair, armor pattern, cloak]. [Surrounding environment layout]. [Patterns and spatial relationships]."

EXAMPLES:
- "High angle bird's eye view: Directly above a figure with distinctive bright blue robes embroidered with silver stars as they navigate a complex hedge maze, their small form visible at an intersection of paths. Pointed wizard hat clearly visible from above. Multiple dead-end routes visible around them, shadows of the high hedge walls creating a geometric pattern. Late afternoon light creates long shadows. Sense of being lost and watched. Strategic puzzle atmosphere, fantasy adventure, clean composition."

- "Elevated high angle: A warrior in battered plate armor with a distinctive griffin emblem lies wounded on ancient temple floor, camera 20 feet above looking down. They clutch their side, crimson blood staining silver armor. Broken shield and spilled supplies scattered nearby. Circular ritual markings on the stone floor beneath them. Shafts of light from holes in ceiling illuminate dust. Vulnerable moment, dramatic lighting, dark fantasy aesthetic."

**8. DUTCH ANGLE (Tilted/Canted):**
Use for: Disorientation, madness, supernatural events, reality warping, unstable situations, psychological horror

STRUCTURE: "Dutch angle (tilted 15-30 degrees): [Tilted framing]. [Character's disoriented state showing features]. [Environment appearing unstable]. [Unsettling atmosphere]."

EXAMPLES:
- "Dutch angle, 25-degree tilt: A figure with wild, unkempt gray hair and tattered robes stumbles through a reality-warped corridor where walls bend impossibly, perspective skewed and disorienting. Their face shows confusion and terror, one pale hand on the shifting wall for balance. Colors bleed and blur at edges, purple and green energy crackling through cracks in reality. Surreal horror atmosphere, distorted proportions, eldritch fantasy, unsettling composition."

**9. EXTREME CLOSE-UP (Macro Detail):**
Use for: Reading inscriptions, examining clues, magical effects, potion brewing, lockpicking, intricate mechanisms

STRUCTURE: "Extreme close-up: [Specific detail filling frame]. [Character's hand/tool interacting - describe skin tone, scars, jewelry]. [Fine textures and materials]. [Focused lighting]."

EXAMPLES:
- "Extreme close-up macro shot: Weathered brown fingers with calluses and old burn scars trace glowing runic inscriptions carved into ancient stone, magical blue light emanating from the symbols as they're touched. Intricate detail on the carved lettering, fingertip showing dirt under nail. Shallow depth of field, background completely blurred. Magical atmosphere, warm skin tones against cool blue magic light. High detail, fantasy realism."

**COMPREHENSIVE VISUAL PROMPT STRUCTURE:**

**[PERSPECTIVE TYPE]: [Subject & Action described using ${context.characterDescription} features NEVER the name]. [Specific Physical Details: hair color/style, eye color, skin tone, build, distinctive features, scars, tattoos]. [Clothing/Armor Details]. [HP State: if HP < 50% show injuries/exhaustion consistent with their appearance]. [Inventory Items visible if relevant]. [Environment Details: architecture, terrain, setting]. [Lighting: time of day, sources, quality, shadows]. [Weather & Atmosphere: conditions, mood]. [Color Palette: dominant colors and tones]. [Action/Motion: what's happening right now]. [Other Elements: NPCs, creatures, threats]. [Emotional Tone]. [Style Tags: "cinematic composition, dramatic lighting, high detail, ${context.customInstructions} theme, [art style]"].**

**DYNAMIC PERSPECTIVE DECISION TREE:**

→ Player discovering/examining something? → **First-person POV**
→ Combat or navigation? → **Over-the-shoulder third-person**
→ Character traveling/moving laterally? → **Side view profile**
→ New location or showing scale? → **Wide establishing shot**
→ Emotional moment or reaction? → **Close-up**
→ Facing powerful enemy/showing dominance? → **Low angle**
→ Tactical situation or vulnerability? → **High angle**
→ Supernatural/disorienting event? → **Dutch angle**
→ Examining fine detail? → **Extreme close-up**

**EXAMPLE VISUAL PROMPTS USING CHARACTER FEATURES:**

**Boss Battle Start:**
"Low angle third-person: A warrior with a distinctive braided mohawk, tribal face paint, and massive build stands defiantly before a towering demon wreathed in flames, camera positioned low emphasizing the demon's 20-foot height. Weapon drawn, body in combat stance despite visible exhaustion and bleeding shoulder wound (HP at 40%). Heavy fur-trimmed armor with bone ornaments. Crumbling throne room, broken pillars and scattered skulls. Hellfire illuminates the scene in orange and red, casting dancing shadows. Smoke and embers swirl through air. Epic confrontation, dark fantasy, highly detailed, concept art style."

**Stealth Infiltration:**
"First-person POV: Gloved hands in dark leather carefully ease open a creaking wooden door, revealing a torch-lit guard room beyond. Two guards sit at a table playing dice, backs turned, unaware. A curved dagger with a serpent-wrapped hilt visible at bottom of frame. Stone castle interior, night, limited light sources. Tense atmosphere, shadows deep and concealing. Stealth gameplay aesthetic, dark fantasy, atmospheric lighting."

**Exploration Discovery:**
"Wide establishing shot: Ancient underground library with vaulted ceiling disappearing into darkness above, thousands of deteriorating books line massive shelves. A small robed figure with a glowing staff and distinctive pointed hood stands on a balcony overlooking the vast repository. Beams of dusty light from cracks above, floating dust motes. Sense of wonder and lost knowledge. Cool blue and warm gold lighting, atmospheric, high fantasy, matte painting quality."

**Emotional Victory:**
"Close-up third-person: A face with kind brown eyes and weathered features shows an expression mixing relief, exhaustion, and joy as they hold a recovered sacred amulet glowing with golden light. Tears streak through dirt on olive skin, gentle smile. Gray-streaked black hair falls across forehead. Soft golden sunrise light illuminating from the side. Blurred background suggests end of journey. Cathartic moment, warm color palette, cinematic emotion, photorealistic detail."

**GAMEPLAY MECHANICS:**

1. **HP Management:**
   - Combat encounters: -5 to -20 HP depending on severity
   - Minor injuries: -1 to -5 HP
   - Healing items: +5 to +10 HP depending on the type of item
   - Rest: FULL HP
   - Environmental hazards: -5 to -20 HP
   - Maximum HP: 15-30 depending on the character's class
   - IF hp_current <= 0: Set game_over to TRUE

2. **Gold Economy:**
   - Found treasure: +10 to +100 gold (scale to encounter importance)
   - Looting enemies: +5 to +50 gold
   - Quest rewards: +50 to +200 gold
   - Purchases/bribes: -10 to -100 gold
   - Track realistically based on narrative events

3. **Inventory Management:**
   - Add items when found, purchased, or received
   - Remove items when used, sold, or lost
   - Include: weapons, armor, consumables (potions, food), quest items, treasure, tools
   - Be specific: "Rusty Iron Longsword" not just "sword"
   - Limit to 10-12 items maximum for realism

4. **Game Over Conditions:**
   - HP drops to 0 or below
   - Story reaches one of the three possible endings
   - Character makes a definitively fatal choice
   - When game_over is TRUE, narrative should describe the outcome (death/victory/resolution)

**PLAYER OPTIONS (Always provide exactly 3):**

Create meaningful choices that:
1. **Reflect different approaches:** Combat vs Stealth vs Diplomacy vs Magic vs Clever/Creative solution
2. **Have clear but uncertain consequences:** Players should anticipate risks/rewards but not know exact outcomes
3. **Tie to character class:** Include at least one option that leverages ${context.class} abilities
4. **Vary in risk/reward:** One safe option, one risky option, one moderate option
5. **Advance the narrative:** Each option should move the story forward, not stall
6. **Use active, specific language:** "Charge the orc chieftain with your blade raised" not "Attack"

FORMATTING:
- Each option: 6-12 words
- Start with strong action verbs
- Include relevant details (what, how, or with what)

**PROGRESSION & PACING:**
- Track approximate story progress (early/mid/late) based on Act structure
- Escalate stakes and difficulty as the campaign advances
- Introduce Act 2 twists around 30-40% progress
- Build toward Act 3 climax around 70-80% progress
- Foreshadow the three possible endings through choices and consequences

**CRITICAL REMINDERS:**
- Consistency: Remember previous events and choices
- Consequences: Player actions should have lasting effects
- Tone: Match ${context.customInstructions} throughout
- Immersion: Make ${context.name} feel like the protagonist of an epic tale
- Balance: Mix combat, exploration, roleplay, and puzzle-solving
- Stakes: Every choice should matter, even if subtly
- **VARY VISUAL PERSPECTIVES:** Don't use the same camera angle repeatedly. Match perspective to narrative drama and scene type
- **NEVER USE CHARACTER NAME IN VISUAL PROMPTS:** Always use physical features from "${context.characterDescription}" instead

**DICE ROLL SYSTEM:**
The player rolls a D20 before each action. Use the roll result to determine success/failure for risky actions:
- **Natural 20 (Critical Success):** Exceptional outcome! Describe an impressive, dramatic success with bonus effects
- **15-19 (Success):** Action succeeds cleanly
- **8-14 (Partial Success):** Action succeeds but with a complication, cost, or reduced effect
- **2-7 (Failure):** Action fails, describe setback or complication
- **Natural 1 (Critical Failure):** Dramatic mishap! Something goes wrong in an interesting way

**WHEN TO USE THE ROLL:**
- Combat attacks, blocks, and maneuvers
- Skill checks (stealth, lockpicking, persuasion, athletics)
- Risky or uncertain actions
- **IGNORE the roll for:** Simple conversation, looking around, safe actions with no risk

${diceRoll ? `**THIS TURN'S ROLL:** ${diceRoll}
- Consider the player's ${context.class} class when determining if they have advantage on this action type
- A ${context.class} would naturally excel at actions matching their specialty` : '(No dice roll this turn - intro or conversation)'}`;

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
          responseSchema: zodToJsonSchema(chatResponseSchema),
        },
      });
      
      const text = apiResponse.text;
      if (!text) {
        throw new Error("No content in response");
      }
      
      const response = chatResponseSchema.parse(JSON.parse(text));
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
  // Optionally saves to adventure if adventureId is provided
  app.post('/api/ai/image', async (req, res) => {
    const startTime = Date.now();
    const role = "Image Artist";
    
    try {
      const { prompt, adventureId } = req.body;
      
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
            const imageData = part.inlineData.data;
            
            // Save to adventure if adventureId provided (no auth check needed - just saves)
            if (adventureId) {
              storage.updateAdventure(adventureId, { lastImage: imageData }).catch(err => {
                console.error('Failed to save lastImage to adventure:', err);
              });
            }
            
            logAI(role, 'done', startTime);
            return res.json({ image: imageData });
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

  // Generate epilogue based on entire conversation history
  app.post('/api/ai/epilogue', async (req, res) => {
    const startTime = Date.now();
    const role = "Epilogue Writer";
    
    try {
      const { history, context } = req.body;
      
      if (!genAI) {
        return res.json({
          epilogue_title: "The End of the Tale",
          epilogue_text: "And so the adventure came to its conclusion. The echoes of their deeds would linger long after they were gone.",
          ending_type: "mysterious",
          legacy: "A wanderer whose story became legend.",
          visual_prompt: "A lone figure silhouetted against a sunset sky"
        });
      }

      const c = context?.endgame;
      if (!c) {
        return res.status(400).json({ message: "Missing campaign data" });
      }

      logAI(role, 'start');
      
      // Build a summary of the conversation for the epilogue
      const conversationSummary = (history || []).map((h: { role: string; parts: { text: string }[] }) => {
        const role = h.role === 'user' ? 'PLAYER ACTION' : 'STORY';
        const text = h.parts?.map((p: { text: string }) => p.text).join(' ') || '';
        return `${role}: ${text}`;
      }).join('\n\n');

      const epiloguePrompt = `You are an master storyteller writing the epilogue for a completed RPG adventure.

**CAMPAIGN THAT JUST ENDED:**
- Title: "${c.title}"
- Theme: ${context.customInstructions}
- World: ${c.world_backstory}
- Act 1: ${c.act1}
- Act 2: ${c.act2}
- Act 3: ${c.act3}
- Possible Endings: ${c.possible_endings.join(' | ')}

**CHARACTER:**
- Name: ${context.name}
- Role: ${context.race} ${context.class}
- Appearance: ${context.characterDescription}
- Character Background: ${c.character_backstory}
- Final HP: ${context.hp}
- Final Gold: ${context.gold}
- Final Inventory: ${(context.inventory || []).join(', ') || 'Nothing'}

**COMPLETE ADVENTURE HISTORY:**
${conversationSummary}

**YOUR TASK:**
Write a moving epilogue that:
1. Reflects on the entire journey from beginning to end
2. Describes what happens AFTER the final scene (days, months, or years later)
3. Honors the character's choices and their consequences
4. Matches the ${context.customInstructions} theme and tone
5. If the character died (HP <= 0), describe how they are remembered
6. If the character survived, describe their future and legacy
7. Reference specific memorable moments from the adventure
8. Write in past tense, third person, literary style
9. The epilogue_text should be 2-3 rich paragraphs
10. The visual_prompt should depict a cinematic epilogue scene (memorial, celebration, peaceful retirement, etc.)`;

      const response = await genAI.models.generateContent({
        model: MODEL_TEXT,
        contents: [{ role: 'user', parts: [{ text: epiloguePrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: zodToJsonSchema(epilogueResponseSchema),
        },
      });

      const text = response.text || "";
      const epilogue = epilogueResponseSchema.parse(JSON.parse(text));
      
      logAI(role, 'done', startTime);
      res.json(epilogue);

    } catch (error) {
      logAI(role, 'error', startTime);
      console.error("Epilogue generation error:", error);
      res.status(500).json({
        epilogue_title: "The End",
        epilogue_text: "And so the tale came to its end. What adventures await beyond, only time will tell.",
        ending_type: "mysterious",
        legacy: "Their story lives on in whispered legends.",
        visual_prompt: "A weathered book closing on an epic tale, dust motes floating in candlelight"
      });
    }
  });

  return httpServer;
}
