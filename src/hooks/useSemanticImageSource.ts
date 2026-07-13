import { useEffect, useRef, useState } from 'react';
import type { Game } from '../types/game';

type SemanticImageState = {
  displayedSource: string | null;
  failedSources: Set<string>;
  gameId: string;
  signature: string;
};

export function getGameArtworkSemanticRevision(game: Pick<Game, 'artworkSource' | 'artworkUpdatedAt'>): string {
  return `${game.artworkSource ?? ''}\u0000${game.artworkUpdatedAt ?? ''}`;
}

export function createSemanticImageSignature(gameId: string, sources: string[], revision = ''): string {
  return `${gameId}\u0001${revision}\u0001${sources.join('\u0000')}`;
}

/**
 * Owns fallback failures and the last successfully loaded URL for one semantic image slot.
 * A changed object or array reference is irrelevant; only the game, ordered URLs, or explicit
 * artwork revision can start a new candidate cycle.
 */
export function useSemanticImageSource({
  gameId,
  revision = '',
  sources,
}: {
  gameId: string;
  revision?: string;
  sources: string[];
}) {
  const signature = createSemanticImageSignature(gameId, sources, revision);
  const latestSignatureRef = useRef(signature);
  latestSignatureRef.current = signature;
  const mountedRef = useRef(true);
  const [state, setState] = useState<SemanticImageState>(() => ({
    displayedSource: null,
    failedSources: new Set(),
    gameId,
    signature,
  }));

  const effectiveState = synchronizeState(state, gameId, signature, sources);
  const candidateSource = sources.find((source) => !effectiveState.failedSources.has(source)) ?? null;
  const displayedSource = effectiveState.displayedSource;
  const visibleSource = displayedSource ?? candidateSource;
  const isTransitioning = Boolean(displayedSource && candidateSource && displayedSource !== candidateSource);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setState((current) => synchronizeState(current, gameId, signature, sources));
  }, [gameId, signature, sources]);

  function markSourceLoaded(source: string) {
    if (!mountedRef.current || latestSignatureRef.current !== signature) return;
    setState((current) => {
      const synchronized = synchronizeState(current, gameId, signature, sources);
      if (synchronized.displayedSource === source) return synchronized;
      return { ...synchronized, displayedSource: source };
    });
  }

  function markSourceFailed(source: string) {
    if (!mountedRef.current || latestSignatureRef.current !== signature) return;
    setState((current) => {
      const synchronized = synchronizeState(current, gameId, signature, sources);
      const failedSources = new Set(synchronized.failedSources).add(source);
      const hasRemainingCandidate = sources.some((candidate) => !failedSources.has(candidate));
      const displayedFailed = synchronized.displayedSource === source;
      const displayedStillCanonical = Boolean(synchronized.displayedSource && sources.includes(synchronized.displayedSource));
      return {
        ...synchronized,
        displayedSource: displayedFailed || (!hasRemainingCandidate && !displayedStillCanonical) ? null : synchronized.displayedSource,
        failedSources,
      };
    });
  }

  function recognizeCompletedCandidate(image: HTMLImageElement | null) {
    if (image && image.complete && image.naturalWidth > 0 && candidateSource) {
      markSourceLoaded(candidateSource);
    }
  }

  return {
    candidateSource,
    displayedSource,
    isTransitioning,
    markSourceFailed,
    markSourceLoaded,
    recognizeCompletedCandidate,
    visibleSource,
  };
}

function synchronizeState(current: SemanticImageState, gameId: string, signature: string, sources: string[]): SemanticImageState {
  if (current.signature === signature) return current;
  return {
    displayedSource: current.gameId === gameId && sources.length > 0 ? current.displayedSource : null,
    failedSources: new Set(),
    gameId,
    signature,
  };
}
