import type { Game } from '../types/game';

const HLTB_CACHE_KEY = 'questshelf.hltbCache.v1';
const HLTB_SEARCH_URL = '/api/hltb/search';
const HLTB_SOURCE_BASE_URL = 'https://howlongtobeat.com/game';
const MIN_SAFE_MATCH_CONFIDENCE = 0.82;
const AMBIGUOUS_MATCH_DELTA = 0.08;

export type HltbSearchResult = {
  id?: string;
  title: string;
  mainHours?: number;
  mainExtraHours?: number;
  completionistHours?: number;
  sourceUrl?: string;
  confidence?: number;
  platforms?: string[];
};

export type HltbCachedEntry = {
  hltbId?: string;
  hltbTitle?: string;
  hltbMainHours?: number;
  hltbMainExtraHours?: number;
  hltbCompletionistHours?: number;
  hltbSourceUrl?: string;
  hltbMatchConfidence?: number;
  hltbLastSyncedAt: string;
};

export type HltbSyncSummary = {
  updatedCount: number;
  noMatchCount: number;
  failedCount: number;
  cachedCount: number;
  unavailableCount: number;
};

export interface HltbProvider {
  search(title: string, signal?: AbortSignal): Promise<HltbSearchResult[]>;
}

export type HltbProviderFailureReason = 'network' | 'cors-proxy' | 'blocked' | 'temporary' | 'invalid-response' | 'parse' | 'unavailable';

type PackageHltbResult = {
  gameId?: unknown;
  game_id?: unknown;
  id?: unknown;
  gameName?: unknown;
  game_name?: unknown;
  name?: unknown;
  title?: unknown;
  mainStory?: unknown;
  mainHours?: unknown;
  comp_main?: unknown;
  mainExtra?: unknown;
  mainExtraHours?: unknown;
  comp_plus?: unknown;
  completionist?: unknown;
  completionistHours?: unknown;
  comp_100?: unknown;
  gameWebLink?: unknown;
  game_url?: unknown;
  url?: unknown;
  similarity?: unknown;
  profilePlatforms?: unknown;
  profile_platform?: unknown;
  platforms?: unknown;
};

export class HltbProviderError extends Error {
  reason: HltbProviderFailureReason;
  status?: number;

  constructor(message = 'HowLongToBeat is temporarily unavailable. Try again later.', reason: HltbProviderFailureReason = 'unavailable', status?: number) {
    super(message);
    this.name = 'HltbProviderError';
    this.reason = reason;
    this.status = status;
  }
}

// howlongtobeat-js is a Node/CommonJS scraper package. The browser adapter calls
// QuestShelf's HLTB endpoint so UI code never bundles the package directly and
// production/static builds fail gracefully unless a compatible backend provides it.
export class HowLongToBeatProvider implements HltbProvider {
  async search(title: string, signal?: AbortSignal): Promise<HltbSearchResult[]> {
    debugHltb('provider', 'howlongtobeat-js via QuestShelf HLTB endpoint');
    debugHltb('search title', title);

    try {
      const response = await fetch(`${HLTB_SEARCH_URL}?title=${encodeURIComponent(title)}`, {
        headers: {
          Accept: 'application/json',
        },
        method: 'GET',
        signal,
      });

      const data = await readHltbEndpointResponse(response);
      const rawResults = getEndpointResults(data);
      if (!rawResults) {
        throw new HltbProviderError('QuestShelf HLTB endpoint returned an invalid response.', 'invalid-response', response.status);
      }

      const results = rawResults.map(mapHowLongToBeatJsResult).filter((result): result is HltbSearchResult => Boolean(result));
      debugHltb('provider package result count', results.length);
      return results;
    } catch (error) {
      const hltbError = error instanceof HltbProviderError ? error : classifyFetchFailure(error);
      debugHltb('failure reason', describeHltbError(hltbError));
      throw hltbError;
    }
  }
}

export async function searchHowLongToBeat(title: string, provider: HltbProvider = new HowLongToBeatProvider(), signal?: AbortSignal) {
  return provider.search(title, signal);
}

export async function syncHltbForGames(
  games: Game[],
  provider: HltbProvider = new HowLongToBeatProvider(),
  options: { force?: boolean } = {},
): Promise<{ games: Game[]; summary: HltbSyncSummary }> {
  const syncedAt = new Date().toISOString();
  const cache = loadHltbCache();
  const summary: HltbSyncSummary = { updatedCount: 0, noMatchCount: 0, failedCount: 0, cachedCount: 0, unavailableCount: 0 };
  const updatedGames: Game[] = [];

  for (const game of games) {
    const cacheKey = getHltbCacheKey(game);

    if (!options.force && hasHltbData(game)) {
      cache[cacheKey] = pickHltbEntryFromGame(game, syncedAt);
      summary.cachedCount += 1;
      continue;
    }

    const cachedEntry = cache[cacheKey];

    if (!options.force && cachedEntry && hasHltbHours(cachedEntry)) {
      updatedGames.push(applyHltbEntry(game, { ...cachedEntry, hltbLastSyncedAt: game.hltbLastSyncedAt ?? cachedEntry.hltbLastSyncedAt }));
      summary.cachedCount += 1;
      continue;
    }

    try {
      const results = await searchHowLongToBeat(game.title, provider);
      const match = chooseBestHltbMatch(game, results);

      if (!match) {
        summary.noMatchCount += 1;
        continue;
      }

      debugHltb('selected match', {
        title: game.title,
        hltbTitle: match.result.title,
        hltbId: match.result.id,
        confidence: match.confidence,
      });

      const entry: HltbCachedEntry = {
        hltbId: match.result.id,
        hltbTitle: match.result.title,
        hltbMainHours: match.result.mainHours,
        hltbMainExtraHours: match.result.mainExtraHours,
        hltbCompletionistHours: match.result.completionistHours,
        hltbSourceUrl: match.result.sourceUrl ?? getHltbSourceUrl(match.result.id),
        hltbMatchConfidence: match.confidence,
        hltbLastSyncedAt: syncedAt,
      };

      cache[cacheKey] = entry;
      updatedGames.push(applyHltbEntry(game, entry));
      summary.updatedCount += 1;
    } catch (error) {
      console.warn(`[hltb] provider failure for ${game.title}`, describeHltbError(error));
      if (error instanceof HltbProviderError) {
        summary.unavailableCount += 1;
      }
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
    debugHltb('no match', {
      title: game.title,
      reason: results.length > 0 ? 'below safe threshold or missing hour data' : 'empty result set',
      resultCount: results.length,
    });
    return null;
  }

  const second = candidates[1];
  if (second && best.score - second.score < AMBIGUOUS_MATCH_DELTA && normalizeHltbTitle(best.result.title) !== normalizeHltbTitle(game.title)) {
    debugHltb('no match', {
      title: game.title,
      reason: 'ambiguous match',
      best: { title: best.result.title, score: best.score },
      second: { title: second.result.title, score: second.score },
    });
    return null;
  }

  return {
    result: best.result,
    confidence: best.score,
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


async function readHltbEndpointResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const data = parseEndpointJson(text, response.status);

  if (!response.ok) {
    throw createEndpointHltbError(response.status, data);
  }

  return data;
}

function parseEndpointJson(text: string, status: number): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HltbProviderError(
      `QuestShelf HLTB endpoint returned non-JSON data${error instanceof Error ? `: ${error.message}` : '.'}`,
      'parse',
      status,
    );
  }
}

function createEndpointHltbError(status: number, data: unknown) {
  const reason = getEndpointFailureReason(data, status);
  const message = getEndpointFailureMessage(data)
    ?? (status === 404
      ? 'QuestShelf HLTB endpoint is unavailable in this build. A Node/server runtime is required for howlongtobeat-js.'
      : `QuestShelf HLTB endpoint failed with HTTP ${status}.`);

  return new HltbProviderError(message, reason, status);
}

function getEndpointResults(data: unknown): PackageHltbResult[] | null {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (isRecord(data) && Array.isArray(data.results)) {
    return data.results.filter(isRecord);
  }

  return null;
}

function getEndpointFailureReason(data: unknown, status: number): HltbProviderFailureReason {
  if (isRecord(data)) {
    const reason = getString(data.reason);
    if (reason && isHltbProviderFailureReason(reason)) {
      return reason;
    }
  }

  if (status === 403 || status === 429) {
    return 'blocked';
  }

  if (status >= 500) {
    return 'temporary';
  }

  return 'invalid-response';
}

function getEndpointFailureMessage(data: unknown) {
  if (!isRecord(data)) {
    return undefined;
  }

  return getString(data.message) ?? getString(data.error);
}

function isHltbProviderFailureReason(reason: string): reason is HltbProviderFailureReason {
  return ['network', 'cors-proxy', 'blocked', 'temporary', 'invalid-response', 'parse', 'unavailable'].includes(reason);
}

function classifyFetchFailure(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new HltbProviderError('HowLongToBeat request was cancelled.', 'network');
  }

  const message = error instanceof Error ? error.message : 'Unknown network failure';
  const reason: HltbProviderFailureReason = /failed to fetch|load failed|cors|proxy/i.test(message) ? 'cors-proxy' : 'network';
  return new HltbProviderError(`HowLongToBeat request could not be sent: ${message}`, reason);
}

function describeHltbError(error: unknown) {
  if (error instanceof HltbProviderError) {
    return { message: error.message, reason: error.reason, status: error.status };
  }

  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  return error;
}

function debugHltb(label: string, details?: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void } | undefined;
  logger?.debug?.(`[hltb] ${label}`, details ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapHowLongToBeatJsResult(value: PackageHltbResult): HltbSearchResult | null {
  const title = getString(value.gameName) ?? getString(value.game_name) ?? getString(value.name) ?? getString(value.title);
  if (!title) {
    return null;
  }

  const id = getString(value.gameId) ?? getString(value.game_id) ?? getString(value.id);

  return {
    id,
    title,
    mainHours: normalizeHltbHours(value.mainStory ?? value.mainHours ?? value.comp_main),
    mainExtraHours: normalizeHltbHours(value.mainExtra ?? value.mainExtraHours ?? value.comp_plus),
    completionistHours: normalizeHltbHours(value.completionist ?? value.completionistHours ?? value.comp_100),
    sourceUrl: getString(value.gameWebLink) ?? getString(value.game_url) ?? getString(value.url) ?? getHltbSourceUrl(id),
    confidence: getNumber(value.similarity),
    platforms: normalizeHltbPlatforms(value.profilePlatforms ?? value.profile_platform ?? value.platforms),
  };
}


function normalizeHltbPlatforms(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((platform): platform is string => typeof platform === 'string' && Boolean(platform.trim()));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((platform) => platform.trim()).filter(Boolean);
  }

  return undefined;
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
    hltbId: entry.hltbId,
    hltbTitle: entry.hltbTitle,
    hltbMainHours: entry.hltbMainHours,
    hltbMainExtraHours: entry.hltbMainExtraHours,
    hltbCompletionistHours: entry.hltbCompletionistHours,
    hltbSourceUrl: entry.hltbSourceUrl,
    hltbMatchConfidence: entry.hltbMatchConfidence,
    hltbLastSyncedAt: entry.hltbLastSyncedAt,
    updatedAt: entry.hltbLastSyncedAt,
  };
}

function pickHltbEntryFromGame(game: Game, fallbackSyncedAt: string): HltbCachedEntry {
  return {
    hltbId: game.hltbId,
    hltbTitle: game.hltbTitle,
    hltbMainHours: game.hltbMainHours,
    hltbMainExtraHours: game.hltbMainExtraHours,
    hltbCompletionistHours: game.hltbCompletionistHours,
    hltbSourceUrl: game.hltbSourceUrl,
    hltbMatchConfidence: game.hltbMatchConfidence,
    hltbLastSyncedAt: game.hltbLastSyncedAt ?? fallbackSyncedAt,
  };
}

function getHltbSourceUrl(id?: string) {
  return id ? `${HLTB_SOURCE_BASE_URL}/${id}` : undefined;
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
