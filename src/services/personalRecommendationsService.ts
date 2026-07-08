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
  genreMatch: number;      // 0–50: weighted overlap with user's liked genres
  tagMatch: number;        // 0–30: weighted overlap with user's liked RAWG tags
  developerMatch: number;  // 0–15: weighted overlap with liked developers when present
  platformMatch: number;   // 0–10: platform-plan/library platform affinity
  negativeMatch: number;   // penalty from low-rated/dropped signals
  metacriticMatch: number; // 0–10: closeness to user's avg MC
  ownershipPenalty: number; // 0 or negative: already owned/wishlisted
  total: number;
}

export function scorePersonalRecommendationCandidate(
  result: RawgSearchResult,
  profile: UserProfile,
): RecommendationScore {
  const candidateGenres = (result.genres ?? []).map((g) => g.name);
  const candidateTags = (result.tags ?? []).map((t) => t.slug ?? t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  const candidateDevelopers = (result as RawgSearchResult & { developers?: Array<{ name: string }> }).developers?.map((d) => d.name) ?? [];
  const candidatePlatforms = (result.platforms ?? []).map((p) => p.platform.name);

  const totalGenreWeight = profile.topGenres.reduce((s, g) => s + g.weight, 0) || 1;
  const genreMatch = Math.round(Math.min(50, profile.topGenres.reduce((sum, pg) => (
    candidateGenres.includes(pg.name) ? sum + (pg.weight / totalGenreWeight) * 50 : sum
  ), 0)));

  const tagMatch = Math.min(30, profile.topTags.filter((tag) => candidateTags.includes(tag)).length * 6);
  const developerMatch = Math.min(15, profile.topDevelopers.filter((dev) => candidateDevelopers.includes(dev)).length * 8);
  const platformMatch = Math.min(10, profile.topPlatforms.filter((platform) => candidatePlatforms.includes(platform) || candidatePlatforms.includes(platform === 'Steam' ? 'PC' : platform)).length * 5);

  const negativeGenre = profile.negativeGenres.filter((ng) => candidateGenres.includes(ng.name)).reduce((sum, ng) => sum + ng.weight * 5, 0);
  const negativeTag = profile.negativeTags.filter((nt) => candidateTags.includes(nt.name)).reduce((sum, nt) => sum + nt.weight * 3, 0);
  const negativeDeveloper = profile.negativeDevelopers.filter((nd) => candidateDevelopers.includes(nd.name)).reduce((sum, nd) => sum + nd.weight * 4, 0);
  const negativePlatform = profile.negativePlatforms.filter((np) => candidatePlatforms.includes(np.name)).reduce((sum, np) => sum + np.weight * 2, 0);
  const negativeMatch = -Math.round(Math.min(45, negativeGenre + negativeTag + negativeDeveloper + negativePlatform));

  let metacriticMatch = 0;
  if (result.metacritic && profile.avgMetacritic) {
    const diff = Math.abs(result.metacritic - profile.avgMetacritic);
    metacriticMatch = Math.round(Math.max(0, 10 - diff / 5));
  }

  const total = genreMatch + tagMatch + developerMatch + platformMatch + negativeMatch + metacriticMatch;
  return { genreMatch, tagMatch, developerMatch, platformMatch, negativeMatch, metacriticMatch, ownershipPenalty: 0, total };
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
  if (score.negativeMatch < 0) {
    return `Balanced against games you rated lower or dropped`;
  }
  if (score.tagMatch > 0 && profile.topTags.length > 0) {
    return `Similar to tags from games you liked`;
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
    if (count < 3) {
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
const CACHE_STORAGE_KEY = 'questshelf.personalRecommendations.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readStoredCache(): CacheEntry | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (!Array.isArray(parsed.candidates) || typeof parsed.fingerprint !== 'string' || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return { candidates: parsed.candidates as DiscoveryCandidate[], fingerprint: parsed.fingerprint, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeStoredCache(entry: CacheEntry): void {
  cache = entry;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // In-memory cache still keeps the current session fast if persistent storage is unavailable.
  }
}

function getFreshCacheEntry(fingerprint: string): CacheEntry | null {
  const entry = cache?.fingerprint === fingerprint ? cache : readStoredCache();
  if (!entry || entry.fingerprint !== fingerprint) return null;
  if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;
  cache = entry;
  return entry;
}

export async function fetchPersonalRecommendations(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
): Promise<DiscoveryCandidate[]> {
  const profile = buildUserProfile(userGames);
  const fp = profileFingerprint(userGames);

  // Return cached result if fingerprint and daily TTL are still valid.
  const freshCache = getFreshCacheEntry(fp);
  if (freshCache) {
    // Re-apply library/inbox status from current state (may have changed without profile change).
    // Preserve original reason strings from the cached pool.
    return applyLibraryStatus(
      freshCache.candidates.map((c) => c.game),
      userGames,
      freshCache.candidates.map((c) => c.reason),
      inboxRawgIds,
    );
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
    pageSize: 40,
  });

  if (rawResults.length === 0) {
    writeStoredCache({ candidates: [], fingerprint: fp, fetchedAt: Date.now() });
    return [];
  }

  // Score and sort.
  const scored = rawResults
    .map((result) => {
      const score = scorePersonalRecommendationCandidate(result, profile);
      const reason = generateReason(result, score, profile);
      return { result, score, reason };
    })
    .sort((a, b) => b.score.total - a.score.total);

  // Diversity filter — allow up to 3 per primary genre so the pool stays wide
  // enough that ownership filtering (library/wishlist) leaves plenty visible.
  const diverse = applyDiversityFilter(scored, 30);

  // Map to DiscoveryGame.
  const games = diverse.map(({ result }) => mapRawgResult(result));

  // Build candidates with library+inbox status.
  const candidates = applyLibraryStatus(games, userGames, diverse.map(({ reason }) => reason), inboxRawgIds);

  // Cache the full non-excluded pool — no hard cap. The consumer filters
  // library/wishlist games so the pool drains gracefully as the user adds games.
  const pool = candidates.filter((c) => !c.excluded);

  writeStoredCache({ candidates: pool, fingerprint: fp, fetchedAt: Date.now() });
  return pool;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyLibraryStatus(
  games: DiscoveryCandidate['game'][],
  userGames: Game[],
  reasons?: (string | undefined)[],
  inboxRawgIds: Set<number> = new Set(),
): DiscoveryCandidate[] {
  return games.map((game, i) => {
    const match = userGames.find((g) => g.rawgId === game.rawgId);
    const libraryStatus =
      match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';
    const inboxStatus = inboxRawgIds.has(game.rawgId);

    let excluded = false;
    let exclusionReason: DiscoveryExclusionReason | null = null;

    if (match) {
      excluded = true;
      exclusionReason = match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned';
    }

    const score = libraryStatus === null ? 0 : -30;

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
