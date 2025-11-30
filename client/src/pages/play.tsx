import React, { useState } from 'react';
import { CreationScreen } from '@/components/game/CreationScreen';
import { GameScreen } from '@/components/game/GameScreen';
import { GameState } from '@/lib/game-engine';

export default function Play() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  const handleGameStart = (state: GameState) => {
    setGameState(state);
  };

  const handleReset = () => {
    setGameState(null);
  };

  if (!gameState) {
    return <CreationScreen onGameStart={handleGameStart} />;
  }

  return <GameScreen initialState={gameState} onReset={handleReset} />;
}
