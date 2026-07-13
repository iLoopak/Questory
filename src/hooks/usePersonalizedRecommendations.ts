import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate } from '../lib/discovery';
import {
  fetchPersonalRecommendationsResult,
  prepareRecommendationInput,
  type PreparedRecommendationInput,
  type PersonalRecommendationsResult,
} from '../services/personalRecommendationsService';
import { getRecommendationState } from '../lib/recommendationState';
import { recordRecommendationFeedback, type RecommendationFeedbackSurface, type RecommendationFeedbackType } from '../lib/recommendationFeedback';
import { clearPersonalRecommendationCaches } from '../services/personalRecommendationsService';
import { trackAnalyticsEvent } from '../lib/analytics';
import { isProviderSetupErrorKind, type ProviderStatusSummary } from '../lib/providerResult';
import { LatestRequestScheduler } from '../lib/latestRequest';
import { RECOMMENDATION_ENGINE_VERSION, RECOMMENDATION_SCORING_VERSION } from '../lib/recommendationConfig';
import { noPlannedGameIds, plannedGameFingerprint, type PlannedGameIds } from '../lib/plannedGames';
import { getRecommendationInputRevision, subscribeRecommendationInputRevision } from '../lib/recommendationInputRevision';
import { recommendationConfig } from '../lib/recommendationConfig';

/**
 * AS-12: recommendations belong to the library they were generated from.
 *
 * The hook used to SKIP a run while another was in flight (`if (inFlight.current) return;`). If the
 * user imported a game, finished one, or the Inbox changed during generation, the new inputs never
 * got their own run — and the old run, computed against the pre-change library, still committed. A
 * game the user had just bought or finished could stay in the recommendations.
 *
 * Now: a stable input key describes the inputs; a scheduler runs exactly one request for the LATEST
 * key (queued-latest, never parallel); and nothing — candidates, diagnostics, error, loading — is
 * committed unless the run's generation and key are still the current ones and the hook is mounted.
 */
/**
 * Where the candidate sits in the list the user is looking at. Pure, so the rank the telemetry
 * reports can be checked against a given list rather than inferred.
 */
export function getRecommendationFeedbackRankBucket(
  candidates: DiscoveryCandidate[],
  candidate: DiscoveryCandidate,
): 'top' | 'middle' | 'lower' {
  const position = candidates.findIndex((item) => item.game.rawgId === candidate.game.rawgId);
  if (position >= 0 && position < 3) return 'top';
  if (position >= 0 && position < 8) return 'middle';
  return 'lower';
}

export function usePersonalizedRecommendations(
  games: Game[],
  inboxRawgIds: Set<number>,
  hydrationReady = true,
  plannedGameIds: PlannedGameIds = noPlannedGameIds,
) {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PersonalRecommendationsResult['diagnostics']>(null);
  // AS-10: what the provider actually did. `failed` means every RAWG call failed, which is not the
  // same thing as RAWG having nothing to recommend.
  const [provider, setProvider] = useState<ProviderStatusSummary | null>(null);

  const previous = useRef<DiscoveryCandidate[]>([]);
  // AS-12: the feedback callback used to close over the candidates array from FIRST render (empty
  // dependency list), so the rank it reported could describe a list the user was no longer looking
  // at. It reads this ref instead.
  const candidatesRef = useRef<DiscoveryCandidate[]>(candidates);
  candidatesRef.current = candidates;

  const semanticRevision = useSyncExternalStore(
    subscribeRecommendationInputRevision,
    getRecommendationInputRevision,
    getRecommendationInputRevision,
  );
  const [freshnessWindow, setFreshnessWindow] = useState(() => getRecommendationFreshnessWindow());
  const inboxFingerprint = [...inboxRawgIds].sort((a, b) => a - b).join('|');
  const plannedFingerprint = plannedGameFingerprint(plannedGameIds);
  const rawInputsRef = useRef({ games, inboxFingerprint, hydrationReady, plannedFingerprint, semanticRevision, revision: 0 });
  const rawInputs = rawInputsRef.current;
  if (
    rawInputs.games !== games ||
    rawInputs.inboxFingerprint !== inboxFingerprint ||
    rawInputs.hydrationReady !== hydrationReady ||
    rawInputs.plannedFingerprint !== plannedFingerprint ||
    rawInputs.semanticRevision !== semanticRevision
  ) {
    rawInputsRef.current = { games, inboxFingerprint, hydrationReady, plannedFingerprint, semanticRevision, revision: rawInputs.revision + 1 };
  }
  const rawRevision = rawInputsRef.current.revision;
  const [preparedState, setPreparedState] = useState<{ input: PreparedRecommendationInput; rawRevision: number } | null>(null);

  useEffect(() => {
    const input = prepareRecommendationInput(games, plannedGameIds);
    setPreparedState({ input, rawRevision });
  }, [games, plannedFingerprint, rawRevision, semanticRevision]);

  useEffect(() => {
    function refreshAtVisibilityBoundary() {
      if (document.visibilityState !== 'visible') return;
      setFreshnessWindow((current) => {
        const next = getRecommendationFreshnessWindow();
        return current === next ? current : next;
      });
    }
    document.addEventListener('visibilitychange', refreshAtVisibilityBoundary);
    return () => document.removeEventListener('visibilitychange', refreshAtVisibilityBoundary);
  }, []);

  const preparedInput = preparedState?.rawRevision === rawRevision ? preparedState.input : null;
  const inputKey = preparedInput
    ? `${preparedInput.semanticKey}::inbox:${inboxFingerprint}::hydration:${hydrationReady}::freshness:${freshnessWindow}`
    : `pending:${rawRevision}`;
  const isPreparing = !preparedInput && hydrationReady && games.length > 0;
  const effectiveLoading = loading || (isPreparing && candidates.length === 0);

  // The inputs the run must be judged against. Written during render, so the scheduler's guards
  // always compare against what the user is looking at right now — not what they were looking at
  // when the request started.
  const desiredKeyRef = useRef(inputKey);
  desiredKeyRef.current = inputKey;
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const inboxRef = useRef(inboxRawgIds);
  inboxRef.current = inboxRawgIds;
  const hydrationReadyRef = useRef(hydrationReady);
  hydrationReadyRef.current = hydrationReady;
  const plannedGameIdsRef = useRef(plannedGameIds);
  plannedGameIdsRef.current = plannedGameIds;
  const preparedInputRef = useRef(preparedInput);
  preparedInputRef.current = preparedInput;

  const schedulerRef = useRef<LatestRequestScheduler<string> | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new LatestRequestScheduler<string>(() => desiredKeyRef.current);
  }
  const scheduler = schedulerRef.current;

  useEffect(() => () => scheduler.dispose(), [scheduler]);

  const runTask = useCallback(async ({ force, isCurrent }: { force: boolean; isCurrent: () => boolean }) => {
    const currentGames = gamesRef.current;
    const currentInbox = inboxRef.current;
    const currentHydrationReady = hydrationReadyRef.current;
    const currentPlannedGameIds = plannedGameIdsRef.current;
    const currentPreparedInput = preparedInputRef.current;

    if (!currentPreparedInput) return;

    const preflight = getRecommendationState({
      games: currentGames,
      hydrationReady: currentHydrationReady,
      hasResults: previous.current.length > 0,
    });

    if (!preflight.canFetch) {
      if (!isCurrent()) return;
      setLoading(false);
      setIsFetching(false);
      setError(null);
      setDiagnostics(null);
      return;
    }

    if (!isCurrent()) return;
    setIsFetching(true);
    setLoading(previous.current.length === 0);
    setError(null);

    try {
      const result = await fetchPersonalRecommendationsResult(currentGames, currentInbox, {
        hydrationReady: currentHydrationReady,
        forceRefresh: force,
        previous: previous.current,
        plannedGameIds: currentPlannedGameIds,
        preparedInput: currentPreparedInput,
      });

      // The guard covers a cache hit exactly as it covers a network result: a result for inputs the
      // user has moved on from is worthless however fast it arrived.
      if (!isCurrent()) return;

      setDiagnostics(result.diagnostics);
      setProvider(result.provider);
      setError(result.provider.status === 'failed' ? result.provider.error?.safeMessage ?? 'Recommendations could not be refreshed.' : null);

      if (result.candidates.length > 0 || (currentHydrationReady && previous.current.length === 0)) {
        setCandidates(result.candidates);
        if (result.candidates.length > 0) previous.current = result.candidates;
      }
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Recommendations failed.');
    } finally {
      // Loading belongs to the CURRENT generation. An obsolete run must not clear the spinner that
      // the run replacing it just turned on — and when the key has moved on, the scheduler is about
      // to start that replacement run immediately.
      if (isCurrent()) {
        setLoading(false);
        setIsFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!preparedInput) return;
    void scheduler.schedule(false, runTask);
  }, [inputKey, preparedInput, runTask, scheduler]);

  const state = useMemo(() => getRecommendationState({
    games,
    hydrationReady,
    loading: effectiveLoading,
    hasResults: candidates.length > 0,
    hasError: error != null,
    isPartial: Boolean(diagnostics?.partialFailureCount) || provider?.status === 'partial',
    isStale: diagnostics?.cacheStatus === 'stale' || Boolean(provider?.stale),
  }), [games, hydrationReady, effectiveLoading, candidates.length, error, diagnostics, provider]);

  const submitFeedback = useCallback((candidate: DiscoveryCandidate, feedbackType: RecommendationFeedbackType, surface: RecommendationFeedbackSurface) => {
    recordRecommendationFeedback(candidate, feedbackType, surface);
    // The rank reported here is the rank in the list on screen when the user pressed the button —
    // read from the ref, not from a closure captured on first render.
    const rankBucket = getRecommendationFeedbackRankBucket(candidatesRef.current, candidate);
    const sourceCategory = candidate.source === 'liked-game-similar' || candidate.source === 'liked-game-series' || candidate.source === 'second-order' ? 'seed'
      : candidate.source === 'plans-wishlist' ? 'intent'
        : candidate.source === 'broad-discovery' || candidate.source === 'trending' ? 'fallback'
          : candidate.source ? 'affinity' : 'unknown';
    trackAnalyticsEvent('recommendation_feedback', {
      surface: surface === 'discovery_inbox' ? 'discover' : surface,
      feedback_type: feedbackType,
      source_category: sourceCategory,
      fallback_tier: candidate.source === 'trending' ? 'broad' : candidate.source === 'broad-discovery' ? 'adjacent' : candidate.source ? 'personalized' : 'none',
      rank_bucket: rankBucket,
      engine_version: RECOMMENDATION_ENGINE_VERSION,
      scoring_version: RECOMMENDATION_SCORING_VERSION,
    });
    void clearPersonalRecommendationCaches();
    setCandidates((current) => current.filter((item) => item.game.rawgId !== candidate.game.rawgId));
    previous.current = previous.current.filter((item) => item.game.rawgId !== candidate.game.rawgId);
  }, []);

  return {
    candidates,
    loading: effectiveLoading,
    error,
    diagnostics,
    provider,
    /** True when the user has to fix the integration rather than wait for the provider. */
    needsSetup: provider?.error ? isProviderSetupErrorKind(provider.error.kind) : false,
    state,
    // Retry bypasses the caches (forceRefresh) and keeps whatever is on screen while it runs. If a
    // run is already going, this queues exactly one rerun rather than racing it.
    refresh: () => { void scheduler.schedule(true, runTask); },
    submitFeedback,
    isRefreshing: (isFetching || isPreparing) && candidates.length > 0,
  };
}

function getRecommendationFreshnessWindow(now = Date.now()): number {
  return Math.floor(now / recommendationConfig.cacheTtlMs);
}
