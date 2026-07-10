import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { buildUserProfile, profileFingerprint } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchRecommendedGames, type RecommendedGamesParams } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';
import { readAppCacheValue, writeAppCacheValue } from '../lib/indexedDbAppCache';

const CACHE_KEY = 'questshelf.releaseCalendar.v2';
const IGNORE_KEY = 'questshelf.releaseCalendarIgnoredRawgIds.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 90;
const TARGET_MIN_RECOMMENDATIONS = 8;
const TARGET_MAX_RECOMMENDATIONS = 20;
const PASS_THRESHOLDS = { strong: 18, soft: 8, general: 3 } as const;

type CacheEntry = { fingerprint: string; dateRange: string; fetchedAt: number; candidates: DiscoveryCandidate[] };

type ReleasePass = 'strong' | 'soft' | 'general';
type ScoredRelease = { result: RawgSearchResult; score: number; reason: string; pass: ReleasePass; generalFallback: boolean };

export function getUpcomingDateRange(days = DEFAULT_DAYS, now = new Date()): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return `${formatDate(start)},${formatDate(end)}`;
}

export function getIgnoredReleaseRawgIds(): Set<number> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(localStorage.getItem(IGNORE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : []);
  } catch {
    return new Set();
  }
}

export function ignoreReleaseCalendarGame(rawgId: number): void {
  if (typeof localStorage === 'undefined') return;
  const ignored = getIgnoredReleaseRawgIds();
  ignored.add(rawgId);
  localStorage.setItem(IGNORE_KEY, JSON.stringify([...ignored]));
}

export async function fetchPersonalizedReleaseCalendar(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: { days?: 30 | 60 | 90; forceRefresh?: boolean } = {},
): Promise<DiscoveryCandidate[]> {
  const days = options.days ?? DEFAULT_DAYS;
  const dateRange = getUpcomingDateRange(days);
  const fp = `${profileFingerprint(userGames)}::ignored=${[...getIgnoredReleaseRawgIds()].sort().join(',')}`;
  if (!options.forceRefresh) {
    const fresh = await readCache(fp, dateRange);
    if (fresh) return restamp(fresh.candidates.map((c) => c.game), userGames, inboxRawgIds, fresh.candidates.map((c) => c.reason), fresh.candidates.map((c) => c.score));
  }

  const profile = buildUserProfile(userGames);
  const platformSlugs = buildPlatformFilter(userGames);
  const requests: RecommendedGamesParams[] = [
    { dates: dateRange, ordering: 'released', pageSize: 40, platforms: platformSlugs },
  ];
  if (profile.topGenres.length > 0) {
    requests.push({ dates: dateRange, ordering: 'released', pageSize: 20, genres: profile.topGenres.slice(0, 3).map((g) => g.slug).join(','), platforms: platformSlugs });
  }

  const pages = await Promise.all(requests.map((params) => fetchRecommendedGames(params)));
  const deduped = dedupeRawgResults(pages.flat()).filter((result) => !isExcludedRelease(result, userGames));
  const scored = rankReleaseCalendarResults(deduped, userGames);

  const games = scored.map(({ result }) => mapRawgResult(result));
  const candidates = restamp(games, userGames, inboxRawgIds, scored.map((s) => s.reason), scored.map((s) => s.score));
  writeCache({ fingerprint: fp, dateRange, fetchedAt: Date.now(), candidates });
  return candidates;
}

export function rankReleaseCalendarResults(results: RawgSearchResult[], userGames: Game[]): ScoredRelease[] {
  const profile = buildUserProfile(userGames);
  const scored = results
    .map((result) => scoreRelease(result, userGames, profile))
    .sort((a, b) => b.score - a.score || compareReleaseDates(a.result.released, b.result.released));

  const selected: ScoredRelease[] = [];
  const used = new Set<number>();

  addDiversePass(scored, selected, used, (item) => item.pass === 'strong' && item.score >= PASS_THRESHOLDS.strong, 2);
  if (selected.length < TARGET_MIN_RECOMMENDATIONS) {
    addDiversePass(scored, selected, used, (item) => item.pass !== 'general' && item.score >= PASS_THRESHOLDS.soft, 3);
  }
  if (selected.length < TARGET_MIN_RECOMMENDATIONS) {
    addDiversePass(scored, selected, used, (item) => item.score >= PASS_THRESHOLDS.general, 4);
  }
  if (selected.length < TARGET_MIN_RECOMMENDATIONS) {
    addDiversePass(scored, selected, used, () => true, 5);
  }

  return selected
    .sort((a, b) => b.score - a.score || compareReleaseDates(a.result.released, b.result.released))
    .slice(0, TARGET_MAX_RECOMMENDATIONS);
}

function scoreRelease(result: RawgSearchResult, userGames: Game[], profile = buildUserProfile(userGames)): ScoredRelease {
  const genres = (result.genres ?? []).map((g) => g.name);
  const tags = (result.tags ?? []).map((t) => t.slug ?? t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  const platforms = (result.platforms ?? []).map((p) => p.platform.name);
  const developers = (result as RawgSearchResult & { developers?: Array<{ name: string }> }).developers?.map((d) => d.name) ?? [];
  const publishers = (result as RawgSearchResult & { publishers?: Array<{ name: string }> }).publishers?.map((p) => p.name) ?? [];
  const studios = [...developers, ...publishers];

  const genreHits = profile.topGenres.filter((g) => genres.includes(g.name));
  const tagHits = profile.topTags.filter((tag) => tags.includes(tag));
  const platformHits = profile.topPlatforms.filter((platform) => platforms.includes(platform) || (platform === 'Steam' && platforms.includes('PC')));
  const studioHits = profile.topDevelopers.filter((studio) => studios.includes(studio));
  const negativeGenreHits = profile.negativeGenres.filter((g) => genres.includes(g.name));
  const negativeTagHits = profile.negativeTags.filter((tag) => tags.includes(tag.name));
  const negativeStudioHits = profile.negativeDevelopers.filter((studio) => studios.includes(studio.name));

  let score = 0;
  // Softer release-calendar weights: a few useful matches are enough to enter the pool.
  score += genreHits.reduce((sum, g) => sum + Math.min(10, 4 + g.weight * 1.4), 0);
  score += Math.min(16, tagHits.length * 4);
  score += Math.min(14, platformHits.length * 4);
  score += Math.min(12, studioHits.length * 6);
  if (hasHighlyRatedLibraryNeighbor(userGames, genres, tags, studios)) score += 8;
  if (hasWishlistOrPlannedNeighbor(userGames, genres, tags, platforms)) score += 7;
  if (typeof result.metacritic === 'number' && result.metacritic >= 75) score += 5;
  if (typeof result.rating === 'number' && result.rating >= 4) score += 4;
  if (typeof result.ratings_count === 'number' && result.ratings_count >= 500) score += 3;
  // Negative taste signals are deliberately light for upcoming games; only explicit dropped/ignored titles are excluded.
  score -= Math.min(10, negativeGenreHits.reduce((sum, g) => sum + g.weight * 1.5, 0));
  score -= Math.min(6, negativeTagHits.reduce((sum, t) => sum + t.weight, 0));
  score -= Math.min(6, negativeStudioHits.reduce((sum, t) => sum + t.weight, 0));

  const roundedScore = Math.round(score);
  const pass: ReleasePass = (genreHits.length > 0 && (tagHits.length > 0 || studioHits.length > 0 || hasHighlyRatedLibraryNeighbor(userGames, genres, tags, studios) || hasWishlistOrPlannedNeighbor(userGames, genres, tags, platforms)))
    ? 'strong'
    : (genreHits.length > 0 || platformHits.length > 0 ? 'soft' : 'general');
  const generalFallback = pass === 'general' || roundedScore < PASS_THRESHOLDS.soft;
  const sample = userGames.find((game) => game.rating && game.rating >= 4 && game.genres?.some((genre) => genres.includes(genre)))
    ?? userGames.find((game) => (game.collectionType === 'wishlist' || game.status === 'Want to play') && game.genres?.some((genre) => genres.includes(genre)))
    ?? userGames.find((game) => game.status === 'Playing' && game.genres?.some((genre) => genres.includes(genre)));
  const reason = sample
    ? `Because you liked ${sample.title}`
    : studioHits[0]
      ? `From a creator you follow: ${studioHits[0]}`
      : genreHits[0]
        ? `Matches your ${genreHits[0].name} plans`
        : platformHits[0]
          ? `General pick for ${platformHits[0]}`
          : 'General upcoming pick';
  return { result, score: roundedScore, reason, pass, generalFallback };
}

function addDiversePass(
  scored: ScoredRelease[],
  selected: ScoredRelease[],
  used: Set<number>,
  predicate: (item: ScoredRelease) => boolean,
  maxPerBucket: number,
): void {
  const genreCounts = new Map<string, number>();
  const franchiseCounts = new Map<string, number>();
  for (const item of selected) {
    genreCounts.set(primaryGenre(item.result), (genreCounts.get(primaryGenre(item.result)) ?? 0) + 1);
    franchiseCounts.set(franchiseKey(item.result), (franchiseCounts.get(franchiseKey(item.result)) ?? 0) + 1);
  }
  for (const item of scored) {
    if (selected.length >= TARGET_MAX_RECOMMENDATIONS) return;
    if (used.has(item.result.id) || !predicate(item)) continue;
    const genre = primaryGenre(item.result);
    const franchise = franchiseKey(item.result);
    if ((genreCounts.get(genre) ?? 0) >= maxPerBucket) continue;
    if ((franchiseCounts.get(franchise) ?? 0) >= 2) continue;
    selected.push(item);
    used.add(item.result.id);
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    franchiseCounts.set(franchise, (franchiseCounts.get(franchise) ?? 0) + 1);
  }
}

function hasHighlyRatedLibraryNeighbor(userGames: Game[], genres: string[], tags: string[], studios: string[]): boolean {
  return userGames.some((game) => game.collectionType === 'library' && (game.rating ?? 0) >= 4 && overlaps(game, genres, tags, studios));
}

function hasWishlistOrPlannedNeighbor(userGames: Game[], genres: string[], tags: string[], platforms: string[]): boolean {
  return userGames.some((game) => (game.collectionType === 'wishlist' || game.status === 'Want to play') && (overlaps(game, genres, tags, []) || platforms.includes(game.platform) || (game.platform === 'Steam' && platforms.includes('PC'))));
}

function overlaps(game: Game, genres: string[], tags: string[], studios: string[]): boolean {
  return (game.genres ?? []).some((genre) => genres.includes(genre))
    || (game.rawgTags ?? []).some((tag) => tags.includes(tag))
    || (game.developers ?? []).some((developer) => studios.includes(developer))
    || (game.publishers ?? []).some((publisher) => studios.includes(publisher));
}

function isExcludedRelease(result: RawgSearchResult, userGames: Game[]): boolean {
  const ignored = getIgnoredReleaseRawgIds();
  if (ignored.has(result.id)) return true;
  return userGames.some((game) => game.rawgId === result.id);
}

function primaryGenre(result: RawgSearchResult): string {
  return result.genres?.[0]?.name ?? 'unknown';
}

function franchiseKey(result: RawgSearchResult): string {
  const slug = result.slug ?? result.name.toLowerCase();
  const cleaned = slug.replace(/\b(\d+|ii|iii|iv|v|vi|vii|remake|remaster|deluxe|ultimate|edition)\b/gi, '').replace(/[:-]/g, ' ').trim();
  return cleaned.split(/\s+/).slice(0, 2).join(' ') || slug;
}

function restamp(games: DiscoveryGame[], userGames: Game[], inboxRawgIds: Set<number>, reasons: (string | undefined)[] = [], scores: number[] = []): DiscoveryCandidate[] {
  const ignored = getIgnoredReleaseRawgIds();
  return games.map((game, i): DiscoveryCandidate | null => {
    const match = userGames.find((g) => g.rawgId === game.rawgId);
    if (match || ignored.has(game.rawgId)) return null;
    return { game, libraryStatus: null, inboxStatus: inboxRawgIds.has(game.rawgId), excluded: false, exclusionReason: null, score: scores[i] ?? 0, reason: reasons[i] };
  }).filter((candidate): candidate is DiscoveryCandidate => Boolean(candidate));
}

function buildPlatformFilter(games: Game[]): string | undefined {
  const slugs = new Set<string>();
  for (const game of games) {
    if (game.platform === 'Steam' || game.platform === 'PC') slugs.add('4');
    if (/switch/i.test(game.platform)) slugs.add('7');
    if (/playstation|ps5/i.test(game.platform)) slugs.add('187');
    if (/xbox/i.test(game.platform)) slugs.add('186');
  }
  return slugs.size ? [...slugs].slice(0, 4).join(',') : undefined;
}

function dedupeRawgResults(results: RawgSearchResult[]): RawgSearchResult[] {
  const seen = new Set<number>();
  return results.filter((result) => (seen.has(result.id) ? false : (seen.add(result.id), true)));
}

function compareReleaseDates(a: string | null, b: string | null): number {
  return (a ?? '9999-12-31').localeCompare(b ?? '9999-12-31');
}

async function readCache(fingerprint: string, dateRange: string): Promise<CacheEntry | null> {
  const entry = await readAppCacheValue<CacheEntry>(CACHE_KEY);
  if (!entry || entry.fingerprint !== fingerprint || entry.dateRange !== dateRange || Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;
  return entry;
}

function writeCache(entry: CacheEntry): void {
  void writeAppCacheValue(CACHE_KEY, entry);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
