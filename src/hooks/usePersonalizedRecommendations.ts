import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate } from '../lib/discovery';
import { fetchPersonalRecommendationsResult, type PersonalRecommendationsResult } from '../services/personalRecommendationsService';
import { profileFingerprint } from '../lib/userProfile';
import { getRecommendationState } from '../lib/recommendationState';
import { recordRecommendationFeedback, type RecommendationFeedbackSurface, type RecommendationFeedbackType } from '../lib/recommendationFeedback';
import { clearPersonalRecommendationCaches } from '../services/personalRecommendationsService';
import { trackAnalyticsEvent } from '../lib/analytics';
import { isProviderSetupErrorKind, type ProviderStatusSummary } from '../lib/providerResult';
import { RECOMMENDATION_ENGINE_VERSION, RECOMMENDATION_SCORING_VERSION } from '../lib/recommendationConfig';

export function usePersonalizedRecommendations(games: Game[], inboxRawgIds: Set<number>, hydrationReady = true) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PersonalRecommendationsResult['diagnostics']>(null);
  // AS-10: what the provider actually did. `failed` means every RAWG call failed, which is not the
  // same thing as RAWG having nothing to recommend — the difference decides whether the user sees an
  // empty state or a retryable error.
  const [provider, setProvider] = useState<ProviderStatusSummary | null>(null);
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
      setProvider(result.provider);
      // A total provider failure is reported as an error even when stale picks are shown, so the
      // surface can say "could not refresh" instead of quietly presenting old data as current.
      setError(result.provider.status === 'failed' ? result.provider.error?.safeMessage ?? 'Recommendations could not be refreshed.' : null);
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
    isPartial: Boolean(diagnostics?.partialFailureCount) || provider?.status === 'partial',
    isStale: diagnostics?.cacheStatus === 'stale' || Boolean(provider?.stale),
  }), [games, hydrationReady, loading, candidates.length, error, diagnostics, provider]);

  const submitFeedback = useCallback((candidate: DiscoveryCandidate, feedbackType: RecommendationFeedbackType, surface: RecommendationFeedbackSurface) => {
    recordRecommendationFeedback(candidate, feedbackType, surface);
    const position = candidates.findIndex((item) => item.game.rawgId === candidate.game.rawgId);
    const sourceCategory = candidate.source === 'liked-game-similar' || candidate.source === 'liked-game-series' || candidate.source === 'second-order' ? 'seed'
      : candidate.source === 'plans-wishlist' ? 'intent'
        : candidate.source === 'broad-discovery' || candidate.source === 'trending' ? 'fallback'
          : candidate.source ? 'affinity' : 'unknown';
    trackAnalyticsEvent('recommendation_feedback', {
      surface: surface === 'discovery_inbox' ? 'discover' : surface,
      feedback_type: feedbackType,
      source_category: sourceCategory,
      fallback_tier: candidate.source === 'trending' ? 'broad' : candidate.source === 'broad-discovery' ? 'adjacent' : candidate.source ? 'personalized' : 'none',
      rank_bucket: position >= 0 && position < 3 ? 'top' : position >= 0 && position < 8 ? 'middle' : 'lower',
      engine_version: RECOMMENDATION_ENGINE_VERSION,
      scoring_version: RECOMMENDATION_SCORING_VERSION,
    });
    void clearPersonalRecommendationCaches();
    setCandidates((current) => current.filter((item) => item.game.rawgId !== candidate.game.rawgId));
    previous.current = previous.current.filter((item) => item.game.rawgId !== candidate.game.rawgId);
  }, []);

  return {
    candidates,
    loading,
    error,
    diagnostics,
    provider,
    /** True when the user has to fix the integration rather than wait for the provider. */
    needsSetup: provider?.error ? isProviderSetupErrorKind(provider.error.kind) : false,
    state,
    // Retry bypasses the caches (forceRefresh) and keeps whatever is on screen while it runs.
    refresh: () => run(true),
    submitFeedback,
    isRefreshing: inFlight.current && candidates.length > 0,
  };
}
