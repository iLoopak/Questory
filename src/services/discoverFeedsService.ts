import { fetchRecommendedGames, type RecommendedGamesParams } from './rawgApi';
import { mapRawgResult, buildDiscoveryCandidates } from './discoveryService';
import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';

const CACHE_TTL_MS = 15 * 60 * 1000;

interface FeedCacheEntry {
  games: DiscoveryGame[];
  fetchedAt: number;
}

/**
 * AS-10: refresh a feed's cache, but only from a provider that actually answered.
 *
 * These feeds used to cache whatever `fetchRecommendedGames` returned — including the `[]` it
 * produced from a 401 or an offline device — so one failed request emptied a Discover row for the
 * next 15 minutes. A failure now leaves the previous entry alone (stale data beats a lie), and only
 * a success, empty or not, is written.
 */
async function refreshFeed(
  entry: FeedCacheEntry | null,
  params: RecommendedGamesParams,
): Promise<FeedCacheEntry | null> {
  const result = await fetchRecommendedGames(params);
  if (!result.ok) return entry;

  return { games: result.data.map(mapRawgResult), fetchedAt: Date.now() };
}

// ── Trending ────────────────────────────────────────────────────────────────
// Recently added to RAWG with solid Metacritic scores — a proxy for currently
// popular titles without needing a real-time popularity signal.

let trendingCache: FeedCacheEntry | null = null;

export async function fetchTrendingGames(
  userGames: Game[],
  inboxRawgIds: Set<number>,
): Promise<DiscoveryCandidate[]> {
  if (!trendingCache || Date.now() - trendingCache.fetchedAt > CACHE_TTL_MS) {
    trendingCache = await refreshFeed(trendingCache, {
      ordering: '-added',
      metacriticMin: 70,
      pageSize: 40,
    });
  }
  return applyStatus(trendingCache?.games ?? [], userGames, inboxRawgIds);
}

// ── Hidden Gems ─────────────────────────────────────────────────────────────
// Well-reviewed indie games that sit below the blockbuster tier — the
// Metacritic ceiling filters out major releases, leaving overlooked gems.

let hiddenGemsCache: FeedCacheEntry | null = null;

export async function fetchHiddenGems(
  userGames: Game[],
  inboxRawgIds: Set<number>,
): Promise<DiscoveryCandidate[]> {
  if (!hiddenGemsCache || Date.now() - hiddenGemsCache.fetchedAt > CACHE_TTL_MS) {
    hiddenGemsCache = await refreshFeed(hiddenGemsCache, {
      ordering: '-rating',
      tags: 'indie',
      metacriticMin: 65,
      metacriticMax: 84,
      pageSize: 40,
    });
  }
  return applyStatus(hiddenGemsCache?.games ?? [], userGames, inboxRawgIds);
}

// ── Recently Released ───────────────────────────────────────────────────────
// Scored games released in the last 90 days, newest first.

let recentlyReleasedCache: FeedCacheEntry | null = null;
let recentlyReleasedDateRange: string | null = null;

export async function fetchRecentlyReleasedGames(
  userGames: Game[],
  inboxRawgIds: Set<number>,
): Promise<DiscoveryCandidate[]> {
  const dateRange = getRecentDateRange(90);
  if (
    !recentlyReleasedCache ||
    recentlyReleasedDateRange !== dateRange ||
    Date.now() - recentlyReleasedCache.fetchedAt > CACHE_TTL_MS
  ) {
    const refreshed = await refreshFeed(recentlyReleasedDateRange === dateRange ? recentlyReleasedCache : null, {
      ordering: '-released',
      dates: dateRange,
      metacriticMin: 60,
      pageSize: 40,
    });
    if (refreshed) {
      recentlyReleasedCache = refreshed;
      recentlyReleasedDateRange = dateRange;
    }
  }
  return applyStatus(recentlyReleasedDateRange === dateRange ? recentlyReleasedCache?.games ?? [] : [], userGames, inboxRawgIds);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function applyStatus(
  games: DiscoveryGame[],
  userGames: Game[],
  inboxRawgIds: Set<number>,
): DiscoveryCandidate[] {
  const candidates = buildDiscoveryCandidates(games, userGames);
  return candidates.map((c) => ({ ...c, inboxStatus: inboxRawgIds.has(c.game.rawgId) }));
}

function getRecentDateRange(daysAgo: number): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  return `${formatDate(start)},${formatDate(end)}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
