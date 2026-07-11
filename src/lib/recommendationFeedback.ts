import { loadLocalJson, savePersistedJson } from './localPersistence';
import { toSlug } from './userProfile';
import { RECOMMENDATION_ENGINE_VERSION, RECOMMENDATION_SCORING_VERSION } from './recommendationConfig';
import type { DiscoveryCandidate } from './discovery';

export const recommendationFeedbackStorageKey = 'questshelf.recommendationFeedback.v1';
export const recommendationExposureStorageKey = 'questshelf.recommendationExposure.v1';
export const recommendationPreferencesStorageKey = 'questshelf.recommendationPreferences.v1';

export type RecommendationFeedbackType = 'hide' | 'not_interested' | 'less_like_this' | 'already_played' | 'more_like_this';
export type RecommendationFeedbackSurface = 'home' | 'discover' | 'discovery_inbox' | 'game_detail' | 'release_calendar';
export type RecommendationExplorationMode = 'familiar' | 'balanced' | 'exploratory';

export type RecommendationFeedbackRecord = {
  schemaVersion: 1;
  rawgId: number | null;
  normalizedTitle: string;
  feedbackType: RecommendationFeedbackType;
  createdAt: number;
  expiresAt?: number | null;
  surface: RecommendationFeedbackSurface;
  candidateSource?: string;
  fallbackTier?: string;
  engineVersion: string;
  scoringVersion: string;
  metadata: {
    genres: string[];
    tags: string[];
    developers: string[];
    franchise: string | null;
  };
};

export type RecommendationExposureRecord = {
  schemaVersion: 1;
  rawgId: number | null;
  normalizedTitle: string;
  firstShownAt: number;
  lastShownAt: number;
  exposureCount: number;
  actionTaken?: RecommendationFeedbackType | 'opened' | 'wishlist' | 'plans' | 'library' | 'playing' | 'finished' | 'dropped';
  profileFingerprint: string;
};

export type RecommendationPreferences = {
  schemaVersion: 1;
  explorationMode: RecommendationExplorationMode;
  preferShorterGames: boolean;
  preferNewerReleases: boolean;
  reduceFranchiseRepetition: boolean;
};

export const defaultRecommendationPreferences: RecommendationPreferences = {
  schemaVersion: 1,
  explorationMode: 'balanced',
  preferShorterGames: false,
  preferNewerReleases: false,
  reduceFranchiseRepetition: false,
};

export function normalizeRecommendationTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeStringArray(value: unknown, limit = 12): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(toSlug).filter(Boolean).slice(0, limit) : [];
}

function normalizeFeedbackType(value: unknown): RecommendationFeedbackType | null {
  return value === 'hide' || value === 'not_interested' || value === 'less_like_this' || value === 'already_played' || value === 'more_like_this' ? value : null;
}

function normalizeSurface(value: unknown): RecommendationFeedbackSurface {
  return value === 'home' || value === 'discover' || value === 'discovery_inbox' || value === 'game_detail' || value === 'release_calendar' ? value : 'discover';
}

export function normalizeRecommendationFeedbackRecords(value: unknown): RecommendationFeedbackRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RecommendationFeedbackRecord[] => {
    if (!item || typeof item !== 'object') return [];
    const parsed = item as Partial<RecommendationFeedbackRecord>;
    const feedbackType = normalizeFeedbackType(parsed.feedbackType);
    const normalizedTitle = normalizeRecommendationTitle(String(parsed.normalizedTitle ?? ''));
    const createdAt = typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0;
    if (!feedbackType || !normalizedTitle || createdAt <= 0) return [];
    return [{
      schemaVersion: 1,
      rawgId: typeof parsed.rawgId === 'number' && Number.isFinite(parsed.rawgId) ? parsed.rawgId : null,
      normalizedTitle,
      feedbackType,
      createdAt,
      expiresAt: typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt) ? parsed.expiresAt : null,
      surface: normalizeSurface(parsed.surface),
      candidateSource: typeof parsed.candidateSource === 'string' ? parsed.candidateSource : undefined,
      fallbackTier: typeof parsed.fallbackTier === 'string' ? parsed.fallbackTier : undefined,
      engineVersion: typeof parsed.engineVersion === 'string' ? parsed.engineVersion : RECOMMENDATION_ENGINE_VERSION,
      scoringVersion: typeof parsed.scoringVersion === 'string' ? parsed.scoringVersion : RECOMMENDATION_SCORING_VERSION,
      metadata: {
        genres: normalizeStringArray(parsed.metadata?.genres),
        tags: normalizeStringArray(parsed.metadata?.tags),
        developers: normalizeStringArray(parsed.metadata?.developers),
        franchise: typeof parsed.metadata?.franchise === 'string' ? parsed.metadata.franchise : null,
      },
    }];
  });
}

export function loadRecommendationFeedback(): RecommendationFeedbackRecord[] {
  const now = Date.now();
  return loadLocalJson(recommendationFeedbackStorageKey, [], normalizeRecommendationFeedbackRecords)
    .filter((record) => !record.expiresAt || record.expiresAt > now);
}

export function saveRecommendationFeedback(records: RecommendationFeedbackRecord[]): void {
  savePersistedJson(recommendationFeedbackStorageKey, normalizeRecommendationFeedbackRecords(records));
}

export function recordRecommendationFeedback(candidate: DiscoveryCandidate, feedbackType: RecommendationFeedbackType, surface: RecommendationFeedbackSurface): RecommendationFeedbackRecord {
  const records = loadRecommendationFeedback();
  const normalizedTitle = normalizeRecommendationTitle(candidate.game.title);
  const next: RecommendationFeedbackRecord = {
    schemaVersion: 1,
    rawgId: candidate.game.rawgId,
    normalizedTitle,
    feedbackType,
    createdAt: Date.now(),
    expiresAt: null,
    surface,
    candidateSource: candidate.source,
    fallbackTier: candidate.source === 'trending' ? 'tier3-broad' : candidate.source === 'broad-discovery' ? 'tier2-adjacent' : candidate.source ? 'tier0-personalized' : undefined,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    scoringVersion: RECOMMENDATION_SCORING_VERSION,
    metadata: {
      genres: candidate.game.genres.map(toSlug).slice(0, 6),
      tags: candidate.game.tags.map(toSlug).slice(0, 10),
      developers: [],
      franchise: candidate.game.slug ? candidate.game.slug.split('-').slice(0, 3).join('-') : null,
    },
  };
  saveRecommendationFeedback([...records.filter((record) => record.rawgId !== next.rawgId && record.normalizedTitle !== next.normalizedTitle), next]);
  return next;
}

export function removeRecommendationFeedback(rawgId: number | null, normalizedTitle: string): void {
  const title = normalizeRecommendationTitle(normalizedTitle);
  saveRecommendationFeedback(loadRecommendationFeedback().filter((record) => !(record.rawgId === rawgId || record.normalizedTitle === title)));
}

export function clearRecommendationFeedback(): void {
  saveRecommendationFeedback([]);
}

export function normalizeRecommendationPreferences(value: unknown): RecommendationPreferences {
  const parsed = value && typeof value === 'object' ? value as Partial<RecommendationPreferences> : {};
  const explorationMode = parsed.explorationMode === 'familiar' || parsed.explorationMode === 'exploratory' ? parsed.explorationMode : 'balanced';
  return {
    schemaVersion: 1,
    explorationMode,
    preferShorterGames: parsed.preferShorterGames === true,
    preferNewerReleases: parsed.preferNewerReleases === true,
    reduceFranchiseRepetition: parsed.reduceFranchiseRepetition === true,
  };
}

export function loadRecommendationPreferences(): RecommendationPreferences {
  return loadLocalJson(recommendationPreferencesStorageKey, defaultRecommendationPreferences, normalizeRecommendationPreferences);
}

export function saveRecommendationPreferences(preferences: RecommendationPreferences): void {
  savePersistedJson(recommendationPreferencesStorageKey, normalizeRecommendationPreferences(preferences));
}

export function normalizeRecommendationExposureRecords(value: unknown): RecommendationExposureRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RecommendationExposureRecord[] => {
    if (!item || typeof item !== 'object') return [];
    const parsed = item as Partial<RecommendationExposureRecord>;
    const normalizedTitle = normalizeRecommendationTitle(String(parsed.normalizedTitle ?? ''));
    if (!normalizedTitle) return [];
    return [{
      schemaVersion: 1,
      rawgId: typeof parsed.rawgId === 'number' && Number.isFinite(parsed.rawgId) ? parsed.rawgId : null,
      normalizedTitle,
      firstShownAt: typeof parsed.firstShownAt === 'number' ? parsed.firstShownAt : Date.now(),
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : Date.now(),
      exposureCount: Math.max(0, Math.min(99, Math.round(typeof parsed.exposureCount === 'number' ? parsed.exposureCount : 0))),
      actionTaken: parsed.actionTaken,
      profileFingerprint: typeof parsed.profileFingerprint === 'string' ? parsed.profileFingerprint : '',
    }];
  });
}

export function loadRecommendationExposure(): RecommendationExposureRecord[] {
  return loadLocalJson(recommendationExposureStorageKey, [], normalizeRecommendationExposureRecords);
}

export function saveRecommendationExposure(records: RecommendationExposureRecord[]): void {
  savePersistedJson(recommendationExposureStorageKey, normalizeRecommendationExposureRecords(records).slice(-300));
}

export function recordRecommendationExposures(candidates: DiscoveryCandidate[], profileFingerprint: string): void {
  const now = Date.now();
  const byKey = new Map(loadRecommendationExposure().map((record) => [record.rawgId != null ? `id:${record.rawgId}` : `title:${record.normalizedTitle}`, record]));
  for (const candidate of candidates) {
    const normalizedTitle = normalizeRecommendationTitle(candidate.game.title);
    const key = candidate.game.rawgId != null ? `id:${candidate.game.rawgId}` : `title:${normalizedTitle}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      schemaVersion: 1,
      rawgId: candidate.game.rawgId,
      normalizedTitle,
      firstShownAt: existing?.firstShownAt ?? now,
      lastShownAt: now,
      exposureCount: (existing?.profileFingerprint === profileFingerprint ? existing.exposureCount : 0) + 1,
      actionTaken: existing?.actionTaken,
      profileFingerprint,
    });
  }
  saveRecommendationExposure([...byKey.values()]);
}

export function recordRecommendationOutcome(rawgId: number | null, title: string, outcome: NonNullable<RecommendationExposureRecord['actionTaken']>): void {
  const normalizedTitle = normalizeRecommendationTitle(title);
  const records = loadRecommendationExposure();
  const next = records.map((record) => {
    if (record.rawgId !== rawgId && record.normalizedTitle !== normalizedTitle) return record;
    return { ...record, actionTaken: outcome };
  });
  saveRecommendationExposure(next);
}
