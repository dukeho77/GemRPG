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
}

// Mock API for now
const MOCK_DELAY = 1500;

export const API = {
  async generateName(context: { gender: string, race: string, class: string }): Promise<string> {
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
