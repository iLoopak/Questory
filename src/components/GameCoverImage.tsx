import { useEffect, useMemo, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Game } from '../types/game';
import { getArtworkFallbackReason, getAvailableArtworkFields, resolveGameArtwork, type ArtworkUsage } from '../lib/gameCoverImages';
import { getArtworkSet, getGameIdentity } from '../lib/gameSelectors';

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
  const gameIdentity = useMemo(() => getGameIdentity(game), [game]);
  const artworkSet = useMemo(() => getArtworkSet(game), [game]);
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
      gameId: gameIdentity.id,
      title: gameIdentity.title,
      resolvedArtworkUrl: src,
      resolvedArtworkSource: source,
      availableArtworkFields: getAvailableArtworkFields(game),
      selectedArtworkSource: artworkSet.source,
      fallbackReason: source === 'generated-fallback' ? artwork.fallbackReason : undefined,
    });
  }, [artwork.fallbackReason, artworkSet, diagnosticsContext, game, gameIdentity, source, src]);

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
            gameId: gameIdentity.id,
            title: gameIdentity.title,
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
