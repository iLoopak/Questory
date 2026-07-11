import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate } from '../lib/discovery';
import { fetchPersonalRecommendationsResult, type PersonalRecommendationsResult } from '../services/personalRecommendationsService';
import { profileFingerprint } from '../lib/userProfile';

export function usePersonalizedRecommendations(games: Game[], inboxRawgIds: Set<number>, hydrationReady = true) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PersonalRecommendationsResult['diagnostics']>(null);
  const inFlight = useRef(false);
  const previous = useRef<DiscoveryCandidate[]>([]);
  const fingerprint = useMemo(() => profileFingerprint(games), [games]);
  const inboxFingerprint = useMemo(() => [...inboxRawgIds].sort((a, b) => a - b).join('|'), [inboxRawgIds]);

  const run = useCallback(async (forceRefresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(previous.current.length === 0);
    setError(null);
    try {
      const result = await fetchPersonalRecommendationsResult(games, inboxRawgIds, { hydrationReady, forceRefresh, previous: previous.current });
      setDiagnostics(result.diagnostics);
      if (result.candidates.length > 0 || (hydrationReady && previous.current.length === 0)) {
        setCandidates(result.candidates);
        if (result.candidates.length > 0) previous.current = result.candidates;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recommendations failed.');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [fingerprint, inboxFingerprint, hydrationReady, games, inboxRawgIds]);

  useEffect(() => { void run(false); }, [run]);

  return { candidates, loading, error, diagnostics, refresh: () => run(true), isRefreshing: inFlight.current && candidates.length > 0 };
}
