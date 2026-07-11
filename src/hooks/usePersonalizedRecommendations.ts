import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate } from '../lib/discovery';
import { fetchPersonalRecommendationsResult, type PersonalRecommendationsResult } from '../services/personalRecommendationsService';
import { profileFingerprint } from '../lib/userProfile';
import { getRecommendationState } from '../lib/recommendationState';

export function usePersonalizedRecommendations(games: Game[], inboxRawgIds: Set<number>, hydrationReady = true) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PersonalRecommendationsResult['diagnostics']>(null);
  const inFlight = useRef(false);
  const requestId = useRef(0);
  const previous = useRef<DiscoveryCandidate[]>([]);
  const fingerprint = useMemo(() => profileFingerprint(games), [games]);
  const inboxFingerprint = useMemo(() => [...inboxRawgIds].sort((a, b) => a - b).join('|'), [inboxRawgIds]);

  const run = useCallback(async (forceRefresh = false) => {
    const preflight = getRecommendationState({ games, hydrationReady, hasResults: previous.current.length > 0 });
    if (!preflight.canFetch) {
      setLoading(false);
      setError(null);
      setDiagnostics(null);
      return;
    }
    if (inFlight.current) return;
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    inFlight.current = true;
    setLoading(previous.current.length === 0);
    setError(null);
    try {
      const result = await fetchPersonalRecommendationsResult(games, inboxRawgIds, { hydrationReady, forceRefresh, previous: previous.current });
      if (requestId.current !== currentRequestId) return;
      setDiagnostics(result.diagnostics);
      if (result.candidates.length > 0 || (hydrationReady && previous.current.length === 0)) {
        setCandidates(result.candidates);
        if (result.candidates.length > 0) previous.current = result.candidates;
      }
    } catch (err) {
      if (requestId.current !== currentRequestId) return;
      setError(err instanceof Error ? err.message : 'Recommendations failed.');
    } finally {
      if (requestId.current === currentRequestId) {
        setLoading(false);
        inFlight.current = false;
      }
    }
  }, [fingerprint, inboxFingerprint, hydrationReady, games, inboxRawgIds]);

  useEffect(() => { void run(false); }, [run]);

  const state = useMemo(() => getRecommendationState({
    games,
    hydrationReady,
    loading,
    hasResults: candidates.length > 0,
    hasError: error != null,
    isPartial: Boolean(diagnostics?.partialFailureCount),
    isStale: diagnostics?.cacheStatus === 'stale',
  }), [games, hydrationReady, loading, candidates.length, error, diagnostics]);

  return { candidates, loading, error, diagnostics, state, refresh: () => run(true), isRefreshing: inFlight.current && candidates.length > 0 };
}
