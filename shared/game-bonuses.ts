export const SKILL_CATEGORIES = {
  combat: ['melee attacks', 'blocking', 'parrying', 'intimidation', 'wrestling', 'weapon techniques'],
  stealth: ['sneaking', 'hiding', 'lockpicking', 'pickpocketing', 'deception', 'disguise', 'sleight of hand'],
  arcane: ['spellcasting', 'magical knowledge', 'enchanting', 'dispelling', 'arcane rituals', 'reading magical texts'],
  divine: ['healing', 'blessing', 'banishing undead', 'holy rituals', 'sensing evil', 'prayer'],
  nature: ['animal handling', 'tracking', 'herbalism', 'weather sense', 'shapeshifting', 'plant lore'],
  social: ['persuasion', 'performance', 'inspiration', 'charm', 'negotiation', 'storytelling'],
  survival: ['tracking', 'foraging', 'navigation', 'hunting', 'trap setting', 'wilderness knowledge']
} as const;

export const CLASS_BONUSES: Record<string, { modifier: number; modifierType: keyof typeof SKILL_CATEGORIES; secondaryType?: keyof typeof SKILL_CATEGORIES; secondaryMod?: number }> = {
  'Warrior': { modifier: 3, modifierType: 'combat' },
  'Paladin': { modifier: 2, modifierType: 'combat', secondaryType: 'divine', secondaryMod: 1 },
  'Barbarian': { modifier: 3, modifierType: 'combat' },
  'Ranger': { modifier: 2, modifierType: 'survival', secondaryType: 'combat', secondaryMod: 1 },
  'Rogue': { modifier: 3, modifierType: 'stealth' },
  'Mage': { modifier: 3, modifierType: 'arcane' },
  'Sorcerer': { modifier: 3, modifierType: 'arcane' },
  'Warlock': { modifier: 2, modifierType: 'arcane' },
  'Cleric': { modifier: 2, modifierType: 'divine' },
  'Druid': { modifier: 2, modifierType: 'nature' },
  'Bard': { modifier: 3, modifierType: 'social' },
  'Monk': { modifier: 2, modifierType: 'combat' }
};

export const RACE_BONUSES: Record<string, { trait: string; bonus: string }> = {
  'Human': { trait: 'Versatile', bonus: '+1 to any skill check (flexible)' },
  'Elf': { trait: 'Keen Senses', bonus: '+2 to perception, detecting hidden things' },
  'Dwarf': { trait: 'Resilient', bonus: '+2 to resisting poison, endurance checks' },
  'Halfling': { trait: 'Lucky', bonus: 'Reroll natural 1s (treat as partial success)' },
  'Dragonborn': { trait: 'Draconic Power', bonus: '+2 to intimidation, breath attacks' },
  'Gnome': { trait: 'Clever', bonus: '+2 to magical knowledge, tinkering' },
  'Half-Orc': { trait: 'Relentless', bonus: '+2 to strength checks, surviving lethal damage once' },
  'Tiefling': { trait: 'Infernal Heritage', bonus: '+2 to fire resistance, dark bargains' },
  'Aasimar': { trait: 'Celestial', bonus: '+2 to healing, sensing evil' }
};

export function getCharacterBonuses(className: string, raceName: string): string {
  const classData = CLASS_BONUSES[className];
  const raceData = RACE_BONUSES[raceName];
  
  if (!classData || !raceData) {
    return `Class: ${className}, Race: ${raceName}`;
  }
  
  const primarySkills = SKILL_CATEGORIES[classData.modifierType];
  
  let bonusText = `**CLASS BONUSES (${className}):**\n`;
  bonusText += `+${classData.modifier} to: ${primarySkills.join(', ')}\n`;
  
  if (classData.secondaryType && classData.secondaryMod) {
    const secondarySkills = SKILL_CATEGORIES[classData.secondaryType];
    bonusText += `+${classData.secondaryMod} to: ${secondarySkills.join(', ')}\n`;
  }
  
  bonusText += `\n**RACIAL BONUS (${raceName} - ${raceData.trait}):**\n`;
  bonusText += raceData.bonus;
  
  return bonusText;
}
