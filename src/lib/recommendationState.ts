import { getUserProfileReadiness } from './userProfile';
import { loadRawgSettings } from './rawgSettingsStorage';
import type { Game } from '../types/game';

export type RecommendationEngineStatus =
  | 'notConfigured'
  | 'hydrating'
  | 'coldStart'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'empty'
  | 'error'
  | 'stale';

export type RecommendationStateInput = {
  games: Game[];
  hydrationReady: boolean;
  loading?: boolean;
  hasResults?: boolean;
  hasError?: boolean;
  isPartial?: boolean;
  isStale?: boolean;
  isRawgConfigured?: boolean;
};

export type RecommendationStateSummary = {
  status: RecommendationEngineStatus;
  profileReady: boolean;
  coldStartProgress: number;
  canFetch: boolean;
};

export const RECOMMENDATION_COPY = {
  notConfigured: {
    title: 'Recommended for You',
    body: 'Personal recommendations are available after connecting the RAWG API.',
    help: 'Configure RAWG to unlock game recommendations.',
  },
  coldStart: {
    title: 'Questory is learning your gaming taste.',
    body: 'Rate, finish or plan a few games to improve your recommendations.',
  },
  empty: {
    title: 'No recommendations yet',
    body: 'Add more rated, finished, planned or wishlisted games to unlock better picks.',
  },
  partial: {
    title: 'Showing the best available picks',
    body: 'Some recommendation sources could not refresh, so these results may be less complete.',
  },
  stale: {
    title: 'Showing recent picks',
    body: 'Recommendations will refresh when the game data source is available again.',
  },
  error: {
    title: 'Could not refresh recommendations',
    body: 'Showing the latest available picks where possible.',
  },
} as const;

export function getRecommendationState(input: RecommendationStateInput): RecommendationStateSummary {
  const isRawgConfigured = input.isRawgConfigured ?? loadRawgSettings().apiKey.trim().length > 0;
  const readiness = getUserProfileReadiness(input.games);

  if (!isRawgConfigured) return { status: 'notConfigured', profileReady: readiness.ready, coldStartProgress: readiness.progress, canFetch: false };
  if (!input.hydrationReady) return { status: 'hydrating', profileReady: readiness.ready, coldStartProgress: readiness.progress, canFetch: false };
  if (!readiness.ready) return { status: 'coldStart', profileReady: false, coldStartProgress: readiness.progress, canFetch: false };
  if (input.loading && !input.hasResults) return { status: 'loading', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
  if (input.hasError) return { status: input.hasResults ? 'partial' : 'error', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
  if (input.isStale) return { status: 'stale', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
  if (input.isPartial) return { status: 'partial', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
  if (!input.hasResults) return { status: 'empty', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
  return { status: 'ready', profileReady: true, coldStartProgress: readiness.progress, canFetch: true };
}
