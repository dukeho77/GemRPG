import React, { useEffect, useState } from 'react';

interface DiceRollerProps {
  rolling: boolean;
  rollResult?: number | null;
  modifier?: number;
  onRollComplete?: (result: number) => void;
}

export function DiceRoller({ rolling, rollResult, modifier = 0, onRollComplete }: DiceRollerProps) {
  const [visible, setVisible] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [displayResult, setDisplayResult] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (rolling) {
      setVisible(true);
      setShowResult(false);
      setDisplayResult(null);
      
      // Random rotation
      const rx = 720 + Math.floor(Math.random() * 360);
      const ry = 720 + Math.floor(Math.random() * 360);
      setRotation({ x: rx, y: ry });

      // Generate roll result
      const result = Math.floor(Math.random() * 20) + 1;
      
      // Show result after dice settles
      const resultTimer = setTimeout(() => {
        setDisplayResult(result);
        setShowResult(true);
      }, 1200);

      // Complete and hide
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setRotation({ x: 0, y: 0 });
        setShowResult(false);
        if (onRollComplete) onRollComplete(result);
      }, 2500);

      return () => {
        clearTimeout(resultTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [rolling, onRollComplete]);

  if (!visible && !rolling) return null;

  const isCriticalSuccess = displayResult === 20;
  const isCriticalFail = displayResult === 1;
  const total = displayResult ? displayResult + modifier : null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Dice */}
        <div className={`dice-wrap ${isCriticalSuccess ? 'animate-pulse' : ''}`} style={{ display: 'block' }}>
          <div 
            className={`dice-cube ${isCriticalSuccess ? 'shadow-[0_0_30px_rgba(251,191,36,0.8)]' : ''} ${isCriticalFail ? 'shadow-[0_0_30px_rgba(239,68,68,0.8)]' : ''}`}
            style={{ transform: visible ? `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` : 'none' }}
          >
            <div className="face f-front">20</div>
            <div className="face f-back">1</div>
            <div className="face f-right">8</div>
            <div className="face f-left">12</div>
            <div className="face f-top">19</div>
            <div className="face f-bottom">3</div>
          </div>
        </div>

        {/* Result Display */}
        {showResult && displayResult && (
          <div className={`fade-in text-center ${isCriticalSuccess ? 'animate-bounce' : ''}`}>
            <div className={`text-4xl font-fantasy font-bold ${
              isCriticalSuccess ? 'text-gold' : 
              isCriticalFail ? 'text-blood' : 
              'text-white'
            }`}>
              {displayResult}
              {modifier > 0 && (
                <span className="text-2xl text-mystic"> + {modifier} = {total}</span>
              )}
            </div>
            {isCriticalSuccess && (
              <div className="text-gold text-sm font-bold uppercase tracking-widest mt-1 animate-pulse">
                Critical Success!
              </div>
            )}
            {isCriticalFail && (
              <div className="text-blood text-sm font-bold uppercase tracking-widest mt-1">
                Critical Fail!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
