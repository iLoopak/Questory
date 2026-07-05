import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryExclusionReason } from '../lib/discovery';
import type { UserProfile } from '../lib/userProfile';
import type { RawgSearchResult } from '../types/rawg';
import { buildUserProfile, profileFingerprint } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchRecommendedGames } from './rawgApi';

// ---------------------------------------------------------------------------
// Recommendation scoring
// ---------------------------------------------------------------------------

export interface RecommendationScore {
  genreMatch: number;      // 0–50: weighted overlap with user's top genres
  metacriticMatch: number; // 0–10: closeness to user's avg MC
  ownershipPenalty: number; // 0 or -30: already owned/wishlisted
  total: number;
}

function scoreCandidate(
  result: RawgSearchResult,
  profile: UserProfile,
): RecommendationScore {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Genre match: each matching profile genre contributes weight-proportionally.
  let genreMatch = 0;
  const totalProfileWeight = profile.topGenres.reduce((s, g) => s + g.weight, 0) || 1;
  for (const pg of profile.topGenres) {
    if (candidateGenres.includes(pg.name)) {
      // Contribution proportional to how dominant this genre is in the profile.
      genreMatch += (pg.weight / totalProfileWeight) * 50;
    }
  }
  genreMatch = Math.round(Math.min(50, genreMatch));

  // Metacritic match: reward games near the user's average.
  let metacriticMatch = 0;
  if (result.metacritic && profile.avgMetacritic) {
    const diff = Math.abs(result.metacritic - profile.avgMetacritic);
    metacriticMatch = Math.round(Math.max(0, 10 - diff / 5));
  }

  const total = genreMatch + metacriticMatch;
  return { genreMatch, metacriticMatch, ownershipPenalty: 0, total };
}

// ---------------------------------------------------------------------------
// Reason text generation
// ---------------------------------------------------------------------------

function generateReason(
  result: RawgSearchResult,
  score: RecommendationScore,
  profile: UserProfile,
): string {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);

  // Find the matched genres between candidate and profile top-3.
  const matched = profile.topGenres
    .slice(0, 3)
    .map((pg) => pg.name)
    .filter((name) => candidateGenres.includes(name));

  if (matched.length >= 2) {
    return `Matches your taste for ${matched[0]} & ${matched[1]}`;
  }
  if (matched.length === 1) {
    return `Based on your ${matched[0]} history`;
  }
  if (score.metacriticMatch >= 8 && result.metacritic) {
    return `Critically acclaimed in your preferred range`;
  }
  if (candidateGenres.length > 0) {
    return `May fit your gaming taste`;
  }
  return `Based on your gaming history`;
}

// ---------------------------------------------------------------------------
// Diversity filter — max 2 games per primary genre to avoid genre flooding.
// ---------------------------------------------------------------------------

function applyDiversityFilter(
  scored: Array<{ result: RawgSearchResult; score: RecommendationScore; reason: string }>,
  max: number,
): typeof scored {
  const genreCounts = new Map<string, number>();
  const output: typeof scored = [];

  for (const item of scored) {
    const primaryGenre = item.result.genres?.[0]?.name ?? '';
    const count = genreCounts.get(primaryGenre) ?? 0;
    if (count < 2) {
      output.push(item);
      genreCounts.set(primaryGenre, count + 1);
    }
    if (output.length >= max) break;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Cache — keyed by profile fingerprint. Invalidated when the profile changes.
// ---------------------------------------------------------------------------

interface CacheEntry {
  candidates: DiscoveryCandidate[];
  fingerprint: string;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 20 * 60 * 1000;

export async function fetchPersonalRecommendations(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
): Promise<DiscoveryCandidate[]> {
  const profile = buildUserProfile(userGames);
  const fp = profileFingerprint(userGames);

  // Return cached result if fingerprint and TTL are still valid.
  if (cache && cache.fingerprint === fp && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    // Re-apply library/inbox status from current state (may have changed without profile change).
    return applyLibraryStatus(cache.candidates.map((c) => c.game), userGames, undefined, inboxRawgIds);
  }

  if (profile.topGenres.length === 0) return [];

  // Build RAWG query from top 3 genres.
  const genreSlugs = profile.topGenres
    .slice(0, 3)
    .map((g) => g.slug)
    .join(',');

  // Only apply metacritic filter when the user has a clear preference (avg > 70).
  const metacriticMin =
    profile.avgMetacritic != null && profile.avgMetacritic >= 70
      ? Math.max(60, profile.avgMetacritic - 15)
      : undefined;

  const rawResults = await fetchRecommendedGames({
    genres: genreSlugs,
    metacriticMin,
    pageSize: 24,
  });

  if (rawResults.length === 0) {
    cache = { candidates: [], fingerprint: fp, fetchedAt: Date.now() };
    return [];
  }

  // Score and sort.
  const scored = rawResults
    .map((result) => {
      const score = scoreCandidate(result, profile);
      const reason = generateReason(result, score, profile);
      return { result, score, reason };
    })
    .sort((a, b) => b.score.total - a.score.total);

  // Diversity + cap.
  const diverse = applyDiversityFilter(scored, 12); // over-fetch to leave room after library filter

  // Map to DiscoveryGame.
  const games = diverse.map(({ result }) => mapRawgResult(result));

  // Build candidates with library+inbox status.
  const candidates = applyLibraryStatus(games, userGames, diverse.map(({ reason }) => reason), inboxRawgIds);

  // Filter and cap at 6.
  const visible = candidates.filter((c) => !c.excluded).slice(0, 6);

  cache = { candidates: visible, fingerprint: fp, fetchedAt: Date.now() };
  return visible;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyLibraryStatus(
  games: DiscoveryCandidate['game'][],
  userGames: Game[],
  reasons?: string[],
  inboxRawgIds: Set<number> = new Set(),
): DiscoveryCandidate[] {
  return games.map((game, i) => {
    const match = userGames.find((g) => g.rawgId === game.rawgId);
    const libraryStatus =
      match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
    const inboxStatus = inboxRawgIds.has(game.rawgId);

    let excluded = false;
    let exclusionReason: DiscoveryExclusionReason | null = null;

    if (match?.status === 'Finished') {
      excluded = true;
      exclusionReason = 'finished';
    }

    const score = libraryStatus === null ? 0 : -1;

    return {
      game,
      libraryStatus,
      inboxStatus,
      excluded,
      exclusionReason,
      score,
      reason: reasons?.[i],
    };
  });
}
