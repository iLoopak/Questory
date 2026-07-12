import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryExclusionReason } from '../lib/discovery';
import type { UserProfile } from '../lib/userProfile';
import type { RawgSearchResult } from '../types/rawg';
import {
  buildUserProfile,
  getRecommendationSignalWeight,
  isDistinctivePreferenceTag,
  preferenceTagWeight,
  profileFingerprint,
  recommendationFranchiseKey,
  signalInformationValue,
  toSlug,
} from '../lib/userProfile';
import { noPlannedGameIds, type PlannedGameIds } from '../lib/plannedGames';
import { mapRawgResult } from './discoveryService';
import {
  fetchGameSeries as fetchGameSeriesResult,
  fetchRecommendedGames as fetchRecommendedGamesResult,
  fetchSuggestedGames as fetchSuggestedGamesResult,
  type RecommendedGamesParams,
} from './rawgApi';
import {
  getProviderErrorCategory,
  summarizeProviderStatus,
  type ProviderError,
  type ProviderResult,
  type ProviderStatusSummary,
} from '../lib/providerResult';
import type { RawgSearchResult as RawgResult } from '../types/rawg';
import { readAppCacheValue, removeAppCacheValue, writeAppCacheValue } from '../lib/indexedDbAppCache';
import type { RecommendationEngineStatus } from '../lib/recommendationState';
import { bucketDuration, bucketSmallGroup, trackAnalyticsEvent } from '../lib/analytics';
import {
  loadRecommendationExposure,
  loadRecommendationFeedback,
  loadRecommendationPreferences,
  normalizeRecommendationTitle,
  recordRecommendationExposures,
  type RecommendationFeedbackRecord,
  type RecommendationPreferences,
} from '../lib/recommendationFeedback';
import {
  RECOMMENDATION_CACHE_SCHEMA_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_SCORING_VERSION,
  recommendationConfig,
} from '../lib/recommendationConfig';
import { summarizeRecommendationQuality, type RecommendationQualitySummary } from '../lib/recommendationQuality';
import { getActiveTasteSignals, getTasteProfileForGames, type TasteProfile, type TasteSignal } from '../lib/tasteProfile';

// ---------------------------------------------------------------------------
// Recommendation waterfall
// ---------------------------------------------------------------------------

const TARGET_PERSONAL_RECOMMENDATIONS = 12;
const DEBUG_RECOMMENDATIONS = import.meta.env.DEV && import.meta.env.VITE_DEBUG_RECOMMENDATIONS !== 'false';

export type CandidateSource =
  | 'liked-game-similar'
  | 'liked-game-series'
  | 'affinity-strict'
  | 'plans-wishlist'
  | 'recently-interacted'
  | 'affinity-relaxed'
  | 'second-order'
  | 'broad-discovery'
  | 'trending';

export type ScoredCandidate = {
  result: RawgSearchResult;
  score: RecommendationScore;
  reason: string;
  source: CandidateSource;
  anchorTitle?: string;
  seed?: SelectedRecommendationSeed;
};

export type RecommendationCandidateDiagnostics = {
  rawgId: number;
  title: string;
  finalScore: number;
  source: CandidateSource;
  strongestPositiveSignals: string[];
  negativePenalties: string[];
  sourceSeedGames: string[];
  fallbackTier: 'personalized' | 'broad' | 'trending';
  exclusionDecisions: string[];
  scoreBreakdown?: RecommendationScore;
  originalScore?: number;
  finalSelectionScore?: number;
  diversityAdjustment?: number;
  primaryGenre?: string;
  franchise?: string | null;
  developer?: string | null;
  tasteClusters?: string[];
  primarySeed?: string | null;
  capDecisions?: string[];
  relaxationStep?: string;
  selectionReason?: string;
};

type DebugEvent = Record<string, unknown> & { event: string };

type RecommendationSurface = 'service' | 'home' | 'discover' | 'discovery-inbox';

type RecommendationDiagnosticsReport = {
  status?: RecommendationEngineStatus;
  hydrationReady: boolean;
  libraryCount: number;
  finishedCount: number;
  playingCount: number;
  plannedCount: number;
  wishlistCount: number;
  seedCount: number;
  providerCandidateCount: number;
  localAffinityCandidateCount: number;
  broadDiscoveryCandidateCount: number;
  trendingCandidateCount: number;
  normalizedCount: number;
  excludedCounts: {
    owned: number;
    finished: number;
    dropped: number;
    ignored: number;
    discoveryInbox: number;
    skippedForNextDiscoveryRun: number;
    duplicate: number;
    lowScore: number;
    missingArtwork: number;
    missingMetadata: number;
    platformMismatch: number;
    seenOnly: number;
  };
  finalRecommendationCount: number;
  cachedRecommendationCount: number;
  homeSelectorCount: number;
  discoverSelectorCount: number;
  homeRenderReason: string;
  discoverRenderReason: string;
  lastGenerationError: string | null;
  cacheAge: number | null;
  fingerprint?: string;
  candidateDiagnostics?: RecommendationCandidateDiagnostics[];
  selectedSeeds?: SeedDiagnostics[];
  topPositiveSignals?: Record<string, unknown>;
  topNegativeSignals?: Record<string, unknown>;
  scoreDistribution?: { min: number; median: number; max: number } | null;
  finalSelection?: FinalSelectionDiagnostics;
  performance?: Record<string, number>;
  cacheStatus?: 'hit' | 'miss' | 'stale' | 'invalid' | 'bypass';
  partialFailureCount?: number;
  engineVersion?: string;
  scoringVersion?: string;
  feedbackSignalCount?: number;
  exposureSignalCount?: number;
  qualitySummary?: RecommendationQualitySummary;
};

const lastSurfaceCounts = { homeSelectorCount: 0, discoverSelectorCount: 0, homeRenderReason: 'not-rendered', discoverRenderReason: 'not-rendered' };
let lastDiagnosticsReport: RecommendationDiagnosticsReport | null = null;

export function reportRecommendationSurfaceDiagnostics(surface: RecommendationSurface, selectorCount: number, renderReason: string): void {
  if (!DEBUG_RECOMMENDATIONS) return;
  if (surface === 'home') {
    lastSurfaceCounts.homeSelectorCount = selectorCount;
    lastSurfaceCounts.homeRenderReason = renderReason;
  }
  if (surface === 'discover') {
    lastSurfaceCounts.discoverSelectorCount = selectorCount;
    lastSurfaceCounts.discoverRenderReason = renderReason;
  }
  console.debug('[QuestShelf recommendations] surface report', { surface, selectorCount, renderReason, sharedReport: lastDiagnosticsReport });
}

function debugRecommendationPipeline(events: DebugEvent[]): void {
  if (!DEBUG_RECOMMENDATIONS || events.length === 0) return;
  console.groupCollapsed(`[QuestShelf recommendations] ${events.length} pipeline events`);
  for (const event of events) console.debug(event);
  console.groupEnd();
}

type RecommendationInputCounts = {
  libraryCount: number;
  finishedCount: number;
  ratedCount: number;
  playingCount: number;
  platformPlanCount: number;
  wishlistCount: number;
};

type RecommendationReportOptions = {
  fromCache?: boolean;
  finalCandidates: DiscoveryCandidate[];
  normalizedCandidates?: DiscoveryCandidate[];
  seedTitles?: string[];
  rawPersonalizedCandidateCount?: number;
  normalizedCandidateCount?: number;
  fingerprint?: string;
  candidateDiagnostics?: RecommendationCandidateDiagnostics[];
  selectedSeeds?: SeedDiagnostics[];
  topPositiveSignals?: Record<string, unknown>;
  topNegativeSignals?: Record<string, unknown>;
  scoreDistribution?: { min: number; median: number; max: number } | null;
  finalSelection?: FinalSelectionDiagnostics;
  performance?: Record<string, number>;
  cacheStatus?: 'hit' | 'miss' | 'stale' | 'invalid' | 'bypass';
  partialFailureCount?: number;
  feedbackSignalCount?: number;
  exposureSignalCount?: number;
  qualitySummary?: RecommendationQualitySummary;
};

function debugRecommendationReport(events: DebugEvent[], counts: RecommendationInputCounts, options: RecommendationReportOptions & { cacheAge?: number | null; lastGenerationError?: string | null }): void {
  if (!DEBUG_RECOMMENDATIONS) return;
  const rejected = events.filter((event) => event.event === 'candidate_rejected');
  const reasonIncludes = (fragment: string) => rejected.filter((event) => String(event.reason ?? '').includes(fragment)).length;
  const stageCount = (source: CandidateSource) => events
    .filter((event) => event.event === 'stage_complete' && event.source === source)
    .reduce((sum, event) => sum + (typeof event.produced === 'number' ? event.produced : 0), 0);
  const providerCandidateCount = events
    .filter((event) => event.event === 'provider_batch')
    .reduce((sum, event) => sum + (typeof event.count === 'number' ? event.count : 0), 0);
  const report: RecommendationDiagnosticsReport = {
    hydrationReady: true,
    libraryCount: counts.libraryCount,
    finishedCount: counts.finishedCount,
    playingCount: counts.playingCount,
    plannedCount: counts.platformPlanCount,
    wishlistCount: counts.wishlistCount,
    seedCount: options.seedTitles?.length ?? 0,
    providerCandidateCount,
    localAffinityCandidateCount: stageCount('liked-game-similar') + stageCount('liked-game-series') + stageCount('affinity-strict') + stageCount('plans-wishlist') + stageCount('recently-interacted') + stageCount('affinity-relaxed') + stageCount('second-order'),
    broadDiscoveryCandidateCount: stageCount('broad-discovery'),
    trendingCandidateCount: stageCount('trending'),
    normalizedCount: options.normalizedCandidateCount ?? options.finalCandidates.length,
    excludedCounts: {
      owned: rejected.filter((event) => event.reason === 'owned' || event.reason === 'wishlist').length,
      finished: rejected.filter((event) => event.reason === 'finished').length,
      dropped: rejected.filter((event) => event.reason === 'dropped').length,
      ignored: 0,
      discoveryInbox: (options.normalizedCandidates ?? options.finalCandidates).filter((candidate) => candidate.inboxStatus).length,
      skippedForNextDiscoveryRun: 0,
      duplicate: rejected.filter((event) => event.reason === 'duplicate').length,
      lowScore: reasonIncludes('below-threshold'),
      missingArtwork: 0,
      missingMetadata: 0,
      platformMismatch: 0,
      seenOnly: 0,
    },
    finalRecommendationCount: options.finalCandidates.length,
    cachedRecommendationCount: options.fromCache ? options.finalCandidates.length : 0,
    ...lastSurfaceCounts,
    lastGenerationError: options.lastGenerationError ?? null,
    cacheAge: options.cacheAge ?? null,
    fingerprint: options.fingerprint,
    candidateDiagnostics: options.candidateDiagnostics,
    selectedSeeds: options.selectedSeeds,
    topPositiveSignals: options.topPositiveSignals,
    topNegativeSignals: options.topNegativeSignals,
    scoreDistribution: options.scoreDistribution,
    finalSelection: options.finalSelection,
    performance: options.performance,
    cacheStatus: options.cacheStatus,
    partialFailureCount: options.partialFailureCount,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    scoringVersion: RECOMMENDATION_SCORING_VERSION,
    feedbackSignalCount: options.feedbackSignalCount,
    exposureSignalCount: options.exposureSignalCount,
    qualitySummary: options.qualitySummary,
  };
  lastDiagnosticsReport = report;
  console.debug('[QuestShelf recommendations] diagnostic report', report);
  debugRecommendationPipeline(events);
}

// ---------------------------------------------------------------------------
// Recommendation scoring
// ---------------------------------------------------------------------------

export interface RecommendationScore {
  genreMatch: number;      // 0-50
  tagMatch: number;        // 0-36
  developerMatch: number;  // 0-18
  franchiseMatch: number;  // 0-18
  platformMatch: number;   // 0-10
  seedSimilarity: number;  // 0-24
  qualityMatch: number;    // 0-12
  recencyMatch: number;    // 0-4
  negativeMatch: number;   // 0 to -40
  sourceAdjustment: number;
  tasteProfileMatch: number;
  metacriticMatch: number; // compatibility/debug subset of quality
  ownershipPenalty: number; // 0 or negative: already owned/wishlisted
  positiveGenres: string[];
  positiveTags: string[];
  positiveDevelopers: string[];
  positiveFranchises: string[];
  negativeGenres: string[];
  negativeTags: string[];
  negativeDevelopers: string[];
  negativeFranchises: string[];
  total: number;
}

const SCORE_CAPS = {
  genre: 50,
  tag: 36,
  developer: 18,
  franchise: 18,
  platform: 10,
  seedSimilarity: 24,
  quality: 12,
  recency: 4,
  negative: 40,
  sourceAdjustment: 8,
  tasteProfile: 18,
} as const;

type ScoreContext = {
  source?: CandidateSource;
  seed?: SelectedRecommendationSeed;
  relaxation?: number;
  tasteProfile?: TasteProfile;
};

type FeedbackContext = {
  feedback: RecommendationFeedbackRecord[];
  preferences: RecommendationPreferences;
  exposureCounts: Map<string, number>;
};

function clampScore(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function normalizeDeveloperName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function feedbackIdentityForResult(result: RawgSearchResult): { rawgId: number; title: string } {
  return { rawgId: result.id, title: normalizeRecommendationTitle(result.name) };
}

function feedbackRecordMatchesResult(record: RecommendationFeedbackRecord, result: RawgSearchResult): boolean {
  const identity = feedbackIdentityForResult(result);
  return record.rawgId === identity.rawgId || record.normalizedTitle === identity.title;
}

function getCandidateMetadata(result: RawgSearchResult): { genres: string[]; tags: string[]; developers: string[]; franchise: string | null } {
  return {
    genres: (result.genres ?? []).map((genre) => toSlug(genre.name)),
    tags: (result.tags ?? []).map((tag) => toSlug(tag.slug ?? tag.name)),
    developers: (result.developers ?? []).map((developer) => normalizeDeveloperName(developer.name)),
    franchise: recommendationFranchiseKey(result.slug ?? result.name),
  };
}

function scoreFeedbackAdjustment(result: RawgSearchResult, context: FeedbackContext): { adjustment: number; reasons: string[]; excluded?: string } {
  const metadata = getCandidateMetadata(result);
  const identity = feedbackIdentityForResult(result);
  let adjustment = 0;
  const reasons: string[] = [];

  for (const record of context.feedback) {
    if (feedbackRecordMatchesResult(record, result)) {
      if (record.feedbackType === 'hide') return { adjustment: -100, reasons: ['hidden exact recommendation'], excluded: 'feedback-hide' };
      if (record.feedbackType === 'already_played') return { adjustment: -100, reasons: ['already played externally'], excluded: 'feedback-already-played' };
      if (record.feedbackType === 'not_interested') return { adjustment: -recommendationConfig.feedback.notInterestedPenalty, reasons: ['not interested exact recommendation'], excluded: 'feedback-not-interested' };
      if (record.feedbackType === 'less_like_this') return { adjustment: -recommendationConfig.feedback.lessLikeThisPenalty, reasons: ['less like this exact recommendation'], excluded: 'feedback-less-like-this' };
      if (record.feedbackType === 'more_like_this') { adjustment += recommendationConfig.feedback.moreLikeThisBonus; reasons.push('more like this exact bonus'); }
    }

    const sharedTags = record.metadata.tags.filter((tag) => metadata.tags.includes(tag) && isDistinctivePreferenceTag(tag)).length;
    const sharedGenres = record.metadata.genres.filter((genre) => metadata.genres.includes(genre)).length;
    const sharedDeveloper = record.metadata.developers.some((developer) => metadata.developers.includes(developer));
    const sharedFranchise = record.metadata.franchise && record.metadata.franchise === metadata.franchise;
    if (record.feedbackType === 'not_interested' || record.feedbackType === 'less_like_this') {
      const strength = record.feedbackType === 'less_like_this' ? 2 : 1;
      const metadataPenalty = Math.min(
        recommendationConfig.feedback.maxMetadataPenalty,
        sharedTags * 4 * strength + Math.min(1, sharedGenres) * 2 * strength + (sharedDeveloper ? 4 * strength : 0) + (sharedFranchise ? 6 * strength : 0),
      );
      if (metadataPenalty > 0) {
        adjustment -= metadataPenalty;
        reasons.push(`${record.feedbackType} metadata penalty`);
      }
    }
    if (record.feedbackType === 'more_like_this') {
      const bonus = Math.min(recommendationConfig.feedback.moreLikeThisBonus, sharedTags * 2 + (sharedFranchise ? 4 : 0));
      if (bonus > 0) {
        adjustment += bonus;
        reasons.push('more like this metadata bonus');
      }
    }
  }

  const exposureCount = context.exposureCounts.get(`id:${identity.rawgId}`) ?? context.exposureCounts.get(`title:${identity.title}`) ?? 0;
  if (exposureCount > recommendationConfig.exposure.fatigueAfter) {
    const penalty = Math.min(recommendationConfig.exposure.maxPenalty, (exposureCount - recommendationConfig.exposure.fatigueAfter) * recommendationConfig.exposure.penaltyPerExposure);
    adjustment -= penalty;
    reasons.push(`fatigue penalty:${penalty}`);
  }
  return { adjustment, reasons };
}

function scorePreferenceAdjustment(result: RawgSearchResult, source: CandidateSource, score: RecommendationScore, preferences: RecommendationPreferences): { adjustment: number; reasons: string[] } {
  let adjustment = 0;
  const reasons: string[] = [];
  if (preferences.preferNewerReleases && result.released) {
    const releaseYear = Number.parseInt(result.released.slice(0, 4), 10);
    if (Number.isFinite(releaseYear) && releaseYear >= new Date().getUTCFullYear() - 2) {
      adjustment += 3;
      reasons.push('newer release preference');
    }
  }
  if (source === 'broad-discovery' && (score.tagMatch > 0 || score.genreMatch >= recommendationConfig.exploration.minScore)) {
    if (preferences.explorationMode === 'exploratory') {
      adjustment += 4;
      reasons.push('exploratory adjacent bonus');
    } else if (preferences.explorationMode === 'familiar') {
      adjustment -= recommendationConfig.exploration.scorePenalty;
      reasons.push('familiar mode exploration penalty');
    }
  }
  return { adjustment, reasons };
}

function scoreTasteProfileAdjustment(result: RawgSearchResult, tasteProfile: TasteProfile | undefined): { score: number; positive: string[]; negative: string[] } {
  if (!tasteProfile) return { score: 0, positive: [], negative: [] };
  const metadata = getCandidateMetadata(result);
  const active = getActiveTasteSignals(tasteProfile);
  const positive: string[] = [];
  const negative: string[] = [];
  let score = 0;
  for (const signal of active.slice(0, 18)) {
    if (!doesTasteSignalMatch(signal, metadata)) continue;
    const strength = signal.strength === 'strong' ? 1 : signal.strength === 'moderate' ? 0.7 : 0.45;
    const origin = signal.origin === 'explicit' ? 1.2 : signal.origin === 'temporary' ? 0.9 : 0.7;
    const points = Math.max(1, Math.round(signal.confidence * strength * origin * 8));
    if (signal.sentiment === 'love') {
      score += points;
      positive.push(signal.label);
    } else {
      score -= points;
      negative.push(signal.label);
    }
  }
  return { score: clampScore(score, -SCORE_CAPS.tasteProfile, SCORE_CAPS.tasteProfile), positive: [...new Set(positive)].slice(0, 3), negative: [...new Set(negative)].slice(0, 3) };
}

function doesTasteSignalMatch(signal: TasteSignal, metadata: ReturnType<typeof getCandidateMetadata>): boolean {
  if (signal.kind === 'genre') return metadata.genres.includes(signal.key) || metadata.genres.includes(toSlug(signal.label));
  if (signal.kind === 'tag' || signal.kind === 'length' || signal.kind === 'release-era') return metadata.tags.includes(signal.key);
  if (signal.kind === 'developer') return metadata.developers.includes(signal.key) || metadata.developers.includes(signal.label);
  if (signal.kind === 'franchise') return metadata.franchise === signal.key;
  if (signal.kind === 'platform') return false;
  return false;
}

function recommendationPreferenceFingerprint(preferences: RecommendationPreferences, feedback: RecommendationFeedbackRecord[]): string {
  const feedbackKey = feedback
    .map((record) => [record.rawgId ?? record.normalizedTitle, record.feedbackType, record.createdAt].join(':'))
    .sort()
    .join('|');
  return `${preferences.explorationMode}:${preferences.preferShorterGames}:${preferences.preferNewerReleases}:${preferences.reduceFranchiseRepetition}::${feedbackKey}`;
}

function weightedOverlap<T extends { name: string; weight: number }>(
  signals: T[],
  matches: Set<string>,
  cap: number,
  multiplier: (name: string) => number = () => 1,
): { score: number; matched: string[] } {
  const considered = signals.slice(0, 10);
  const denominator = considered.reduce((sum, signal) => sum + Math.max(0, signal.weight) * multiplier(signal.name), 0) || 1;
  let raw = 0;
  const matched: string[] = [];
  for (const signal of considered) {
    if (!matches.has(signal.name)) continue;
    raw += Math.max(0, signal.weight) * multiplier(signal.name);
    matched.push(signal.name);
  }
  return { score: clampScore((raw / denominator) * cap, 0, cap), matched };
}

export function scorePersonalRecommendationCandidate(
  result: RawgSearchResult,
  profile: UserProfile,
  relaxation = 0,
  context: ScoreContext = {},
): RecommendationScore {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);
  const candidateTags = (result.tags ?? []).map((t) => t.slug ?? toSlug(t.name));
  const candidateDevelopers = (result.developers ?? []).map((d) => normalizeDeveloperName(d.name));
  const candidatePlatforms = (result.platforms ?? []).map((p) => p.platform.name);
  const candidateFranchise = recommendationFranchiseKey(result.slug ?? result.name);

  const consideredGenres = profile.topGenres.slice(0, Math.min(profile.topGenres.length, 5 + relaxation));
  const consideredPlatforms = profile.topPlatforms.slice(0, Math.min(profile.topPlatforms.length, 3 + relaxation));
  const candidateGenreSet = new Set(candidateGenres);
  const candidateTagSet = new Set(candidateTags);
  const candidateDeveloperSet = new Set(candidateDevelopers);
  const candidateFranchiseSet = new Set(candidateFranchise ? [candidateFranchise] : []);

  const genreOverlap = weightedOverlap(consideredGenres, candidateGenreSet, SCORE_CAPS.genre, (name) => signalInformationValue('genre', name));
  const consideredTagWeights = profile.topTagWeights.length > 0
    ? profile.topTagWeights.slice(0, Math.min(profile.topTagWeights.length, 10 + relaxation * 2))
    : profile.topTags.map((name) => ({ name, weight: preferenceTagWeight(name) }));
  const tagOverlap = weightedOverlap(consideredTagWeights, candidateTagSet, SCORE_CAPS.tag, (name) => signalInformationValue('tag', name));
  const developerOverlap = weightedOverlap(profile.topDeveloperWeights, candidateDeveloperSet, SCORE_CAPS.developer);
  const franchiseOverlap = weightedOverlap(profile.topFranchises, candidateFranchiseSet, SCORE_CAPS.franchise);
  const franchiseMatch = Math.max(
    franchiseOverlap.score,
    context.source === 'liked-game-series' ? SCORE_CAPS.franchise : 0,
  );
  const positiveFranchises = [...new Set([...franchiseOverlap.matched, ...(context.source === 'liked-game-series' && context.seed?.franchiseKey ? [context.seed.franchiseKey] : [])])];

  const platformMatch = Math.min(10, consideredPlatforms.filter((platform) => candidatePlatforms.includes(platform) || candidatePlatforms.includes(platform === 'Steam' ? 'PC' : platform)).length * (relaxation >= 2 ? 4 : 5));

  const negativeGenreOverlap = weightedOverlap(profile.negativeGenres, candidateGenreSet, 14, (name) => signalInformationValue('genre', name));
  const negativeTagOverlap = weightedOverlap(profile.negativeTags, candidateTagSet, 16, (name) => signalInformationValue('tag', name));
  const negativeDeveloperOverlap = weightedOverlap(profile.negativeDevelopers, candidateDeveloperSet, 8);
  const negativeFranchiseOverlap = weightedOverlap(profile.negativeFranchises, candidateFranchiseSet, 8);
  const tasteProfileAdjustment = scoreTasteProfileAdjustment(result, context.tasteProfile);
  const negativeMatch = -clampScore(
    negativeGenreOverlap.score + negativeTagOverlap.score + negativeDeveloperOverlap.score + negativeFranchiseOverlap.score,
    0,
    SCORE_CAPS.negative,
  );

  let metacriticMatch = 0;
  if (result.metacritic && profile.avgMetacritic) {
    const diff = Math.abs(result.metacritic - profile.avgMetacritic);
    metacriticMatch = clampScore(Math.max(0, 6 - diff / (8 + relaxation * 2)), 0, 6);
  }

  const rawgRating = typeof result.rating === 'number' ? result.rating : 0;
  const ratingQuality = rawgRating > 0 ? Math.max(0, (rawgRating - 3.2) / 1.8) * 4 : 0;
  const popularityConfidence = Math.min(2, Math.log10(Math.max(1, result.ratings_count ?? 0)) / 2);
  const qualityMatch = clampScore(metacriticMatch + ratingQuality + popularityConfidence, 0, SCORE_CAPS.quality);
  const releaseYear = result.released ? Number.parseInt(result.released.slice(0, 4), 10) : 0;
  const recencyMatch = Number.isFinite(releaseYear) && releaseYear >= new Date().getUTCFullYear() - 3 ? SCORE_CAPS.recency : 0;
  const seedTags = new Set(context.seed?.tags ?? []);
  const seedGenres = new Set(context.seed?.genres ?? []);
  const seedTagMatches = [...candidateTagSet].filter((tag) => seedTags.has(tag) && isDistinctivePreferenceTag(tag)).length;
  const seedGenreMatches = [...candidateGenreSet].filter((genre) => seedGenres.has(genre)).length;
  const seedSimilarity = context.seed
    ? clampScore(seedTagMatches * 8 + seedGenreMatches * 4 + (context.source === 'liked-game-similar' ? 8 : 0), 0, SCORE_CAPS.seedSimilarity)
    : 0;
  const sourceAdjustment = clampScore(
    context.source === 'liked-game-series' ? 4 :
      context.source === 'liked-game-similar' ? 3 :
        context.source === 'plans-wishlist' ? 1 :
          context.source === 'broad-discovery' ? -4 :
            context.source === 'trending' ? -8 : 0,
    -SCORE_CAPS.sourceAdjustment,
    SCORE_CAPS.sourceAdjustment,
  );

  const total = genreOverlap.score + tagOverlap.score + developerOverlap.score + franchiseMatch + platformMatch + seedSimilarity + qualityMatch + recencyMatch + negativeMatch + sourceAdjustment + tasteProfileAdjustment.score;
  return {
    genreMatch: genreOverlap.score,
    tagMatch: tagOverlap.score,
    developerMatch: developerOverlap.score,
    franchiseMatch,
    platformMatch,
    seedSimilarity,
    qualityMatch,
    recencyMatch,
    negativeMatch,
    sourceAdjustment,
    tasteProfileMatch: tasteProfileAdjustment.score,
    metacriticMatch,
    ownershipPenalty: 0,
    positiveGenres: genreOverlap.matched,
    positiveTags: [...new Set([...tagOverlap.matched, ...tasteProfileAdjustment.positive.map(toSlug)])],
    positiveDevelopers: developerOverlap.matched,
    positiveFranchises,
    negativeGenres: negativeGenreOverlap.matched,
    negativeTags: [...new Set([...negativeTagOverlap.matched, ...tasteProfileAdjustment.negative.map(toSlug)])],
    negativeDevelopers: negativeDeveloperOverlap.matched,
    negativeFranchises: negativeFranchiseOverlap.matched,
    total,
  };
}

function formatSignalName(slugOrName: string): string {
  return slugOrName
    .split('-')
    .filter(Boolean)
    .map((part) => part === 'rpg' ? 'RPG' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function generateRecommendationReasonForTest(result: RawgSearchResult, score: RecommendationScore, profile: UserProfile, source: CandidateSource, anchorTitle?: string): string {
  void result;
  void profile;
  if (score.tasteProfileMatch >= 8) {
    const tasteSignal = [...score.positiveTags, ...score.positiveGenres][0];
    if (tasteSignal) return `Because your Taste Profile strongly matches ${formatSignalName(tasteSignal)}`;
  }
  const distinctiveTags = score.positiveTags.filter(isDistinctivePreferenceTag).slice(0, 2).map(formatSignalName);
  if (score.franchiseMatch >= 12 && anchorTitle) return `Continues a series you have enjoyed`;
  if (score.developerMatch >= 10 && score.positiveDevelopers[0]) return `From a developer you rate highly`;
  if (anchorTitle && score.seedSimilarity >= 12 && source === 'liked-game-similar') return `Similar to one of your strongest library picks`;
  if (anchorTitle && source === 'plans-wishlist') return `Matches your wishlist interest`;
  if (distinctiveTags.length >= 2) return `Matches your ${distinctiveTags[0]} and ${distinctiveTags[1]} preferences`;
  if (distinctiveTags.length === 1) return `Matches your ${distinctiveTags[0]} preference`;
  if (score.positiveGenres.length >= 2 && score.genreMatch >= 24) return `Matches your ${score.positiveGenres[0]} and ${score.positiveGenres[1]} taste`;
  if (score.qualityMatch >= 9) return `Highly rated within your taste profile`;
  return `Based on your gaming history`;
}

export type SelectedRecommendationSeed = {
  game: Game;
  signalScore: number;
  reason: string;
  cluster: string;
  rating: number;
  playtimeHours: number;
  activityTime: number;
  metadataScore: number;
  stableKey: string;
  tags: string[];
  genres: string[];
  franchiseKey: string | null;
};

export type SeedDiagnostics = {
  rawgId: number;
  selected: boolean;
  signalScore: number;
  reason: string;
  cluster: string;
  rank: number;
  skippedReason?: string;
};

function getActivityTime(game: Game): number {
  const value = game.lastPlayedAt ?? game.finishedAt ?? game.updatedAt ?? game.importedAt ?? '';
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getSeedCluster(game: Game): string {
  const distinctiveTag = (game.rawgTags ?? []).map(toSlug).find(isDistinctivePreferenceTag);
  if (distinctiveTag) return `tag:${distinctiveTag}`;
  const franchise = recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
  if (franchise) return `series:${franchise}`;
  const genre = (game.genres ?? [])[0];
  if (genre) return `genre:${genre}`;
  const developer = game.developers?.[0];
  if (developer) return `developer:${normalizeDeveloperName(developer)}`;
  return `platform:${game.platform}`;
}

function compareSeeds(a: SelectedRecommendationSeed, b: SelectedRecommendationSeed): number {
  return b.signalScore - a.signalScore
    || b.rating - a.rating
    || b.playtimeHours - a.playtimeHours
    || b.activityTime - a.activityTime
    || b.metadataScore - a.metadataScore
    || a.stableKey.localeCompare(b.stableKey);
}

export function selectRecommendationSeeds(userGames: Game[], maxSeeds = 8, plannedGameIds: PlannedGameIds = noPlannedGameIds): { seeds: SelectedRecommendationSeed[]; diagnostics: SeedDiagnostics[] } {
  const ranked = userGames
    .map((game): SelectedRecommendationSeed | null => {
      const signal = getRecommendationSignalWeight(game, plannedGameIds);
      if (!game.rawgId || signal.weight <= 0) return null;
      const tags = (game.rawgTags ?? []).map(toSlug);
      const genres = game.genres ?? [];
      const metadataScore = (genres.length > 0 ? 1 : 0) + (tags.length > 0 ? 1 : 0) + ((game.developers?.length ?? 0) > 0 ? 1 : 0);
      return {
        game,
        signalScore: signal.weight,
        reason: signal.reason,
        cluster: getSeedCluster(game),
        rating: typeof game.rating === 'number' ? game.rating : 0,
        playtimeHours: game.playtimeHours ?? 0,
        activityTime: getActivityTime(game),
        metadataScore,
        stableKey: `${game.id}:${normalizeTitle(game.title)}`,
        tags,
        genres,
        franchiseKey: recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title),
      };
    })
    .filter((seed): seed is SelectedRecommendationSeed => Boolean(seed))
    .sort(compareSeeds);

  const selected: SelectedRecommendationSeed[] = [];
  const selectedKeys = new Set<string>();
  const usedClusters = new Set<string>();
  for (const seed of ranked) {
    if (selected.length >= maxSeeds) break;
    if (usedClusters.has(seed.cluster)) continue;
    selected.push(seed);
    selectedKeys.add(seed.stableKey);
    usedClusters.add(seed.cluster);
  }
  for (const seed of ranked) {
    if (selected.length >= maxSeeds) break;
    if (selectedKeys.has(seed.stableKey)) continue;
    selected.push(seed);
    selectedKeys.add(seed.stableKey);
  }

  return {
    seeds: selected,
    diagnostics: ranked.map((seed, index) => ({
      rawgId: seed.game.rawgId!,
      selected: selectedKeys.has(seed.stableKey),
      signalScore: seed.signalScore,
      reason: seed.reason,
      cluster: seed.cluster,
      rank: index + 1,
      skippedReason: selectedKeys.has(seed.stableKey) ? undefined : usedClusters.has(seed.cluster) ? 'cluster already represented' : 'outside seed limit',
    })),
  };
}

/**
 * Seeds drawn from what the user says they want next. AS-15: that is a wishlist entry or a Platform
 * Plan entry — not `status === 'Want to play'`, which is what an import calls a backlog it has never
 * been told anything about.
 */
function getPlanAndWishlistGames(userGames: Game[], plannedGameIds: PlannedGameIds): Game[] {
  return userGames
    .filter((game) => game.rawgId && (game.collectionType === 'wishlist' || plannedGameIds.has(game.id)))
    .sort((a, b) => getRecommendationSignalWeight(b, plannedGameIds).weight - getRecommendationSignalWeight(a, plannedGameIds).weight)
    .slice(0, 6);
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const RAWG_PLATFORM_IDS: Record<string, string> = {
  Steam: '4', PC: '4', PS5: '187', PS4: '18', Switch: '7', 'Switch 2': '7', Android: '21',
};

function getPreferredRawgPlatforms(profile: UserProfile): string | undefined {
  const ids = [...new Set(profile.topPlatforms.map((platform) => RAWG_PLATFORM_IDS[platform]).filter(Boolean))];
  return ids.slice(0, 3).join(',') || undefined;
}

function getUpcomingDateRange(months = 9, now = new Date()): string {
  const start = now.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()));
  return `${start},${endDate.toISOString().slice(0, 10)}`;
}

function getRecentlyInteractedGames(userGames: Game[]): Game[] {
  return userGames
    .filter((game) => game.rawgId && game.lastPlayedAt)
    .sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))
    .slice(0, 4);
}

function hasLibraryMatch(result: RawgSearchResult, userGames: Game[]): { rejected: boolean; reason?: DiscoveryExclusionReason } {
  const match = userGames.find((game) => game.rawgId === result.id);
  if (!match) {
    const candidateTitle = normalizeTitle(result.name);
    const titleMatch = userGames.find((game) => !game.rawgId && normalizeTitle(game.title) === candidateTitle);
    if (!titleMatch) return { rejected: false };
    return { rejected: true, reason: titleMatch.status === 'Dropped' ? 'dropped' : titleMatch.status === 'Finished' ? 'finished' : titleMatch.collectionType === 'wishlist' ? 'wishlist' : 'owned' };
  }
  return { rejected: true, reason: match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned' };
}

async function collectFromResults(
  results: RawgSearchResult[],
  source: CandidateSource,
  profile: UserProfile,
  userGames: Game[],
  seen: Set<number>,
  events: DebugEvent[],
  feedbackContext: FeedbackContext,
  options: { minScore: number; relaxation?: number; anchorTitle?: string; seed?: SelectedRecommendationSeed; tasteProfile?: TasteProfile },
): Promise<ScoredCandidate[]> {
  const output: ScoredCandidate[] = [];
  for (const result of results) {
    const score = scorePersonalRecommendationCandidate(result, profile, options.relaxation ?? 0, { source, seed: options.seed, tasteProfile: options.tasteProfile });
    const feedbackAdjustment = scoreFeedbackAdjustment(result, feedbackContext);
    if (feedbackAdjustment.excluded) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: feedbackAdjustment.excluded, feedbackReasons: feedbackAdjustment.reasons });
      continue;
    }
    const preferenceAdjustment = scorePreferenceAdjustment(result, source, score, feedbackContext.preferences);
    score.sourceAdjustment += feedbackAdjustment.adjustment + preferenceAdjustment.adjustment;
    score.total += feedbackAdjustment.adjustment + preferenceAdjustment.adjustment;
    const libraryMatch = hasLibraryMatch(result, userGames);
    if (seen.has(result.id)) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: 'duplicate' });
      continue;
    }
    if (libraryMatch.rejected) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: libraryMatch.reason });
      continue;
    }
    if (score.total < options.minScore) {
      events.push({ event: 'candidate_rejected', source, rawgId: result.id, title: result.name, score: score.total, reason: `below-threshold:${options.minScore}` });
      continue;
    }
    seen.add(result.id);
    output.push({ result, score, source, anchorTitle: options.anchorTitle, seed: options.seed, reason: generateRecommendationReasonForTest(result, score, profile, source, options.anchorTitle) });
    events.push({ event: 'candidate_accepted', source, rawgId: result.id, title: result.name, score: score.total, reason: output.at(-1)?.reason, anchorTitle: options.anchorTitle, scoreBreakdown: score, feedbackReasons: feedbackAdjustment.reasons, preferenceReasons: preferenceAdjustment.reasons });
  }
  return output;
}

export type FallbackTier = 'tier0-personalized' | 'tier1-taste-quality' | 'tier2-adjacent' | 'tier3-broad';

type FinalSelectionCandidate = {
  item: ScoredCandidate;
  rawgId: number;
  originalScore: number;
  primaryGenre: string | null;
  franchise: string | null;
  developer: string | null;
  sourceCategory: string;
  seedKey: string | null;
  fallbackTier: FallbackTier;
  tasteClusters: string[];
  duplicateKey: string;
  metadataScore: number;
};

export type FinalSelectionCandidateDiagnostics = {
  rawgId: number;
  title: string;
  selected: boolean;
  originalScore: number;
  finalSelectionScore: number | null;
  diversityAdjustment: number;
  primaryGenre: string | null;
  franchise: string | null;
  developer: string | null;
  sourceCategory: string;
  seedKey: string | null;
  fallbackTier: FallbackTier;
  tasteClusters: string[];
  capDecisions: string[];
  relaxationStep?: string;
  selectionReason: string;
};

export type FinalSelectionDiagnostics = {
  beforeCount: number;
  afterDuplicateCount: number;
  selectedCount: number;
  sourceCountsBefore: Record<string, number>;
  sourceCountsAfter: Record<string, number>;
  primaryGenreCountsBefore: Record<string, number>;
  primaryGenreCountsAfter: Record<string, number>;
  franchiseCountsBefore: Record<string, number>;
  franchiseCountsAfter: Record<string, number>;
  developerCountsBefore: Record<string, number>;
  developerCountsAfter: Record<string, number>;
  tasteClusterCountsAfter: Record<string, number>;
  fallbackTierCountsBefore: Record<string, number>;
  fallbackTierCountsAfter: Record<string, number>;
  relaxationStepsUsed: string[];
  nearDuplicateSuppressions: Array<{ keptRawgId: number; suppressedRawgId: number; key: string; reason: string }>;
  candidates: FinalSelectionCandidateDiagnostics[];
};

const FINAL_SELECTION_RELAXATION_STEPS = [
  { name: 'soft caps', genre: 3, franchise: 2, developer: 2, source: 5, seed: 2, fallback: 2, minScore: 10 },
  { name: 'relax source and seed caps', genre: 3, franchise: 2, developer: 2, source: 6, seed: 3, fallback: 2, minScore: 10 },
  { name: 'relax developer caps', genre: 3, franchise: 2, developer: 3, source: 6, seed: 3, fallback: 2, minScore: 8 },
  { name: 'relax genre caps', genre: 4, franchise: 2, developer: 3, source: 6, seed: 3, fallback: 3, minScore: 8 },
  { name: 'relax franchise hard cap', genre: 4, franchise: 3, developer: 3, source: 7, seed: 3, fallback: 3, minScore: 4 },
] as const;

function stableCandidateCompare(a: FinalSelectionCandidate, b: FinalSelectionCandidate): number {
  return b.originalScore - a.originalScore || a.item.result.id - b.item.result.id || a.item.result.name.localeCompare(b.item.result.name);
}

function incrementCount(map: Map<string, number>, key: string | null | undefined): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function getPrimaryGenreKey(result: RawgSearchResult): string | null {
  const genre = result.genres?.[0];
  return genre ? (genre.slug ?? toSlug(genre.name)) : null;
}

function getPrimaryDeveloperKey(result: RawgSearchResult): string | null {
  const developer = result.developers?.[0]?.name;
  if (!developer) return null;
  const normalized = normalizeDeveloperName(developer);
  return /^(valve|sony interactive entertainment|microsoft|nintendo|electronic arts|ubisoft)$/i.test(normalized) ? null : normalized;
}

function getSourceCategory(source: CandidateSource): string {
  if (source === 'broad-discovery' || source === 'trending') return 'fallback';
  if (source === 'liked-game-similar' || source === 'liked-game-series' || source === 'second-order') return 'seed';
  if (source === 'plans-wishlist') return 'intent';
  return 'affinity';
}

function getFallbackTier(item: ScoredCandidate): FallbackTier {
  if (item.source === 'trending') return 'tier3-broad';
  if (item.source === 'broad-discovery') return item.score.tagMatch > 0 || item.score.genreMatch >= 20 ? 'tier2-adjacent' : 'tier3-broad';
  if (item.score.seedSimilarity >= 12 || item.score.tagMatch >= 18 || item.score.developerMatch >= 10 || item.score.franchiseMatch >= 12) return 'tier0-personalized';
  return 'tier1-taste-quality';
}

function editionCanonicalTitle(title: string): string {
  return normalizeTitle(title)
    .replace(/\b(definitive|complete|game of the year|goty|remastered|remaster|remake|deluxe|ultimate|directors cut|director s cut|enhanced|anniversary|special|gold|hd|edition|collection)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNearDuplicateKey(result: RawgSearchResult): string {
  const canonical = editionCanonicalTitle(result.name);
  const sequelMatch = canonical.match(/\b(\d+|ii|iii|iv|v|vi|vii|viii|ix|x)\b/);
  return sequelMatch ? canonical : canonical;
}

function getTasteClusters(item: ScoredCandidate): string[] {
  const clusters = new Set<string>();
  item.score.positiveTags.filter(isDistinctivePreferenceTag).slice(0, 3).forEach((tag) => clusters.add(`tag:${tag}`));
  if (item.score.positiveTags.some((tag) => /turn-based|tactical/.test(tag)) && item.score.positiveGenres.includes('RPG')) clusters.add('cluster:turn-based-rpg');
  if (item.score.positiveTags.some((tag) => /deck/.test(tag))) clusters.add('cluster:deckbuilder');
  if (item.score.positiveTags.some((tag) => /souls/.test(tag))) clusters.add('cluster:soulslike');
  if (item.score.positiveTags.some((tag) => /metroidvania/.test(tag))) clusters.add('cluster:metroidvania');
  item.score.positiveGenres.slice(0, 2).forEach((genre) => clusters.add(`genre:${toSlug(genre)}`));
  return [...clusters];
}

function toFinalSelectionCandidate(item: ScoredCandidate): FinalSelectionCandidate {
  return {
    item,
    rawgId: item.result.id,
    originalScore: item.score.total,
    primaryGenre: getPrimaryGenreKey(item.result),
    franchise: recommendationFranchiseKey(item.result.slug ?? item.result.name),
    developer: getPrimaryDeveloperKey(item.result),
    sourceCategory: getSourceCategory(item.source),
    seedKey: item.seed ? item.seed.stableKey : null,
    fallbackTier: getFallbackTier(item),
    tasteClusters: getTasteClusters(item),
    duplicateKey: getNearDuplicateKey(item.result),
    metadataScore: (item.result.background_image ? 2 : 0) + ((item.result.genres?.length ?? 0) > 0 ? 1 : 0) + ((item.result.tags?.length ?? 0) > 0 ? 1 : 0) + (item.result.released ? 1 : 0),
  };
}

function chooseDuplicateWinner(a: FinalSelectionCandidate, b: FinalSelectionCandidate): FinalSelectionCandidate {
  return b.originalScore > a.originalScore ? b
    : b.originalScore === a.originalScore && b.metadataScore > a.metadataScore ? b
      : a;
}

function dedupeFinalSelectionCandidates(candidates: FinalSelectionCandidate[]): { candidates: FinalSelectionCandidate[]; suppressions: FinalSelectionDiagnostics['nearDuplicateSuppressions'] } {
  const byRawg = new Map<number, FinalSelectionCandidate>();
  const suppressions: FinalSelectionDiagnostics['nearDuplicateSuppressions'] = [];
  for (const candidate of candidates) {
    const existing = byRawg.get(candidate.rawgId);
    if (!existing) {
      byRawg.set(candidate.rawgId, candidate);
      continue;
    }
    const winner = chooseDuplicateWinner(existing, candidate);
    const loser = winner === existing ? candidate : existing;
    byRawg.set(candidate.rawgId, winner);
    suppressions.push({ keptRawgId: winner.rawgId, suppressedRawgId: loser.rawgId, key: String(candidate.rawgId), reason: 'duplicate rawgId' });
  }

  const byEdition = new Map<string, FinalSelectionCandidate>();
  for (const candidate of byRawg.values()) {
    const key = candidate.duplicateKey;
    const existing = byEdition.get(key);
    if (!existing || !key) {
      byEdition.set(key || `rawg:${candidate.rawgId}`, candidate);
      continue;
    }
    const winner = chooseDuplicateWinner(existing, candidate);
    const loser = winner === existing ? candidate : existing;
    byEdition.set(key, winner);
    suppressions.push({ keptRawgId: winner.rawgId, suppressedRawgId: loser.rawgId, key, reason: 'near-duplicate edition' });
  }
  return { candidates: [...byEdition.values()].sort(stableCandidateCompare), suppressions };
}

function finalSelectionScore(
  candidate: FinalSelectionCandidate,
  counts: {
    genre: Map<string, number>;
    franchise: Map<string, number>;
    developer: Map<string, number>;
    source: Map<string, number>;
    seed: Map<string, number>;
    cluster: Map<string, number>;
    fallback: Map<string, number>;
  },
): { score: number; adjustment: number; decisions: string[] } {
  let adjustment = 0;
  const decisions: string[] = [];
  if (candidate.primaryGenre && (counts.genre.get(candidate.primaryGenre) ?? 0) > 0) { adjustment -= 4; decisions.push('genre repetition penalty'); }
  if (candidate.franchise && (counts.franchise.get(candidate.franchise) ?? 0) > 0) { adjustment -= 6; decisions.push('franchise repetition penalty'); }
  if (candidate.developer && (counts.developer.get(candidate.developer) ?? 0) > 0) { adjustment -= 3; decisions.push('developer repetition penalty'); }
  if ((counts.source.get(candidate.sourceCategory) ?? 0) >= 3) { adjustment -= 3; decisions.push('source balance penalty'); }
  if (candidate.seedKey && (counts.seed.get(candidate.seedKey) ?? 0) > 0) { adjustment -= 4; decisions.push('seed repetition penalty'); }
  if (candidate.fallbackTier === 'tier3-broad') { adjustment -= 10; decisions.push('broad fallback penalty'); }
  if (candidate.tasteClusters.some((cluster) => !(counts.cluster.get(cluster) ?? 0))) { adjustment += 4; decisions.push('new taste cluster bonus'); }
  return { score: candidate.originalScore + adjustment, adjustment, decisions };
}

export function selectFinalRecommendationCandidates(scored: ScoredCandidate[], max = TARGET_PERSONAL_RECOMMENDATIONS, preferences: Pick<RecommendationPreferences, 'reduceFranchiseRepetition'> = { reduceFranchiseRepetition: false }): { selected: ScoredCandidate[]; diagnostics: FinalSelectionDiagnostics } {
  const raw = scored.map(toFinalSelectionCandidate);
  const { candidates, suppressions } = dedupeFinalSelectionCandidates(raw);
  const selected: FinalSelectionCandidate[] = [];
  const selectedKeys = new Set<number>();
  const diagnostics = new Map<number, FinalSelectionCandidateDiagnostics>();
  const counts = {
    genre: new Map<string, number>(),
    franchise: new Map<string, number>(),
    developer: new Map<string, number>(),
    source: new Map<string, number>(),
    seed: new Map<string, number>(),
    cluster: new Map<string, number>(),
    fallback: new Map<string, number>(),
  };
  const relaxationStepsUsed: string[] = [];

  for (const step of FINAL_SELECTION_RELAXATION_STEPS) {
    let addedInStep = false;
    while (selected.length < max) {
      const eligible = candidates
        .filter((candidate) => !selectedKeys.has(candidate.rawgId))
        .map((candidate) => {
          const capDecisions: string[] = [];
          if (candidate.originalScore < step.minScore) capDecisions.push(`below relevance floor:${step.minScore}`);
          if (candidate.primaryGenre && (counts.genre.get(candidate.primaryGenre) ?? 0) >= step.genre) capDecisions.push(`genre cap:${candidate.primaryGenre}`);
          const franchiseCap = Math.max(1, step.franchise - (preferences.reduceFranchiseRepetition ? 1 : 0));
          if (candidate.franchise && (counts.franchise.get(candidate.franchise) ?? 0) >= franchiseCap) capDecisions.push(`franchise cap:${candidate.franchise}`);
          if (candidate.developer && (counts.developer.get(candidate.developer) ?? 0) >= step.developer) capDecisions.push(`developer cap:${candidate.developer}`);
          if ((counts.source.get(candidate.sourceCategory) ?? 0) >= step.source) capDecisions.push(`source cap:${candidate.sourceCategory}`);
          if (candidate.seedKey && (counts.seed.get(candidate.seedKey) ?? 0) >= step.seed) capDecisions.push(`seed cap`);
          if ((candidate.fallbackTier === 'tier2-adjacent' || candidate.fallbackTier === 'tier3-broad') && (counts.fallback.get('fallback') ?? 0) >= step.fallback) capDecisions.push(`fallback cap`);
          const selection = finalSelectionScore(candidate, counts);
          return { candidate, selection, capDecisions };
        })
        .filter((entry) => entry.capDecisions.length === 0)
        .sort((a, b) => b.selection.score - a.selection.score || stableCandidateCompare(a.candidate, b.candidate));
      const next = eligible[0];
      if (!next) break;
      selected.push(next.candidate);
      selectedKeys.add(next.candidate.rawgId);
      incrementCount(counts.genre, next.candidate.primaryGenre);
      incrementCount(counts.franchise, next.candidate.franchise);
      incrementCount(counts.developer, next.candidate.developer);
      incrementCount(counts.source, next.candidate.sourceCategory);
      incrementCount(counts.seed, next.candidate.seedKey);
      next.candidate.tasteClusters.forEach((cluster) => incrementCount(counts.cluster, cluster));
      if (next.candidate.fallbackTier === 'tier2-adjacent' || next.candidate.fallbackTier === 'tier3-broad') incrementCount(counts.fallback, 'fallback');
      diagnostics.set(next.candidate.rawgId, {
        rawgId: next.candidate.rawgId,
        title: next.candidate.item.result.name,
        selected: true,
        originalScore: next.candidate.originalScore,
        finalSelectionScore: next.selection.score,
        diversityAdjustment: next.selection.adjustment,
        primaryGenre: next.candidate.primaryGenre,
        franchise: next.candidate.franchise,
        developer: next.candidate.developer,
        sourceCategory: next.candidate.sourceCategory,
        seedKey: next.candidate.seedKey,
        fallbackTier: next.candidate.fallbackTier,
        tasteClusters: next.candidate.tasteClusters,
        capDecisions: next.selection.decisions,
        relaxationStep: step.name,
        selectionReason: next.selection.decisions.join('; ') || 'highest relevant candidate within caps',
      });
      addedInStep = true;
    }
    if (addedInStep) relaxationStepsUsed.push(step.name);
    if (selected.length >= max) break;
  }

  for (const candidate of candidates) {
    if (diagnostics.has(candidate.rawgId)) continue;
    const selection = finalSelectionScore(candidate, counts);
    const capDecisions: string[] = [];
    if (candidate.primaryGenre && (counts.genre.get(candidate.primaryGenre) ?? 0) >= FINAL_SELECTION_RELAXATION_STEPS.at(-1)!.genre) capDecisions.push(`genre cap:${candidate.primaryGenre}`);
    const finalFranchiseCap = Math.max(1, FINAL_SELECTION_RELAXATION_STEPS.at(-1)!.franchise - (preferences.reduceFranchiseRepetition ? 1 : 0));
    if (candidate.franchise && (counts.franchise.get(candidate.franchise) ?? 0) >= finalFranchiseCap) capDecisions.push(`franchise cap:${candidate.franchise}`);
    if (candidate.developer && (counts.developer.get(candidate.developer) ?? 0) >= FINAL_SELECTION_RELAXATION_STEPS.at(-1)!.developer) capDecisions.push(`developer cap:${candidate.developer}`);
    diagnostics.set(candidate.rawgId, {
      rawgId: candidate.rawgId,
      title: candidate.item.result.name,
      selected: false,
      originalScore: candidate.originalScore,
      finalSelectionScore: selection.score,
      diversityAdjustment: selection.adjustment,
      primaryGenre: candidate.primaryGenre,
      franchise: candidate.franchise,
      developer: candidate.developer,
      sourceCategory: candidate.sourceCategory,
      seedKey: candidate.seedKey,
      fallbackTier: candidate.fallbackTier,
      tasteClusters: candidate.tasteClusters,
      capDecisions,
      selectionReason: capDecisions[0] ?? 'outside final selection',
    });
  }

  return {
    selected: selected.map((candidate) => candidate.item),
    diagnostics: {
      beforeCount: raw.length,
      afterDuplicateCount: candidates.length,
      selectedCount: selected.length,
      sourceCountsBefore: countBy(candidates, (candidate) => candidate.sourceCategory),
      sourceCountsAfter: countBy(selected, (candidate) => candidate.sourceCategory),
      primaryGenreCountsBefore: countBy(candidates, (candidate) => candidate.primaryGenre),
      primaryGenreCountsAfter: countBy(selected, (candidate) => candidate.primaryGenre),
      franchiseCountsBefore: countBy(candidates, (candidate) => candidate.franchise),
      franchiseCountsAfter: countBy(selected, (candidate) => candidate.franchise),
      developerCountsBefore: countBy(candidates, (candidate) => candidate.developer),
      developerCountsAfter: countBy(selected, (candidate) => candidate.developer),
      tasteClusterCountsAfter: countBy(selected.flatMap((candidate) => candidate.tasteClusters), (cluster) => cluster),
      fallbackTierCountsBefore: countBy(candidates, (candidate) => candidate.fallbackTier),
      fallbackTierCountsAfter: countBy(selected, (candidate) => candidate.fallbackTier),
      relaxationStepsUsed,
      nearDuplicateSuppressions: suppressions,
      candidates: [...diagnostics.values()].sort((a, b) => Number(b.selected) - Number(a.selected) || b.originalScore - a.originalScore || a.rawgId - b.rawgId),
    },
  };
}

interface CacheEntry { candidates: DiscoveryCandidate[]; fingerprint: string; fetchedAt: number; }
let cache: CacheEntry | null = null;
const CACHE_SCHEMA_VERSION = RECOMMENDATION_CACHE_SCHEMA_VERSION;
const CACHE_STORAGE_KEY = 'questshelf.personalRecommendations.v2';
export const PERSONAL_RECOMMENDATIONS_CACHE_KEY = CACHE_STORAGE_KEY;
const OBSOLETE_CACHE_KEYS = ['questshelf.personalizedRecommendations.v1', 'questshelf.personalRecommendations.v1'];
const CACHE_TTL_MS = recommendationConfig.cacheTtlMs;
/**
 * AS-10: how long a successful pool may still be SHOWN once it has expired, when a refresh fails.
 *
 * It is never served as fresh past the TTL — it is served as stale, labelled, with a Retry. Beyond
 * this window it is not worth showing at all, and the user sees the honest empty/failed state.
 */
const STALE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const inFlightRequests = new Map<string, Promise<PersonalRecommendationsResult>>();
let recommendationRequestGeneration = 0;

type PersistedCacheEntry = Partial<CacheEntry> & { version?: number; expiresAt?: number };

function isValidCachedCandidate(value: unknown): value is DiscoveryCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DiscoveryCandidate>;
  const game = candidate.game as Partial<DiscoveryCandidate['game']> | undefined;
  return Boolean(
    game &&
    typeof game.rawgId === 'number' &&
    Number.isFinite(game.rawgId) &&
    typeof game.title === 'string' &&
    game.title.trim().length > 0 &&
    (candidate.libraryStatus === null || candidate.libraryStatus === 'library' || candidate.libraryStatus === 'wishlist') &&
    typeof candidate.score === 'number' &&
    Number.isFinite(candidate.score) &&
    (candidate.source === undefined || typeof candidate.source === 'string') &&
    (candidate.reason === undefined || typeof candidate.reason === 'string'),
  );
}

export function validatePersonalRecommendationCacheEntry(value: unknown, now = Date.now()): CacheEntry | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as PersistedCacheEntry;
  if (parsed.version !== CACHE_SCHEMA_VERSION) return null;
  if (typeof parsed.fingerprint !== 'string' || parsed.fingerprint.length === 0) return null;
  if (typeof parsed.fetchedAt !== 'number' || !Number.isFinite(parsed.fetchedAt) || parsed.fetchedAt <= 0) return null;
  if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= parsed.fetchedAt) return null;
  if (parsed.expiresAt <= now) return null;
  if (!Array.isArray(parsed.candidates) || !parsed.candidates.every(isValidCachedCandidate)) return null;
  return { candidates: parsed.candidates, fingerprint: parsed.fingerprint, fetchedAt: parsed.fetchedAt };
}

/**
 * AS-10: an EXPIRED entry is not an invalid one.
 *
 * This used to delete the stored pool the moment it went stale, which is precisely the data that
 * stale-if-error needs. A malformed or wrong-version entry is still removed; an expired one is kept
 * on disk (it simply stops counting as fresh) so a failed refresh has something to fall back to.
 */
async function readStoredCache(): Promise<CacheEntry | null> {
  const parsed = await readAppCacheValue<unknown>(CACHE_STORAGE_KEY);
  if (!parsed) return null;

  const wellFormed = validatePersonalRecommendationCacheEntry(parsed, 0);
  if (!wellFormed) {
    await removeAppCacheValue(CACHE_STORAGE_KEY);
    return null;
  }

  return validatePersonalRecommendationCacheEntry(parsed);
}

/** The last successful pool, expired or not, within the stale-retention window. */
async function readStaleStoredCache(): Promise<CacheEntry | null> {
  const parsed = await readAppCacheValue<unknown>(CACHE_STORAGE_KEY);
  const wellFormed = validatePersonalRecommendationCacheEntry(parsed, 0);
  if (!wellFormed) return null;

  return Date.now() - wellFormed.fetchedAt < STALE_RETENTION_MS ? wellFormed : null;
}
function writeStoredCache(entry: CacheEntry): void {
  cache = entry;
  void writeAppCacheValue(CACHE_STORAGE_KEY, { ...entry, version: CACHE_SCHEMA_VERSION, expiresAt: entry.fetchedAt + CACHE_TTL_MS });
}
export async function clearPersonalRecommendationCaches(): Promise<void> {
  recommendationRequestGeneration += 1;
  cache = null;
  inFlightRequests.clear();
  await Promise.all([CACHE_STORAGE_KEY, ...OBSOLETE_CACHE_KEYS].map((key) => removeAppCacheValue(key)));
  if (typeof window !== 'undefined') {
    [CACHE_STORAGE_KEY, ...OBSOLETE_CACHE_KEYS].forEach((key) => window.localStorage.removeItem(key));
  }
}
async function getAnyStoredCacheEntry(): Promise<CacheEntry | null> {
  return cache ?? await readStaleStoredCache();
}

/**
 * A Retry BYPASSES the caches; it does not destroy them.
 *
 * `forceRefresh` used to call `clearPersonalRecommendationCaches`, deleting the last good pool
 * before attempting a refresh that might fail — so pressing Retry during an outage left the user
 * with nothing at all. The in-flight requests and the generation counter are still reset (a Retry
 * supersedes anything already running); the successful pool stays until a new one replaces it.
 */
function bypassRecommendationCaches(): void {
  recommendationRequestGeneration += 1;
  inFlightRequests.clear();
  void clearObsoleteRecommendationCaches();
}

async function getFreshCacheEntry(fingerprint: string): Promise<CacheEntry | null> {
  const entry = cache?.fingerprint === fingerprint ? cache : await readStoredCache();
  if (!entry || entry.fingerprint !== fingerprint || Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;
  cache = entry;
  return entry;
}

export type FetchPersonalRecommendationsOptions = {
  forceRefresh?: boolean;
  hydrationReady?: boolean;
  previous?: DiscoveryCandidate[];
  /**
   * AS-15: the games the user actually put in a Platform Plan, projected by the caller (which owns
   * Plan state) and passed in. This service does not read Plan storage — it is given the one thing
   * about Plans that scoring depends on. Omitted means "no Plans", which is also the cold start.
   */
  plannedGameIds?: PlannedGameIds;
};

export type PersonalRecommendationsResult = {
  candidates: DiscoveryCandidate[];
  diagnostics: RecommendationDiagnosticsReport | null;
  /**
   * AS-10: how the provider behaved during this generation. `failed` means every RAWG call failed,
   * so an empty pool says nothing about what RAWG contains — the UI must offer a Retry rather than
   * "no recommendations", and the pool must not be cached.
   */
  provider: ProviderStatusSummary;
};

const providerOk: ProviderStatusSummary = { status: 'ok', successCount: 0, failureCount: 0, stale: false };

function getDiagnosticsReport(): RecommendationDiagnosticsReport | null {
  return DEBUG_RECOMMENDATIONS ? lastDiagnosticsReport : null;
}

function buildCandidateDiagnostics(
  scored: ScoredCandidate[],
  finalCandidates: DiscoveryCandidate[],
  events: DebugEvent[],
  finalSelection?: FinalSelectionDiagnostics,
): RecommendationCandidateDiagnostics[] {
  if (!DEBUG_RECOMMENDATIONS) return [];
  const byRawgId = new Map(scored.map((item) => [item.result.id, item]));
  return finalCandidates.map((candidate) => {
    const scoredCandidate = byRawgId.get(candidate.game.rawgId);
    const score = scoredCandidate?.score;
    const selection = finalSelection?.candidates.find((item) => item.rawgId === candidate.game.rawgId);
    const positive = [
      score && score.genreMatch > 0 ? `genres +${score.genreMatch}` : null,
      score && score.tagMatch > 0 ? `tags +${score.tagMatch}` : null,
      score && score.developerMatch > 0 ? `developers +${score.developerMatch}` : null,
      score && score.platformMatch > 0 ? `platforms +${score.platformMatch}` : null,
      score && score.metacriticMatch > 0 ? `metacritic +${score.metacriticMatch}` : null,
    ].filter((value): value is string => Boolean(value));
    const negative = [
      score && score.negativeMatch < 0 ? `negative taste ${score.negativeMatch}` : null,
      score && score.ownershipPenalty < 0 ? `ownership ${score.ownershipPenalty}` : null,
    ].filter((value): value is string => Boolean(value));
    const source = scoredCandidate?.source ?? (candidate.source as CandidateSource | undefined) ?? 'broad-discovery';
    return {
      rawgId: candidate.game.rawgId,
      title: candidate.game.title,
      finalScore: candidate.score,
      source,
      strongestPositiveSignals: [
        ...(score?.positiveTags.slice(0, 2).map((tag) => `tag:${tag}`) ?? []),
        ...(score?.positiveGenres.slice(0, 2).map((genre) => `genre:${genre}`) ?? []),
        ...(score?.positiveDevelopers.slice(0, 1).map((developer) => `developer:${developer}`) ?? []),
        ...positive,
      ].slice(0, 5),
      negativePenalties: [
        ...(score?.negativeTags.slice(0, 2).map((tag) => `tag:${tag}`) ?? []),
        ...(score?.negativeGenres.slice(0, 2).map((genre) => `genre:${genre}`) ?? []),
        ...negative,
      ],
      sourceSeedGames: scoredCandidate?.seed ? [`${scoredCandidate.seed.cluster}:${scoredCandidate.seed.reason}`] : scoredCandidate?.anchorTitle ? ['seed anchor'] : [],
      fallbackTier: source === 'trending' ? 'trending' : source === 'broad-discovery' ? 'broad' : 'personalized',
      exclusionDecisions: events
        .filter((event) => event.event === 'candidate_rejected' && event.rawgId === candidate.game.rawgId)
        .map((event) => String(event.reason ?? 'rejected')),
      scoreBreakdown: score,
      originalScore: selection?.originalScore,
      finalSelectionScore: selection?.finalSelectionScore ?? undefined,
      diversityAdjustment: selection?.diversityAdjustment,
      primaryGenre: selection?.primaryGenre ?? undefined,
      franchise: selection?.franchise,
      developer: selection?.developer,
      tasteClusters: selection?.tasteClusters,
      primarySeed: selection?.seedKey ?? null,
      capDecisions: selection?.capDecisions,
      relaxationStep: selection?.relaxationStep,
      selectionReason: selection?.selectionReason,
    };
  });
}

function scoreDistribution(scores: number[]): { min: number; median: number; max: number } | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

function getTelemetryFallbackTier(finalSelection?: FinalSelectionDiagnostics): 'none' | 'personalized' | 'adjacent' | 'broad' {
  if (!finalSelection) return 'none';
  if ((finalSelection.fallbackTierCountsAfter['tier3-broad'] ?? 0) > 0) return 'broad';
  if ((finalSelection.fallbackTierCountsAfter['tier2-adjacent'] ?? 0) > 0) return 'adjacent';
  if ((finalSelection.fallbackTierCountsAfter['tier0-personalized'] ?? 0) + (finalSelection.fallbackTierCountsAfter['tier1-taste-quality'] ?? 0) > 0) return 'personalized';
  return 'none';
}

function trackRecommendationGenerationCompleted(options: {
  cacheStatus: 'hit' | 'miss' | 'stale' | 'invalid' | 'bypass';
  durationMs: number;
  finalSelection?: FinalSelectionDiagnostics;
  partialFailureCount: number;
  resultCount: number;
  /** Every provider call failed: the run produced no knowledge, which is not the same as `empty`. */
  allProvidersFailed?: boolean;
}): void {
  trackAnalyticsEvent('recommendation_generation_completed', {
    outcome: options.allProvidersFailed ? 'failed' : options.partialFailureCount > 0 ? 'partial' : options.resultCount > 0 ? 'success' : 'empty',
    result_count_bucket: bucketSmallGroup(options.resultCount),
    duration_bucket: bucketDuration(options.durationMs),
    cache_status: options.cacheStatus,
    partial_failure_bucket: bucketSmallGroup(options.partialFailureCount),
    fallback_tier: getTelemetryFallbackTier(options.finalSelection),
  });
}

async function generatePersonalRecommendationsResult(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: FetchPersonalRecommendationsOptions = {},
): Promise<PersonalRecommendationsResult> {
  if (options.hydrationReady === false) {
    return {
      candidates: options.previous ?? [],
      diagnostics: DEBUG_RECOMMENDATIONS ? {
        status: 'hydrating',
        hydrationReady: false,
        libraryCount: userGames.length,
        finishedCount: 0,
        playingCount: 0,
        plannedCount: 0,
        wishlistCount: 0,
        seedCount: 0,
        providerCandidateCount: 0,
        localAffinityCandidateCount: 0,
        broadDiscoveryCandidateCount: 0,
        trendingCandidateCount: 0,
        normalizedCount: 0,
        excludedCounts: { owned: 0, finished: 0, dropped: 0, ignored: 0, discoveryInbox: 0, skippedForNextDiscoveryRun: 0, duplicate: 0, lowScore: 0, missingArtwork: 0, missingMetadata: 0, platformMismatch: 0, seenOnly: 0 },
        finalRecommendationCount: 0,
        cachedRecommendationCount: 0,
        ...lastSurfaceCounts,
        homeRenderReason: lastSurfaceCounts.homeRenderReason,
        discoverRenderReason: lastSurfaceCounts.discoverRenderReason,
        lastGenerationError: null,
        cacheAge: null,
      } : null,
      provider: providerOk,
    };
  }
  const plannedGameIds = options.plannedGameIds ?? noPlannedGameIds;
  const generationStartedAt = performance.now();
  const performanceMarks: Record<string, number> = {};
  const profileStartedAt = performance.now();
  const profile = buildUserProfile(userGames, plannedGameIds);
  const tasteProfile = getTasteProfileForGames(userGames, plannedGameIds);
  performanceMarks.profileBuildMs = Math.round(performance.now() - profileStartedAt);
  const feedback = loadRecommendationFeedback();
  const preferences = loadRecommendationPreferences();
  const exposure = loadRecommendationExposure();
  const exposureCounts = new Map(exposure.map((record) => [record.rawgId != null ? `id:${record.rawgId}` : `title:${record.normalizedTitle}`, record.exposureCount]));
  const feedbackContext: FeedbackContext = { feedback, preferences, exposureCounts };
  const fp = `${profileFingerprint(userGames, plannedGameIds)}::taste:${tasteProfile.lastUpdatedAt}:${tasteProfile.explicit.length}:${tasteProfile.temporary.length}::recommendations:${recommendationPreferenceFingerprint(preferences, feedback)}::engine:${RECOMMENDATION_ENGINE_VERSION}:scoring:${RECOMMENDATION_SCORING_VERSION}`;
  const events: DebugEvent[] = [];
  let partialFailureCount = 0;
  const counts = {
    libraryCount: userGames.filter((game) => game.collectionType === 'library').length,
    finishedCount: userGames.filter((game) => game.status === 'Finished').length,
    ratedCount: userGames.filter((game) => typeof game.rating === 'number' && game.rating > 0).length,
    playingCount: userGames.filter((game) => game.status === 'Playing').length,
    // AS-15: how many games are in a Platform Plan — the diagnostic used to report the backlog.
    platformPlanCount: userGames.filter((game) => plannedGameIds.has(game.id)).length,
    wishlistCount: userGames.filter((game) => game.collectionType === 'wishlist').length,
  };

  if (options.forceRefresh) {
    bypassRecommendationCaches();
  } else {
    void clearObsoleteRecommendationCaches();
  }
  const activeRecommendationGeneration = recommendationRequestGeneration;

  const cacheStartedAt = performance.now();
  const freshCache = options.forceRefresh ? null : await getFreshCacheEntry(fp);
  performanceMarks.cacheReadMs = Math.round(performance.now() - cacheStartedAt);
  if (freshCache) {
    events.push({ event: 'cache_hit', candidates: freshCache.candidates.length });
    const cached = applyLibraryStatus(freshCache.candidates.map((c) => c.game), userGames, freshCache.candidates.map((c) => c.reason), inboxRawgIds, freshCache.candidates.map((c) => c.score), freshCache.candidates.map((c) => c.source as CandidateSource | undefined)).filter((c) => !c.excluded && !c.inboxStatus);
    if (recommendationRequestGeneration !== activeRecommendationGeneration) {
      return { candidates: [], diagnostics: getDiagnosticsReport(), provider: providerOk };
    }
    recordRecommendationExposures(cached, fp);
    debugRecommendationReport(events, counts, { fromCache: true, finalCandidates: cached, cacheAge: Date.now() - freshCache.fetchedAt, fingerprint: fp, cacheStatus: 'hit', performance: performanceMarks, feedbackSignalCount: feedback.length, exposureSignalCount: exposure.filter((record) => record.exposureCount > recommendationConfig.exposure.fatigueAfter).length, qualitySummary: summarizeRecommendationQuality(cached) });
    trackRecommendationGenerationCompleted({ cacheStatus: 'hit', durationMs: performanceMarks.cacheReadMs ?? 0, partialFailureCount: 0, resultCount: cached.length });
    // A cache hit is a success that happens to come from cache — the pool it holds was fetched from
    // a provider that answered.
    return { candidates: cached, diagnostics: getDiagnosticsReport(), provider: providerOk };
  }

  const { seeds: selectedSeeds, diagnostics: seedDiagnostics } = selectRecommendationSeeds(userGames, 8, plannedGameIds);
  const likedSeeds = selectedSeeds.slice(0, 6);
  const planWishlistSeeds = getPlanAndWishlistGames(userGames, plannedGameIds);
  const recentSeeds = getRecentlyInteractedGames(userGames);
  const seedTitles = [...likedSeeds.map((seed) => seed.game), ...planWishlistSeeds, ...recentSeeds].map((game) => game.title);
  const seen = new Set<number>();
  const collected: ScoredCandidate[] = [];

  // AS-10: every RAWG call in the waterfall is counted, and a failed one is counted as a FAILURE
  // rather than an empty page. The helpers used to swallow errors into `[]`, so a total outage
  // produced an empty pool that looked exactly like "RAWG has nothing for you" — and was cached as
  // such for 24 hours. The local wrappers below keep every call site (and therefore all scoring,
  // filtering and selection) byte-for-byte unchanged while recording what actually happened.
  let providerSuccessCount = 0;
  let providerFailureCount = 0;
  let firstProviderError: ProviderError | null = null;

  const takeResults = (result: ProviderResult<RawgResult[]>): RawgResult[] => {
    if (result.ok) {
      providerSuccessCount += 1;
      return result.data;
    }

    providerFailureCount += 1;
    partialFailureCount += 1;
    firstProviderError ??= result.error;
    // The category, never the message body or the URL — nothing here can carry a key or a payload.
    events.push({ event: 'provider_failed', kind: result.error.kind, category: getProviderErrorCategory(result.error.kind), retryable: result.error.retryable });
    return [];
  };

  const fetchRecommendedGames = async (params: RecommendedGamesParams) => takeResults(await fetchRecommendedGamesResult(params));
  const fetchSuggestedGames = async (rawgId: number) => takeResults(await fetchSuggestedGamesResult(rawgId));
  const fetchGameSeries = async (rawgId: number) => takeResults(await fetchGameSeriesResult(rawgId));

  const addStage = async (name: CandidateSource, producer: () => Promise<Array<{ results: RawgSearchResult[]; anchorTitle?: string; seed?: SelectedRecommendationSeed }>>, minScore: number, relaxation = 0) => {
    const stageStartedAt = performance.now();
    const before = collected.length;
    try {
      for (const batch of await producer()) {
        events.push({ event: 'provider_batch', source: name, count: batch.results.length, anchorTitle: batch.anchorTitle });
        collected.push(...await collectFromResults(batch.results, name, profile, userGames, seen, events, feedbackContext, { minScore, relaxation, anchorTitle: batch.anchorTitle, seed: batch.seed, tasteProfile }));
      }
    } catch (error) {
      partialFailureCount += 1;
      events.push({ event: 'stage_failed', source: name, reason: error instanceof Error ? error.name : 'unknown' });
    }
    performanceMarks[`stage:${name}:ms`] = Math.round(performance.now() - stageStartedAt);
    events.push({ event: 'stage_complete', source: name, produced: collected.length - before, totalPersonalized: collected.length, minScore, relaxation });
  };

  seedDiagnostics.filter((seed) => seed.selected).forEach((seed) => events.push({ event: 'seed_selected', ...seed }));
  seedDiagnostics.filter((seed) => !seed.selected).slice(0, 16).forEach((seed) => events.push({ event: 'seed_skipped', ...seed }));

  await addStage('liked-game-similar', async () => Promise.all(likedSeeds.map(async (seed) => ({ anchorTitle: seed.game.title, seed, results: (await fetchSuggestedGames(seed.game.rawgId!)).slice(0, 12) }))), 22);

  await addStage('liked-game-series', async () => Promise.all(likedSeeds.slice(0, 3).map(async (seed) => ({ anchorTitle: seed.game.title, seed, results: (await fetchGameSeries(seed.game.rawgId!)).slice(0, 8) }))), 20);

  const preferredPlatforms = getPreferredRawgPlatforms(profile);


  if (profile.topGenres.length > 0) {
    await addStage('affinity-strict', async () => [{ results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 3).map((g) => g.slug).join(','), tags: profile.topTags.slice(0, 3).join(',') || undefined, platforms: preferredPlatforms, metacriticMin: profile.avgMetacritic != null && profile.avgMetacritic >= 70 ? Math.max(55, profile.avgMetacritic - 18) : undefined, pageSize: 40 }) }], 24);
  }

  await addStage('plans-wishlist', async () => Promise.all(planWishlistSeeds.map(async (game) => ({ anchorTitle: game.title, results: await fetchSuggestedGames(game.rawgId!) }))), 18, 1);

  await addStage('recently-interacted', async () => Promise.all(recentSeeds.map(async (game) => ({ anchorTitle: game.title, results: await fetchSuggestedGames(game.rawgId!) }))), 16, 1);

  if (profile.topGenres.length > 0) {
    await addStage('affinity-relaxed', async () => [
      { results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 5).map((g) => g.slug).join(','), platforms: preferredPlatforms, pageSize: 40 }) },
      { results: profile.topTags.length > 0 ? await fetchRecommendedGames({ tags: profile.topTags.slice(0, 6).join(','), platforms: preferredPlatforms, pageSize: 40 }) : [] },
      { results: await fetchRecommendedGames({ genres: profile.topGenres.slice(0, 5).map((g) => g.slug).join(','), ordering: '-added', pageSize: 40 }) },
      { results: profile.topTags[0] ? await fetchRecommendedGames({ tags: profile.topTags[0], genres: profile.topGenres[0]?.slug, ordering: '-released', pageSize: 40 }) : [] },
      { results: await fetchRecommendedGames({ genres: profile.topGenres[0]?.slug, dates: getUpcomingDateRange(), ordering: '-added', platforms: preferredPlatforms, pageSize: 30 }) },
    ], 8, 3);
  }

  if (collected.length < TARGET_PERSONAL_RECOMMENDATIONS) {
    await addStage('broad-discovery', async () => [
      { results: await fetchRecommendedGames({ platforms: preferredPlatforms, ordering: '-rating', pageSize: 40 }) },
      { results: await fetchRecommendedGames({ platforms: preferredPlatforms, ordering: '-added', pageSize: 40 }) },
    ], profile.topGenres.length > 0 ? 4 : -20, 4);
  }

  await addStage('second-order', async () => Promise.all(collected.slice(0, 3).map(async (item) => ({ anchorTitle: item.result.name, results: await fetchSuggestedGames(item.result.id) }))), 10, 3);

  const ranked = collected.sort((a, b) => b.score.total - a.score.total || a.result.id - b.result.id);
  const selectionStartedAt = performance.now();
  let finalSelection = selectFinalRecommendationCandidates(ranked, TARGET_PERSONAL_RECOMMENDATIONS, preferences);
  performanceMarks.diversitySelectionMs = Math.round(performance.now() - selectionStartedAt);
  finalSelection.diagnostics.nearDuplicateSuppressions.forEach((suppression) => events.push({ event: 'candidate_rejected', ...suppression, reason: 'near-duplicate' }));
  finalSelection.diagnostics.candidates.forEach((candidate) => events.push({ event: candidate.selected ? 'final_candidate_selected' : 'final_candidate_rejected', ...candidate }));
  const candidates = applyLibraryStatus(finalSelection.selected.map(({ result }) => mapRawgResult(result)), userGames, finalSelection.selected.map(({ reason }) => reason), inboxRawgIds, finalSelection.selected.map(({ score }) => score.total), finalSelection.selected.map(({ source }) => source));
  let pool = candidates.filter((c) => !c.excluded && !c.inboxStatus);
  if (pool.length < TARGET_PERSONAL_RECOMMENDATIONS / 2) {
    const staleCache = await getAnyStoredCacheEntry();
    if (staleCache?.candidates.length) {
      const cacheCandidates = applyLibraryStatus(staleCache.candidates.map((c) => c.game), userGames, staleCache.candidates.map((c) => c.reason), inboxRawgIds, staleCache.candidates.map((c) => c.score), staleCache.candidates.map((c) => c.source as CandidateSource | undefined)).filter((c) => !c.excluded && !c.inboxStatus && !seen.has(c.game.rawgId));
      pool = [...pool, ...cacheCandidates].slice(0, TARGET_PERSONAL_RECOMMENDATIONS);
      cacheCandidates.forEach((candidate) => seen.add(candidate.game.rawgId));
      events.push({ event: 'stale_cache_backfill', added: cacheCandidates.length, total: pool.length });
    }
  }

  if (pool.length < TARGET_PERSONAL_RECOMMENDATIONS / 2) {
    await addStage('trending', async () => [
      { results: await fetchRecommendedGames({ ordering: '-added', pageSize: 40 }) },
      { results: await fetchRecommendedGames({ ordering: '-rating', pageSize: 40 }) },
    ], -20, 4);
    const reranked = collected.sort((a, b) => b.score.total - a.score.total || a.result.id - b.result.id);
    const fallbackSelectionStartedAt = performance.now();
    finalSelection = selectFinalRecommendationCandidates(reranked, TARGET_PERSONAL_RECOMMENDATIONS, preferences);
    performanceMarks.diversitySelectionMs += Math.round(performance.now() - fallbackSelectionStartedAt);
    finalSelection.diagnostics.nearDuplicateSuppressions.forEach((suppression) => events.push({ event: 'candidate_rejected', ...suppression, reason: 'near-duplicate' }));
    finalSelection.diagnostics.candidates.forEach((candidate) => events.push({ event: candidate.selected ? 'final_candidate_selected' : 'final_candidate_rejected', ...candidate }));
    const expandedCandidates = applyLibraryStatus(finalSelection.selected.map(({ result }) => mapRawgResult(result)), userGames, finalSelection.selected.map(({ reason }) => reason), inboxRawgIds, finalSelection.selected.map(({ score }) => score.total), finalSelection.selected.map(({ source }) => source));
    pool = expandedCandidates.filter((c) => !c.excluded && !c.inboxStatus).slice(0, TARGET_PERSONAL_RECOMMENDATIONS);
  }
  performanceMarks.totalGenerationMs = Math.round(performance.now() - generationStartedAt);
  events.push({ event: 'pipeline_complete', candidates: pool.length, personalized: finalSelection.selected.length, trending: pool.filter((candidate) => candidate.source === 'trending').length, partialFailureCount, durationMs: performanceMarks.totalGenerationMs });
  const candidateDiagnostics = buildCandidateDiagnostics(collected, pool, events, finalSelection.diagnostics);
  debugRecommendationReport(events, counts, {
    finalCandidates: pool,
    normalizedCandidates: candidates,
    seedTitles,
    rawPersonalizedCandidateCount: collected.length,
    normalizedCandidateCount: candidates.length,
    fingerprint: fp,
    candidateDiagnostics,
    selectedSeeds: seedDiagnostics,
    topPositiveSignals: {
      genres: profile.topGenres.slice(0, 6),
      tags: profile.topTagWeights.slice(0, 8),
      developers: profile.topDeveloperWeights.slice(0, 5),
      franchises: profile.topFranchises.slice(0, 5),
      tasteProfile: getActiveTasteSignals(tasteProfile, 'love').slice(0, 8).map((signal) => ({ label: signal.label, origin: signal.origin, confidence: signal.confidence, evidence: signal.supportingGameCount })),
    },
    topNegativeSignals: {
      genres: profile.negativeGenres.slice(0, 5),
      tags: profile.negativeTags.slice(0, 8),
      developers: profile.negativeDevelopers.slice(0, 5),
      franchises: profile.negativeFranchises.slice(0, 5),
      tasteProfile: getActiveTasteSignals(tasteProfile, 'avoid').slice(0, 8).map((signal) => ({ label: signal.label, origin: signal.origin, confidence: signal.confidence, evidence: signal.supportingGameCount })),
    },
    scoreDistribution: scoreDistribution(collected.map((item) => item.score.total)),
    finalSelection: finalSelection.diagnostics,
    performance: performanceMarks,
    cacheStatus: options.forceRefresh ? 'bypass' : 'miss',
    partialFailureCount,
    feedbackSignalCount: feedback.length,
    exposureSignalCount: exposure.filter((record) => record.exposureCount > recommendationConfig.exposure.fatigueAfter).length,
    qualitySummary: summarizeRecommendationQuality(pool, finalSelection.diagnostics),
  });

  const cacheWriteStartedAt = performance.now();
  if (recommendationRequestGeneration !== activeRecommendationGeneration) {
    return { candidates: [], diagnostics: getDiagnosticsReport(), provider: providerOk };
  }

  // AS-10: every provider call failed. The pool is empty because we learned NOTHING, not because
  // RAWG has nothing — so it must not be written to the 24-hour success cache, and the last good
  // pool is served instead, marked stale, with a retryable error the UI can offer to retry.
  const allProvidersFailed = providerSuccessCount === 0 && providerFailureCount > 0;
  if (allProvidersFailed) {
    const staleEntry = await getAnyStoredCacheEntry();
    const staleCandidates = staleEntry
      ? applyLibraryStatus(staleEntry.candidates.map((c) => c.game), userGames, staleEntry.candidates.map((c) => c.reason), inboxRawgIds, staleEntry.candidates.map((c) => c.score), staleEntry.candidates.map((c) => c.source as CandidateSource | undefined)).filter((c) => !c.excluded && !c.inboxStatus)
      : [];

    trackRecommendationGenerationCompleted({ cacheStatus: staleCandidates.length > 0 ? 'stale' : 'miss', durationMs: performanceMarks.totalGenerationMs, finalSelection: finalSelection.diagnostics, partialFailureCount, resultCount: staleCandidates.length, allProvidersFailed: true });
    return {
      candidates: staleCandidates,
      diagnostics: getDiagnosticsReport(),
      provider: summarizeProviderStatus(providerSuccessCount, providerFailureCount, {
        stale: staleCandidates.length > 0,
        error: firstProviderError ?? undefined,
      }),
    };
  }

  // Everything else IS a success — including a genuinely empty pool from a provider that answered.
  // That empty result is cached, exactly as before: an empty 200 is data.
  writeStoredCache({ candidates: pool, fingerprint: fp, fetchedAt: Date.now() });
  performanceMarks.cacheWriteMs = Math.round(performance.now() - cacheWriteStartedAt);
  recordRecommendationExposures(pool, fp);
  trackRecommendationGenerationCompleted({ cacheStatus: options.forceRefresh ? 'bypass' : 'miss', durationMs: performanceMarks.totalGenerationMs, finalSelection: finalSelection.diagnostics, partialFailureCount, resultCount: pool.length });
  return {
    candidates: pool,
    diagnostics: getDiagnosticsReport(),
    provider: summarizeProviderStatus(providerSuccessCount, providerFailureCount, { error: firstProviderError ?? undefined }),
  };
}

/**
 * AS-12: every input that materially changes the result, as one comparable string.
 *
 * The hook needs to know whether the run it is about to commit still belongs to the inputs the user
 * is looking at. Object identity cannot answer that (a new `games` array with the same contents is
 * not a new input), so the key is built from the same signals the generation itself reads: the
 * library fingerprint, the taste profile, recommendation preferences and feedback, the Discovery
 * Inbox exclusions, and whether hydration has completed. It lives here, next to the generation, so
 * the two cannot drift apart.
 */
export function getRecommendationInputKey(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  hydrationReady = true,
  plannedGameIds: PlannedGameIds = noPlannedGameIds,
): string {
  const tasteProfile = getTasteProfileForGames(userGames, plannedGameIds);
  const preferences = loadRecommendationPreferences();
  const feedback = loadRecommendationFeedback();
  const inboxFingerprint = [...inboxRawgIds].sort((a, b) => a - b).join('|');

  return [
    profileFingerprint(userGames, plannedGameIds),
    `taste:${tasteProfile.lastUpdatedAt}:${tasteProfile.explicit.length}:${tasteProfile.temporary.length}`,
    `recommendations:${recommendationPreferenceFingerprint(preferences, feedback)}`,
    `inbox:${inboxFingerprint}`,
    `hydration:${hydrationReady}`,
    `engine:${RECOMMENDATION_ENGINE_VERSION}:scoring:${RECOMMENDATION_SCORING_VERSION}`,
  ].join('::');
}

export async function fetchPersonalRecommendationsResult(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: FetchPersonalRecommendationsOptions = {},
): Promise<PersonalRecommendationsResult> {
  const plannedGameIds = options.plannedGameIds ?? noPlannedGameIds;
  const fp = profileFingerprint(userGames, plannedGameIds);
  const inboxFingerprint = [...inboxRawgIds].sort((a, b) => a - b).join('|');
  const requestKey = options.forceRefresh ? `force:${crypto.randomUUID()}` : `${fp}:${inboxFingerprint}:${options.hydrationReady !== false}`;
  const existing = inFlightRequests.get(requestKey);
  if (existing) return existing;
  const request = generatePersonalRecommendationsResult(userGames, inboxRawgIds, options)
    .finally(() => { inFlightRequests.delete(requestKey); });
  inFlightRequests.set(requestKey, request);
  return request;
}

async function clearObsoleteRecommendationCaches(): Promise<void> {
  await Promise.all(OBSOLETE_CACHE_KEYS.map((key) => removeAppCacheValue(key)));
  if (typeof window !== 'undefined') OBSOLETE_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export async function fetchPersonalRecommendations(userGames: Game[], inboxRawgIds: Set<number> = new Set()): Promise<DiscoveryCandidate[]> {
  return (await fetchPersonalRecommendationsResult(userGames, inboxRawgIds)).candidates;
}

function applyLibraryStatus(
  games: DiscoveryCandidate['game'][],
  userGames: Game[],
  reasons?: (string | undefined)[],
  inboxRawgIds: Set<number> = new Set(),
  scores?: number[],
  sources?: Array<CandidateSource | undefined>,
): DiscoveryCandidate[] {
  return games.map((game, i) => {
    const match = userGames.find((g) => g.rawgId === game.rawgId) ?? userGames.find((g) => !g.rawgId && normalizeTitle(g.title) === normalizeTitle(game.title));
    const libraryStatus = match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
    const inboxStatus = inboxRawgIds.has(game.rawgId);
    let excluded = false;
    let exclusionReason: DiscoveryExclusionReason | null = null;
    if (match) {
      excluded = true;
      exclusionReason = match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned';
    }
    return { game, libraryStatus, inboxStatus, excluded, exclusionReason, score: scores?.[i] ?? (libraryStatus === null ? 0 : -30), reason: reasons?.[i], source: sources?.[i] };
  });
}
