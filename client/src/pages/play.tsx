import React, { useState, useEffect } from 'react';
import { CreationScreen } from '@/components/game/CreationScreen';
import { GameScreen } from '@/components/game/GameScreen';
import { GameState, AdventureAPI } from '@/lib/game-engine';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function Play() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isCheckingAdventure, setIsCheckingAdventure] = useState(false);

  // Check for active adventure when user is authenticated
  useEffect(() => {
    async function checkActiveAdventure() {
      if (!isAuthenticated || authLoading) return;
      
      setIsCheckingAdventure(true);
      try {
        const { adventure, turns } = await AdventureAPI.getActiveAdventure();
        
        // Only resume if adventure exists AND has valid campaign data
        // This prevents loading incomplete/corrupted adventures
        if (adventure && adventure.campaignData && adventure.campaignData.title) {
          // Convert to GameState and resume
          const state = AdventureAPI.adventureToGameState(adventure, turns);
          
          // Double-check the state is valid before resuming
          if (state.endgame && state.name) {
            setGameState(state);
          } else {
            console.warn('Adventure state incomplete, starting fresh');
          }
        }
      } catch (error) {
        console.error('Error checking active adventure:', error);
        // Silently fail - user can start new game
      } finally {
        setIsCheckingAdventure(false);
      }
    }

    checkActiveAdventure();
  }, [isAuthenticated, authLoading]);

  const handleGameStart = async (state: GameState) => {
    // If user is authenticated, create adventure on server
    console.log('[DEBUG] handleGameStart - isAuthenticated:', isAuthenticated);
    if (isAuthenticated) {
      try {
        console.log('[DEBUG] Creating adventure on server...');
        const adventure = await AdventureAPI.createAdventure(state);
        state.id = adventure.id;
        console.log('[DEBUG] Adventure created with ID:', adventure.id);
      } catch (error) {
        console.error('Error creating adventure:', error);
        // Continue without persistence - ephemeral session
      }
    } else {
      console.log('[DEBUG] Not authenticated, skipping adventure creation');
    }
    console.log('[DEBUG] Final state.id:', state.id);
    setGameState(state);
  };

  const handleReset = () => {
    setGameState(null);
  };

  // Show loading while checking auth or active adventure
  if (authLoading || isCheckingAdventure) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-void">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-mystic animate-spin" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return <CreationScreen onGameStart={handleGameStart} isAuthenticated={isAuthenticated} />;
  }

  return <GameScreen initialState={gameState} onReset={handleReset} isAuthenticated={isAuthenticated} />;
}
