import { useEffect, useMemo, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Game } from '../types/game';
import { type ArtworkUsage, getPreferredArtworkSources } from '../lib/gameCoverImages';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  game: Game;
  usage?: ArtworkUsage;
};

/**
 * Renders a game cover that cycles through all available artwork sources on
 * load failure, ultimately landing on the generated SVG. Never shows a broken
 * browser image icon.
 */
export function GameCoverImage({ game, usage = 'portrait', alt = '', decoding = 'async', loading = 'lazy', ...imgProps }: Props) {
  const sources = useMemo(() => getPreferredArtworkSources(game, usage), [game, usage]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const src = sources[sourceIndex];
  if (!src) return null;

  return (
    <img
      alt={alt}
      decoding={decoding}
      loading={loading}
      onError={() => {
        if (import.meta.env.DEV) {
          console.debug('[ArtworkFallback]', {
            gameId: game.id,
            title: game.title,
            failedSource: src,
            nextSource: sources[sourceIndex + 1] ?? null,
            fallbackUsed: sourceIndex + 1 >= sources.length - 1,
          });
        }
        setSourceIndex((i) => i + 1);
      }}
      src={src}
      {...imgProps}
    />
  );
}
