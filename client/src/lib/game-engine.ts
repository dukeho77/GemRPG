import { CLASSES, ClassName, RaceName } from "./game-constants";

export interface GameState {
  name: string;
  class: ClassName;
  race: RaceName;
  gender: 'Male' | 'Female';
  customInstructions: string;
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
  image_base64?: string; // Added for dynamic images
}

// Configuration
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const MODEL_TEXT = "gemini-2.0-flash"; // Using a stable model
const MODEL_IMAGE = "imagen-3.0-generate-001"; 

export const API = {
  async generateName(context: { gender: string, race: string, class: string }): Promise<string> {
    if (!API_KEY) return mockAPI.generateName(context);

    const prompt = `Generate a SINGLE creative fantasy name for a ${context.gender} ${context.race} ${context.class}. Output ONLY the name (e.g., "Thorgar"). No text like "Here is a name:".`;
    
    try {
      const text = await callGemini(prompt);
      return text.replace(/["']/g, "").trim() || "Adventurer";
    } catch (e) {
      console.error("AI Name Gen Error", e);
      return "Hero";
    }
  },

  async generateCampaign(context: any): Promise<CampaignData> {
    if (!API_KEY) return mockAPI.generateCampaign(context);

    const prompt = `You are a master RPG Architect. Create a rich, 3-Act Campaign Structure and Backstories.
    Player Name: "${context.name}".
    Details: ${context.gender} ${context.race} ${context.class}.
    Theme: "${context.customInstructions}".
    
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
      return JSON.parse(text);
    } catch (e) {
      console.error("AI Campaign Gen Error", e);
      return mockAPI.generateCampaign(context);
    }
  },

  async generateVisuals(context: any): Promise<string> {
    if (!API_KEY) return mockAPI.generateVisuals(context);

    const prompt = `Generate a concise (max 25 words) visual description for a dark fantasy RPG character. Role: ${context.gender} ${context.race} ${context.class}. Requirements: Describe physique, hair, eyes, and clothing/armor. Output: Just the description text.`;
    
    try {
      return await callGemini(prompt);
    } catch (e) {
      return `${context.gender} ${context.race} ${context.class}`;
    }
  },

  async chat(history: any[], context: GameState): Promise<TurnResponse> {
    if (!API_KEY) return mockAPI.chat(history, context);
    
    const turnCount = context.turn + 1;
    const isLimit = turnCount >= context.maxTurns;

    // Force end if limit reached
    if (isLimit) {
       return mockAPI.chat(history, context); // Use mock response for limit message to ensure consistency
    }

    const c = context.endgame!;
    const systemPrompt = `Role: Dungeon Master. Theme: ${context.customInstructions}. Character: ${context.name} (${context.gender} ${context.race} ${context.class}). Visual DNA: "${context.characterDescription}". CAMPAIGN: ${c.title}. Act 1: ${c.act1}. Act 2: ${c.act2}. Act 3: ${c.act3}. Endings: ${c.possible_endings.join(' | ')}. Instructions: 1. STRICT JSON. 2. Narrative: 2nd Person ("You..."). 4-6 sentences. Evocative. Use the name "${context.name}" occasionally. 3. Visual Prompt: Describe CURRENT scene. Decide First vs Third person. 4. Logic: IF HP <= 0 OR Story ends -> "game_over": true. JSON Schema: { "narrative": "Story text (Markdown)", "visual_prompt": "Image prompt", "hp_current": Number, "gold": Number, "inventory": [], "options": ["Option 1", "Option 2", "Option 3"], "game_over": Boolean } Context: Player Inventory: ${context.inventory.join(', ')}. Current HP: ${context.hp}.`;

    try {
      // Convert history to Gemini format
      const geminiHistory = history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: h.parts
      }));

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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("No content");
      
      const response = JSON.parse(text) as TurnResponse;

      // Try to generate image if visual prompt exists
      if (response.visual_prompt) {
        // Note: Image generation might be slow, maybe we skip it for speed or do it async?
        // For now, let's try to fetch it if possible, or just return null
        // response.image_base64 = await generateImage(response.visual_prompt);
      }

      return response;

    } catch (e) {
      console.error("AI Chat Error", e);
      return mockAPI.chat(history, context);
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Helper for Image (Placeholder for now as Imagen API varies)
async function generateImage(prompt: string): Promise<string | undefined> {
    // Implementation depends on specific Imagen endpoint access
    return undefined;
}

// MOCK FALLBACK (The original code)
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
