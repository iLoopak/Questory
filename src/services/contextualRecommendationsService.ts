import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryCandidateStatus, DiscoveryExclusionReason } from '../lib/discovery';
import { buildUserProfile, profileFingerprint, toSlug } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchSuggestedGames, fetchGameSeries, fetchRecommendedGames } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ContextualScore {
  /** 0–40: appears in RAWG /suggested (40) or /game-series (30) */
  rawgSimilarity: number;
  /** 0–30: shared genres with the currently viewed game */
  genreMatch: number;
  /** 0–20: matches user's top profile genres (weighted) */
  profileAffinity: number;
  /** 0 or −30: already in library or wishlist */
  ownershipPenalty: number;
  total: number;
}

function scoreCandidate(
  result: RawgSearchResult,
  rawgSimilarity: number,
  currentGameGenres: string[],
  profileGenres: Array<{ name: string; weight: number }>,
): ContextualScore {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Genre overlap with the currently viewed game.
  let genreMatch = 0;
  for (const g of currentGameGenres) {
    if (candidateGenres.includes(g)) genreMatch += 15;
  }
  genreMatch = Math.min(30, genreMatch);

  // Profile affinity: how well candidate genres align with user's taste.
  const totalProfileWeight = profileGenres.reduce((s, g) => s + g.weight, 0) || 1;
  let profileAffinity = 0;
  for (const pg of profileGenres) {
    if (candidateGenres.includes(pg.name)) {
      profileAffinity += (pg.weight / totalProfileWeight) * 20;
    }
  }
  profileAffinity = Math.round(Math.min(20, profileAffinity));

  const total = rawgSimilarity + genreMatch + profileAffinity;
  return { rawgSimilarity, genreMatch, profileAffinity, ownershipPenalty: 0, total };
}

// ---------------------------------------------------------------------------
// Reason text
// ---------------------------------------------------------------------------

function generateReason(
  result: RawgSearchResult,
  score: ContextualScore,
  currentGameTitle: string,
  currentGameGenres: string[],
  profileGenreNames: string[],
): string {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Genres the candidate shares with the current game.
  const sharedWithGame = currentGameGenres.filter((g) => candidateGenres.includes(g));
  // Genres the candidate shares with the user's top profile genres.
  const sharedWithProfile = profileGenreNames.slice(0, 3).filter((g) => candidateGenres.includes(g));

  if (score.rawgSimilarity >= 30 && sharedWithProfile.length > 0) {
    return `Similar to ${currentGameTitle} and fits your ${sharedWithProfile[0]} history`;
  }
  if (score.rawgSimilarity >= 30) {
    return `Similar to ${currentGameTitle}`;
  }
  if (sharedWithGame.length >= 2 && score.profileAffinity >= 10) {
    return `Shares ${sharedWithGame[0]} & ${sharedWithGame[1]} with ${currentGameTitle}`;
  }
  if (sharedWithGame.length >= 1 && score.profileAffinity >= 10) {
    return `Shares ${sharedWithGame[0]} with ${currentGameTitle} and fits your taste`;
  }
  if (sharedWithGame.length >= 2) {
    return `Shares ${sharedWithGame[0]} & ${sharedWithGame[1]} with ${currentGameTitle}`;
  }
  if (sharedWithGame.length === 1) {
    return `Shares ${sharedWithGame[0]} with ${currentGameTitle}`;
  }
  if (score.profileAffinity >= 12 && sharedWithProfile.length > 0) {
    return `Matches your ${sharedWithProfile[0]} history`;
  }
  return `May complement ${currentGameTitle}`;
}

// ---------------------------------------------------------------------------
// Diversity — max 2 games per primary genre to prevent genre flooding.
// ---------------------------------------------------------------------------

function applyDiversityFilter<T extends { result: RawgSearchResult }>(
  items: T[],
  max: number,
): T[] {
  const counts = new Map<string, number>();
  const output: T[] = [];
  for (const item of items) {
    const genre = item.result.genres?.[0]?.name ?? '';
    const n = counts.get(genre) ?? 0;
    if (n < 2) {
      output.push(item);
      counts.set(genre, n + 1);
    }
    if (output.length >= max) break;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Cache — Map keyed by `${rawgId}:${profileFingerprint}` so each game+profile
// combination is cached independently. TTL 15 minutes.
// ---------------------------------------------------------------------------

interface CacheEntry {
  raw: Array<{ result: RawgSearchResult; score: ContextualScore; reason: string }>;
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
): Promise<DiscoveryCandidate[]> {
  if (!game.rawgId) return [];

  const profile = buildUserProfile(userGames);
  const key = cacheKey(game.rawgId, userGames);
  const currentGameGenres = game.genres ?? [];
  const profileGenreNames = profile.topGenres.map((g) => g.name);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return buildCandidates(cached.raw, userGames);
  }

  // -------------------------------------------------------------------------
  // Fetch candidate pool
  // Primary: RAWG suggested + game-series (strong similarity signals)
  // Secondary: genre-filtered pool (broadens when primary is thin)
  // -------------------------------------------------------------------------

  const [suggested, series] = await Promise.all([
    fetchSuggestedGames(game.rawgId),
    fetchGameSeries(game.rawgId),
  ]);

  const suggestedIds = new Set(suggested.map((r) => r.id));
  const seriesIds = new Set(series.map((r) => r.id));

  // Fetch genre-broadened pool only when the current game has genre metadata.
  let genrePool: RawgSearchResult[] = [];
  if (currentGameGenres.length > 0) {
    const genreSlugs = currentGameGenres.slice(0, 2).map(toSlug).join(',');
    genrePool = await fetchRecommendedGames({ genres: genreSlugs, pageSize: 20 });
  } else if (profile.topGenres.length > 0) {
    // Fall back to profile genres if current game has no metadata.
    const genreSlugs = profile.topGenres.slice(0, 2).map((g) => g.slug).join(',');
    genrePool = await fetchRecommendedGames({ genres: genreSlugs, pageSize: 20 });
  }

  // Merge — exclude the current game, deduplicate, cap pool at 30.
  const seen = new Set<number>([game.rawgId]);
  const merged: Array<{ result: RawgSearchResult; rawgSim: number }> = [];

  function addMerged(result: RawgSearchResult, sim: number) {
    if (!seen.has(result.id) && merged.length < 30) {
      seen.add(result.id);
      merged.push({ result, rawgSim: sim });
    }
  }

  for (const r of suggested) addMerged(r, 40);
  for (const r of series) {
    // A game can appear in both suggested and series; keep the higher signal (40).
    if (!suggestedIds.has(r.id)) addMerged(r, 30);
  }
  for (const r of genrePool) {
    addMerged(r, suggestedIds.has(r.id) ? 40 : seriesIds.has(r.id) ? 30 : 0);
  }

  if (merged.length === 0) {
    cache.set(key, { raw: [], fetchedAt: Date.now() });
    return [];
  }

  // -------------------------------------------------------------------------
  // Score + sort
  // -------------------------------------------------------------------------

  const scored = merged
    .map(({ result, rawgSim }) => {
      const score = scoreCandidate(result, rawgSim, currentGameGenres, profile.topGenres);
      const reason = generateReason(result, score, game.title, currentGameGenres, profileGenreNames);
      return { result, score, reason };
    })
    .sort((a, b) => b.score.total - a.score.total);

  // Diversity filter and over-fetch so filtering owned games still leaves 6.
  const diverse = applyDiversityFilter(scored, 14);

  cache.set(key, { raw: diverse, fetchedAt: Date.now() });
  return buildCandidates(diverse, userGames);
}

// ---------------------------------------------------------------------------
// Build DiscoveryCandidate[] from scored results + live library state.
// Called both after a fresh fetch and on cache hits (library may have changed).
// ---------------------------------------------------------------------------

function buildCandidates(
  raw: Array<{ result: RawgSearchResult; score: ContextualScore; reason: string }>,
  userGames: Game[],
): DiscoveryCandidate[] {
  return raw
    .map(({ result, score, reason }) => {
      const game = mapRawgResult(result);
      const match = userGames.find((g) => g.rawgId === game.rawgId);
      const libraryStatus: DiscoveryCandidateStatus =
        match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';

      let excluded = false;
      let exclusionReason: DiscoveryExclusionReason | null = null;
      if (match?.status === 'Finished') {
        excluded = true;
        exclusionReason = 'finished';
      }

      // Ownership penalty shifts owned/wishlisted games below unknowns.
      const ownershipPenalty = libraryStatus !== null ? -30 : 0;
      const total = score.total + ownershipPenalty;

      return {
        game,
        libraryStatus,
        excluded,
        exclusionReason,
        score: total,
        reason,
      };
    })
    .filter((c) => !c.excluded)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
