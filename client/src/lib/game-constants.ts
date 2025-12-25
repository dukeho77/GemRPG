import { SKILL_CATEGORIES, CLASS_BONUSES, RACE_BONUSES, getCharacterBonuses } from '@shared/game-bonuses';

export { SKILL_CATEGORIES, CLASS_BONUSES, RACE_BONUSES, getCharacterBonuses };

export const CLASSES = {
  'Warrior': { hp: 30, items: ['Greatsword', 'Chainmail', 'Potion'], ...CLASS_BONUSES['Warrior'] },
  'Paladin': { hp: 28, items: ['Longsword', 'Shield', 'Holy Symbol'], ...CLASS_BONUSES['Paladin'] },
  'Barbarian': { hp: 35, items: ['Greataxe', 'Handaxe', 'Javelins'], ...CLASS_BONUSES['Barbarian'] },
  'Ranger': { hp: 26, items: ['Longbow', 'Shortswords', 'Cloak'], ...CLASS_BONUSES['Ranger'] },
  'Rogue': { hp: 20, items: ['Daggers', 'Cloak', 'Lockpicks'], ...CLASS_BONUSES['Rogue'] },
  'Mage': { hp: 16, items: ['Staff', 'Robes', 'Tome'], ...CLASS_BONUSES['Mage'] },
  'Sorcerer': { hp: 18, items: ['Arcane Focus', 'Dagger', 'Robes'], ...CLASS_BONUSES['Sorcerer'] },
  'Warlock': { hp: 20, items: ['Dagger', 'Eldritch Eye', 'Leather Armor'], ...CLASS_BONUSES['Warlock'] },
  'Cleric': { hp: 24, items: ['Mace', 'Shield', 'Holy Symbol'], ...CLASS_BONUSES['Cleric'] },
  'Druid': { hp: 24, items: ['Scimitar', 'Wooden Shield', 'Holly'], ...CLASS_BONUSES['Druid'] },
  'Bard': { hp: 22, items: ['Lute', 'Rapier', 'Dagger'], ...CLASS_BONUSES['Bard'] },
  'Monk': { hp: 24, items: ['Staff', 'Darts', 'Meditation Beads'], ...CLASS_BONUSES['Monk'] }
} as const;

export type ModifierType = keyof typeof SKILL_CATEGORIES;
export type ClassName = keyof typeof CLASSES;

export const RACES = RACE_BONUSES;
export type RaceName = keyof typeof RACES;

export const RPG_KEYWORDS = ["Abyss", "Arcane", "Artifact", "Ash", "Bane", "Bastion", "Beast", "Betrayal", "Blade", "Blood", "Bone", "Chaos", "Chronicle", "Citadel", "Clockwork", "Covenant", "Crimson", "Crown", "Crypt", "Crystal", "Curse", "Darkness", "Dawn", "Demon", "Destiny", "Divine", "Doom", "Dragon", "Dread", "Dream", "Dungeon", "Dusk", "Echo", "Eclipse", "Elder", "Ember", "Empire", "Enigma", "Eternal", "Exile", "Fable", "Fate", "Flame", "Forbidden", "Forest", "Forsaken", "Frost", "Ghost", "Gloom", "Glory", "God", "Gold", "Grave", "Grimoire", "Guardian", "Haven", "Heart", "Hell", "Hero", "Hollow", "Honor", "Hope", "Ice", "Immortal", "Inferno", "Iron", "Ivory", "Jewel", "Journey", "Keep", "King", "Knight", "Legend", "Lich", "Light", "Lord", "Lost", "Magic", "Mana", "Maze", "Memory", "Moon", "Myth", "Necromancer", "Night", "Nightmare", "Oath", "Oblivion", "Omen", "Oracle", "Phantom", "Plague", "Portal", "Power", "Prophecy", "Pyre", "Queen", "Quest", "Realm", "Rebellion"];
