import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game } from '../types/game';
import { clearCachedScreenshots, getCachedScreenshots, setCachedScreenshots } from '../lib/screenshotCache';
import { RawgApiError } from '../services/rawgApi';
import { fetchScreenshotsForGame } from '../lib/screenshotProviders';

export type UseGameScreenshotsResult = {
  screenshots: string[];
  loading: boolean;
  /** True when the fetch failed for a non-auth reason (CORS, network, API error). */
  error: boolean;
  /** True when the RAWG API key is not configured — not an error, just not set up. */
  missingApiKey: boolean;
  /** Clears the cache entry and re-fetches. */
  refetch: () => void;
};

export function useGameScreenshots(game: Game): UseGameScreenshotsResult {
  const gameId = game.id;
  // Stable reference so we can pass game into the effect without it re-running on every render.
  const gameRef = useRef(game);
  gameRef.current = game;

  const [screenshots, setScreenshots] = useState<string[]>(() => getCachedScreenshots(game) ?? []);
  const [loading, setLoading] = useState(() => getCachedScreenshots(game) === null);
  const [error, setError] = useState(false);
  const [missingApiKey, setMissingApiKey] = useState(false);

  const runFetch = useCallback((forceRefresh: boolean) => {
    const g = gameRef.current;

    if (forceRefresh) clearCachedScreenshots(g);

    const cached = getCachedScreenshots(g);
    if (cached !== null && !forceRefresh) {
      setScreenshots(cached);
      setLoading(false);
      setError(false);
      setMissingApiKey(false);
      return;
    }

    setLoading(true);
    setError(false);
    setMissingApiKey(false);

    let cancelled = false;

    fetchScreenshotsForGame(g)
      .then(({ urls, provider }) => {
        if (cancelled) return;
        setCachedScreenshots(g, urls, provider);
        setScreenshots(urls);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoading(false);
        if (e instanceof RawgApiError && (e.code === 'missing-api-key' || e.code === 'invalid-api-key')) {
          setMissingApiKey(true);
        } else {
          setError(true);
        }
      });

    return () => { cancelled = true; };
  }, []); // stable — gameRef provides the latest game

  useEffect(() => {
    // Reset UI when the game changes, then fetch.
    const cached = getCachedScreenshots(gameRef.current);
    setScreenshots(cached ?? []);
    setLoading(cached === null);
    setError(false);
    setMissingApiKey(false);

    const cleanup = runFetch(false);
    return cleanup;
  }, [gameId, runFetch]);

  const refetch = useCallback(() => runFetch(true), [runFetch]);

  return { screenshots, loading, error, missingApiKey, refetch };
}
