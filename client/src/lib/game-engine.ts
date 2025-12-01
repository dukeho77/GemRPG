import { CLASSES, ClassName, RaceName } from "./game-constants";

export interface GameState {
  name: string;
  class: ClassName;
  race: RaceName;
  gender: 'Male' | 'Female';
  customInstructions: string;
  themeSeeds: string; // The random keywords or custom theme for display
  endgame: CampaignData | null;
  characterDescription: string;
  history: any[];
  hp: number;
  gold: number;
  inventory: string[];
  turn: number;
  maxTurns: number;
}

export interface CampaignData {
  title: string;
  act1: string;
  act2: string;
  act3: string;
  possible_endings: string[];
  world_backstory: string;
  character_backstory: string;
}

export interface TurnResponse {
  narrative: string;
  visual_prompt?: string;
  hp_current: number;
  gold: number;
  inventory: string[];
  options: string[];
  game_over: boolean;
}

// Configuration
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const MODEL_TEXT = "gemini-2.0-flash";

// Logging helper
function logAI(type: string, startTime: number, success: boolean, details?: string) {
  const elapsed = Date.now() - startTime;
  const status = success ? "SUCCESS" : "FAIL";
  const color = success ? "color: #22c55e; font-weight: bold" : "color: #ef4444; font-weight: bold";
  console.log(
    `%c[AI: ${type}] ${status} (${elapsed}ms)${details ? ` - ${details}` : ""}`,
    color
  );
}

export const API = {
  async generateName(context: { gender: string, race: string, class: string }): Promise<string> {
    const startTime = Date.now();
    const type = "Name Generator";
    
    if (!API_KEY) {
      logAI(type, startTime, true, "Using MOCK (no API key)");
      return mockAPI.generateName(context);
    }

    const prompt = `Generate a SINGLE creative fantasy name for a ${context.gender} ${context.race} ${context.class}. Output ONLY the name (e.g., "Thorgar"). No text like "Here is a name:".`;
    
    try {
      const text = await callGemini(prompt, false);
      const name = text.replace(/["']/g, "").trim() || "Adventurer";
      logAI(type, startTime, true, `Generated: "${name}"`);
      return name;
    } catch (e) {
      logAI(type, startTime, false, String(e));
      return "Hero";
    }
  },

  async generateCampaign(context: any): Promise<CampaignData> {
    const startTime = Date.now();
    const type = "Campaign Architect";
    
    if (!API_KEY) {
      logAI(type, startTime, true, "Using MOCK (no API key)");
      return mockAPI.generateCampaign(context);
    }

    const prompt = `You are a master RPG Architect. Create a rich, 3-Act Campaign Structure and Backstories.
    Player Name: "${context.name}".
    Details: ${context.gender} ${context.race} ${context.class}.
    Theme: "${context.customInstructions || 'dark fantasy adventure'}".
    
    Output JSON ONLY:
    {
        "title": "Campaign Title",
        "act1": "The Setup & Inciting Incident (1 sentence)",
        "act2": "The Twist & Rising Action (1 sentence)",
        "act3": "The Climax & Final Boss (1 sentence)",
        "possible_endings": ["Good Ending", "Bad Ending", "Twist Ending"],
        "world_backstory": "1 short paragraph (3-4 sentences) describing the world.",
        "character_backstory": "1 short paragraph (3-4 sentences) describing ${context.name}'s past and motivation."
    }`;

    try {
      const text = await callGemini(prompt, true);
      let campaign = JSON.parse(text);
      
      // Handle array response (sometimes API returns [{...}] instead of {...})
      if (Array.isArray(campaign)) {
        campaign = campaign[0];
      }
      
      if (!campaign || !campaign.title || !campaign.act1 || !campaign.possible_endings) {
        logAI(type, startTime, false, "Invalid campaign structure");
        return mockAPI.generateCampaign(context);
      }
      
      logAI(type, startTime, true, `Campaign: "${campaign.title}"`);
      return campaign;
    } catch (e) {
      logAI(type, startTime, false, String(e));
      return mockAPI.generateCampaign(context);
    }
  },

  async generateVisuals(context: any): Promise<string> {
    const startTime = Date.now();
    const type = "Visual Designer";
    
    if (!API_KEY) {
      logAI(type, startTime, true, "Using MOCK (no API key)");
      return mockAPI.generateVisuals(context);
    }

    const prompt = `Generate a concise (max 25 words) visual description for a dark fantasy RPG character. Role: ${context.gender} ${context.race} ${context.class}. Requirements: Describe physique, hair, eyes, and clothing/armor. Output: Just the description text.`;
    
    try {
      const result = await callGemini(prompt, false);
      logAI(type, startTime, true, `Description length: ${result.length} chars`);
      return result;
    } catch (e) {
      logAI(type, startTime, false, String(e));
      return `${context.gender} ${context.race} ${context.class}`;
    }
  },

  // Main chat - returns narrative/options but NOT the image (image is separate)
  async chat(history: any[], context: GameState, userInput?: string): Promise<TurnResponse> {
    const startTime = Date.now();
    const type = "Dungeon Master";
    
    if (!API_KEY) {
      logAI(type, startTime, true, "Using MOCK (no API key)");
      return mockAPI.chat(history, context);
    }
    
    const turnCount = context.turn + 1;
    const isLimit = turnCount >= context.maxTurns;

    if (isLimit) {
      logAI(type, startTime, true, "Turn limit reached - using limit message");
      return mockAPI.chat(history, context);
    }

    if (!context.endgame || !context.endgame.possible_endings) {
      logAI(type, startTime, false, "Missing campaign data");
      return mockAPI.chat(history, context);
    }

    const c = context.endgame;
    const systemPrompt = `Role: Dungeon Master. Theme: ${context.customInstructions}. Character: ${context.name} (${context.gender} ${context.race} ${context.class}). Visual DNA: "${context.characterDescription}". CAMPAIGN: ${c.title}. Act 1: ${c.act1}. Act 2: ${c.act2}. Act 3: ${c.act3}. Endings: ${c.possible_endings.join(' | ')}. Instructions: 1. STRICT JSON. 2. Narrative: 2nd Person ("You..."). 4-6 sentences. Evocative. Use the name "${context.name}" occasionally. 3. Visual Prompt: Describe CURRENT scene. Decide First vs Third person. 4. Logic: IF HP <= 0 OR Story ends -> "game_over": true. JSON Schema: { "narrative": "Story text (Markdown)", "visual_prompt": "Image prompt", "hp_current": Number, "gold": Number, "inventory": [], "options": ["Option 1", "Option 2", "Option 3"], "game_over": Boolean } Context: Player Inventory: ${context.inventory.join(', ')}. Current HP: ${context.hp}.`;

    try {
      let geminiHistory = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: h.parts
      }));

      if (geminiHistory.length === 0 && userInput) {
        geminiHistory = [{ role: 'user', parts: [{ text: userInput }] }];
      } else if (geminiHistory.length === 0) {
        geminiHistory = [{ role: 'user', parts: [{ text: `Begin the adventure. ${c.act1}` }] }];
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiHistory,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await res.json();
      
      if (data.error) {
        logAI(type, startTime, false, data.error.message);
        throw new Error(data.error.message || "API error");
      }
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        logAI(type, startTime, false, "No content in response");
        throw new Error("No content in response");
      }
      
      const response = JSON.parse(text) as TurnResponse;
      logAI(type, startTime, true, `Turn ${turnCount}, HP: ${response.hp_current}, Options: ${response.options?.length || 0}`);

      return response;

    } catch (e) {
      logAI(type, startTime, false, String(e));
      return mockAPI.chat(history, context);
    }
  },

  // Separate image generation - called asynchronously (non-blocking)
  async generateImage(prompt: string): Promise<string | null> {
    const startTime = Date.now();
    const type = "Image Generator (Imagen 4.0)";
    
    if (!API_KEY) {
      logAI(type, startTime, false, "No API key");
      return null;
    }
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;
      const finalPrompt = `${prompt}, cinematic lighting, 8k, masterpiece, detailed, ${Date.now()}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: finalPrompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" }
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        logAI(type, startTime, false, data.error.message || "API error");
        return null;
      }
      
      const imageData = data.predictions?.[0]?.bytesBase64Encoded;
      if (imageData) {
        logAI(type, startTime, true, `Image size: ${Math.round(imageData.length / 1024)}KB`);
        return imageData;
      } else {
        logAI(type, startTime, false, "No image data in response");
        return null;
      }
    } catch (e) {
      logAI(type, startTime, false, String(e));
      return null;
    }
  }
};

// Helper for Gemini Text
async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (jsonMode) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await res.json();
  
  if (data.error) {
    throw new Error(data.error.message || "Gemini API error");
  }
  
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// MOCK FALLBACK
const MOCK_DELAY = 1000;
const mockAPI = {
  async generateName(context: any): Promise<string> {
    await new Promise(r => setTimeout(r, 800));
    const names = ["Thorgar", "Elara", "Kaelen", "Nyx", "Valen", "Sylas", "Aria", "Dorn"];
    return names[Math.floor(Math.random() * names.length)];
  },

  async generateCampaign(context: any): Promise<CampaignData> {
    await new Promise(r => setTimeout(r, MOCK_DELAY));
    return {
      title: "The Shadow of the Void",
      act1: "You awaken in a cold, dark cell with no memory of how you arrived.",
      act2: "A mysterious artifact whispers to you, promising power at a terrible cost.",
      act3: "You must choose between saving the realm or becoming its new tyrant.",
      possible_endings: ["Hero", "Tyrant", "Martyr"],
      world_backstory: "The world of Aethelgard is crumbling under the weight of an ancient curse.",
      character_backstory: `${context.name} was once a respected ${context.class} before the darkness fell.`
    };
  },

  async generateVisuals(context: any): Promise<string> {
    await new Promise(r => setTimeout(r, 500));
    return `A ${context.gender} ${context.race} ${context.class} standing in a dimly lit dungeon.`;
  },

  async chat(history: any[], context: GameState): Promise<TurnResponse> {
    await new Promise(r => setTimeout(r, MOCK_DELAY));
    
    const turnCount = context.turn + 1;
    const isLimit = turnCount >= context.maxTurns;
    
    if (isLimit) {
      return {
        narrative: `**Turn Limit Reached (Free Version)**\n\nThe mists of fate obscure your vision. To continue your journey and unlock unlimited turns, you must prove your worth (Login/Upgrade). \n\n*This is the end of the free trial.*`,
        hp_current: context.hp,
        gold: context.gold,
        inventory: context.inventory,
        options: ["End Trial"],
        game_over: true,
        visual_prompt: "A locked gate shrouded in mist"
      };
    }

    return {
      narrative: `You venture deeper into the darkness. The air grows colder. (Turn ${turnCount})\n\n*"What do you seek?"* a voice echoes.`,
      hp_current: context.hp,
      gold: context.gold + Math.floor(Math.random() * 5),
      inventory: context.inventory,
      options: ["Search the area", "Call out", "Draw weapon"],
      game_over: false,
      visual_prompt: "A dark corridor with glowing runes"
    };
  }
};
