
export const CLASSES = {
  'Warrior': { hp: 30, items: ['Greatsword', 'Chainmail', 'Potion'] },
  'Paladin': { hp: 28, items: ['Longsword', 'Shield', 'Holy Symbol'] },
  'Barbarian': { hp: 35, items: ['Greataxe', 'Handaxe', 'Javelins'] },
  'Ranger': { hp: 26, items: ['Longbow', 'Shortswords', 'Cloak'] },
  'Rogue': { hp: 20, items: ['Daggers', 'Cloak', 'Lockpicks'] },
  'Mage': { hp: 16, items: ['Staff', 'Robes', 'Tome'] },
  'Sorcerer': { hp: 18, items: ['Arcane Focus', 'Dagger', 'Robes'] },
  'Warlock': { hp: 20, items: ['Dagger', 'Eldritch Eye', 'Leather Armor'] },
  'Cleric': { hp: 24, items: ['Mace', 'Shield', 'Holy Symbol'] },
  'Druid': { hp: 24, items: ['Scimitar', 'Wooden Shield', 'Holly'] },
  'Bard': { hp: 22, items: ['Lute', 'Rapier', 'Dagger'] },
  'Monk': { hp: 24, items: ['Staff', 'Darts', 'Meditation Beads'] }
} as const;

export type ClassName = keyof typeof CLASSES;

export const RACES = {
  'Human': 'Versatile', 'Elf': 'Keen', 'Dwarf': 'Resilient', 
  'Halfling': 'Lucky', 'Dragonborn': 'Strong', 'Gnome': 'Clever',
  'Half-Orc': 'Relentless', 'Tiefling': 'Charismatic', 'Aasimar': 'Divine'
} as const;

export type RaceName = keyof typeof RACES;

export const RPG_KEYWORDS = ["Abyss", "Arcane", "Artifact", "Ash", "Bane", "Bastion", "Beast", "Betrayal", "Blade", "Blood", "Bone", "Chaos", "Chronicle", "Citadel", "Clockwork", "Covenant", "Crimson", "Crown", "Crypt", "Crystal", "Curse", "Darkness", "Dawn", "Demon", "Destiny", "Divine", "Doom", "Dragon", "Dread", "Dream", "Dungeon", "Dusk", "Echo", "Eclipse", "Elder", "Ember", "Empire", "Enigma", "Eternal", "Exile", "Fable", "Fate", "Flame", "Forbidden", "Forest", "Forsaken", "Frost", "Ghost", "Gloom", "Glory", "God", "Gold", "Grave", "Grimoire", "Guardian", "Haven", "Heart", "Hell", "Hero", "Hollow", "Honor", "Hope", "Ice", "Immortal", "Inferno", "Iron", "Ivory", "Jewel", "Journey", "Keep", "King", "Knight", "Legend", "Lich", "Light", "Lord", "Lost", "Magic", "Mana", "Maze", "Memory", "Moon", "Myth", "Necromancer", "Night", "Nightmare", "Oath", "Oblivion", "Omen", "Oracle", "Phantom", "Plague", "Portal", "Power", "Prophecy", "Pyre", "Queen", "Quest", "Realm", "Rebellion"];
