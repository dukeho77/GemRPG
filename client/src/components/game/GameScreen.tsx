import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { Book, Hourglass, Heart, Coins, Backpack, ArrowRightCircle, Skull, RefreshCw, Home, X, RotateCcw, Loader2, Lock } from 'lucide-react';
import { GameState, API, TurnResponse } from '@/lib/game-engine';
import { DiceRoller } from './DiceRoller';
import stockImage from '@assets/stock_images/dark_fantasy_rpg_atm_0f6db108.jpg';
import { useLocation } from 'wouter';

interface GameScreenProps {
  initialState: GameState;
  onReset: () => void;
}

export function GameScreen({ initialState, onReset }: GameScreenProps) {
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [displayedNarrative, setDisplayedNarrative] = useState('');
  const [fullNarrative, setFullNarrative] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial Start
  useEffect(() => {
    if (state.turn === 0 && state.history.length === 0) {
      handleTurn(`Begin Act 1: ${state.endgame?.act1}. Introduce ${state.name}.`);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedNarrative, lastAction]);

  // Typewriter effect
  useEffect(() => {
    if (displayedNarrative.length < fullNarrative.length) {
      const timeout = setTimeout(() => {
        setDisplayedNarrative(fullNarrative.slice(0, displayedNarrative.length + 5)); // Speed up slightly
      }, 10);
      return () => clearTimeout(timeout);
    }
  }, [displayedNarrative, fullNarrative]);

  const handleTurn = async (inputText: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setLastAction(inputText !== state.history[state.history.length - 1]?.parts?.[0]?.text ? inputText : lastAction); // Only update if new user input

    // Add user input to history if it's not the system start command
    const newHistory = [...state.history];
    if (state.turn > 0) {
       newHistory.push({ role: 'user', parts: [{ text: inputText }] });
    }

    try {
      // Pass inputText as third argument for first turn handling
      const response = await API.chat(newHistory, state, inputText);
      
      // Update State - IMPORTANT: Don't store image_base64 in history to avoid token overflow
      const historyResponse = { ...response };
      delete historyResponse.image_base64; // Remove image data from history
      
      setState(prev => ({
        ...prev,
        hp: response.hp_current,
        gold: response.gold,
        inventory: response.inventory,
        turn: prev.turn + 1,
        history: [...newHistory, { role: 'model', parts: [{ text: JSON.stringify(historyResponse) }] }]
      }));

      setFullNarrative(response.narrative);
      setDisplayedNarrative(''); // Reset for typewriter
      setOptions(response.options);
      
      // Update image if available
      if (response.image_base64) {
        setCurrentImage(`data:image/png;base64,${response.image_base64}`);
      }
      
      if (response.game_over) {
        setGameOver(true);
      }

    } catch (e: any) {
      console.error("Turn error:", e?.message || e, e);
    } finally {
      setIsBusy(false);
    }
  };

  const handleInputSubmit = async () => {
    if (!input.trim() || isBusy) return;
    const txt = input;
    setInput('');
    setLastAction(txt);
    
    setIsRolling(true);
    // Wait for roll animation - onRollComplete will trigger the turn
  };

  const handleOptionClick = (option: string) => {
    if (isBusy || gameOver) return;
    setLastAction(option);
    setIsRolling(true);
    // Dice animation will trigger onRollComplete -> handleTurn
  };

  const onRollComplete = () => {
    setIsRolling(false);
    if (lastAction) {
      handleTurn(lastAction);
    }
  };

  const renderMarkdown = (text: string) => {
    return { __html: marked.parse(text) };
  };

  const isTurnLimit = state.turn > state.maxTurns; // API increments before returning, so turn 6 > 5

  return (
    <div className="flex-1 w-full h-full flex flex-col md:flex-row overflow-hidden relative transition-all duration-700 animate-in fade-in">
      
      {/* VISUAL CARD (Top 75% on Mobile) */}
      <div className="flex-none w-full h-[75dvh] md:w-96 md:h-full flex flex-col bg-black relative group md:border-r md:border-white/10">
        
        {/* Image Wrapper */}
        <div className="relative w-full h-full overflow-hidden bg-void-light">
          <div className={`absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isBusy ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="animate-spin text-mystic"><Loader2 className="w-8 h-8" /></div>
          </div>
          
          <img src={currentImage || stockImage} className="w-full h-full object-cover transition-all duration-1000" alt="Scene" />
          
          {/* Shadows */}
          <div className="absolute inset-0 shadow-card-overlay pointer-events-none z-10"></div>
          <div className="absolute inset-0 shadow-top-gradient pointer-events-none z-10"></div>
          
          {/* HUD */}
          <div className="absolute top-0 left-0 right-0 p-4 z-30 flex justify-between items-start">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLore(true)} className="flex items-center justify-center w-8 h-8 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-mystic hover:text-white hover:bg-mystic/20 transition-all shadow-lg" title="Read Lore">
                <Book className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold text-gray-300 shadow-lg">
                <Hourglass className="w-3 h-3" /> <span>Turn {Math.min(state.turn, state.maxTurns)}/{state.maxTurns}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-end">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/20 text-[10px] font-bold text-red-400 shadow-lg">
                  <Heart className="w-3 h-3 fill-current" /> <span>{state.hp}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/20 text-[10px] font-bold text-gold shadow-lg">
                  <Coins className="w-3 h-3 fill-current" /> <span>{state.gold}</span>
                </div>
              </div>
              <button onClick={() => setShowInventory(true)} className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-black/60 transition-all shadow-lg">
                <Backpack className="w-3 h-3" /> BAG
              </button>
            </div>
          </div>

          {/* Bottom Controls (Mobile & Desktop) */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-30 flex flex-col gap-2">
            <div className={`h-3 flex items-center gap-1.5 text-[10px] text-white/70 transition-opacity pl-1 ${isBusy ? 'opacity-100' : 'opacity-0'}`}>
              <span className="animate-pulse w-1.5 h-1.5 bg-mystic rounded-full"></span> DM is writing...
            </div>
            
            <div className="flex flex-col gap-2 w-full pb-1">
              {options.map((opt, idx) => (
                <button 
                  key={idx} 
                  onClick={() => handleOptionClick(opt)}
                  disabled={isBusy || gameOver}
                  className="text-left text-xs py-2 px-3 bg-black/60 backdrop-blur-md border border-white/10 rounded hover:bg-mystic/20 hover:border-mystic/50 transition-colors text-gray-300 truncate disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {opt}
                </button>
              ))}
            </div>
            
            <div className="relative flex items-center mt-1">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                className="glass-input w-full rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none shadow-lg" 
                placeholder="Or type your action..." 
                autoComplete="off"
              />
              <button onClick={handleInputSubmit} className="absolute right-1.5 p-1 text-white/80 hover:text-white hover:scale-110 transition-transform">
                <ArrowRightCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TEXT AREA */}
      <main className="flex-1 flex flex-col min-h-0 bg-void relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-3 no-scrollbar">
          {lastAction && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <p className="text-[10px] uppercase tracking-widest text-mystic mb-0.5">You</p>
              <p className="text-xs text-gray-500 italic font-body border-l-2 border-mystic/30 pl-2">{lastAction}</p>
            </div>
          )}
          <div className="flex-1 animate-in fade-in duration-700">
             <div 
               className="prose prose-sm prose-invert max-w-none font-story text-gray-300 text-xs leading-relaxed"
               dangerouslySetInnerHTML={renderMarkdown(displayedNarrative)} 
             />
          </div>
        </div>
        
        <DiceRoller rolling={isRolling} onRollComplete={onRollComplete} />
      </main>

      {/* GAME OVER OVERLAY */}
      {gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in p-4">
          <div className="text-center p-8 w-full max-w-sm bg-void-light/90 border border-blood/30 rounded-2xl shadow-2xl shadow-blood/10">
            {isTurnLimit ? (
                <Lock className="w-16 h-16 text-gold mx-auto mb-4 animate-pulse" />
            ) : (
                <Skull className="w-16 h-16 text-blood mx-auto mb-4 animate-pulse" />
            )}
            
            <h2 className="font-fantasy text-4xl text-white mb-2 tracking-widest">
                {isTurnLimit ? "LIMIT REACHED" : "FATE SEALED"}
            </h2>
            <p className="text-gray-400 text-xs mb-8 italic">
                {isTurnLimit ? "Your free trial has ended." : "Your legend ends here..."}
            </p>
            
            <div className="space-y-3">
              {isTurnLimit ? (
                 <button onClick={() => setLocation('/login')} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-gold to-yellow-600 text-black font-bold text-sm transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                    <Lock className="w-4 h-4" /> Unlock Full Game
                 </button>
              ) : (
                 <button onClick={onReset} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blood to-red-900 text-white font-bold text-sm transition-transform active:scale-95 shadow-lg flex items-center justify-center gap-2 cursor-pointer">
                    <RefreshCw className="w-4 h-4" /> Resurrect (Retry)
                 </button>
              )}
              
              <button onClick={() => window.location.reload()} className="w-full py-3.5 rounded-xl bg-transparent border border-gray-600 text-gray-400 hover:text-white hover:border-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer">
                <Home className="w-4 h-4" /> Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVENTORY MODAL */}
      {showInventory && (
        <div className="absolute inset-0 z-40 bg-black/95 p-6 flex flex-col backdrop-blur-xl animate-in fade-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-3 flex-none">
            <h2 className="font-fantasy text-xl text-gold">Inventory</h2>
            <button onClick={() => setShowInventory(false)} className="text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <ul className="space-y-3 text-sm text-gray-300 pb-6">
              {state.inventory.map((item, i) => (
                <li key={i} className="flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/10 text-xs">
                  <div className="w-8 h-8 bg-black/50 rounded flex items-center justify-center text-gold border border-white/5">
                    <Backpack className="w-4 h-4" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* LORE MODAL */}
      {showLore && (
        <div className="absolute inset-0 z-40 bg-black/95 p-6 flex flex-col backdrop-blur-xl animate-in fade-in slide-in-from-bottom-10">
          <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-3 flex-none">
            <h2 className="font-fantasy text-xl text-mystic">Tales of Origin</h2>
            <button onClick={() => setShowLore(false)} className="text-white"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pb-6">
            <div>
              <h3 className="text-xs uppercase tracking-widest text-gold mb-2 font-bold">The World</h3>
              <p className="text-sm text-gray-300 font-story leading-relaxed italic border-l-2 border-white/10 pl-3">
                {state.endgame?.world_backstory || "Generating..."}
              </p>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-widest text-mystic mb-2 font-bold">The Hero</h3>
              <p className="text-sm text-gray-300 font-story leading-relaxed italic border-l-2 border-white/10 pl-3">
                {state.endgame?.character_backstory || "Generating..."}
              </p>
            </div>
            
            <div className="pt-6 border-t border-gray-800 space-y-3">
              <button onClick={() => { if(confirm('Restart this adventure? Progress will be lost.')) onReset(); }} className="w-full py-3 rounded-lg bg-mystic/10 border border-mystic/30 text-mystic hover:bg-mystic/20 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                <RotateCcw className="w-4 h-4" /> Restart Chapter
              </button>
              <button onClick={() => { if(confirm('Return to main menu? Progress will be lost.')) window.location.reload(); }} className="w-full py-3 rounded-lg bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                <Home className="w-4 h-4" /> Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
