import type { MouseEvent } from 'react';
import { hasFallbackArtwork } from '../lib/gameCoverImages';
import type { Game } from '../types/game';
import { Icon } from './Icon';

type ArtworkRecoveryButtonProps = {
  game: Game;
  onFind: () => void;
  compact?: boolean;
};

export function ArtworkRecoveryButton({ game, onFind, compact = false }: ArtworkRecoveryButtonProps) {
  if (!hasFallbackArtwork(game)) return null;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onFind();
  }

  return (
    <button
      aria-label="Find artwork"
      className={`absolute right-1 top-1 z-20 grid place-items-center rounded border border-mint/30 bg-ink-950/80 text-mint/70 backdrop-blur-sm transition hover:border-mint/50 hover:bg-mint/20 hover:text-mint focus:outline-none focus-visible:ring-1 focus-visible:ring-mint/70 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
      onClick={handleClick}
      title="Find artwork"
      type="button"
    >
      <Icon name="image" size={compact ? 11 : 13} strokeWidth={2} />
    </button>
  );
}
