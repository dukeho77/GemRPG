import React, { useState } from 'react';
import { Crown, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { CLASSES, RACES, RPG_KEYWORDS, ClassName, RaceName } from '@/lib/game-constants';
import { API, GameState } from '@/lib/game-engine';
import { useLocation } from 'wouter';

interface CreationScreenProps {
  onGameStart: (state: GameState) => void;
}

export function CreationScreen({ onGameStart }: CreationScreenProps) {
  const [name, setName] = useState('Adam Kingsborn');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [selectedClass, setSelectedClass] = useState<ClassName>('Warrior');
  const [selectedRace, setSelectedRace] = useState<RaceName>('Human');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [, setLocation] = useLocation();

  const handleGenerateName = async () => {
    setIsGeneratingName(true);
    try {
      const newName = await API.generateName({ gender, race: selectedRace, class: selectedClass });
      setName(newName);
    } finally {
      setIsGeneratingName(false);
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // Initial State
      const initialState: GameState = {
        name: name || 'Adventurer',
        class: selectedClass,
        race: selectedRace,
        gender,
        customInstructions: customPrompt,
        endgame: null, // Will be populated by game engine
        characterDescription: '',
        history: [],
        hp: CLASSES[selectedClass].hp,
        gold: 10,
        inventory: [...CLASSES[selectedClass].items],
        turn: 0,
        maxTurns: 5 // Free version limit
      };

      // Pre-fetch campaign data (simulation)
      const [campaign, visual] = await Promise.all([
        API.generateCampaign(initialState),
        API.generateVisuals(initialState)
      ]);

      initialState.endgame = campaign;
      initialState.characterDescription = visual;

      onGameStart(initialState);
    } catch (error) {
      console.error("Failed to start game", error);
      setIsStarting(false);
    }
  };

  const canStart = name.length > 0;

  return (
    <div className="h-screen w-full overflow-y-auto bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=2574')] bg-cover bg-center relative">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm fixed"></div>
        
        <div className="relative w-full max-w-xl bg-void-light/95 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-white/10 shadow-2xl my-auto">
          <div className="text-center mb-6">
          <Crown className="w-10 h-10 text-gold mx-auto mb-3" />
          <h1 className="font-fantasy text-3xl text-transparent bg-clip-text bg-gradient-to-r from-gold to-yellow-600 mb-1">GemRPG</h1>
          <p className="text-gray-400 text-[10px] tracking-[0.2em] uppercase">Campaign Edition</p>
        </div>

        <div className="space-y-5">
          {/* Name & Gender */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block ml-1">Hero Name</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  name="hero-name-field"
                  id="hero-name-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-mystic outline-none" 
                  placeholder="Enter name or generate..." 
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-lpignore="true"
                  data-form-type="other"
                  data-1p-ignore="true"
                />
                <button 
                  onClick={handleGenerateName}
                  disabled={isGeneratingName}
                  className="px-3 bg-gray-800 border border-gray-700 rounded-lg text-mystic hover:text-white transition-colors relative disabled:opacity-50"
                >
                  {isGeneratingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block ml-1">Gender</label>
              <div className="flex bg-black/50 rounded-lg border border-gray-700 p-1">
                {(['Male', 'Female'] as const).map(g => (
                  <button 
                    key={g}
                    onClick={() => setGender(g)}
                    className={`flex-1 rounded py-2 text-xs font-bold transition-colors ${gender === g ? 'bg-mystic text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Class Selection */}
          <div>
            <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block ml-1">Class</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(CLASSES).map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedClass(c as ClassName)}
                  className={`p-2 border rounded text-[10px] font-bold transition-colors text-center uppercase tracking-wide truncate ${
                    selectedClass === c 
                      ? 'bg-mystic/20 border-mystic text-white' 
                      : 'border-gray-700 bg-void-light text-gray-400 hover:border-mystic hover:text-white'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Race Selection */}
          <div>
            <label className="text-[10px] uppercase text-gray-500 font-bold mb-1 block ml-1">Lineage</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(RACES).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRace(r as RaceName)}
                  className={`p-2 border rounded text-[10px] font-bold transition-colors text-center uppercase tracking-wide truncate ${
                    selectedRace === r 
                      ? 'bg-mystic/20 border-mystic text-white' 
                      : 'border-gray-700 bg-void-light text-gray-400 hover:border-mystic hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div>
            <label className="text-[10px] uppercase text-gold font-bold mb-1 block ml-1 flex justify-between">
              <span>Campaign Seed</span> <span className="text-gray-600 font-normal normal-case opacity-60">(Optional)</span>
            </label>
            <textarea 
              rows={2} 
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:border-gold outline-none resize-none" 
              placeholder="E.g., A cyberpunk noir mystery... (Or leave blank for random)"
            ></textarea>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-gray-700/50">
            <div className="flex justify-center text-[10px] text-gold font-mono mb-3 h-3">
              {gender} {selectedRace} {selectedClass}
            </div>
            <button 
              onClick={handleStart} 
              disabled={!canStart || isStarting}
              className="w-full bg-mystic hover:bg-indigo-600 text-white font-fantasy font-bold py-3 rounded-xl text-sm shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isStarting ? (
                <>
                  <span>Forging Destiny...</span>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </>
              ) : (
                <>
                  <span>Forge Destiny</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
