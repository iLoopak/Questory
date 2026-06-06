import type { Game } from '../types/game';

const HLTB_CACHE_KEY = 'questshelf.hltbCache.v1';
const HLTB_SEARCH_URL = 'https://howlongtobeat.com/api/search';
const MIN_SAFE_MATCH_CONFIDENCE = 0.82;
const AMBIGUOUS_MATCH_DELTA = 0.08;

export type HltbMatchConfidence = 'exact' | 'high' | 'medium';

export type HltbSearchResult = {
  id?: string;
  title: string;
  mainHours?: number;
  mainExtraHours?: number;
  completionistHours?: number;
  confidence?: number;
  platforms?: string[];
};

export type HltbCachedEntry = {
  hltbMainHours?: number;
  hltbMainExtraHours?: number;
  hltbCompletionistHours?: number;
  hltbLastSyncedAt: string;
  hltbMatchConfidence?: HltbMatchConfidence;
  matchedTitle?: string;
};

export type HltbSyncSummary = {
  updatedCount: number;
  noMatchCount: number;
  failedCount: number;
  cachedCount: number;
};

export interface HltbProvider {
  search(title: string, signal?: AbortSignal): Promise<HltbSearchResult[]>;
}

export class HowLongToBeatProvider implements HltbProvider {
  async search(title: string, signal?: AbortSignal): Promise<HltbSearchResult[]> {
    const response = await fetch(HLTB_SEARCH_URL, {
      body: JSON.stringify({
        searchType: 'games',
        searchTerms: normalizeSearchTerms(title),
        searchPage: 1,
        size: 20,
        searchOptions: {
          games: {
            userId: 0,
            platform: '',
            sortCategory: 'popular',
            rangeCategory: 'main',
            rangeTime: { min: 0, max: 0 },
            gameplay: { perspective: '', flow: '', genre: '' },
            modifier: '',
          },
        },
      }),
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });

    if (!response.ok) {
      throw new Error(`HowLongToBeat search failed with ${response.status}`);
    }

    const data = await response.json();
    const rawResults = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    return (rawResults as Record<string, unknown>[]).map(mapHowLongToBeatResult).filter((result): result is HltbSearchResult => Boolean(result));
  }
}

export async function syncHltbForGames(games: Game[], provider: HltbProvider = new HowLongToBeatProvider()): Promise<{ games: Game[]; summary: HltbSyncSummary }> {
  const syncedAt = new Date().toISOString();
  const cache = loadHltbCache();
  const summary: HltbSyncSummary = { updatedCount: 0, noMatchCount: 0, failedCount: 0, cachedCount: 0 };
  const updatedGames: Game[] = [];

  for (const game of games) {
    const cacheKey = getHltbCacheKey(game);

    if (hasHltbData(game)) {
      cache[cacheKey] = {
        hltbMainHours: game.hltbMainHours,
        hltbMainExtraHours: game.hltbMainExtraHours,
        hltbCompletionistHours: game.hltbCompletionistHours,
        hltbLastSyncedAt: game.hltbLastSyncedAt ?? syncedAt,
        hltbMatchConfidence: game.hltbMatchConfidence,
      };
      summary.cachedCount += 1;
      continue;
    }

    const cachedEntry = cache[cacheKey];

    if (cachedEntry && hasHltbHours(cachedEntry)) {
      updatedGames.push(applyHltbEntry(game, { ...cachedEntry, hltbLastSyncedAt: game.hltbLastSyncedAt ?? cachedEntry.hltbLastSyncedAt }));
      summary.cachedCount += 1;
      continue;
    }

    try {
      const results = await provider.search(game.title);
      const match = chooseBestHltbMatch(game, results);

      if (!match) {
        summary.noMatchCount += 1;
        continue;
      }

      const entry: HltbCachedEntry = {
        hltbMainHours: match.result.mainHours,
        hltbMainExtraHours: match.result.mainExtraHours,
        hltbCompletionistHours: match.result.completionistHours,
        hltbLastSyncedAt: syncedAt,
        hltbMatchConfidence: match.confidenceLabel,
        matchedTitle: match.result.title,
      };

      cache[cacheKey] = entry;
      updatedGames.push(applyHltbEntry(game, entry));
      summary.updatedCount += 1;
    } catch (error) {
      console.warn(`HLTB sync failed for ${game.title}`, error);
      summary.failedCount += 1;
    }
  }

  saveHltbCache(cache);
  return { games: updatedGames, summary };
}

export function chooseBestHltbMatch(game: Pick<Game, 'title' | 'platform'>, results: HltbSearchResult[]) {
  const candidates = results
    .map((result) => ({ result, score: scoreHltbCandidate(game, result) }))
    .filter((candidate) => candidate.score >= MIN_SAFE_MATCH_CONFIDENCE && hasHltbHours(candidate.result))
    .sort((first, second) => second.score - first.score);

  const best = candidates[0];
  if (!best) {
    return null;
  }

  const second = candidates[1];
  if (second && best.score - second.score < AMBIGUOUS_MATCH_DELTA && normalizeHltbTitle(best.result.title) !== normalizeHltbTitle(game.title)) {
    return null;
  }

  return {
    result: best.result,
    confidence: best.score,
    confidenceLabel: best.score >= 0.98 ? 'exact' : best.score >= 0.9 ? 'high' : 'medium' as HltbMatchConfidence,
  };
}

export function hasHltbData(game: Pick<Game, 'hltbMainHours' | 'hltbMainExtraHours' | 'hltbCompletionistHours'>) {
  return hasHltbHours({
    hltbMainHours: game.hltbMainHours,
    hltbMainExtraHours: game.hltbMainExtraHours,
    hltbCompletionistHours: game.hltbCompletionistHours,
  });
}

export function getPrimaryHltbHours(game: Pick<Game, 'hltbMainHours' | 'hltbMainExtraHours' | 'hltbCompletionistHours'>) {
  return game.hltbMainHours ?? game.hltbMainExtraHours ?? game.hltbCompletionistHours ?? null;
}

export function formatHltbBadge(game: Pick<Game, 'hltbMainHours' | 'hltbMainExtraHours'>, options: { includeLabel?: boolean } = {}) {
  const main = formatHourValue(game.hltbMainHours);
  const mainExtra = formatHourValue(game.hltbMainExtraHours);

  if (main && mainExtra && main !== mainExtra) {
    return options.includeLabel ? `🎮 ${main} / ${mainExtra}` : `🎮 ${main}`;
  }

  if (main) {
    return options.includeLabel ? `🎮 ${main} Main` : `🎮 ${main}`;
  }

  if (mainExtra) {
    return `🎮 ${mainExtra}`;
  }

  return null;
}

function mapHowLongToBeatResult(value: Record<string, unknown>): HltbSearchResult | null {
  const title = getString(value.game_name) ?? getString(value.name) ?? getString(value.title);
  if (!title) {
    return null;
  }

  return {
    id: getString(value.game_id) ?? getString(value.id),
    title,
    mainHours: normalizeHltbHours(value.comp_main ?? value.gameplayMain ?? value.main_story),
    mainExtraHours: normalizeHltbHours(value.comp_plus ?? value.gameplayMainExtra ?? value.main_extra),
    completionistHours: normalizeHltbHours(value.comp_100 ?? value.gameplayCompletionist ?? value.completionist),
    confidence: getNumber(value.similarity),
    platforms: Array.isArray(value.profile_platform) ? value.profile_platform.filter((platform): platform is string => typeof platform === 'string') : undefined,
  };
}

function scoreHltbCandidate(game: Pick<Game, 'title' | 'platform'>, result: HltbSearchResult) {
  const normalizedGameTitle = normalizeHltbTitle(game.title);
  const normalizedResultTitle = normalizeHltbTitle(result.title);

  if (!normalizedGameTitle || !normalizedResultTitle) {
    return 0;
  }

  let score = result.confidence ?? diceCoefficient(normalizedGameTitle, normalizedResultTitle);

  if (normalizedGameTitle === normalizedResultTitle) {
    score = Math.max(score, 1);
  } else if (normalizedResultTitle.includes(normalizedGameTitle) || normalizedGameTitle.includes(normalizedResultTitle)) {
    score = Math.max(score, 0.9);
  }

  if (result.platforms?.some((platform) => normalizePlatform(platform) === normalizePlatform(game.platform))) {
    score += 0.03;
  }

  return Math.min(score, 1);
}

function normalizeSearchTerms(title: string) {
  return title.split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

function normalizeHltbTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/\b(game of the year|goty|remastered|remaster|definitive edition|complete edition|standard edition)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlatform(platform: string) {
  return platform.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function diceCoefficient(firstValue: string, secondValue: string) {
  if (firstValue === secondValue) {
    return 1;
  }

  const firstPairs = getBigrams(firstValue);
  const secondPairs = getBigrams(secondValue);

  if (firstPairs.length === 0 || secondPairs.length === 0) {
    return 0;
  }

  const secondPairCounts = new Map<string, number>();
  secondPairs.forEach((pair) => secondPairCounts.set(pair, (secondPairCounts.get(pair) ?? 0) + 1));

  let intersections = 0;
  firstPairs.forEach((pair) => {
    const count = secondPairCounts.get(pair) ?? 0;
    if (count > 0) {
      intersections += 1;
      secondPairCounts.set(pair, count - 1);
    }
  });

  return (2 * intersections) / (firstPairs.length + secondPairs.length);
}

function getBigrams(value: string) {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 2) {
    return compact ? [compact] : [];
  }

  return Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2));
}

function hasHltbHours(value: Pick<HltbCachedEntry, 'hltbMainHours' | 'hltbMainExtraHours' | 'hltbCompletionistHours'> | HltbSearchResult) {
  const hours = 'title' in value
    ? [value.mainHours, value.mainExtraHours, value.completionistHours]
    : [value.hltbMainHours, value.hltbMainExtraHours, value.hltbCompletionistHours];

  return hours.some((hourValue) => typeof hourValue === 'number' && hourValue > 0);
}

function applyHltbEntry(game: Game, entry: HltbCachedEntry): Game {
  return {
    ...game,
    hltbMainHours: entry.hltbMainHours,
    hltbMainExtraHours: entry.hltbMainExtraHours,
    hltbCompletionistHours: entry.hltbCompletionistHours,
    hltbLastSyncedAt: entry.hltbLastSyncedAt,
    hltbMatchConfidence: entry.hltbMatchConfidence,
    updatedAt: entry.hltbLastSyncedAt,
  };
}

function getHltbCacheKey(game: Pick<Game, 'title' | 'steamAppId'>) {
  return `${game.steamAppId ?? 'title'}:${normalizeHltbTitle(game.title)}`;
}

function loadHltbCache(): Record<string, HltbCachedEntry> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const storedValue = window.localStorage.getItem(HLTB_CACHE_KEY);
    return storedValue ? JSON.parse(storedValue) : {};
  } catch {
    return {};
  }
}

function saveHltbCache(cache: Record<string, HltbCachedEntry>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(HLTB_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // HLTB fields are also stored on games; the side cache is an optimization.
  }
}

function normalizeHltbHours(value: unknown) {
  const numberValue = getNumber(value);
  if (typeof numberValue !== 'number' || numberValue <= 0) {
    return undefined;
  }

  // HLTB's current API returns seconds for comp_* fields; wrapper-style providers may return hours.
  return Math.round((numberValue > 1000 ? numberValue / 3600 : numberValue) * 10) / 10;
}

function formatHourValue(value?: number) {
  if (typeof value !== 'number' || value <= 0) {
    return null;
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)}h`;
}

function getString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return undefined;
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  return undefined;
}
