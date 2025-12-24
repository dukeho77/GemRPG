import { CLASSES, ClassName, RaceName } from "./game-constants";

export interface GameState {
  id?: string; // Adventure ID (only for signed-in users)
  name: string;
  class: ClassName;
  race: RaceName;
  gender: 'Male' | 'Female';
  customInstructions: string;
  themeSeeds: string; // The random keywords or custom theme for display
  endgame: CampaignData | null;
  characterDescription: string;
  history: HistoryEntry[];
  hp: number;
  gold: number;
  inventory: string[];
  turn: number;
  maxTurns: number;
  // For resuming - last turn's display data
  lastNarrative?: string;
  lastOptions?: string[];
  lastAction?: string;
  lastImage?: string; // Last scene image (base64) for resume
}

export interface HistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
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

export interface EpilogueResponse {
  epilogue_title: string;
  epilogue_text: string;
  ending_type: 'victory' | 'death' | 'bittersweet' | 'mysterious';
  legacy: string;
  visual_prompt: string;
}

// Server-side adventure types
export interface Adventure {
  id: string;
  userId: string;
  characterName: string;
  characterRace: string;
  characterClass: string;
  characterGender: string;
  characterDescription: string | null;
  campaignTitle: string | null;
  campaignData: CampaignData | null;
  themeSeeds: string | null;
  currentHp: number;
  gold: number;
  inventory: string[];
  turnCount: number;
  maxTurns: number;
  status: 'active' | 'completed' | 'abandoned';
  endingType: 'victory' | 'death' | 'limit_reached' | null;
  lastImage?: string | null; // Last generated scene image (base64) - stripped from API responses
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string;
}

export interface AdventureTurn {
  id: string;
  adventureId: string;
  turnNumber: number;
  playerAction: string;
  narrative: string;
  visualPrompt: string | null;
  hpAfter: number;
  goldAfter: number;
  inventoryAfter: string[];
  options: string[];
  createdAt: string;
}


export const API = {
  // Generate character name via server
  async generateName(context: { gender: string, race: string, class: string }): Promise<string> {
    try {
      const res = await fetch('/api/ai/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(context)
      });
      
      const data = await res.json();
      return data.name || "Hero";
    } catch {
      return "Hero";
    }
  },

  // Generate campaign via server
  async generateCampaign(context: { name: string; gender: string; race: string; class: string; customInstructions?: string }): Promise<CampaignData> {
    try {
      const res = await fetch('/api/ai/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(context)
      });
      
      const data = await res.json();
      
      if (!data.title || !data.act1) {
        throw new Error("Invalid campaign");
      }
      
      return data;
    } catch {
      // Return fallback
      return {
        title: "The Shadow of the Void",
        act1: "You awaken in a cold, dark cell with no memory of how you arrived.",
        act2: "A mysterious artifact whispers to you, promising power at a terrible cost.",
        act3: "You must choose between saving the realm or becoming its new tyrant.",
        possible_endings: ["Hero", "Tyrant", "Martyr"],
        world_backstory: "The world of Aethelgard is crumbling under the weight of an ancient curse.",
        character_backstory: `${context.name} was once a respected ${context.class} before the darkness fell.`
      };
    }
  },

  // Generate character visuals via server
  async generateVisuals(context: { gender: string; race: string; class: string }): Promise<string> {
    try {
      const res = await fetch('/api/ai/visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(context)
      });
      
      const data = await res.json();
      return data.description || `${context.gender} ${context.race} ${context.class}`;
    } catch {
      return `${context.gender} ${context.race} ${context.class}`;
    }
  },

  // Main chat - returns narrative/options via server
  async chat(history: HistoryEntry[], context: GameState, userInput?: string, diceRoll?: { raw: number; modifier: number; total: number }): Promise<TurnResponse> {
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ history, context, userInput, diceRoll })
      });
      
      if (res.status === 429) {
        const data = await res.json();
        return {
          narrative: data.message || "Daily limit reached. Sign in for unlimited play!",
          hp_current: context.hp,
          gold: context.gold,
          inventory: context.inventory,
          options: [],
          game_over: true
        };
      }
      
      if (res.status === 403) {
        const data = await res.json();
        return {
          narrative: data.narrative || "Your free trial has ended.",
          hp_current: context.hp,
          gold: context.gold,
          inventory: context.inventory,
          options: [],
          game_over: true
        };
      }
      
      return await res.json();
      
    } catch {
      return {
        narrative: "The mists of fate swirl around you...",
        hp_current: context.hp,
        gold: context.gold,
        inventory: context.inventory,
        options: ["Continue cautiously", "Rest", "Look around"],
        game_over: false
      };
    }
  },

  // Image generation via server (optionally saves to adventure if adventureId provided)
  async generateImage(prompt: string, adventureId?: string): Promise<string | null> {
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt, adventureId })
      });
      
      const data = await res.json();
      return data.image || null;
    } catch {
      return null;
    }
  },

  // Generate epilogue based on full conversation history
  async generateEpilogue(history: HistoryEntry[], context: GameState): Promise<EpilogueResponse> {
    try {
      const res = await fetch('/api/ai/epilogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ history, context })
      });
      
      return await res.json();
    } catch {
      return {
        epilogue_title: "The End",
        epilogue_text: "And so the tale came to its end. What adventures await beyond, only time will tell.",
        ending_type: "mysterious",
        legacy: "Their story lives on in whispered legends.",
        visual_prompt: "A weathered book closing on an epic tale"
      };
    }
  }
};


// ============== Adventure Persistence API (for signed-in users) ==============

export const AdventureAPI = {
  // List user's adventures
  async listAdventures(): Promise<{ adventures: Adventure[]; isPremium: boolean; limit: number | null }> {
    const res = await fetch('/api/adventures', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch adventures');
    }
    return res.json();
  },

  // Get active adventure (for "Continue" button)
  async getActiveAdventure(): Promise<{ adventure: Adventure | null; turns: AdventureTurn[] }> {
    const res = await fetch('/api/adventures/active', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch active adventure');
    }
    return res.json();
  },

  // Resume a specific adventure with its turns
  async resumeAdventure(id: string): Promise<{ adventure: Adventure; turns: AdventureTurn[] }> {
    const res = await fetch(`/api/adventures/${id}/resume`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to resume adventure');
    }
    return res.json();
  },

  // Create a new adventure
  async createAdventure(gameState: GameState): Promise<Adventure> {
    const res = await fetch('/api/adventures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        characterName: gameState.name,
        characterRace: gameState.race,
        characterClass: gameState.class,
        characterGender: gameState.gender,
        characterDescription: gameState.characterDescription,
        campaignTitle: gameState.endgame?.title || null,
        campaignData: gameState.endgame,
        themeSeeds: gameState.themeSeeds,
        currentHp: gameState.hp,
        gold: gameState.gold,
        inventory: gameState.inventory,
        turnCount: 0,
        maxTurns: -1, // Unlimited for signed-in users
      }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to create adventure');
    }
    return res.json();
  },

  // Save a turn
  async saveTurn(adventureId: string, turnData: {
    playerAction: string;
    narrative: string;
    visualPrompt?: string;
    hpAfter: number;
    goldAfter: number;
    inventoryAfter: string[];
    options: string[];
  }): Promise<{ turn: AdventureTurn; turnNumber: number }> {
    const res = await fetch(`/api/adventures/${adventureId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(turnData),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to save turn');
    }
    return res.json();
  },

  // Update adventure (status, etc.)
  async updateAdventure(id: string, updates: {
    currentHp?: number;
    gold?: number;
    inventory?: string[];
    status?: 'active' | 'completed' | 'abandoned';
    endingType?: 'victory' | 'death' | 'limit_reached';
    lastImage?: string;
  }): Promise<Adventure> {
    const res = await fetch(`/api/adventures/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to update adventure');
    }
    return res.json();
  },

  // Delete an adventure
  async deleteAdventure(id: string): Promise<void> {
    const res = await fetch(`/api/adventures/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    
    if (!res.ok) {
      throw new Error('Failed to delete adventure');
    }
  },

  // Restart an adventure (delete all turns and reset to turn 0)
  async restartAdventure(id: string): Promise<Adventure> {
    const res = await fetch(`/api/adventures/${id}/restart`, {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Failed to restart adventure');
    }
    const data = await res.json();
    return data.adventure;
  },

  // Convert Adventure + Turns to GameState
  adventureToGameState(adventure: Adventure, turns: AdventureTurn[]): GameState {
    // Reconstruct history from turns
    const history: HistoryEntry[] = [];
    for (const turn of turns) {
      // User message
      history.push({
        role: 'user',
        parts: [{ text: turn.playerAction }],
      });
      // Model response (simplified, without visual_prompt)
      history.push({
        role: 'model',
        parts: [{
          text: JSON.stringify({
            narrative: turn.narrative,
            hp_current: turn.hpAfter,
            gold: turn.goldAfter,
            inventory: turn.inventoryAfter,
            options: turn.options,
            game_over: false,
          }),
        }],
      });
    }

    // Get the last turn's data for immediate display on resume
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

    return {
      id: adventure.id,
      name: adventure.characterName,
      class: adventure.characterClass as ClassName,
      race: adventure.characterRace as RaceName,
      gender: adventure.characterGender as 'Male' | 'Female',
      customInstructions: adventure.themeSeeds || '',
      themeSeeds: adventure.themeSeeds || '',
      endgame: adventure.campaignData,
      characterDescription: adventure.characterDescription || '',
      history,
      hp: adventure.currentHp,
      gold: adventure.gold,
      inventory: adventure.inventory as string[],
      turn: adventure.turnCount,
      maxTurns: adventure.maxTurns,
      // Last turn data for immediate display on resume
      lastNarrative: lastTurn?.narrative,
      lastOptions: lastTurn?.options as string[] | undefined,
      lastAction: lastTurn?.playerAction,
      // Use image URL endpoint instead of base64 (more efficient, cacheable)
      lastImage: `/api/adventures/${adventure.id}/image`,
    };
  },
};
