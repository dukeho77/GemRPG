import React, { useEffect, useState } from 'react';

interface DiceRollerProps {
  rolling: boolean;
  onRollComplete?: () => void;
}

export function DiceRoller({ rolling, onRollComplete }: DiceRollerProps) {
  const [visible, setVisible] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (rolling) {
      setVisible(true);
      // Random rotation
      const rx = 720 + Math.floor(Math.random() * 360);
      const ry = 720 + Math.floor(Math.random() * 360);
      setRotation({ x: rx, y: ry });

      const timer = setTimeout(() => {
        setVisible(false);
        setRotation({ x: 0, y: 0 });
        if (onRollComplete) onRollComplete();
      }, 1800); // Slightly shorter than CSS for safety

      return () => clearTimeout(timer);
    }
  }, [rolling, onRollComplete]);

  if (!visible && !rolling) return null;

  return (
    <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="dice-wrap" style={{ display: 'block' }}>
        <div 
          className="dice-cube" 
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
    </div>
  );
}
