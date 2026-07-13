import { Fragment, useEffect, useMemo } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Game } from '../types/game';
import { getArtworkFallbackReason, getAvailableArtworkFields, resolveGameArtwork, type ArtworkUsage } from '../lib/gameCoverImages';
import { getArtworkSet, getGameIdentity } from '../lib/gameSelectors';
import { getGameArtworkSemanticRevision, useSemanticImageSource } from '../hooks/useSemanticImageSource';

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
  const sourceUrls = useMemo(() => sources.map((candidate) => candidate.url), [sources]);
  const semanticImage = useSemanticImageSource({
    gameId: game.id,
    revision: getGameArtworkSemanticRevision(game),
    sources: sourceUrls,
  });
  const src = semanticImage.visibleSource;
  const source = sources.find((candidate) => candidate.url === src)?.source ?? null;

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
    <Fragment>
      <img
        alt={alt}
        decoding={decoding}
        loading={loading}
        onError={() => {
          const failedIndex = sources.findIndex((candidate) => candidate.url === src);
          const nextSource = sources.slice(failedIndex + 1).find((candidate) => candidate.url !== src)?.url ?? null;
          if (import.meta.env.DEV) {
            console.debug(diagnosticsContext === 'quest-queue' ? '[QuestQueueArtworkError]' : '[ArtworkFallback]', {
              gameId: gameIdentity.id,
              title: gameIdentity.title,
              failedSource: src,
              failedArtworkSource: source,
              nextSource,
              fallbackReason: nextSource === null ? getArtworkFallbackReason(game, sources) : undefined,
            });
          }
          semanticImage.markSourceFailed(src);
        }}
        onLoad={(event) => {
          if (src === semanticImage.candidateSource) semanticImage.markSourceLoaded(src);
          onLoad?.(event);
        }}
        ref={(image) => {
          if (src === semanticImage.candidateSource) semanticImage.recognizeCompletedCandidate(image);
        }}
        src={src}
        {...imgProps}
      />
      {semanticImage.isTransitioning && semanticImage.candidateSource ? (
        <img
          alt=""
          aria-hidden="true"
          data-semantic-image-probe="true"
          decoding={decoding}
          loading={loading}
          onError={() => semanticImage.markSourceFailed(semanticImage.candidateSource!)}
          onLoad={() => semanticImage.markSourceLoaded(semanticImage.candidateSource!)}
          ref={semanticImage.recognizeCompletedCandidate}
          src={semanticImage.candidateSource}
          style={{ height: 1, opacity: 0, pointerEvents: 'none', position: 'absolute', width: 1 }}
        />
      ) : null}
    </Fragment>
  );
}
