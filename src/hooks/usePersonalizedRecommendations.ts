import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate } from '../lib/discovery';
import {
  buildPersonalizedRecommendations,
  type PersonalizedRecommendationDiagnostics,
} from '../lib/personalizedRecommendations';
import { fetchGameSeries, fetchRecommendedGames, fetchSuggestedGames } from '../services/rawgApi';

export function usePersonalizedRecommendations(games: Game[], inboxRawgIds: Set<number>, hydrationReady = true) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PersonalizedRecommendationDiagnostics | null>(null);
  const inFlight = useRef(false);
  const previous = useRef<DiscoveryCandidate[]>([]);
  const fingerprint = useMemo(() => games.map(g => `${g.id}:${g.rawgId}:${g.status}:${g.rating}:${g.favorite}:${g.playtimeHours}:${g.collectionType}:${g.updatedAt}`).sort().join('|'), [games]);
  const inboxFingerprint = useMemo(() => [...inboxRawgIds].sort((a, b) => a - b).join('|'), [inboxRawgIds]);

  const run = useCallback(async (forceRefresh = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(previous.current.length === 0);
    setError(null);
    const result = await buildPersonalizedRecommendations(games, {
      hydrationReady,
      inboxRawgIds,
      forceRefresh,
      previous: previous.current,
      fetchers: {
        similar: async (rawgId) => [...await fetchSuggestedGames(rawgId), ...await fetchGameSeries(rawgId)],
        discover: fetchRecommendedGames,
      },
    });
    setDiagnostics(result.diagnostics);
    if (result.diagnostics.lastError) setError(result.diagnostics.lastError);
    if (result.candidates.length > 0 || (hydrationReady && previous.current.length === 0)) {
      setCandidates(result.candidates);
      if (result.candidates.length > 0) previous.current = result.candidates;
    }
    setLoading(false);
    inFlight.current = false;
  }, [fingerprint, inboxFingerprint, hydrationReady, games, inboxRawgIds]);

  useEffect(() => { void run(false); }, [run]);

  return { candidates, loading, error, diagnostics, refresh: () => run(true), isRefreshing: inFlight.current && candidates.length > 0 };
}
