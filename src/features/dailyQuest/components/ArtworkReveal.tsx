import { useMemo } from 'react';
import type { Game } from '../../../types/game';
import { getPreferredArtworkSources } from '../../../lib/gameCoverImages';
import { getRevealedTileIndices } from '../logic';
import type { RevealStage } from '../types';

interface ArtworkRevealProps {
  game: Game;
  stage: RevealStage;
  date: string;
  className?: string;
}

// 4 columns × 5 rows = 20 tiles
const COLS = 4;
const ROWS = 5;

export function ArtworkReveal({ game, stage, date, className = '' }: ArtworkRevealProps) {
  const revealed = useMemo(() => getRevealedTileIndices(date, stage), [date, stage]);

  const artSrc = useMemo(() => {
    const srcs = getPreferredArtworkSources(game, 'portrait');
    return srcs[0] ?? game.coverImage;
  }, [game]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-ink-950 ${className}`}>
      <img
        src={artSrc}
        alt=""
        aria-hidden="true"
        className="block h-full w-full object-cover"
        draggable={false}
      />
      {/* Tile overlay: unrevealed tiles are dark, revealed tiles are transparent */}
      <div
        className="absolute inset-0"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <div
            key={i}
            className="transition-opacity duration-500"
            style={{ opacity: revealed.has(i) ? 0 : 1, background: 'rgb(10 9 12)' }}
          />
        ))}
      </div>
    </div>
  );
}
