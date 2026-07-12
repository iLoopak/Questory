import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game } from '../types/game';
import { getCachedScreenshots, setCachedScreenshots } from '../lib/screenshotCache';
import { fetchScreenshotsForGame } from '../lib/screenshotProviders';
import { isProviderSetupErrorKind, type ProviderError } from '../lib/providerResult';
import { LatestRequestScheduler } from '../lib/latestRequest';

export type UseGameScreenshotsResult = {
  screenshots: string[];
  loading: boolean;
  /** True when the fetch failed for a non-auth reason (network, timeout, provider, malformed). */
  error: boolean;
  /** The typed failure, when there is one — for the message and for whether Retry makes sense. */
  errorDetail: ProviderError | null;
  /** True when the RAWG API key is missing or rejected — not an outage, a setup problem. */
  missingApiKey: boolean;
  /** Re-fetches, and replaces what is on screen only if the request actually succeeds. */
  refetch: () => void;
};

const emptyScreenshots: string[] = [];

/**
 * AS-13: screenshots belong to the game on screen, and a failure is not "no screenshots".
 *
 * Two defects lived here. A transient network failure was written into the seven-day cache as a
 * valid empty result, hiding a game's screenshots for a week. And every fetch committed
 * unconditionally — `refetch` even discarded its own cancellation cleanup — so selecting game A and
 * then game B could let A's late result overwrite B's screenshots, error and loading state.
 *
 * The selected game IS the request key now: a new game (or a Retry) starts a new generation, and a
 * result may only touch state while its generation and its game are still the current ones.
 */
export function useGameScreenshots(game: Game): UseGameScreenshotsResult {
  const gameId = game.id;
  const gameRef = useRef(game);
  gameRef.current = game;

  const [screenshots, setScreenshots] = useState<string[]>(() => getCachedScreenshots(game) ?? emptyScreenshots);
  const [loading, setLoading] = useState(() => getCachedScreenshots(game) === null);
  const [errorDetail, setErrorDetail] = useState<ProviderError | null>(null);
  const [missingApiKey, setMissingApiKey] = useState(false);

  const desiredKeyRef = useRef(gameId);
  desiredKeyRef.current = gameId;

  const schedulerRef = useRef<LatestRequestScheduler<string> | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new LatestRequestScheduler<string>(() => desiredKeyRef.current);
  }
  const scheduler = schedulerRef.current;

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  const runTask = useCallback(async ({ force, isCurrent }: { force: boolean; isCurrent: () => boolean }) => {
    const currentGame = gameRef.current;
    const cached = getCachedScreenshots(currentGame);

    // A cached result is still a result for one specific game, so it commits under the same guard.
    if (cached !== null && !force) {
      if (!isCurrent()) return;
      setScreenshots(cached);
      setLoading(false);
      setErrorDetail(null);
      setMissingApiKey(false);
      return;
    }

    if (!isCurrent()) return;
    setLoading(true);
    setErrorDetail(null);
    setMissingApiKey(false);

    const result = await fetchScreenshotsForGame(currentGame);

    // The user has navigated to another game, forced a newer refresh, or unmounted: this result
    // belongs to nobody. It may not write screenshots, an error, or even clear the spinner.
    if (!isCurrent()) return;

    if (result.ok) {
      // Only a genuine success is cached — including a genuinely empty one, which is a real answer
      // ("RAWG has no screenshots for this game") and worth remembering.
      setCachedScreenshots(currentGame, result.data.urls, result.data.provider);
      setScreenshots(result.data.urls);
      setLoading(false);
      return;
    }

    // A failure caches NOTHING, and it does not wipe what is on screen: screenshots from an earlier
    // successful fetch stay visible while the failure is reported next to them.
    setLoading(false);
    if (isProviderSetupErrorKind(result.error.kind)) {
      setMissingApiKey(true);
    } else {
      setErrorDetail(result.error);
    }
  }, []);

  useEffect(() => {
    // Show whatever is cached for the NEW game immediately, so the previous game's screenshots are
    // never left on screen while the next request runs.
    const cached = getCachedScreenshots(gameRef.current);
    setScreenshots(cached ?? emptyScreenshots);
    setLoading(cached === null);
    setErrorDetail(null);
    setMissingApiKey(false);

    void scheduler.runLatest(false, runTask);
  }, [gameId, runTask, scheduler]);

  const refetch = useCallback(() => {
    void scheduler.runLatest(true, runTask);
  }, [runTask, scheduler]);

  return { screenshots, loading, error: errorDetail !== null, errorDetail, missingApiKey, refetch };
}
