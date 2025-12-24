import React, { useEffect, useState } from 'react';

interface DiceRollerProps {
  rolling: boolean;
  onRollComplete?: (result: number) => void;
}

export function DiceRoller({ rolling, onRollComplete }: DiceRollerProps) {
  const [visible, setVisible] = useState(false);
  const [displayResult, setDisplayResult] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (rolling) {
      setVisible(true);
      setShowResult(false);
      setDisplayResult(null);
      setIsSpinning(true);
      
      // Generate roll result immediately
      const result = Math.floor(Math.random() * 20) + 1;
      
      // Show result after dice settles (stop spinning, show final number)
      const resultTimer = setTimeout(() => {
        setIsSpinning(false);
        setDisplayResult(result);
        setShowResult(true);
      }, 1200);

      // Complete and hide
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setShowResult(false);
        setDisplayResult(null);
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

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        {/* Dice - shows spinning animation then settles on result */}
        <div className={`dice-wrap ${isCriticalSuccess ? 'animate-pulse' : ''}`} style={{ display: 'block' }}>
          <div 
            className={`dice-cube ${isSpinning ? 'dice-spinning' : ''} ${isCriticalSuccess ? 'shadow-[0_0_30px_rgba(251,191,36,0.8)]' : ''} ${isCriticalFail ? 'shadow-[0_0_30px_rgba(239,68,68,0.8)]' : ''}`}
          >
            {/* When spinning, show random faces. When settled, show result on front face */}
            <div className={`face f-front ${showResult ? 'text-3xl' : ''} ${isCriticalSuccess ? 'text-gold' : isCriticalFail ? 'text-blood' : ''}`}>
              {showResult && displayResult ? displayResult : 20}
            </div>
            <div className="face f-back">{showResult && displayResult ? displayResult : 1}</div>
            <div className="face f-right">{showResult && displayResult ? displayResult : 8}</div>
            <div className="face f-left">{showResult && displayResult ? displayResult : 12}</div>
            <div className="face f-top">{showResult && displayResult ? displayResult : 19}</div>
            <div className="face f-bottom">{showResult && displayResult ? displayResult : 3}</div>
          </div>
        </div>

        {/* Result Text Display */}
        {showResult && displayResult && (
          <div className={`fade-in text-center ${isCriticalSuccess ? 'animate-bounce' : ''}`}>
            {isCriticalSuccess && (
              <div className="text-gold text-lg font-bold uppercase tracking-widest animate-pulse">
                Critical Success!
              </div>
            )}
            {isCriticalFail && (
              <div className="text-blood text-lg font-bold uppercase tracking-widest">
                Critical Fail!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
