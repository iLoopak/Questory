import type { Game } from '../types/game';
import type {
  SteamApiDebugEntry,
  SteamOwnedGame,
  SteamRecentlyPlayedGame,
  SteamSettings,
  SteamWishlistItem,
} from '../types/steam';
import { getSteamArtworkUrls } from '../lib/steamArtwork';

const DEVELOPMENT_STEAM_API_BASE_URL = '/api/steam/IPlayerService';
const DEVELOPMENT_STEAM_STORE_BASE_URL = '/api/steam-store';
// Production placeholder only. A deployed client will still need a safe proxy/backend before Steam sync is production-ready.
const PRODUCTION_STEAM_API_BASE_URL = 'https://api.steampowered.com/IPlayerService';
const PRODUCTION_STEAM_STORE_BASE_URL = 'https://store.steampowered.com';
const STEAM_API_BASE_URL = import.meta.env.DEV ? DEVELOPMENT_STEAM_API_BASE_URL : PRODUCTION_STEAM_API_BASE_URL;
const STEAM_STORE_BASE_URL = import.meta.env.DEV
  ? DEVELOPMENT_STEAM_STORE_BASE_URL
  : PRODUCTION_STEAM_STORE_BASE_URL;

type SteamApiResponse<T> = {
  response?: T;
};

type OwnedGamesResponse = {
  game_count?: number;
  games?: SteamOwnedGame[];
};

type RecentlyPlayedResponse = {
  total_count?: number;
  games?: SteamRecentlyPlayedGame[];
};

type PlayerSummaryResponse = {
  players?: Array<{
    profileurl?: string;
  }>;
};

const steamApiDebugEntries: SteamApiDebugEntry[] = [];

export class SteamApiError extends Error {
  constructor(
    message: string,
    public code:
      | 'missing-api-key'
      | 'missing-steamid64'
      | 'invalid-steamid64'
      | 'private-profile'
      | 'empty-library'
      | 'malformed-response'
      | 'cors-proxy'
      | 'api-failure',
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

export class SteamWishlistError extends Error {
  constructor(
    message: string,
    public code:
      | 'missing-steamid64'
      | 'invalid-steamid64'
      | 'private-wishlist'
      | 'rate-limited'
      | 'malformed-response'
      | 'cors-proxy'
      | 'endpoint-failure',
  ) {
    super(message);
    this.name = 'SteamWishlistError';
  }
}

function validateSettings(settings: SteamSettings) {
  if (!settings.apiKey.trim()) {
    throw new SteamApiError('Add a Steam Web API key before testing the connection.', 'missing-api-key');
  }

  if (!settings.steamId64) {
    throw new SteamApiError('Add a SteamID64 before testing the connection.', 'missing-steamid64');
  }

  if (!/^\d{17}$/.test(settings.steamId64)) {
    throw new SteamApiError('SteamID64 should be a 17-digit numeric ID, usually starting with 7656.', 'invalid-steamid64');
  }
}

async function requestSteamEndpoint<T>(endpoint: string, settings: SteamSettings): Promise<T> {
  validateSettings(settings);

  const url = new URL(`${STEAM_API_BASE_URL}/${endpoint}/v0001/`, window.location.origin);
  url.searchParams.set('key', settings.apiKey.trim());
  url.searchParams.set('steamid', settings.steamId64);
  url.searchParams.set('format', 'json');

  if (endpoint === 'GetOwnedGames') {
    url.searchParams.set('include_appinfo', 'true');
    url.searchParams.set('include_played_free_games', 'true');
  }

  let response: Response;
  const safeRequestUrl = getSafeRequestUrl(url);

  try {
    response = await fetch(url);
  } catch {
    recordSteamApiDebug({
      endpoint,
      httpStatus: null,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary: 'Network request failed before an HTTP response was received.',
      steamId64: settings.steamId64,
    });

    if (import.meta.env.DEV) {
      throw new SteamApiError(
        'Steam API request failed. Make sure the Vite dev server is running with the /api/steam proxy configured.',
        'cors-proxy',
      );
    }

    throw new SteamApiError(
      'Steam API request failed. Direct Steam sync may need a trusted proxy in production before every device can reach Steam reliably.',
      'api-failure',
    );
  }

  if (!response.ok) {
    recordSteamApiDebug({
      endpoint,
      httpStatus: response.status,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary: `HTTP ${response.status} ${response.statusText}`,
      steamId64: settings.steamId64,
    });

    if (import.meta.env.DEV && response.status === 404) {
      throw new SteamApiError(
        'Steam proxy route was not found. Restart the Vite dev server and confirm /api/steam is configured in vite.config.ts.',
        'cors-proxy',
      );
    }

    if (response.status === 400) {
      throw new SteamApiError('Steam rejected the request. Check that SteamID64 is valid and numeric.', 'invalid-steamid64');
    }

    if (response.status === 401 || response.status === 403) {
      throw new SteamApiError('Steam profile or game details are private or unavailable for this SteamID64.', 'private-profile');
    }

    throw new SteamApiError(`Steam API request failed with status ${response.status}.`, 'api-failure');
  }

  let payload: SteamApiResponse<T>;

  try {
    payload = (await response.json()) as SteamApiResponse<T>;
  } catch {
    recordSteamApiDebug({
      endpoint,
      httpStatus: response.status,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary: 'Steam returned a response that could not be parsed as JSON.',
      steamId64: settings.steamId64,
    });
    throw new SteamApiError('Steam returned malformed JSON. Try the request again.', 'malformed-response');
  }

  recordSteamApiDebug({
    endpoint,
    httpStatus: response.status,
    parsedGameCount: getParsedGameCount(payload.response),
    requestUrl: safeRequestUrl,
    responseSummary: JSON.stringify(payload, null, 2),
    steamId64: settings.steamId64,
  });

  if (!payload.response) {
    throw new SteamApiError('Steam returned no response object. The SteamID64 may be invalid or unavailable.', 'malformed-response');
  }

  return payload.response;
}

export async function getOwnedGames(settings: SteamSettings): Promise<SteamOwnedGame[]> {
  const response = await requestSteamEndpoint<OwnedGamesResponse>('GetOwnedGames', settings);

  if (Array.isArray(response.games)) {
    return response.games;
  }

  if (response.game_count === 0) {
    return [];
  }

  if (typeof response.game_count === 'number') {
    throw new SteamApiError(
      'Steam returned a game count but no games list. The response shape was unexpected.',
      'malformed-response',
    );
  }

  if (!Array.isArray(response.games)) {
    throw new SteamApiError('Steam owned games are private or unavailable for this SteamID64.', 'private-profile');
  }

  return response.games;
}

export async function getRecentlyPlayedGames(settings: SteamSettings): Promise<SteamRecentlyPlayedGame[]> {
  const response = await requestSteamEndpoint<RecentlyPlayedResponse>('GetRecentlyPlayedGames', settings);

  return Array.isArray(response.games) ? response.games : [];
}

export async function getSteamWishlist(
  settings: Pick<SteamSettings, 'apiKey' | 'steamId64' | 'wishlistUrl'>,
): Promise<SteamWishlistItem[]> {
  const steamId64 = settings.steamId64.trim();

  if (!steamId64) {
    throw new SteamWishlistError('Add a SteamID64 before syncing the Steam wishlist.', 'missing-steamid64');
  }

  if (!/^\d{17}$/.test(steamId64)) {
    throw new SteamWishlistError('SteamID64 should be a 17-digit numeric ID, usually starting with 7656.', 'invalid-steamid64');
  }

  const profilePaths = await getSteamWishlistProfilePaths(settings);
  const wishlistItems: SteamWishlistItem[] = [];

  for (let page = 0; page < 50; page += 1) {
    const pageItems = await getSteamWishlistPage(profilePaths, page);

    if (pageItems.length === 0) {
      break;
    }

    wishlistItems.push(...pageItems);
  }

  return wishlistItems;
}

async function getSteamWishlistProfilePaths(
  settings: Pick<SteamSettings, 'apiKey' | 'steamId64' | 'wishlistUrl'>,
): Promise<string[]> {
  const paths = [`profiles/${settings.steamId64.trim()}`];
  const profilePathFromUrl = getSteamWishlistProfilePathFromUrl(settings.wishlistUrl);
  const vanityId = await getSteamVanityId(settings);

  if (vanityId) {
    paths.unshift(`id/${vanityId}`);
  }

  if (profilePathFromUrl) {
    paths.unshift(profilePathFromUrl);
  }

  return Array.from(new Set(paths));
}

function getSteamWishlistProfilePathFromUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const match = trimmedValue.match(/(?:^|\/)wishlist\/(id\/[^/?#]+|profiles\/\d{17})(?:[/?#]|$)/i);
  return match?.[1] ?? null;
}

async function getSteamVanityId(settings: Pick<SteamSettings, 'apiKey' | 'steamId64'>) {
  if (!settings.apiKey.trim()) {
    return null;
  }

  try {
    const response = await requestSteamEndpoint<PlayerSummaryResponse>('GetPlayerSummaries', settings as SteamSettings);
    const profileUrl = response.players?.[0]?.profileurl;
    const vanityMatch = profileUrl?.match(/\/id\/([^/]+)\/?$/);

    return vanityMatch?.[1] ?? null;
  } catch {
    return null;
  }
}

async function getSteamWishlistPage(profilePaths: string[], page: number): Promise<SteamWishlistItem[]> {
  let lastError: SteamWishlistError | null = null;

  for (const profilePath of profilePaths) {
    try {
      return await getSteamWishlistPageForProfile(profilePath, page);
    } catch (error) {
      if (error instanceof SteamWishlistError) {
        if (error.code === 'rate-limited') {
          throw error;
        }

        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new SteamWishlistError('Steam wishlist is unavailable for this Steam profile.', 'private-wishlist');
}

async function getSteamWishlistPageForProfile(profilePath: string, page: number): Promise<SteamWishlistItem[]> {
  const proxyUrl = new URL(`${STEAM_STORE_BASE_URL}/wishlist/${profilePath}/wishlistdata/`, window.location.origin);
  const directUrl = new URL(`https://store.steampowered.com/wishlist/${profilePath}/wishlistdata/`);
  proxyUrl.searchParams.set('p', page.toString());
  directUrl.searchParams.set('p', page.toString());

  const response = await fetchSteamWishlistResponse(proxyUrl, directUrl);

  if (response.type === 'opaqueredirect' || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    return getSteamWishlistFromPublicPage(profilePath, page);
  }

  if (!response.ok) {
    if (import.meta.env.DEV && response.status === 404) {
      throw new SteamWishlistError(
        'Steam wishlist proxy route was not found. Restart the Vite dev server and confirm /api/steam-store is configured.',
        'cors-proxy',
      );
    }

    if (response.status === 400) {
      throw new SteamWishlistError('Steam rejected this SteamID64. Check the value in Settings.', 'invalid-steamid64');
    }

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new SteamWishlistError('Steam wishlist is private or unavailable for this SteamID64.', 'private-wishlist');
    }

    if (response.status === 429) {
      throw new SteamWishlistError(
        'Steam is temporarily rate limiting wishlist requests. Wait a while before syncing again; repeated retries can extend the cooldown.',
        'rate-limited',
      );
    }

    throw new SteamWishlistError(`Steam wishlist request failed with status ${response.status}.`, 'endpoint-failure');
  }

  let responseText: string;

  try {
    responseText = await response.text();
  } catch {
    throw new SteamWishlistError('Steam returned wishlist data that could not be read.', 'malformed-response');
  }

  const payload = await parseSteamWishlistResponseText(responseText, profilePath, page);
  return parseSteamWishlistPayload(payload);
}

async function getSteamWishlistFromPublicPage(profilePath: string, page: number): Promise<SteamWishlistItem[]> {
  const proxyPageUrl = new URL(`${STEAM_STORE_BASE_URL}/wishlist/${profilePath}/`, window.location.origin);
  const directPageUrl = new URL(`https://store.steampowered.com/wishlist/${profilePath}/`);
  proxyPageUrl.searchParams.set('sort', 'order');
  directPageUrl.searchParams.set('sort', 'order');

  const response = await fetchSteamWishlistResponse(proxyPageUrl, directPageUrl);

  if (!response.ok) {
    if (response.status === 429) {
      throw new SteamWishlistError(
        'Steam is temporarily rate limiting wishlist requests. Wait a while before syncing again; repeated retries can extend the cooldown.',
        'rate-limited',
      );
    }

    throw new SteamWishlistError(
      `Steam redirected the wishlistdata endpoint and the public wishlist page failed with status ${response.status}.`,
      response.status === 404 ? 'private-wishlist' : 'endpoint-failure',
    );
  }

  let html: string;

  try {
    html = await response.text();
  } catch {
    throw new SteamWishlistError('Steam returned a wishlist page that could not be read.', 'malformed-response');
  }

  const payload = parseSteamWishlistPageHtml(html);
  const items = parseSteamWishlistPayload(payload);

  if (page > 0) {
    return [];
  }

  return items;
}

async function parseSteamWishlistResponseText(responseText: string, profilePath: string, page: number) {
  const trimmedText = responseText.trim();

  if (!trimmedText) {
    throw new SteamWishlistError('Steam returned an empty wishlist response.', 'malformed-response');
  }

  if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
    try {
      return JSON.parse(trimmedText) as unknown;
    } catch {
      throw new SteamWishlistError('Steam returned wishlist data that could not be parsed as JSON.', 'malformed-response');
    }
  }

  if (page > 0) {
    return [];
  }

  try {
    return parseSteamWishlistPageHtml(trimmedText);
  } catch {
    return getSteamWishlistFromPublicPage(profilePath, page);
  }
}

function parseSteamWishlistPageHtml(html: string) {
  const wishlistDataMatch = html.match(/var\s+g_rgWishlistData\s*=\s*(\[.*?\]|\{.*?\});/s);

  if (!wishlistDataMatch) {
    throw new SteamWishlistError(
      'Steam returned the wishlist page, but QuestShelf could not find wishlist data in the page. The wishlist may be private, rate-limited, or Steam may have changed the page format.',
      'malformed-response',
    );
  }

  try {
    return JSON.parse(wishlistDataMatch[1]) as unknown;
  } catch {
    throw new SteamWishlistError('Steam wishlist page contained data that could not be parsed as JSON.', 'malformed-response');
  }
}

async function fetchSteamWishlistResponse(proxyUrl: URL, directUrl: URL) {
  try {
    return await fetch(proxyUrl, { redirect: 'manual' });
  } catch (proxyError) {
    try {
      return await fetch(directUrl, { redirect: 'manual' });
    } catch (directError) {
      if (import.meta.env.DEV) {
        throw new SteamWishlistError(
          `Steam wishlist request failed through both the Vite proxy and direct Steam Store URL. Make sure the app is running with npm run dev, not npm run preview, and unregister any old QuestShelf service worker for this localhost origin. Proxy error: ${formatFetchError(proxyError)}. Direct error: ${formatFetchError(directError)}.`,
          'cors-proxy',
        );
      }

      throw new SteamWishlistError(
        `Steam wishlist request failed. Direct error: ${formatFetchError(directError)}.`,
        'endpoint-failure',
      );
    }
  }
}

export function clearSteamApiDebugLog() {
  steamApiDebugEntries.length = 0;
}

export function getSteamApiDebugLog() {
  return [...steamApiDebugEntries];
}

export function mapSteamGamesToLocalGames(
  ownedGames: SteamOwnedGame[],
  recentlyPlayedGames: SteamRecentlyPlayedGame[],
  importedAt?: string,
): Game[] {
  const recentByAppId = new Map(recentlyPlayedGames.map((game) => [game.appid, game]));

  return ownedGames.map((game) => {
    const recentGame = recentByAppId.get(game.appid);
    const lastPlayedAt = game.rtime_last_played
      ? new Date(game.rtime_last_played * 1000).toISOString().slice(0, 10)
      : null;
    const artworkUrls = getSteamArtworkUrls(game.appid);

    return {
      id: `steam-${game.appid}`,
      title: game.name ?? `Steam app ${game.appid}`,
      platform: 'Steam',
      status: recentGame ? 'Playing' : 'Want to play',
      coverImage: artworkUrls.library,
      playtimeHours: Math.round((game.playtime_forever ?? 0) / 60),
      tags: ['imported', 'steam'],
      lastPlayedAt,
      notes: recentGame
        ? `Recently played on Steam. Last two weeks: ${Math.round((recentGame.playtime_2weeks ?? 0) / 60)}h.`
        : 'Imported from Steam API test results. Not saved to local library yet.',
      collectionType: 'library',
      steamAppId: game.appid,
      externalSource: 'steam',
      externalUrl: `https://store.steampowered.com/app/${game.appid}`,
      importedAt,
    };
  });
}

export function mapSteamWishlistItemToLocalGame(item: SteamWishlistItem, syncedAt: string): Game {
  const artworkUrls = getSteamArtworkUrls(item.appid);

  return {
    id: `steam-wishlist-${item.appid}`,
    title: item.name,
    platform: 'Steam',
    status: 'Want to play',
    coverImage: artworkUrls.library,
    playtimeHours: 0,
    tags: ['wishlist', 'steam'],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'wishlist',
    steamAppId: item.appid,
    externalSource: 'steam-wishlist',
    externalUrl: item.storeUrl,
    importedAt: syncedAt,
    storeUrl: item.storeUrl,
    releaseDate: item.releaseDate,
    steamPriceInfo: item.priceInfo,
    steamDiscountInfo: item.discountInfo,
    steamReviewInfo: item.reviewSummary,
    wishlistImportedAt: syncedAt,
    wishlistSyncedAt: syncedAt,
  };
}

function recordSteamApiDebug(entry: SteamApiDebugEntry) {
  steamApiDebugEntries.push(entry);

  if (steamApiDebugEntries.length > 8) {
    steamApiDebugEntries.shift();
  }

  console.debug('[QuestShelf Steam API]', {
    endpoint: entry.endpoint,
    httpStatus: entry.httpStatus,
    parsedGameCount: entry.parsedGameCount,
    requestUrl: entry.requestUrl,
    responseSummary: entry.responseSummary,
    steamId64: entry.steamId64,
  });
}

function getSafeRequestUrl(url: URL) {
  const safeUrl = new URL(url.toString());
  safeUrl.searchParams.set('key', '[redacted]');
  return safeUrl.toString();
}

function getParsedGameCount(response: unknown) {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const maybeResponse = response as { games?: unknown };
  return Array.isArray(maybeResponse.games) ? maybeResponse.games.length : null;
}

function parseSteamWishlistPayload(payload: unknown): SteamWishlistItem[] {
  if (Array.isArray(payload)) {
    return payload.map(normalizeSteamWishlistEntry).filter((item): item is SteamWishlistItem => Boolean(item));
  }

  if (!payload || typeof payload !== 'object') {
    throw new SteamWishlistError('Steam wishlist response was empty or malformed.', 'malformed-response');
  }

  const entries = Object.entries(payload);
  const items = entries
    .map(([appId, value]) => normalizeSteamWishlistEntry(value, Number(appId)))
    .filter((item): item is SteamWishlistItem => Boolean(item));

  const success = (payload as Record<string, unknown>).success;

  if (items.length === 0 && typeof success === 'number' && success !== 1) {
    throw new SteamWishlistError('Steam wishlist is private or unavailable for this SteamID64.', 'private-wishlist');
  }

  return items;
}

function normalizeSteamWishlistEntry(value: unknown, fallbackAppId?: number): SteamWishlistItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const appid = getNumber(entry.appid) ?? fallbackAppId;
  const name = getString(entry.name);

  if (!appid || !name) {
    return null;
  }

  return {
    appid,
    name,
    capsule: getString(entry.capsule),
    discountInfo: formatSteamDiscount(entry),
    priceInfo: formatSteamPrice(entry),
    releaseDate: getString(entry.release_string) ?? formatUnixDate(getNumber(entry.release_date)),
    reviewScore: getNumber(entry.review_score),
    reviewSummary: formatSteamReviews(entry),
    storeUrl: `https://store.steampowered.com/app/${appid}`,
  };
}

function formatSteamPrice(entry: Record<string, unknown>) {
  const subs = Array.isArray(entry.subs) ? entry.subs : [];
  const firstSub = subs.find((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object');

  if (!firstSub) {
    return undefined;
  }

  const price = getString(firstSub.price);
  const discountBlock = firstSub.discount_block;
  const discountFinalPrice =
    discountBlock && typeof discountBlock === 'object'
      ? getString((discountBlock as Record<string, unknown>).discount_final_price)
      : undefined;

  return discountFinalPrice ?? price;
}

function formatSteamDiscount(entry: Record<string, unknown>) {
  const subs = Array.isArray(entry.subs) ? entry.subs : [];
  const firstSub = subs.find((sub): sub is Record<string, unknown> => Boolean(sub) && typeof sub === 'object');
  const discountPct = firstSub ? getNumber(firstSub.discount_pct) : undefined;

  return discountPct && discountPct > 0 ? `${discountPct}% off` : undefined;
}

function formatSteamReviews(entry: Record<string, unknown>) {
  const reviewDesc = getString(entry.review_desc);
  const reviewsTotal = getNumber(entry.reviews_total);
  const reviewsPercent = getNumber(entry.reviews_percent);

  if (reviewDesc) {
    return reviewDesc;
  }

  if (typeof reviewsPercent === 'number' && typeof reviewsTotal === 'number') {
    return `${reviewsPercent}% positive from ${reviewsTotal} reviews`;
  }

  return undefined;
}

function formatUnixDate(value?: number) {
  return value ? new Date(value * 1000).toISOString().slice(0, 10) : undefined;
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
}

function formatFetchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
