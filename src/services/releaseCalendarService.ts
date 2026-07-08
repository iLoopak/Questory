import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { buildUserProfile, profileFingerprint } from '../lib/userProfile';
import { mapRawgResult } from './discoveryService';
import { fetchRecommendedGames, type RecommendedGamesParams } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';

const CACHE_KEY = 'questshelf.releaseCalendar.v1';
const IGNORE_KEY = 'questshelf.releaseCalendarIgnoredRawgIds.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 90;
const MIN_SCORE = 12;

type CacheEntry = { fingerprint: string; dateRange: string; fetchedAt: number; candidates: DiscoveryCandidate[] };

type ScoredRelease = { result: RawgSearchResult; score: number; reason: string };

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
    const fresh = readCache(fp, dateRange);
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
  const deduped = dedupeRawgResults(pages.flat());
  const scored = deduped
    .map((result) => scoreRelease(result, userGames))
    .filter((item) => item.score >= MIN_SCORE)
    .sort((a, b) => compareReleaseDates(a.result.released, b.result.released) || b.score - a.score)
    .slice(0, 12);

  const games = scored.map(({ result }) => mapRawgResult(result));
  const candidates = restamp(games, userGames, inboxRawgIds, scored.map((s) => s.reason), scored.map((s) => s.score));
  writeCache({ fingerprint: fp, dateRange, fetchedAt: Date.now(), candidates });
  return candidates;
}

function scoreRelease(result: RawgSearchResult, userGames: Game[]): ScoredRelease {
  const profile = buildUserProfile(userGames);
  const genres = (result.genres ?? []).map((g) => g.name);
  const tags = (result.tags ?? []).map((t) => t.slug ?? t.name.toLowerCase());
  const platforms = (result.platforms ?? []).map((p) => p.platform.name);
  const genreHits = profile.topGenres.filter((g) => genres.includes(g.name));
  const tagHits = profile.topTags.filter((tag) => tags.includes(tag));
  const platformHits = profile.topPlatforms.filter((platform) => platforms.includes(platform) || (platform === 'Steam' && platforms.includes('PC')));
  const negativeGenreHits = profile.negativeGenres.filter((g) => genres.includes(g.name));
  const negativeTagHits = profile.negativeTags.filter((tag) => tags.includes(tag.name));

  let score = 0;
  score += genreHits.reduce((sum, g) => sum + Math.min(18, g.weight * 3), 0);
  score += Math.min(24, tagHits.length * 6);
  score += Math.min(18, platformHits.length * 6);
  if (typeof result.metacritic === 'number' && result.metacritic >= 75) score += 6;
  if (typeof result.rating === 'number' && result.rating >= 4) score += 4;
  score -= negativeGenreHits.reduce((sum, g) => sum + g.weight * 6, 0);
  score -= negativeTagHits.reduce((sum, t) => sum + t.weight * 4, 0);

  const sample = userGames.find((game) => game.rating && game.rating >= 4 && game.genres?.some((genre) => genres.includes(genre))) ?? userGames.find((game) => game.status === 'Playing' && game.genres?.some((genre) => genres.includes(genre)));
  const reason = sample ? `Because you liked ${sample.title}` : genreHits[0] ? `Matches your ${genreHits[0].name} plans` : platformHits[0] ? `Coming to ${platformHits[0]}` : 'Matches your library signals';
  return { result, score: Math.round(score), reason };
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

function readCache(fingerprint: string, dateRange: string): CacheEntry | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as CacheEntry | null;
    if (!entry || entry.fingerprint !== fingerprint || entry.dateRange !== dateRange || Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return null;
    return entry;
  } catch { return null; }
}

function writeCache(entry: CacheEntry): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch { /* ignore cache failures */ }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
