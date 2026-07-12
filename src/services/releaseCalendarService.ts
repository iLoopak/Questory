import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { buildUserProfile, profileFingerprint, recommendationFranchiseKey, toSlug } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchRecommendedGames, type RecommendedGamesParams } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';
import { readAppCacheValue, removeAppCacheValue, writeAppCacheValue } from '../lib/indexedDbAppCache';
import { summarizeProviderStatus, type ProviderError, type ProviderStatusSummary } from '../lib/providerResult';
import { getActiveTasteSignals, getTasteProfileForGames, type TasteProfile, type TasteSignal } from '../lib/tasteProfile';

const CACHE_KEY = 'questshelf.releaseCalendar.v2';
const IGNORE_KEY = 'questshelf.releaseCalendarIgnoredRawgIds.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * AS-10: how long a successful result may still be shown once it is stale.
 *
 * Beyond the 24-hour TTL the entry is no longer served as fresh, but if the refresh FAILS it is
 * better to show week-old upcoming releases (clearly labelled) than to show the user an empty
 * calendar that implies RAWG knows of nothing.
 */
const STALE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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

export type ReleaseCalendarResult = {
  candidates: DiscoveryCandidate[];
  provider: ProviderStatusSummary;
};

/**
 * AS-10: the calendar reports HOW it got its answer.
 *
 * A provider that answers with nothing upcoming still returns `ok` with zero candidates, and that
 * empty answer is cached — it is data. A provider that fails returns `failed`, is never cached, and
 * falls back to the last successful result (marked stale) so the section does not silently collapse
 * into the same empty state an outage used to produce.
 */
export async function fetchPersonalizedReleaseCalendarResult(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: { days?: 30 | 60 | 90; forceRefresh?: boolean } = {},
): Promise<ReleaseCalendarResult> {
  const days = options.days ?? DEFAULT_DAYS;
  const dateRange = getUpcomingDateRange(days);
  const tasteProfile = getTasteProfileForGames(userGames);
  const fp = `${profileFingerprint(userGames)}::taste=${tasteProfile.lastUpdatedAt}:${tasteProfile.explicit.length}:${tasteProfile.temporary.length}::ignored=${[...getIgnoredReleaseRawgIds()].sort().join(',')}`;
  const restampEntry = (entry: CacheEntry) =>
    restamp(entry.candidates.map((c) => c.game), userGames, inboxRawgIds, entry.candidates.map((c) => c.reason), entry.candidates.map((c) => c.score));

  if (!options.forceRefresh) {
    const fresh = await readCache(fp, dateRange);
    if (fresh) return { candidates: restampEntry(fresh), provider: { status: 'ok', successCount: 0, failureCount: 0, stale: false } };
  }

  const profile = buildUserProfile(userGames);
  const platformSlugs = buildPlatformFilter(userGames);
  const requests: RecommendedGamesParams[] = [
    { dates: dateRange, ordering: 'released', pageSize: 40, platforms: platformSlugs },
  ];
  if (profile.topGenres.length > 0) {
    requests.push({ dates: dateRange, ordering: 'released', pageSize: 20, genres: profile.topGenres.slice(0, 3).map((g) => g.slug).join(','), platforms: platformSlugs });
  }

  const results = await Promise.all(requests.map((params) => fetchRecommendedGames(params)));
  const pages: RawgSearchResult[][] = [];
  let successCount = 0;
  let failureCount = 0;
  let firstError: ProviderError | null = null;

  for (const result of results) {
    if (result.ok) {
      successCount += 1;
      pages.push(result.data);
    } else {
      failureCount += 1;
      firstError ??= result.error;
    }
  }

  // Nothing came back at all. Serve the last good calendar rather than an empty one, and do not
  // touch the cache: a failure must never reset the success timestamp as if it were fresh data.
  if (successCount === 0 && failureCount > 0) {
    const stale = await readStaleCache(fp, dateRange);
    return {
      candidates: stale ? restampEntry(stale) : [],
      provider: summarizeProviderStatus(successCount, failureCount, { stale: Boolean(stale), error: firstError ?? undefined }),
    };
  }

  const deduped = dedupeRawgResults(pages.flat()).filter((result) => !isExcludedRelease(result, userGames));
  const scored = rankReleaseCalendarResults(deduped, userGames, tasteProfile);

  const games = scored.map(({ result }) => mapRawgResult(result));
  const candidates = restamp(games, userGames, inboxRawgIds, scored.map((s) => s.reason), scored.map((s) => s.score));
  writeCache({ fingerprint: fp, dateRange, fetchedAt: Date.now(), candidates });
  return {
    candidates,
    provider: summarizeProviderStatus(successCount, failureCount, { error: firstError ?? undefined }),
  };
}

/** Candidate-only adapter, for callers that do not care how the answer was obtained. */
export async function fetchPersonalizedReleaseCalendar(
  userGames: Game[],
  inboxRawgIds: Set<number> = new Set(),
  options: { days?: 30 | 60 | 90; forceRefresh?: boolean } = {},
): Promise<DiscoveryCandidate[]> {
  const { candidates } = await fetchPersonalizedReleaseCalendarResult(userGames, inboxRawgIds, options);
  return candidates;
}

export function rankReleaseCalendarResults(results: RawgSearchResult[], userGames: Game[], tasteProfile = getTasteProfileForGames(userGames)): ScoredRelease[] {
  const profile = buildUserProfile(userGames);
  const scored = results
    .map((result) => scoreRelease(result, userGames, profile, tasteProfile))
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

function scoreRelease(result: RawgSearchResult, userGames: Game[], profile = buildUserProfile(userGames), tasteProfile?: TasteProfile): ScoredRelease {
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
  const tasteMatch = scoreReleaseTasteProfile(result, tasteProfile);

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
  score += tasteMatch.score;

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
    : tasteMatch.positive[0]
      ? `Because your Taste Profile matches ${tasteMatch.positive[0]}`
    : studioHits[0]
      ? `From a creator you follow: ${studioHits[0]}`
      : genreHits[0]
        ? `Matches your ${genreHits[0].name} plans`
        : platformHits[0]
          ? `General pick for ${platformHits[0]}`
          : 'General upcoming pick';
  return { result, score: roundedScore, reason, pass, generalFallback };
}

function scoreReleaseTasteProfile(result: RawgSearchResult, tasteProfile: TasteProfile | undefined): { score: number; positive: string[] } {
  if (!tasteProfile) return { score: 0, positive: [] };
  const genres = new Set((result.genres ?? []).map((genre) => genre.slug ?? toSlug(genre.name)));
  const tags = new Set((result.tags ?? []).map((tag) => tag.slug ?? toSlug(tag.name)));
  const developers = new Set((result as RawgSearchResult & { developers?: Array<{ name: string }> }).developers?.map((developer) => developer.name.trim().replace(/\s+/g, ' ')) ?? []);
  const franchise = recommendationFranchiseKey(result.slug ?? result.name) ?? franchiseKey(result);
  let score = 0;
  const positive: string[] = [];
  for (const signal of getActiveTasteSignals(tasteProfile).slice(0, 16)) {
    if (!releaseMatchesTasteSignal(signal, genres, tags, developers, franchise)) continue;
    const points = Math.round(signal.confidence * (signal.origin === 'explicit' ? 6 : 4));
    if (signal.sentiment === 'love') {
      score += points;
      positive.push(signal.label);
    } else {
      score -= points;
    }
  }
  return { score: Math.max(-10, Math.min(12, score)), positive: [...new Set(positive)].slice(0, 2) };
}

function releaseMatchesTasteSignal(signal: TasteSignal, genres: Set<string>, tags: Set<string>, developers: Set<string>, franchise: string): boolean {
  if (signal.kind === 'genre') return genres.has(signal.key);
  if (signal.kind === 'tag' || signal.kind === 'length' || signal.kind === 'release-era') return tags.has(signal.key);
  if (signal.kind === 'developer') return developers.has(signal.key) || developers.has(signal.label);
  if (signal.kind === 'franchise') return franchise === signal.key;
  return false;
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

/** The same entry PAST its TTL — only ever used when a refresh failed, and always labelled stale. */
async function readStaleCache(fingerprint: string, dateRange: string): Promise<CacheEntry | null> {
  const entry = await readAppCacheValue<CacheEntry>(CACHE_KEY);
  if (!entry || entry.fingerprint !== fingerprint || entry.dateRange !== dateRange) return null;
  return Date.now() - entry.fetchedAt < STALE_RETENTION_MS ? entry : null;
}

function writeCache(entry: CacheEntry): void {
  void writeAppCacheValue(CACHE_KEY, entry);
}

export function clearReleaseCalendarCache(): void {
  void removeAppCacheValue(CACHE_KEY);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
