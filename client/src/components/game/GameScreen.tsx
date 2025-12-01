import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { marked } from 'marked';
import { ArrowRightCircle, Skull, RefreshCw, Home, X, RotateCcw, Loader2, AlertTriangle, Crown, LogIn, LogOut } from 'lucide-react';
import { GameState, API, AdventureAPI, EpilogueResponse } from '@/lib/game-engine';
import { DiceRoller } from './DiceRoller';
import { GameHeader } from './GameHeader';
import stockImage from '@assets/stock_images/dark_fantasy_rpg_atm_0f6db108.jpg';

interface GameScreenProps {
  initialState: GameState;
  onReset: () => void;
  isAuthenticated?: boolean;
}

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText: string;
  cancelText: string;
  type: 'restart' | 'main-menu';
}

export function GameScreen({ initialState, onReset, isAuthenticated = false }: GameScreenProps) {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [epilogue, setEpilogue] = useState<EpilogueResponse | null>(null);
  const [epilogueLoading, setEpilogueLoading] = useState(false);
  const [narrative, setNarrative] = useState('<p class="italic text-gray-600">The world is forming...</p>');
  const [lastAction, setLastAction] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(
    initialState.lastImage || null // URL endpoint or null
  );
  const [imageLoading, setImageLoading] = useState(false);
  const [fadeKey, setFadeKey] = useState(0); // For triggering fade animation
  const [journeyComplete, setJourneyComplete] = useState(false); // Reached max turns but not dead

  // Confirmation Modal State
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'restart'
  });

  const narrativeRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Track if we've already started an initial turn to avoid duplicates
  const hasStartedRef = useRef(false);
  
  // Initial Start & Restart Logic
  useEffect(() => {
    // If resuming an adventure with saved turn data, restore immediately (only on mount)
    if (state.turn > 0 && initialState.lastNarrative && !hasStartedRef.current) {
      hasStartedRef.current = true;
      console.log('Resuming adventure with last turn data');
      setNarrative(marked.parse(initialState.lastNarrative) as string);
      if (initialState.lastOptions) {
        setOptions(initialState.lastOptions);
      }
      if (initialState.lastAction) {
        setLastAction(initialState.lastAction);
      }
      return; // Don't trigger new turn when resuming
    }
    
    // Fallback: try to restore from history if lastNarrative not available
    if (state.turn > 0 && state.history.length > 0 && !hasStartedRef.current) {
      hasStartedRef.current = true;
      const lastModelEntry = [...state.history].reverse().find(h => h.role === 'model');
      if (lastModelEntry) {
        try {
          const lastResponse = JSON.parse(lastModelEntry.parts[0].text);
          if (lastResponse.narrative) {
            setNarrative(marked.parse(lastResponse.narrative) as string);
          }
          if (lastResponse.options && Array.isArray(lastResponse.options)) {
            setOptions(lastResponse.options);
          }
          const lastUserEntry = [...state.history].reverse().find(h => h.role === 'user');
          if (lastUserEntry) {
            setLastAction(lastUserEntry.parts[0].text);
          }
        } catch (e) {
          console.error('Error parsing saved turn data:', e);
        }
      }
      return;
    }
    
    // Trigger start if turn is 0 and history is empty (Initial Start or Restart)
    if (state.turn === 0 && state.history.length === 0 && state.endgame) {
      handleTurn(`Begin Act 1: ${state.endgame.act1}. Introduce ${state.name}.`);
    }
  }, [state.turn, state.history.length]); // Re-run when turn or history changes (for restart)

  // Handle turn - like original's turn() function
  const handleTurn = async (inputText: string) => {
    if (isBusy) return;
    setIsBusy(true);

    // Start image loading state (blur current image via state)
    setImageLoading(true);

    // Add user input to history
    const newHistory = [...state.history];
    if (state.turn > 0) {
      newHistory.push({ role: 'user', parts: [{ text: inputText }] });
    }

    try {
      // Get narrative response (text only, fast)
      const response = await API.chat(newHistory, state, inputText);

      // Update state immediately (don't store visual_prompt in history)
      const historyResponse = { ...response };
      delete (historyResponse as any).visual_prompt;

      const newTurn = state.turn + 1;

      setState(prev => ({
        ...prev,
        hp: response.hp_current,
        gold: response.gold,
        inventory: response.inventory,
        turn: newTurn,
        history: [...newHistory, { role: 'model', parts: [{ text: JSON.stringify(historyResponse) }] }]
      }));

      // Update narrative with fade-in effect (like original)
      setFadeKey(prev => prev + 1);
      setNarrative(marked.parse(response.narrative) as string);
      setOptions(response.options || []);

      // Check for actual death vs journey complete (reached max turns)
      if (response.game_over) {
        setGameOver(true);
      } else if (state.maxTurns > 0 && newTurn >= state.maxTurns) {
        // Reached max turns but not dead - offer to continue (only for anonymous)
        setJourneyComplete(true);
      }

      // Save turn to server ASYNC (fire-and-forget, don't block UI)
      if (isAuthenticated && state.id) {
        // Save turn in background
        AdventureAPI.saveTurn(state.id, {
          playerAction: inputText,
          narrative: response.narrative,
          visualPrompt: response.visual_prompt,
          hpAfter: response.hp_current,
          goldAfter: response.gold,
          inventoryAfter: response.inventory,
          options: response.options || [],
        }).catch(err => console.error('Failed to save turn:', err));

        // Update status if game over (also fire-and-forget)
        if (response.game_over) {
          AdventureAPI.updateAdventure(state.id, {
            status: 'completed',
            endingType: response.hp_current <= 0 ? 'death' : 'victory',
          }).catch(err => console.error('Failed to update adventure status:', err));
        }
      }

      // Generate image ASYNC (non-blocking) - server saves to adventure if ID provided
      if (response.visual_prompt) {
        setPendingImage(true); // Mark that we're waiting for a generated image
        // Pass adventureId so server can save image directly (no round-trip needed)
        API.generateImage(response.visual_prompt, state.id).then(b64 => {
          if (b64) {
            const newSrc = `data:image/jpeg;base64,${b64}`;
            // Set the new image source - the onLoad handler will clear loading state
            // when the browser has actually finished loading/decoding the image
            setCurrentImage(newSrc);
          } else {
            // No image returned - clear loading state
            setImageLoading(false);
            setPendingImage(false);
          }
        }).catch(() => {
          // Error generating image - clear loading state
          setImageLoading(false);
          setPendingImage(false);
        });
      } else {
        // No visual prompt - clear loading state
        setImageLoading(false);
      }

    } catch (e: any) {
      console.error("Turn error:", e?.message || e, e);
      setImageLoading(false);
    } finally {
      setIsBusy(false);
    }
  };

  // Track if we're expecting a new generated image
  const [pendingImage, setPendingImage] = useState(false);

  // Handle image load - clear blur when image loads
  const handleImageLoad = useCallback(() => {
    // Only clear loading state if we were actually waiting for a generated image
    if (pendingImage) {
      setImageLoading(false);
      setPendingImage(false);
    }
  }, [pendingImage]);

  const handleInputSubmit = async () => {
    if (!input.trim() || isBusy) return;
    const txt = input;
    setInput('');
    setLastAction(txt);

    setIsRolling(true);
  };

  const handleOptionClick = (option: string) => {
    if (isBusy || gameOver) return;
    setLastAction(option);
    setIsRolling(true);
  };

  const onRollComplete = () => {
    setIsRolling(false);
    if (lastAction) {
      handleTurn(lastAction);
    }
  };

  // --- Confirmation Helpers ---
  const requestRestart = () => {
    setShowLore(false);
    setShowGameOverModal(false);
    setConfirmation({
      isOpen: true,
      title: 'Restart Chapter?',
      message: 'This will erase your current progress and restart the adventure from the beginning. Your character and world will remain.',
      confirmText: 'Restart Adventure',
      cancelText: 'Cancel',
      type: 'restart',
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, isOpen: false }));
        
        // If authenticated and has adventure ID, restart on server
        if (isAuthenticated && state.id) {
          try {
            await AdventureAPI.restartAdventure(state.id);
          } catch (error) {
            console.error('Failed to restart adventure on server:', error);
            // Continue with local restart even if server fails
          }
        }
        
        // Reset State for Restart
        setState(prev => ({
          ...prev,
          history: [],
          hp: 30,
          gold: 10,
          inventory: [],
          turn: 0,
          maxTurns: isAuthenticated ? -1 : 5, // Unlimited for signed-in users
          lastNarrative: undefined,
          lastOptions: undefined,
          lastAction: undefined,
        }));
        setGameOver(false);
        setJourneyComplete(false);
        setShowGameOverModal(false);
        setEpilogue(null);
        setNarrative('<p class="italic text-gray-600">The world reforms...</p>');
        setOptions([]);
        setLastAction('');
        // useEffect will trigger handleTurn because turn becomes 0
      }
    });
  };

  const requestMainMenu = () => {
    setShowLore(false);
    setShowGameOverModal(false);
    setConfirmation({
      isOpen: true,
      title: 'Return to Main Menu?',
      message: 'Are you sure you want to leave? Your adventure will be abandoned.',
      confirmText: 'Exit to Menu',
      cancelText: 'Stay',
      type: 'main-menu',
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, isOpen: false }));
        
        // Abandon the adventure in the database so user can start a new one
        if (isAuthenticated && state.id && !gameOver) {
          try {
            await AdventureAPI.updateAdventure(state.id, { status: 'abandoned' });
          } catch (error) {
            console.error('Failed to abandon adventure:', error);
          }
        }
        
        onReset();
      }
    });
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col md:flex-row overflow-hidden relative transition-all duration-700 animate-in fade-in">

      {/* VISUAL CARD (Top 70% on Mobile, 50% on Desktop) */}
      <div className="flex-none w-full h-[70dvh] md:w-1/2 md:h-full flex flex-col bg-black relative group md:border-r md:border-white/10">

        {/* Image Wrapper */}
        <div className="relative w-full h-full overflow-hidden bg-void-light">
          {/* Loading Spinner Overlay */}
          <div className={`absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${imageLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="animate-spin text-mystic"><Loader2 className="w-8 h-8" /></div>
          </div>

          {/* Scene Image with blur/opacity transitions */}
          <img
            ref={imageRef}
            src={currentImage || stockImage}
            className="w-full h-full object-cover transition-all duration-700"
            alt="Scene"
            onLoad={handleImageLoad}
            style={{ 
              opacity: imageLoading && pendingImage ? 0.3 : 1, 
              filter: imageLoading && pendingImage ? 'blur(4px)' : 'none' 
            }}
          />

          {/* Shadows */}
          <div className="absolute inset-0 shadow-card-overlay pointer-events-none z-10"></div>
          <div className="absolute inset-0 shadow-top-gradient pointer-events-none z-10"></div>

          {/* HUD */}
          <GameHeader
            turn={state.turn}
            maxTurns={state.maxTurns}
            hp={state.hp}
            gold={state.gold}
            onShowLore={() => setShowLore(true)}
            onShowInventory={() => setShowInventory(true)}
          />

          {/* Bottom Controls (Mobile & Desktop) */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-30 flex flex-col gap-2">
            <div className={`h-3 flex items-center gap-1.5 text-[10px] text-white/70 transition-opacity pl-1 ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
              <span className="animate-pulse w-1.5 h-1.5 bg-mystic rounded-full"></span> DM is writing...
            </div>

            <div className="flex flex-col gap-2 w-full pb-1">
              {gameOver ? (
                <button
                  onClick={async () => {
                    setShowGameOverModal(true);
                    if (!epilogue && !epilogueLoading) {
                      setEpilogueLoading(true);
                      const result = await API.generateEpilogue(state.history, state);
                      setEpilogue(result);
                      setEpilogueLoading(false);
                    }
                  }}
                  className="w-full py-4 rounded-xl bg-blood border border-red-500 text-sm text-white font-bold tracking-widest shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse"
                >
                  ACCEPT FATE
                </button>
              ) : journeyComplete ? (
                /* Journey Complete - Prompt to sign up */
                <div className="flex flex-col gap-2">
                  <div className="text-center text-[10px] md:text-sm text-gold uppercase tracking-widest mb-1 animate-pulse">
                    ✦ Free Trial Complete ✦
                  </div>
                  <button
                    onClick={() => setLocation('/login')}
                    className="w-full py-3 md:py-4 rounded-xl bg-mystic/20 border border-mystic/50 text-mystic hover:bg-mystic/30 hover:text-white text-xs md:text-base font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4 md:w-5 md:h-5" /> Sign Up to Continue
                  </button>
                  <button
                    onClick={() => setShowGameOverModal(true)}
                    className="w-full py-3 md:py-4 rounded-xl bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20 text-xs md:text-base font-bold transition-all"
                  >
                    End Tale Here
                  </button>
                </div>
              ) : (
                options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleOptionClick(opt)}
                    disabled={isBusy}
                    className="text-center text-xs md:text-base py-2 md:py-3 px-3 bg-black/60 backdrop-blur-md border border-white/10 rounded hover:bg-mystic/20 hover:border-mystic/50 transition-colors text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {opt}
                  </button>
                ))
              )}
            </div>

            {!gameOver && !journeyComplete && (
              <div className="relative flex items-center mt-1">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                  className="glass-input w-full rounded-lg px-3 py-2.5 md:py-3 text-xs md:text-base text-white focus:outline-none shadow-lg"
                  placeholder="Or type your action..."
                  autoComplete="off"
                />
                <button onClick={handleInputSubmit} className="absolute right-1.5 md:right-2 p-1 text-white/80 hover:text-white hover:scale-110 transition-transform">
                  <ArrowRightCircle className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TEXT AREA */}
      <main className="flex-1 flex flex-col min-h-0 bg-void relative">
        <div ref={narrativeRef} className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-3 no-scrollbar">
          {lastAction && (
            <div className="transition-opacity duration-500">
              <p className="text-[10px] md:text-xs uppercase tracking-widest text-mystic mb-0.5">You</p>
              <p className="text-xs md:text-base text-gray-500 italic font-body border-l-2 border-mystic/30 pl-2">{lastAction}</p>
            </div>
          )}

          {/* Narrative with fade-in animation (like original) */}
          <div key={fadeKey} className="fade-in">
            <div
              className="prose prose-sm md:prose-base prose-invert max-w-none font-story text-gray-300 text-xs md:text-base leading-relaxed md:leading-loose"
              dangerouslySetInnerHTML={{ __html: narrative }}
            />
          </div>
        </div>

        {/* Dice Overlay */}
        <DiceRoller rolling={isRolling} onRollComplete={onRollComplete} />
      </main>

      {/* GAME OVER / VICTORY OVERLAY */}
      {showGameOverModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm fade-in p-4">
          {journeyComplete ? (
            /* Free Trial Complete - Prompt Sign Up */
            <div className="text-center p-8 w-full max-w-sm bg-void-light/90 border border-gold/30 rounded-2xl shadow-2xl shadow-gold/10">
              <Crown className="w-16 h-16 text-gold mx-auto mb-4 animate-pulse" />
              <h2 className="font-fantasy text-4xl text-gold mb-2 tracking-widest">WELL PLAYED</h2>
              <p className="text-gray-300 text-xs mb-2 italic">Your free trial has ended.</p>
              <p className="text-gray-400 text-xs mb-8">Sign up to continue your legendary adventure!</p>
              <div className="space-y-3">
                <button
                  onClick={() => setLocation('/login')}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-mystic to-indigo-700 text-white font-bold text-sm transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Sign Up to Continue
                </button>
                <button
                  onClick={requestRestart}
                  className="w-full py-3.5 rounded-xl bg-transparent border border-gold/50 text-gold hover:text-white hover:border-gold font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Restart (New Story)
                </button>
                <button
                  onClick={requestMainMenu}
                  className="w-full py-3.5 rounded-xl bg-transparent border border-gray-600 text-gray-400 hover:text-white hover:border-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" /> Main Menu
                </button>
              </div>
            </div>
          ) : (
            /* Death / Victory - Game Over with Epilogue */
            <div className="text-center p-6 md:p-8 w-full max-w-md bg-void-light/90 border border-blood/30 rounded-2xl shadow-2xl shadow-blood/10 max-h-[90vh] overflow-y-auto no-scrollbar">
              <Skull className="w-12 h-12 md:w-16 md:h-16 text-blood mx-auto mb-3 md:mb-4 animate-pulse" />
              <h2 className="font-fantasy text-3xl md:text-4xl text-white mb-2 tracking-widest">FATE SEALED</h2>
              
              {epilogueLoading ? (
                <div className="py-8">
                  <Loader2 className="w-8 h-8 text-blood mx-auto animate-spin mb-3" />
                  <p className="text-gray-400 text-xs italic">The chroniclers inscribe your final chapter...</p>
                </div>
              ) : epilogue ? (
                <div className="text-left mb-6 space-y-4">
                  <h3 className="font-fantasy text-lg md:text-xl text-gold text-center italic">
                    "{epilogue.epilogue_title}"
                  </h3>
                  <div className="text-gray-300 text-xs md:text-sm leading-relaxed font-story space-y-3 border-l-2 border-blood/30 pl-3 md:pl-4">
                    {epilogue.epilogue_text.split('\n\n').map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>
                  <p className="text-center text-gold/80 text-xs md:text-sm italic pt-2 border-t border-white/10">
                    "{epilogue.legacy}"
                  </p>
                </div>
              ) : (
                <p className="text-gray-400 text-xs mb-8 italic">Your legend ends here...</p>
              )}
              
              <div className="space-y-3">
                <button
                  onClick={requestRestart}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blood to-red-900 text-white font-bold text-sm transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Resurrect (Retry)
                </button>
                <button
                  onClick={requestMainMenu}
                  className="w-full py-3.5 rounded-xl bg-transparent border border-gray-600 text-gray-400 hover:text-white hover:border-white font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Home className="w-4 h-4" /> Main Menu
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CHARACTER SHEET MODAL */}
      {showInventory && (
        <div className="absolute inset-0 z-40 bg-black/95 p-6 md:p-10 flex flex-col backdrop-blur-xl no-scrollbar overflow-y-auto">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-3">
            <h2 className="font-fantasy text-xl md:text-3xl text-gold">Character</h2>
            <button onClick={() => setShowInventory(false)} className="text-white"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
          </div>
          
          <div className="space-y-6 md:space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
            {/* Character Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 mb-1 font-bold">Name</h3>
                <p className="text-sm md:text-lg text-white font-bold">{state.name}</p>
              </div>
              <div>
                <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 mb-1 font-bold">Gender</h3>
                <p className="text-sm md:text-lg text-white">{state.gender}</p>
              </div>
              <div>
                <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 mb-1 font-bold">Class</h3>
                <p className="text-sm md:text-lg text-mystic font-bold">{state.class}</p>
              </div>
              <div>
                <h3 className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 mb-1 font-bold">Race</h3>
                <p className="text-sm md:text-lg text-mystic">{state.race}</p>
              </div>
            </div>
            
            {/* Inventory */}
            <div>
              <h3 className="text-xs md:text-sm uppercase tracking-widest text-gold mb-3 font-bold">Inventory</h3>
              <ul className="space-y-2 md:space-y-3">
                {state.inventory.length > 0 ? state.inventory.map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 bg-white/5 p-2 md:p-3 rounded-lg border border-white/10 text-xs md:text-base">
                    <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-gold rounded-full shadow-[0_0_5px_rgba(251,191,36,0.5)]"></div>
                    <span className="text-gray-300">{item}</span>
                  </li>
                )) : (
                  <li className="italic text-gray-600 text-xs md:text-base">Empty...</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* LORE MODAL */}
      {showLore && (
        <div className="absolute inset-0 z-40 bg-black/95 p-6 md:p-10 flex flex-col backdrop-blur-xl no-scrollbar">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-3">
            <h2 className="font-fantasy text-xl md:text-3xl text-mystic">Tales of Origin</h2>
            <button onClick={() => setShowLore(false)} className="text-white"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
          </div>
          <div className="overflow-y-auto space-y-6 md:space-y-8 max-h-[80vh] no-scrollbar">
            <div>
              <h3 className="text-xs md:text-sm uppercase tracking-widest text-gold mb-2 font-bold">The World</h3>
              <p className="text-sm md:text-lg text-gray-300 font-story leading-relaxed md:leading-loose italic border-l-2 border-white/10 pl-3 md:pl-4">
                {state.endgame?.world_backstory || "A world shrouded in mystery..."}
              </p>
            </div>
            <div>
              <h3 className="text-xs md:text-sm uppercase tracking-widest text-mystic mb-2 font-bold">The Hero</h3>
              <p className="text-sm md:text-lg text-gray-300 font-story leading-relaxed md:leading-loose italic border-l-2 border-white/10 pl-3 md:pl-4">
                {state.endgame?.character_backstory || "A stranger from distant lands..."}
              </p>
            </div>
            <div>
              <h3 className="text-xs md:text-sm uppercase tracking-widest text-gray-500 mb-2 font-bold">Seeds of Fate</h3>
              <p className="text-xs md:text-base text-gray-400 font-mono tracking-wide">
                {state.themeSeeds || "Random destiny..."}
              </p>
            </div>

            <div className="pt-6 border-t border-gray-800 space-y-3">
              <button
                onClick={requestRestart}
                className="w-full py-3 md:py-4 rounded-lg bg-mystic/10 border border-mystic/30 text-mystic hover:bg-mystic/20 hover:text-white text-xs md:text-base font-bold transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4 md:w-5 md:h-5" /> Restart Chapter
              </button>
              <button
                onClick={requestMainMenu}
                className="w-full py-3 md:py-4 rounded-lg bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs md:text-base font-bold transition-all flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4 md:w-5 md:h-5" /> Main Menu
              </button>
              {isAuthenticated && (
                <button
                  onClick={() => { window.location.href = '/api/logout'; }}
                  className="w-full py-3 md:py-4 rounded-lg bg-transparent border border-red-900/50 text-red-400 hover:text-red-300 hover:border-red-700 text-xs md:text-base font-bold transition-all flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4 md:w-5 md:h-5" /> Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmation.isOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm fade-in p-4">
          <div className="w-full max-w-sm bg-void-light/95 border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3 className="font-fantasy text-xl text-white mb-2">{confirmation.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{confirmation.message}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-3 rounded-xl bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-bold transition-all"
              >
                {confirmation.cancelText}
              </button>
              <button
                onClick={confirmation.onConfirm}
                className="flex-1 py-3 rounded-xl bg-mystic text-white hover:bg-indigo-600 text-xs font-bold transition-all shadow-lg"
              >
                {confirmation.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
