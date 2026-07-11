import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryCandidateStatus, DiscoveryExclusionReason } from '../lib/discovery';
import {
  buildUserProfile,
  isDistinctivePreferenceTag,
  isGenericPreferenceTag,
  preferenceTagWeight,
  profileFingerprint,
  recommendationFranchiseKey,
  signalInformationValue,
  toSlug,
} from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchSuggestedGames, fetchGameSeries, fetchRecommendedGames } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';
import { scorePersonalRecommendationCandidate } from './personalRecommendationsService';
import { getActiveTasteSignals, getTasteProfileForGames, type TasteProfile } from '../lib/tasteProfile';

// ---------------------------------------------------------------------------
// Scoring weights
// Designed so that semantically specific signals dominate broad ones:
//
//   Franchise membership   50   ★★★★★  same game series
//   RAWG suggested         40   ★★★★☆  RAWG's own similarity model
//   Specific tag match     40   ★★★★☆  shared gameplay tags
//   Profile affinity       20   ★★☆☆☆  user's taste from their library
//   Broad genre match      15   ★★☆☆☆  coarse genre overlap
//   Ownership penalty     −30          demotes already-owned games
// ---------------------------------------------------------------------------

export interface ContextualScore {
  franchise: number;       // 0 or 50
  rawgSuggested: number;   // 0 or 40
  tagMatch: number;        // 0–40
  genreMatch: number;      // 0–15
  profileAffinity: number; // 0–20
  profilePenalty: number;
  ownershipPenalty: number;
  total: number;
}

function tagWeight(slug: string): number {
  return preferenceTagWeight(slug);
}

function meaningfulTagWeight(slug: string): number {
  return isGenericPreferenceTag(slug) ? 0 : tagWeight(slug);
}

function rareTagMultiplier(slug: string, corpusFrequency: Map<string, number>): number {
  if (isGenericPreferenceTag(slug)) return 0.25;
  const frequency = corpusFrequency.get(slug) ?? 0;
  if (isDistinctivePreferenceTag(slug)) return 1.35;
  if (frequency >= 8) return 0.65;
  if (frequency >= 4) return 0.85;
  if (frequency <= 1) return 1.25;
  return 1;
}

function buildUserTagFrequency(userGames: Game[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const userGame of userGames) {
    for (const slug of new Set((userGame.rawgTags ?? []).map(toSlug))) {
      frequency.set(slug, (frequency.get(slug) ?? 0) + 1);
    }
  }
  return frequency;
}
// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computeTagMatchScore(
  candidateTagSlugs: string[],
  currentGameTagSlugs: string[],
  tagFrequency: Map<string, number>,
): { score: number; meaningfulMatches: number } {
  let rawScore = 0;
  let meaningfulMatches = 0;
  for (const slug of new Set(candidateTagSlugs)) {
    if (!currentGameTagSlugs.includes(slug)) continue;
    const weighted = tagWeight(slug) * rareTagMultiplier(slug, tagFrequency);
    rawScore += weighted;
    if (isDistinctivePreferenceTag(slug) || meaningfulTagWeight(slug) >= 4) meaningfulMatches += 1;
  }

  const synergy = meaningfulMatches >= 2 ? 1.35 : 1;
  return {
    score: Math.round(Math.min(55, rawScore * synergy)),
    meaningfulMatches,
  };
}


export function scoreContextualTagOverlapForTest(candidateTagSlugs: string[], currentGameTagSlugs: string[], corpusTagSlugs: string[] = []): { score: number; meaningfulMatches: number } {
  const frequency = new Map<string, number>();
  for (const slug of corpusTagSlugs.map(toSlug)) {
    frequency.set(slug, (frequency.get(slug) ?? 0) + 1);
  }
  return computeTagMatchScore(candidateTagSlugs.map(toSlug), currentGameTagSlugs.map(toSlug), frequency);
}

function computeGenreMatchScore(
  candidateGenres: string[],
  currentGameGenres: string[],
): number {
  return Math.min(18, candidateGenres
    .filter((genre) => currentGameGenres.includes(genre))
    .reduce((sum, genre) => sum + 9 * signalInformationValue('genre', genre), 0));
}

function computeProfileAffinity(result: RawgSearchResult, profile: ReturnType<typeof buildUserProfile>, tasteProfile?: TasteProfile): { affinity: number; penalty: number; tasteLabel: string | null } {
  const score = scorePersonalRecommendationCandidate(result, profile, 1, { source: 'affinity-relaxed', tasteProfile });
  return {
    affinity: Math.round(Math.min(30, score.genreMatch * 0.25 + score.tagMatch * 0.35 + score.developerMatch * 0.35 + score.franchiseMatch * 0.35 + score.qualityMatch * 0.4 + Math.max(0, score.tasteProfileMatch))),
    penalty: score.negativeMatch,
    tasteLabel: score.tasteProfileMatch >= 8 ? getActiveTasteSignals(tasteProfile ?? { version: 1, observed: [], explicit: [], temporary: [], lastComputedFingerprint: '', lastUpdatedAt: '', prompt: {} }, 'love')[0]?.label ?? null : null,
  };
}

// ---------------------------------------------------------------------------
// Reason text generation
// Prioritises tag-based explanations over genre-based ones.
// ---------------------------------------------------------------------------

function generateReason(
  result: RawgSearchResult,
  score: ContextualScore,
  currentGameTitle: string,
  currentTagSlugs: string[],
  profileGenreNames: string[],
  tasteLabel?: string | null,
): string {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Collect the display names of specifically matched tags (non-generic, ordered by RAWG weight).
  const matchedTagNames = (result.tags ?? [])
    .filter((t) => {
      const slug = t.slug ?? toSlug(t.name);
      return !isGenericPreferenceTag(slug) && currentTagSlugs.includes(slug);
    })
    .slice(0, 2)
    .map((t) => t.name);

  const sharedWithProfile = profileGenreNames
    .slice(0, 3)
    .filter((g) => candidateGenres.includes(g));

  if (score.franchise > 0) {
    return `Part of the same series as ${currentGameTitle}`;
  }
  if (score.rawgSuggested > 0 && matchedTagNames.length >= 2) {
    return `Similar to ${currentGameTitle} — shares ${matchedTagNames[0]} & ${matchedTagNames[1]}`;
  }
  if (score.rawgSuggested > 0 && matchedTagNames.length === 1) {
    return `Similar to ${currentGameTitle} — shares ${matchedTagNames[0]}`;
  }
  if (score.rawgSuggested > 0 && sharedWithProfile.length > 0) {
    return `Similar to ${currentGameTitle} and fits your ${sharedWithProfile[0]} history`;
  }
  if (score.rawgSuggested > 0) {
    return `Similar to ${currentGameTitle}`;
  }
  if (matchedTagNames.length >= 2) {
    return `Shares ${matchedTagNames[0]} & ${matchedTagNames[1]} with ${currentGameTitle}`;
  }
  if (matchedTagNames.length === 1 && sharedWithProfile.length > 0) {
    return `Shares ${matchedTagNames[0]} with ${currentGameTitle} and fits your taste`;
  }
  if (matchedTagNames.length === 1) {
    return `Shares ${matchedTagNames[0]} with ${currentGameTitle}`;
  }
  if (sharedWithProfile.length > 0) {
    return `Matches your ${sharedWithProfile[0]} history`;
  }
  if (tasteLabel) {
    return `Because your Taste Profile matches ${tasteLabel}`;
  }
  return `May complement ${currentGameTitle}`;
}

// ---------------------------------------------------------------------------
// Diversity — max 2 games per primary tag (or genre as fallback).
// Tag-based diversity is more semantically precise than genre-based.
// ---------------------------------------------------------------------------

function applyDiversityFilter<T extends { primaryTag: string }>(
  items: T[],
  max: number,
): T[] {
  const counts = new Map<string, number>();
  const output: T[] = [];
  for (const item of items) {
    const n = counts.get(item.primaryTag) ?? 0;
    if (n < 2) {
      output.push(item);
      counts.set(item.primaryTag, n + 1);
    }
    if (output.length >= max) break;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  raw: Array<{
    result: RawgSearchResult;
    score: ContextualScore;
    reason: string;
    primaryTag: string;
  }>;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(rawgId: number, userGames: Game[]): string {
  return `${rawgId}:${profileFingerprint(userGames)}`;
}

export function clearContextualRecommendationCache(): void {
  cache.clear();
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findLibraryMatch(result: RawgSearchResult | DiscoveryCandidate['game'], userGames: Game[]): Game | undefined {
  const rawgId = 'rawgId' in result ? result.rawgId : result.id;
  const title = 'name' in result ? result.name : result.title;
  return userGames.find((game) => game.rawgId === rawgId) ??
    userGames.find((game) => !game.rawgId && normalizeTitle(game.title) === normalizeTitle(title));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchContextualRecommendations(
  game: Game,
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
): Promise<DiscoveryCandidate[]> {
  if (!game.rawgId) return [];

  const profile = buildUserProfile(userGames);
  const tasteProfile = getTasteProfileForGames(userGames);
  const key = cacheKey(game.rawgId, userGames);

  const currentGameGenres = game.genres ?? [];
  const currentTagSlugs = (game.rawgTags ?? []).map(toSlug);
  const tagFrequency = buildUserTagFrequency(userGames);

  // Specific tags are those not in the non-discriminating set — used for the
  // tag pool query so RAWG returns semantically similar games.
  const specificTagSlugs = currentTagSlugs
    .filter((slug) => isDistinctivePreferenceTag(slug) || meaningfulTagWeight(slug) >= 4)
    .sort((a, b) => (tagWeight(b) * rareTagMultiplier(b, tagFrequency)) - (tagWeight(a) * rareTagMultiplier(a, tagFrequency)))
    .slice(0, 5);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return buildCandidates(cached.raw, userGames, inboxRawgIds);
  }

  // -------------------------------------------------------------------------
  // Fetch candidate pool — all three in parallel.
  //
  //   Pool 1: RAWG /suggested — their own similarity model (rawgSuggested = 40)
  //   Pool 2: RAWG /game-series — franchise membership (franchise = 50)
  //   Pool 3: Tag pool — specific gameplay tags (tagMatch score from overlap)
  //   Pool 4: Genre pool — broad fallback when tag pool is thin
  //
  // Pools 1 + 2 fetch at the same time. Pools 3 + 4 run in a second parallel
  // batch so we don't over-fetch if primary pools are already rich.
  // -------------------------------------------------------------------------

  const [suggested, series] = await Promise.all([
    fetchSuggestedGames(game.rawgId),
    fetchGameSeries(game.rawgId),
  ]);

  const suggestedIds = new Set(suggested.map((r) => r.id));
  const seriesIds = new Set(series.map((r) => r.id));

  const [tagPool, genrePool] = await Promise.all([
    specificTagSlugs.length > 0
      ? fetchRecommendedGames({ tags: specificTagSlugs.join(','), pageSize: 20 })
      : Promise.resolve([] as RawgSearchResult[]),
    currentGameGenres.length > 0
      ? fetchRecommendedGames({
          genres: currentGameGenres.slice(0, 2).map(toSlug).join(','),
          pageSize: 15,
        })
      : profile.topGenres.length > 0
      ? fetchRecommendedGames({
          genres: profile.topGenres
            .slice(0, 2)
            .map((g) => g.slug)
            .join(','),
          pageSize: 15,
        })
      : Promise.resolve([] as RawgSearchResult[]),
  ]);

  // -------------------------------------------------------------------------
  // Merge — deduplicate, exclude the current game, cap at 35 before scoring.
  // -------------------------------------------------------------------------

  const seen = new Set<number>([game.rawgId]);
  const merged: Array<{ result: RawgSearchResult; inSeries: boolean; inSuggested: boolean }> = [];

  function addIfUnseen(result: RawgSearchResult, inSeries: boolean, inSuggested: boolean) {
    if (seen.has(result.id) || merged.length >= 35) return;
    seen.add(result.id);
    merged.push({ result, inSeries, inSuggested });
  }

  // Game-series first (franchise = highest score).
  for (const r of series) addIfUnseen(r, true, false);
  // Then suggested (but may already be in series).
  for (const r of suggested) {
    if (seriesIds.has(r.id)) {
      // Already added; update inSuggested flag.
      const existing = merged.find((m) => m.result.id === r.id);
      if (existing) existing.inSuggested = true;
    } else {
      addIfUnseen(r, false, true);
    }
  }
  // Tag pool + genre pool for breadth.
  for (const r of tagPool) addIfUnseen(r, seriesIds.has(r.id), suggestedIds.has(r.id));
  for (const r of genrePool) addIfUnseen(r, seriesIds.has(r.id), suggestedIds.has(r.id));

  if (merged.length === 0) {
    cache.set(key, { raw: [], fetchedAt: Date.now() });
    return [];
  }

  // -------------------------------------------------------------------------
  // Score → sort → diversity filter
  // -------------------------------------------------------------------------

  const scored = merged
    .map(({ result, inSeries, inSuggested }) => {
      const candidateGenres = (result.genres ?? []).map((g) => g.name);
      const candidateTagSlugs = (result.tags ?? []).map(
        (t) => t.slug ?? toSlug(t.name),
      );

      const sameFranchise = recommendationFranchiseKey(result.slug ?? result.name) != null &&
        recommendationFranchiseKey(result.slug ?? result.name) === recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
      const franchise = inSeries || sameFranchise ? 50 : 0;
      const rawgSuggested = inSuggested ? 40 : 0;
      const tagMatchResult = computeTagMatchScore(candidateTagSlugs, currentTagSlugs, tagFrequency);
      const tagMatch = tagMatchResult.score;
      const genreMatch = computeGenreMatchScore(candidateGenres, currentGameGenres);
      const profileScore = computeProfileAffinity(result, profile, tasteProfile);
      const profileAffinity = profileScore.affinity;
      const profilePenalty = profileScore.penalty;

      const score: ContextualScore = {
        franchise,
        rawgSuggested,
        tagMatch,
        genreMatch,
        profileAffinity,
        profilePenalty,
        ownershipPenalty: 0,
        total: franchise + rawgSuggested + tagMatch + genreMatch + profileAffinity + profilePenalty,
      };

      const reason = generateReason(
        result,
        score,
        game.title,
        currentTagSlugs,
        profile.topGenres.map((g) => g.name),
        profileScore.tasteLabel,
      );

      // Primary tag for diversity bucketing — first specific non-discriminating
      // tag shared with the current game, or the candidate's own first tag, or genre.
      const primaryTag =
        candidateTagSlugs.find(
          (s) => !isGenericPreferenceTag(s) && currentTagSlugs.includes(s),
        ) ??
        candidateTagSlugs.find((s) => !isGenericPreferenceTag(s)) ??
        candidateGenres[0] ??
        '';

      return { result, score, reason, primaryTag, meaningfulMatches: tagMatchResult.meaningfulMatches };
    })
    .filter((item) => item.score.franchise > 0 || item.score.rawgSuggested > 0 || item.meaningfulMatches >= 2 || item.score.tagMatch >= 18)
    .sort((a, b) => b.score.total - a.score.total);

  const diverse = applyDiversityFilter(scored, 14);

  cache.set(key, { raw: diverse, fetchedAt: Date.now() });
  return buildCandidates(diverse, userGames, inboxRawgIds);
}

// ---------------------------------------------------------------------------
// Materialise DiscoveryCandidate[] — always uses live userGames so library
// status is current even when the result came from cache.
// ---------------------------------------------------------------------------

function buildCandidates(
  raw: Array<{
    result: RawgSearchResult;
    score: ContextualScore;
    reason: string;
    primaryTag: string;
  }>,
  userGames: Game[],
  inboxRawgIds: Set<number>,
): DiscoveryCandidate[] {
  return raw
    .map(({ result, score, reason }) => {
      const game = mapRawgResult(result);
      const match = findLibraryMatch(game, userGames);
      const libraryStatus: DiscoveryCandidateStatus =
        match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
      const inboxStatus = inboxRawgIds.has(game.rawgId);

      let excluded = false;
      let exclusionReason: DiscoveryExclusionReason | null = null;
      if (match) {
        excluded = true;
        exclusionReason = match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned';
      }

      const ownershipPenalty = libraryStatus !== null ? -30 : 0;
      const total = score.total + ownershipPenalty;

      return { game, libraryStatus, inboxStatus, excluded, exclusionReason, score: total, reason };
    })
    .filter((c) => !c.excluded)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
