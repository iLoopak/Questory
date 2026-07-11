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
import { mapRawgResult } from './discoveryService';
import { fetchGameSeries, fetchRecommendedGames, fetchSuggestedGames } from './rawgApi';
import { readAppCacheValue, removeAppCacheValue, writeAppCacheValue } from '../lib/indexedDbAppCache';

// ---------------------------------------------------------------------------
// Recommendation waterfall
// ---------------------------------------------------------------------------

const TARGET_PERSONAL_RECOMMENDATIONS = 12;
const DEBUG_RECOMMENDATIONS = import.meta.env.DEV && import.meta.env.VITE_DEBUG_RECOMMENDATIONS !== 'false';

type CandidateSource =
  | 'liked-game-similar'
  | 'liked-game-series'
  | 'affinity-strict'
  | 'plans-wishlist'
  | 'recently-interacted'
  | 'affinity-relaxed'
  | 'second-order'
  | 'broad-discovery'
  | 'trending';

type ScoredCandidate = {
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
};

type DebugEvent = Record<string, unknown> & { event: string };

type RecommendationSurface = 'service' | 'home' | 'discover' | 'discovery-inbox';

type RecommendationDiagnosticsReport = {
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
} as const;

type ScoreContext = {
  source?: CandidateSource;
  seed?: SelectedRecommendationSeed;
  relaxation?: number;
};

function clampScore(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function normalizeDeveloperName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
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

  const total = genreOverlap.score + tagOverlap.score + developerOverlap.score + franchiseMatch + platformMatch + seedSimilarity + qualityMatch + recencyMatch + negativeMatch + sourceAdjustment;
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
    metacriticMatch,
    ownershipPenalty: 0,
    positiveGenres: genreOverlap.matched,
    positiveTags: tagOverlap.matched,
    positiveDevelopers: developerOverlap.matched,
    positiveFranchises,
    negativeGenres: negativeGenreOverlap.matched,
    negativeTags: negativeTagOverlap.matched,
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

export function selectRecommendationSeeds(userGames: Game[], maxSeeds = 8): { seeds: SelectedRecommendationSeed[]; diagnostics: SeedDiagnostics[] } {
  const ranked = userGames
    .map((game): SelectedRecommendationSeed | null => {
      const signal = getRecommendationSignalWeight(game);
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

function getPlanAndWishlistGames(userGames: Game[]): Game[] {
  return userGames
    .filter((game) => game.rawgId && (game.collectionType === 'wishlist' || game.status === 'Want to play'))
    .sort((a, b) => getRecommendationSignalWeight(b).weight - getRecommendationSignalWeight(a).weight)
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
  options: { minScore: number; relaxation?: number; anchorTitle?: string; seed?: SelectedRecommendationSeed },
): Promise<ScoredCandidate[]> {
  const output: ScoredCandidate[] = [];
  for (const result of results) {
    const score = scorePersonalRecommendationCandidate(result, profile, options.relaxation ?? 0, { source, seed: options.seed });
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
    events.push({ event: 'candidate_accepted', source, rawgId: result.id, title: result.name, score: score.total, reason: output.at(-1)?.reason, anchorTitle: options.anchorTitle, scoreBreakdown: score });
  }
  return output;
}

function applyDiversityFilter(scored: ScoredCandidate[], max: number, events: DebugEvent[]): ScoredCandidate[] {
  const genreCounts = new Map<string, number>();
  const sourceCounts = new Map<CandidateSource, number>();
  const output: ScoredCandidate[] = [];

  for (const item of scored) {
    const primaryGenre = item.result.genres?.[0]?.name ?? 'unknown';
    const genreCount = genreCounts.get(primaryGenre) ?? 0;
    const sourceCount = sourceCounts.get(item.source) ?? 0;
    const sourceLimit = 5;
    if (genreCount >= 3) {
      events.push({ event: 'candidate_rejected', source: item.source, rawgId: item.result.id, title: item.result.name, score: item.score.total, reason: `genre-diversity:${primaryGenre}` });
      continue;
    }
    if (sourceCount >= sourceLimit) {
      events.push({ event: 'candidate_rejected', source: item.source, rawgId: item.result.id, title: item.result.name, score: item.score.total, reason: `source-diversity:${item.source}` });
      continue;
    }
    output.push(item);
    genreCounts.set(primaryGenre, genreCount + 1);
    sourceCounts.set(item.source, sourceCount + 1);
    if (output.length >= max) break;
  }
  return output;
}

interface CacheEntry { candidates: DiscoveryCandidate[]; fingerprint: string; fetchedAt: number; }
let cache: CacheEntry | null = null;
const CACHE_STORAGE_KEY = 'questshelf.personalRecommendations.v2';
export const PERSONAL_RECOMMENDATIONS_CACHE_KEY = CACHE_STORAGE_KEY;
const OBSOLETE_CACHE_KEYS = ['questshelf.personalizedRecommendations.v1', 'questshelf.personalRecommendations.v1'];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function readStoredCache(): Promise<CacheEntry | null> {
  const parsed = await readAppCacheValue<Partial<CacheEntry>>(CACHE_STORAGE_KEY);
  if (!parsed || !Array.isArray(parsed.candidates) || typeof parsed.fingerprint !== 'string' || typeof parsed.fetchedAt !== 'number') return null;
  return { candidates: parsed.candidates as DiscoveryCandidate[], fingerprint: parsed.fingerprint, fetchedAt: parsed.fetchedAt };
}
function writeStoredCache(entry: CacheEntry): void { cache = entry; void writeAppCacheValue(CACHE_STORAGE_KEY, entry); }
export async function clearPersonalRecommendationCaches(): Promise<void> {
  cache = null;
  await Promise.all([CACHE_STORAGE_KEY, ...OBSOLETE_CACHE_KEYS].map((key) => removeAppCacheValue(key)));
  if (typeof window !== 'undefined') {
    [CACHE_STORAGE_KEY, ...OBSOLETE_CACHE_KEYS].forEach((key) => window.localStorage.removeItem(key));
  }
}
async function getAnyStoredCacheEntry(): Promise<CacheEntry | null> {
  return cache ?? await readStoredCache();
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
};

export type PersonalRecommendationsResult = {
  candidates: DiscoveryCandidate[];
  diagnostics: RecommendationDiagnosticsReport | null;
};

function getDiagnosticsReport(): RecommendationDiagnosticsReport | null {
  return DEBUG_RECOMMENDATIONS ? lastDiagnosticsReport : null;
}

function buildCandidateDiagnostics(
  scored: ScoredCandidate[],
  finalCandidates: DiscoveryCandidate[],
  events: DebugEvent[],
): RecommendationCandidateDiagnostics[] {
  if (!DEBUG_RECOMMENDATIONS) return [];
  const byRawgId = new Map(scored.map((item) => [item.result.id, item]));
  return finalCandidates.map((candidate) => {
    const scoredCandidate = byRawgId.get(candidate.game.rawgId);
    const score = scoredCandidate?.score;
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

export async function fetchPersonalRecommendationsResult(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: FetchPersonalRecommendationsOptions = {},
): Promise<PersonalRecommendationsResult> {
  if (options.hydrationReady === false) {
    return {
      candidates: options.previous ?? [],
      diagnostics: DEBUG_RECOMMENDATIONS ? {
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
    };
  }
  const profile = buildUserProfile(userGames);
  const fp = profileFingerprint(userGames);
  const events: DebugEvent[] = [];
  const counts = {
    libraryCount: userGames.filter((game) => game.collectionType === 'library').length,
    finishedCount: userGames.filter((game) => game.status === 'Finished').length,
    ratedCount: userGames.filter((game) => typeof game.rating === 'number' && game.rating > 0).length,
    playingCount: userGames.filter((game) => game.status === 'Playing').length,
    platformPlanCount: userGames.filter((game) => game.status === 'Want to play').length,
    wishlistCount: userGames.filter((game) => game.collectionType === 'wishlist').length,
  };

  if (options.forceRefresh) {
    await clearPersonalRecommendationCaches();
  } else {
    void clearObsoleteRecommendationCaches();
  }

  const freshCache = options.forceRefresh ? null : await getFreshCacheEntry(fp);
  if (freshCache) {
    events.push({ event: 'cache_hit', candidates: freshCache.candidates.length });
    const cached = applyLibraryStatus(freshCache.candidates.map((c) => c.game), userGames, freshCache.candidates.map((c) => c.reason), inboxRawgIds, freshCache.candidates.map((c) => c.score), freshCache.candidates.map((c) => c.source as CandidateSource | undefined)).filter((c) => !c.excluded && !c.inboxStatus);
    debugRecommendationReport(events, counts, { fromCache: true, finalCandidates: cached, cacheAge: Date.now() - freshCache.fetchedAt, fingerprint: fp });
    return { candidates: cached, diagnostics: getDiagnosticsReport() };
  }

  const { seeds: selectedSeeds, diagnostics: seedDiagnostics } = selectRecommendationSeeds(userGames, 8);
  const likedSeeds = selectedSeeds.slice(0, 6);
  const planWishlistSeeds = getPlanAndWishlistGames(userGames);
  const recentSeeds = getRecentlyInteractedGames(userGames);
  const seedTitles = [...likedSeeds.map((seed) => seed.game), ...planWishlistSeeds, ...recentSeeds].map((game) => game.title);
  const seen = new Set<number>();
  const collected: ScoredCandidate[] = [];
  const addStage = async (name: CandidateSource, producer: () => Promise<Array<{ results: RawgSearchResult[]; anchorTitle?: string; seed?: SelectedRecommendationSeed }>>, minScore: number, relaxation = 0) => {
    const before = collected.length;
    for (const batch of await producer()) {
      events.push({ event: 'provider_batch', source: name, count: batch.results.length, anchorTitle: batch.anchorTitle });
      collected.push(...await collectFromResults(batch.results, name, profile, userGames, seen, events, { minScore, relaxation, anchorTitle: batch.anchorTitle, seed: batch.seed }));
    }
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

  const ranked = collected.sort((a, b) => b.score.total - a.score.total);
  const diverse = applyDiversityFilter(ranked, TARGET_PERSONAL_RECOMMENDATIONS, events);
  const candidates = applyLibraryStatus(diverse.map(({ result }) => mapRawgResult(result)), userGames, diverse.map(({ reason }) => reason), inboxRawgIds, diverse.map(({ score }) => score.total), diverse.map(({ source }) => source));
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
    const reranked = collected.sort((a, b) => b.score.total - a.score.total);
    const rediverse = applyDiversityFilter(reranked, TARGET_PERSONAL_RECOMMENDATIONS, events);
    const expandedCandidates = applyLibraryStatus(rediverse.map(({ result }) => mapRawgResult(result)), userGames, rediverse.map(({ reason }) => reason), inboxRawgIds, rediverse.map(({ score }) => score.total), rediverse.map(({ source }) => source));
    pool = expandedCandidates.filter((c) => !c.excluded && !c.inboxStatus).slice(0, TARGET_PERSONAL_RECOMMENDATIONS);
  }
  events.push({ event: 'pipeline_complete', candidates: pool.length, personalized: diverse.length, trending: pool.filter((candidate) => candidate.source === 'trending').length });
  const candidateDiagnostics = buildCandidateDiagnostics(collected, pool, events);
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
    },
    topNegativeSignals: {
      genres: profile.negativeGenres.slice(0, 5),
      tags: profile.negativeTags.slice(0, 8),
      developers: profile.negativeDevelopers.slice(0, 5),
      franchises: profile.negativeFranchises.slice(0, 5),
    },
    scoreDistribution: scoreDistribution(collected.map((item) => item.score.total)),
  });

  writeStoredCache({ candidates: pool, fingerprint: fp, fetchedAt: Date.now() });
  return { candidates: pool, diagnostics: getDiagnosticsReport() };
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
