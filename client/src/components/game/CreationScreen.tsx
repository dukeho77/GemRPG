import React, { useState, useEffect } from 'react';
import { Crown, Sparkles, ArrowRight, Loader2, AlertCircle, LogIn, LogOut, BookOpen, X, Play, Trash2 } from 'lucide-react';
import { CLASSES, RACES, RPG_KEYWORDS, ClassName, RaceName } from '@/lib/game-constants';
import { API, GameState, Adventure, AdventureAPI } from '@/lib/game-engine';
import { useLocation } from 'wouter';

interface RateLimitStatus {
  authenticated: boolean;
  unlimited: boolean;
  gamesRemaining?: number;
  totalAllowed?: number;
  isPremium?: boolean;
}

interface CreationScreenProps {
  onGameStart: (state: GameState) => void;
  isAuthenticated?: boolean;
}

export function CreationScreen({ onGameStart, isAuthenticated = false }: CreationScreenProps) {
  const [name, setName] = useState('Adam Kingsborn');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [selectedClass, setSelectedClass] = useState<ClassName>('Warrior');
  const [selectedRace, setSelectedRace] = useState<RaceName>('Human');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [generatingSeeds, setGeneratingSeeds] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  
  // Rate limit state
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  
  // Adventure list state
  const [showAdventures, setShowAdventures] = useState(false);
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [adventuresLoading, setAdventuresLoading] = useState(false);
  const [loadingAdventureId, setLoadingAdventureId] = useState<string | null>(null);

  // Fetch rate limit status on mount
  useEffect(() => {
    fetch('/api/rate-limit/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setRateLimit(data))
      .catch(err => console.error('Failed to fetch rate limit:', err));
  }, []);

  // Fetch adventures when modal opens
  const handleShowAdventures = async () => {
    setShowAdventures(true);
    setAdventuresLoading(true);
    try {
      const { adventures: list } = await AdventureAPI.listAdventures();
      setAdventures(list);
    } catch (err) {
      console.error('Failed to fetch adventures:', err);
    } finally {
      setAdventuresLoading(false);
    }
  };

  // Load selected adventure
  const handleLoadAdventure = async (adventure: Adventure) => {
    setLoadingAdventureId(adventure.id);
    try {
      const { adventure: fullAdventure, turns } = await AdventureAPI.resumeAdventure(adventure.id);
      if (fullAdventure) {
        const state = AdventureAPI.adventureToGameState(fullAdventure, turns);
        setShowAdventures(false);
        onGameStart(state);
      }
    } catch (err) {
      console.error('Failed to load adventure:', err);
    } finally {
      setLoadingAdventureId(null);
    }
  };

  // Delete adventure
  const handleDeleteAdventure = async (adventureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this adventure? This cannot be undone.')) return;
    try {
      await AdventureAPI.deleteAdventure(adventureId);
      setAdventures(prev => prev.filter(a => a.id !== adventureId));
    } catch (err) {
      console.error('Failed to delete adventure:', err);
    }
  };

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
    setRateLimitError(null);
    
    try {
      // Track game start for anonymous users (rate limiting)
      if (!isAuthenticated) {
        const trackRes = await fetch('/api/rate-limit/track', {
          method: 'POST',
          credentials: 'include'
        });
        
        if (trackRes.status === 429) {
          const data = await trackRes.json();
          setRateLimitError(data.message || 'Daily limit reached. Sign in for unlimited play!');
          setIsStarting(false);
          return;
        }
        
        // Update local rate limit state
        if (rateLimit && rateLimit.gamesRemaining !== undefined) {
          setRateLimit({
            ...rateLimit,
            gamesRemaining: Math.max(0, rateLimit.gamesRemaining - 1)
          });
        }
      }

      // Determine theme seeds - random 3 words if no custom prompt
      let seedText = customPrompt.trim();
      let themeSeeds = '';
      
      if (!seedText) {
        // Pick 3 random words from RPG_KEYWORDS (like original prototype)
        const shuffled = [...RPG_KEYWORDS].sort(() => 0.5 - Math.random());
        const seeds = shuffled.slice(0, 3);
        seedText = `Theme: ${seeds.join(', ')}`;
        themeSeeds = seeds.join(' • ');
        setGeneratingSeeds(seeds);
      } else {
        themeSeeds = `Custom: ${seedText}`;
        setGeneratingSeeds([]);
      }

      // Initial State
      const initialState: GameState = {
        name: name || 'Adventurer',
        class: selectedClass,
        race: selectedRace,
        gender,
        customInstructions: seedText,
        themeSeeds: themeSeeds,
        endgame: null, // Will be populated by game engine
        characterDescription: '',
        history: [],
        hp: CLASSES[selectedClass].hp,
        gold: 10,
        inventory: [...CLASSES[selectedClass].items],
        turn: 0,
        maxTurns: isAuthenticated ? -1 : 5 // Unlimited for signed-in, 5 for anonymous
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
      setGeneratingSeeds([]);
    }
  };

  // Check if user can start a game
  const hasGamesRemaining = rateLimit === null || rateLimit.authenticated || rateLimit.unlimited || (rateLimit.gamesRemaining !== undefined && rateLimit.gamesRemaining > 0);
  const canStart = name.length > 0 && hasGamesRemaining;

  return (
    <div className="h-screen w-full overflow-y-auto bg-[url('https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=2574')] bg-cover bg-center relative">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm fixed"></div>
        
        {/* My Adventures Button - Top Left (only for authenticated) */}
        {isAuthenticated && (
          <button
            onClick={handleShowAdventures}
            className="fixed top-6 left-6 z-50 p-3 bg-void-light/80 backdrop-blur-md border border-mystic/30 rounded-full text-mystic hover:text-white hover:border-mystic hover:bg-mystic/20 transition-all duration-300 shadow-lg"
            title="My Adventures"
          >
            <BookOpen className="w-5 h-5" />
          </button>
        )}
        
        {/* Sign In / Sign Out Button - Top Right */}
        {!isAuthenticated ? (
          <button
            onClick={() => setLocation('/login')}
            className="fixed top-6 right-6 z-50 p-3 bg-void-light/80 backdrop-blur-md border border-gold/30 rounded-full text-gold hover:text-white hover:border-gold hover:bg-gold/20 transition-all duration-300 shadow-lg"
            title="Sign In"
          >
            <LogIn className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => { window.location.href = '/api/logout'; }}
            className="fixed top-6 right-6 z-50 p-3 bg-void-light/80 backdrop-blur-md border border-red-500/30 rounded-full text-red-400 hover:text-white hover:border-red-500 hover:bg-red-500/20 transition-all duration-300 shadow-lg"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
        
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
            
            {/* Rate limit error */}
            {rateLimitError && (
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{rateLimitError}</span>
              </div>
            )}
            
            {/* Games remaining indicator for anonymous users */}
            {rateLimit && !rateLimit.authenticated && rateLimit.gamesRemaining !== undefined && (
              <div className={`mb-3 text-center text-xs ${rateLimit.gamesRemaining > 0 ? 'text-gold' : 'text-red-400'}`}>
                {rateLimit.gamesRemaining > 0 ? (
                  <span>🎮 {rateLimit.gamesRemaining} free {rateLimit.gamesRemaining === 1 ? 'game' : 'games'} remaining today</span>
                ) : (
                  <span>Daily limit reached • <button onClick={() => setLocation('/login')} className="underline hover:text-white">Sign in for unlimited</button></span>
                )}
              </div>
            )}
            
            <button 
              onClick={handleStart} 
              disabled={!canStart || isStarting}
              className="w-full bg-mystic hover:bg-indigo-600 text-white font-fantasy font-bold py-3 rounded-xl text-sm shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isStarting ? (
                <>
                  <span>{generatingSeeds.length > 0 ? `Forging: ${generatingSeeds.join(' ')}...` : 'Forging Destiny...'}</span>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </>
              ) : !hasGamesRemaining ? (
                <>
                  <span>Sign In to Play</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Forge Destiny</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            
            {/* Sign in prompt for anonymous users with remaining games */}
            {rateLimit && !rateLimit.authenticated && rateLimit.gamesRemaining !== undefined && rateLimit.gamesRemaining > 0 && (
              <div className="mt-3 text-center">
                <button 
                  onClick={() => setLocation('/login')} 
                  className="text-xs text-gray-500 hover:text-mystic transition-colors"
                >
                  Sign in for unlimited games & saved progress
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    
      {/* Adventures List Modal */}
      {showAdventures && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-void-light/95 border border-white/10 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-white/10">
              <h2 className="font-fantasy text-xl text-mystic flex items-center gap-2">
                <BookOpen className="w-5 h-5" /> My Adventures
              </h2>
              <button 
                onClick={() => setShowAdventures(false)} 
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {adventuresLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-mystic animate-spin" />
                </div>
              ) : adventures.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No adventures yet. Start your first one!
                </div>
              ) : (
                adventures.map(adventure => (
                  <div
                    key={adventure.id}
                    onClick={() => handleLoadAdventure(adventure)}
                    className={`p-4 bg-black/30 border rounded-lg cursor-pointer transition-all hover:border-mystic/50 hover:bg-mystic/5 ${
                      adventure.status === 'active' ? 'border-mystic/30' : 'border-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white truncate">{adventure.characterName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                            adventure.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            adventure.status === 'completed' ? 'bg-gold/20 text-gold' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {adventure.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {adventure.characterRace} {adventure.characterClass} • Turn {adventure.turnCount}
                        </p>
                        {adventure.campaignTitle && (
                          <p className="text-xs text-mystic/70 truncate mt-1 italic">
                            {adventure.campaignTitle}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-600 mt-1">
                          {new Date(adventure.lastPlayedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {loadingAdventureId === adventure.id ? (
                          <Loader2 className="w-4 h-4 text-mystic animate-spin" />
                        ) : (
                          <>
                            <button
                              onClick={(e) => handleDeleteAdventure(adventure.id, e)}
                              className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <Play className="w-4 h-4 text-mystic" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={() => setShowAdventures(false)}
                className="w-full py-2.5 rounded-lg bg-mystic/10 border border-mystic/30 text-mystic hover:bg-mystic/20 text-sm font-bold transition-all"
              >
                Start New Adventure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
