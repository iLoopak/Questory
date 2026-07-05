import { useEffect, useState } from 'react';
import { RawgApiError, getGameScreenshots } from '../services/rawgApi';
import { getCachedScreenshotsByRawgId, setCachedScreenshotsByRawgId } from '../lib/screenshotCache';

export type UseDiscoveryScreenshotsResult = {
  screenshots: string[];
  loading: boolean;
  missingApiKey: boolean;
};

/**
 * Fetches and caches screenshots for a DiscoveryGame via its rawgId.
 * Shares the same localStorage cache as useGameScreenshots so entries are
 * reused when the same game later appears in the library.
 */
export function useDiscoveryScreenshots(rawgId: number): UseDiscoveryScreenshotsResult {
  const [screenshots, setScreenshots] = useState<string[]>(() => getCachedScreenshotsByRawgId(rawgId) ?? []);
  const [loading, setLoading] = useState(() => getCachedScreenshotsByRawgId(rawgId) === null);
  const [missingApiKey, setMissingApiKey] = useState(false);

  useEffect(() => {
    const cached = getCachedScreenshotsByRawgId(rawgId);
    if (cached !== null) {
      setScreenshots(cached);
      setLoading(false);
      setMissingApiKey(false);
      return;
    }

    setScreenshots([]);
    setLoading(true);
    setMissingApiKey(false);
    let cancelled = false;

    getGameScreenshots(rawgId)
      .then((urls) => {
        if (cancelled) return;
        const unique = [...new Set(urls)].slice(0, 5);
        setCachedScreenshotsByRawgId(rawgId, unique);
        setScreenshots(unique);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoading(false);
        if (e instanceof RawgApiError && (e.code === 'missing-api-key' || e.code === 'invalid-api-key')) {
          setMissingApiKey(true);
        }
        // Network/API errors silently produce no screenshots — not a hard failure
      });

    return () => { cancelled = true; };
  }, [rawgId]);

  return { screenshots, loading, missingApiKey };
}
