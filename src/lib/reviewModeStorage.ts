import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.reviewMode.v1';

export const reviewSourceOptions = [
  'backlog',
  'recent-imports',
  'wishlist',
  'missing-metadata',
  'retro',
  'steam',
  'manual',
  'never-played',
] as const;

export type ReviewSource = (typeof reviewSourceOptions)[number];

export type ReviewStats = {
  dropped: number;
  enriched: number;
  ignored: number;
  playing: number;
  queueCandidates: number;
  reviewed: number;
  skipped: number;
  wishlisted: number;
};

export type ReviewModeState = {
  ignoredGameIds: string[];
  lastSource: ReviewSource;
  stats: ReviewStats;
};

export type ReviewDecision = keyof ReviewStats;

const emptyStats: ReviewStats = {
  dropped: 0,
  enriched: 0,
  ignored: 0,
  playing: 0,
  queueCandidates: 0,
  reviewed: 0,
  skipped: 0,
  wishlisted: 0,
};

const emptyReviewModeState: ReviewModeState = {
  ignoredGameIds: [],
  lastSource: 'backlog',
  stats: emptyStats,
};

export function loadReviewModeState(): ReviewModeState {
  return loadLocalJson(STORAGE_KEY, emptyReviewModeState, normalizeReviewModeState);
}

export function saveReviewModeState(state: ReviewModeState) {
  savePersistedJson(STORAGE_KEY, state);
}

export function createReviewStats(): ReviewStats {
  return { ...emptyStats };
}

export function getReviewSourceLabel(source: ReviewSource) {
  const labels: Record<ReviewSource, string> = {
    backlog: 'Backlog',
    'missing-metadata': 'Missing metadata',
    manual: 'Manual games',
    'never-played': 'Never played',
    'recent-imports': 'Imported recently',
    retro: 'Retro games',
    steam: 'Steam games',
    wishlist: 'Wishlist',
  };

  return labels[source];
}

function normalizeReviewModeState(value: unknown): ReviewModeState {
  const parsedState = value && typeof value === 'object' ? (value as Partial<ReviewModeState>) : {};
  const stats =
    parsedState.stats && typeof parsedState.stats === 'object'
      ? (parsedState.stats as Partial<ReviewStats>)
      : {};

  return {
    ignoredGameIds: Array.isArray(parsedState.ignoredGameIds)
      ? parsedState.ignoredGameIds.filter((gameId): gameId is string => typeof gameId === 'string')
      : [],
    lastSource: isReviewSource(parsedState.lastSource) ? parsedState.lastSource : 'backlog',
    stats: {
      dropped: getNumber(stats.dropped),
      enriched: getNumber(stats.enriched),
      ignored: getNumber(stats.ignored),
      playing: getNumber(stats.playing),
      queueCandidates: getNumber(stats.queueCandidates),
      reviewed: getNumber(stats.reviewed),
      skipped: getNumber(stats.skipped),
      wishlisted: getNumber(stats.wishlisted),
    },
  };
}

function isReviewSource(value: unknown): value is ReviewSource {
  return typeof value === 'string' && reviewSourceOptions.includes(value as ReviewSource);
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
