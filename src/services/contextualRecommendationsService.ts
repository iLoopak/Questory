import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryCandidateStatus, DiscoveryExclusionReason } from '../lib/discovery';
import { buildUserProfile, profileFingerprint, toSlug } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchSuggestedGames, fetchGameSeries, fetchRecommendedGames } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';

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
  ownershipPenalty: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Tags that are too common to meaningfully distinguish similar games.
// Matches on these tags are excluded from the scoring calculation.
// ---------------------------------------------------------------------------

const NON_DISCRIMINATING_TAGS = new Set([
  'singleplayer',
  'multiplayer',
  'co-op',
  'online-co-op',
  'local-co-op',
  'great-soundtrack',
  'atmospheric',
  'story-rich',
  'dark',
  'violent',
  'exploration',
  'steam-achievements',
  'full-controller-support',
  'partial-controller-support',
  'steam-cloud',
  'controller',
  'linux',
  'macos',
  'windows',
  'difficult',
  'relaxing',
  'colorful',
  'cute',
  'funny',
  'casual',
]);

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computeTagMatchScore(
  candidateTagSlugs: string[],
  currentGameTagSlugs: string[],
): number {
  const specificMatches = candidateTagSlugs.filter(
    (slug) => !NON_DISCRIMINATING_TAGS.has(slug) && currentGameTagSlugs.includes(slug),
  ).length;
  // Each specific match: +8 pts, capped at 40.
  return Math.min(40, specificMatches * 8);
}

function computeGenreMatchScore(
  candidateGenres: string[],
  currentGameGenres: string[],
): number {
  const matches = candidateGenres.filter((g) => currentGameGenres.includes(g)).length;
  return Math.min(15, matches * 7);
}

function computeProfileAffinity(
  candidateGenres: string[],
  profileGenres: Array<{ name: string; weight: number }>,
): number {
  const totalWeight = profileGenres.reduce((s, g) => s + g.weight, 0) || 1;
  let affinity = 0;
  for (const pg of profileGenres) {
    if (candidateGenres.includes(pg.name)) {
      affinity += (pg.weight / totalWeight) * 20;
    }
  }
  return Math.round(Math.min(20, affinity));
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
): string {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Collect the display names of specifically matched tags (non-generic, ordered by RAWG weight).
  const matchedTagNames = (result.tags ?? [])
    .filter((t) => {
      const slug = t.slug ?? toSlug(t.name);
      return !NON_DISCRIMINATING_TAGS.has(slug) && currentTagSlugs.includes(slug);
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
  const key = cacheKey(game.rawgId, userGames);

  const currentGameGenres = game.genres ?? [];
  const currentTagSlugs = (game.rawgTags ?? []).map(toSlug);

  // Specific tags are those not in the non-discriminating set — used for the
  // tag pool query so RAWG returns semantically similar games.
  const specificTagSlugs = currentTagSlugs
    .filter((slug) => !NON_DISCRIMINATING_TAGS.has(slug))
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

      const franchise = inSeries ? 50 : 0;
      const rawgSuggested = inSuggested ? 40 : 0;
      const tagMatch = computeTagMatchScore(candidateTagSlugs, currentTagSlugs);
      const genreMatch = computeGenreMatchScore(candidateGenres, currentGameGenres);
      const profileAffinity = computeProfileAffinity(candidateGenres, profile.topGenres);

      const score: ContextualScore = {
        franchise,
        rawgSuggested,
        tagMatch,
        genreMatch,
        profileAffinity,
        ownershipPenalty: 0,
        total: franchise + rawgSuggested + tagMatch + genreMatch + profileAffinity,
      };

      const reason = generateReason(
        result,
        score,
        game.title,
        currentTagSlugs,
        profile.topGenres.map((g) => g.name),
      );

      // Primary tag for diversity bucketing — first specific non-discriminating
      // tag shared with the current game, or the candidate's own first tag, or genre.
      const primaryTag =
        candidateTagSlugs.find(
          (s) => !NON_DISCRIMINATING_TAGS.has(s) && currentTagSlugs.includes(s),
        ) ??
        candidateTagSlugs.find((s) => !NON_DISCRIMINATING_TAGS.has(s)) ??
        candidateGenres[0] ??
        '';

      return { result, score, reason, primaryTag };
    })
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
      const match = userGames.find((g) => g.rawgId === game.rawgId);
      const libraryStatus: DiscoveryCandidateStatus =
        match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
      const inboxStatus = inboxRawgIds.has(game.rawgId);

      let excluded = false;
      let exclusionReason: DiscoveryExclusionReason | null = null;
      if (match?.status === 'Finished') {
        excluded = true;
        exclusionReason = 'finished';
      }

      const ownershipPenalty = libraryStatus !== null ? -30 : 0;
      const total = score.total + ownershipPenalty;

      return { game, libraryStatus, inboxStatus, excluded, exclusionReason, score: total, reason };
    })
    .filter((c) => !c.excluded)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
