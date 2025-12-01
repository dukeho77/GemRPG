import { Book, Hourglass, Heart, Coins, User } from 'lucide-react';

interface GameHeaderProps {
  turn: number;
  maxTurns: number;
  hp: number;
  gold: number;
  onShowLore: () => void;
  onShowInventory: () => void;
}

export function GameHeader({
  turn,
  maxTurns,
  hp,
  gold,
  onShowLore,
  onShowInventory,
}: GameHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 p-4 z-30 flex justify-between items-center">
      {/* Left: Lore + Turn */}
      <div className="flex items-center gap-2">
        <button
          onClick={onShowLore}
          className="flex items-center justify-center w-8 h-8 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-mystic hover:text-white hover:bg-mystic/20 transition-all shadow-lg"
          title="Read Lore"
        >
          <Book className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold text-gray-300 shadow-lg">
          <Hourglass className="w-3 h-3" />
          <span>Turn {turn}{maxTurns > 0 ? `/${maxTurns}` : ''}</span>
        </div>
      </div>

      {/* Right: Health + Gold + Bag (all in one row) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/20 text-[10px] font-bold text-red-400 shadow-lg">
          <Heart className="w-3 h-3 fill-current" />
          <span>{hp}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/20 text-[10px] font-bold text-gold shadow-lg">
          <Coins className="w-3 h-3 fill-current" />
          <span>{gold}</span>
        </div>
        <button
          onClick={onShowInventory}
          className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-bold text-gray-300 hover:text-white hover:bg-black/60 transition-all shadow-lg"
        >
          <User className="w-3 h-3" /> CHAR
        </button>
      </div>
    </div>
  );
}

