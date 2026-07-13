import { useCallback, useEffect, useRef, useState } from 'react';
import { getGameScreenshots, toRawgProviderError } from '../services/rawgApi';
import { getCachedScreenshotsByRawgId, setCachedScreenshotsByRawgId } from '../lib/screenshotCache';
import { isProviderSetupErrorKind } from '../lib/providerResult';
import { LatestRequestScheduler } from '../lib/latestRequest';

export type UseDiscoveryScreenshotsResult = {
  screenshots: string[];
  loading: boolean;
  missingApiKey: boolean;
  error: boolean;
  refetch: () => void;
};

const emptyScreenshots: string[] = [];

/**
 * Fetches and caches screenshots for a DiscoveryGame via its rawgId. Shares the cache with
 * `useGameScreenshots`, so an entry is reused when the same game later joins the library.
 *
 * AS-13: the rawgId is the request key. A late result for a preview the user has already moved past
 * cannot write over the current one, and a failure is never cached as "this game has no screenshots".
 */
export function useDiscoveryScreenshots(rawgId: number): UseDiscoveryScreenshotsResult {
  const [screenshots, setScreenshots] = useState<string[]>(() => getCachedScreenshotsByRawgId(rawgId) ?? emptyScreenshots);
  const [loading, setLoading] = useState(() => getCachedScreenshotsByRawgId(rawgId) === null);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const [error, setError] = useState(false);

  const desiredKeyRef = useRef(rawgId);
  desiredKeyRef.current = rawgId;

  const schedulerRef = useRef<LatestRequestScheduler<number> | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new LatestRequestScheduler<number>(() => desiredKeyRef.current);
  }
  const scheduler = schedulerRef.current;

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  const runTask = useCallback(async ({ key, isCurrent }: { key: number; isCurrent: () => boolean }) => {
    const cached = getCachedScreenshotsByRawgId(key);
    if (cached !== null) {
      if (!isCurrent()) return;
      setScreenshots(cached);
      setLoading(false);
      setMissingApiKey(false);
      setError(false);
      return;
    }

    if (!isCurrent()) return;
    setScreenshots(emptyScreenshots);
    setLoading(true);
    setMissingApiKey(false);
    setError(false);

    try {
      const urls = await getGameScreenshots(key);
      if (!isCurrent()) return;

      const unique = [...new Set(urls)].slice(0, 5);
      setCachedScreenshotsByRawgId(key, unique);
      setScreenshots(unique);
      setLoading(false);
      setError(false);
    } catch (error) {
      if (!isCurrent()) return;

      // Nothing is cached: a network blip must not record "no screenshots" for a week.
      setLoading(false);
      if (isProviderSetupErrorKind(toRawgProviderError(error).kind)) {
        setMissingApiKey(true);
      } else {
        setError(true);
      }
    }
  }, []);

  useEffect(() => {
    void scheduler.runLatest(false, runTask);
  }, [rawgId, runTask, scheduler]);

  const refetch = useCallback(() => {
    void scheduler.runLatest(true, runTask);
  }, [runTask, scheduler]);

  return { screenshots, loading, missingApiKey, error, refetch };
}
