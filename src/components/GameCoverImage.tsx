import { useEffect, useMemo, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Game } from '../types/game';
import { getArtworkFallbackReason, getAvailableArtworkFields, resolveGameArtwork, type ArtworkUsage } from '../lib/gameCoverImages';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  game: Game;
  usage?: ArtworkUsage;
  diagnosticsContext?: string;
  onResolvedSourceChange?: (source: string | null) => void;
};

/**
 * Renders a game cover using the canonical artwork resolver. It cycles through
 * available artwork sources on load failure and ends on the generated SVG
 * without mutating the stored game artwork fields.
 */
export function GameCoverImage({ game, usage = 'portrait', alt = '', decoding = 'async', loading = 'lazy', diagnosticsContext, onLoad, onResolvedSourceChange, ...imgProps }: Props) {
  const artwork = useMemo(() => resolveGameArtwork(game, usage), [game, usage]);
  const sources = artwork.candidates;
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex]?.url ?? null;
  const source = sources[sourceIndex]?.source ?? null;

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  useEffect(() => {
    onResolvedSourceChange?.(src);
  }, [onResolvedSourceChange, src]);

  useEffect(() => {
    if (!import.meta.env.DEV || diagnosticsContext !== 'quest-queue') return;
    console.debug('[QuestQueueArtwork]', {
      gameId: game.id,
      title: game.title,
      resolvedArtworkUrl: src,
      resolvedArtworkSource: source,
      availableArtworkFields: getAvailableArtworkFields(game),
      fallbackReason: source === 'generated-fallback' ? artwork.fallbackReason : undefined,
    });
  }, [artwork.fallbackReason, diagnosticsContext, game, source, src]);

  if (!src) return null;

  return (
    <img
      alt={alt}
      decoding={decoding}
      loading={loading}
      onError={() => {
        const nextIndex = Math.min(sourceIndex + 1, sources.length - 1);
        if (import.meta.env.DEV) {
          console.debug(diagnosticsContext === 'quest-queue' ? '[QuestQueueArtworkError]' : '[ArtworkFallback]', {
            gameId: game.id,
            title: game.title,
            failedSource: src,
            failedArtworkSource: source,
            nextSource: sources[nextIndex]?.url ?? null,
            fallbackReason: nextIndex === sources.length - 1 ? getArtworkFallbackReason(game, sources) : undefined,
          });
        }
        setSourceIndex(nextIndex);
      }}
      onLoad={onLoad}
      src={src}
      {...imgProps}
    />
  );
}
