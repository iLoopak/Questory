import type { Game, SteamAchievement } from '../types/game';
import type {
  SteamApiDebugEntry,
  SteamOwnedGame,
  SteamRecentlyPlayedGame,
  SteamPlayerSummary,
  SteamSettings,
  SteamAchievementSummary,
  SteamWishlistItem,
} from '../types/steam';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import { postIntegration } from '../lib/integrationProxy';

const DEVELOPMENT_STEAM_API_BASE_URL = '/api/steam/IPlayerService';
const DEVELOPMENT_STEAM_STATS_API_BASE_URL = '/api/steam/ISteamUserStats';
const DEVELOPMENT_STEAM_USER_API_BASE_URL = '/api/steam/ISteamUser';
const DEVELOPMENT_STEAM_STORE_BASE_URL = '/api/steam-store';
const DIRECT_STEAM_API_BASE_URL = 'https://api.steampowered.com/IPlayerService';
const DIRECT_STEAM_STATS_API_BASE_URL = 'https://api.steampowered.com/ISteamUserStats';
const DIRECT_STEAM_USER_API_BASE_URL = 'https://api.steampowered.com/ISteamUser';
const DIRECT_STEAM_STORE_BASE_URL = 'https://store.steampowered.com';
const STEAM_API_BASE_URL = getSteamRuntimeBaseUrl('VITE_STEAM_API_BASE_URL', DEVELOPMENT_STEAM_API_BASE_URL, DIRECT_STEAM_API_BASE_URL);
const STEAM_STATS_API_BASE_URL = getSteamRuntimeBaseUrl('VITE_STEAM_STATS_API_BASE_URL', DEVELOPMENT_STEAM_STATS_API_BASE_URL, DIRECT_STEAM_STATS_API_BASE_URL);
const STEAM_USER_API_BASE_URL = getSteamRuntimeBaseUrl('VITE_STEAM_USER_API_BASE_URL', DEVELOPMENT_STEAM_USER_API_BASE_URL, DIRECT_STEAM_USER_API_BASE_URL);
const STEAM_STORE_BASE_URL = getSteamRuntimeBaseUrl('VITE_STEAM_STORE_BASE_URL', DEVELOPMENT_STEAM_STORE_BASE_URL, DIRECT_STEAM_STORE_BASE_URL);
const STEAM_API_REQUEST_TIMEOUT_MS = 10_000;
const STEAM_WISHLIST_RETRY_DELAY_MS = 750;
const STEAM_WISHLIST_MAX_TRANSIENT_RETRIES = 1;

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

type PlayerAchievementsResponse = {
  playerstats?: {
    error?: string;
    achievements?: Array<{
      achieved?: number;
      apiname?: string;
      unlocktime?: number;
    }>;
    success?: boolean;
  };
};

type GameSchemaAchievement = {
  name?: string;        // apiName
  displayName?: string;
  description?: string;
  icon?: string;        // full URL to achievement icon
  icongray?: string;    // full URL to locked/gray icon
  hidden?: number;      // 0 or 1
};

type GameSchemaResponse = {
  game?: {
    availableGameStats?: {
      achievements?: GameSchemaAchievement[];
    };
  };
};

type PlayerSummaryResponse = {
  players?: Array<{
    personaname?: string;
    profilestate?: number;
    profileurl?: string;
    realname?: string;
    avatarfull?: string;
    avatarmedium?: string;
  }>;
};

const steamApiDebugEntries: SteamApiDebugEntry[] = [];

export class SteamApiError extends Error {
  public httpStatus?: number;
  public isTransient?: boolean;

  constructor(
    message: string,
    public code:
      | 'missing-api-key'
      | 'invalid-api-key'
      | 'missing-steamid64'
      | 'invalid-steamid64'
      | 'private-profile'
      | 'no-achievements'
      | 'empty-library'
      | 'malformed-response'
      | 'cors-proxy'
      | 'network-unavailable'
      | 'proxy-unavailable'
      | 'timeout'
      | 'api-failure',
    options: { httpStatus?: number; isTransient?: boolean } = {},
  ) {
    super(message);
    this.name = 'SteamApiError';
    this.httpStatus = options.httpStatus;
    this.isTransient = options.isTransient;
  }
}

export class SteamWishlistError extends Error {
  constructor(
    message: string,
    public code:
      | 'missing-profile'
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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: RequestInit & { timeoutMs?: number; timeoutMessage?: string } = {},
) {
  const {
    timeoutMs = STEAM_API_REQUEST_TIMEOUT_MS,
    timeoutMessage = 'Steam API request timed out.',
    ...fetchOptions
  } = options;
  logSteamApiRequest('request:start', input);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(new DOMException(timeoutMessage, 'TimeoutError')), timeoutMs);

  try {
    return await fetch(input, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new SteamApiError(timeoutMessage, 'timeout', { isTransient: true });
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
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


function shouldUseSteamIntegrationProxy() {
  return !import.meta.env.DEV || Boolean(import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim() || import.meta.env.VITE_STEAM_PROXY_BASE_URL?.trim());
}

function getSteamProxyRoute(endpoint: string) {
  if (endpoint === 'GetOwnedGames') return 'owned-games';
  if (endpoint === 'GetPlayerSummaries') return 'player-summary';
  return null;
}

function mapSteamProxyError(error: unknown): SteamApiError {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  if (code === 'MISSING_API_KEY') return new SteamApiError('Add a Steam Web API key before testing the connection.', 'missing-api-key');
  if (code === 'INVALID_API_KEY') return new SteamApiError('Steam rejected the API key. Check that your Steam Web API key is valid.', 'invalid-api-key');
  if (code === 'RATE_LIMITED') return new SteamApiError('Steam is rate limiting requests. Try again later.', 'api-failure', { isTransient: true });
  if (code === 'PROVIDER_TIMEOUT') return new SteamApiError('Steam request timed out.', 'timeout', { isTransient: true });
  return new SteamApiError(error instanceof Error ? error.message : 'Steam integration proxy request failed.', 'proxy-unavailable', { isTransient: true });
}

async function requestSteamEndpoint<T>(endpoint: string, settings: SteamSettings): Promise<T> {
  validateSettings(settings);

  const proxyRoute = getSteamProxyRoute(endpoint);
  if (proxyRoute && shouldUseSteamIntegrationProxy()) {
    try {
      const payload = await postIntegration<{ response: SteamApiResponse<T> }>('steam', proxyRoute, { apiKey: settings.apiKey.trim(), steamId64: settings.steamId64 });
      if (!payload.response.response) throw new SteamApiError('Steam returned no response object. The SteamID64 may be invalid or unavailable.', 'malformed-response');
      return payload.response.response;
    } catch (error) {
      if (error instanceof SteamApiError) throw error;
      throw mapSteamProxyError(error);
    }
  }

  const baseUrl = endpoint === 'GetPlayerSummaries' ? STEAM_USER_API_BASE_URL : STEAM_API_BASE_URL;
  const version = endpoint === 'GetPlayerSummaries' ? 'v0002' : 'v0001';
  const url = new URL(`${baseUrl}/${endpoint}/${version}/`, window.location.origin);
  url.searchParams.set('key', settings.apiKey.trim());
  url.searchParams.set('steamid', settings.steamId64);
  url.searchParams.set('format', 'json');

  if (isUnsafeProductionAndroidUrl(url)) {
    recordSteamApiDebug({
      endpoint,
      httpStatus: null,
      parsedGameCount: null,
      requestUrl: getSafeRequestUrl(url),
      responseSummary: 'Blocked unsafe Android production localhost Steam API URL.',
      steamId64: settings.steamId64,
    });
    throw new SteamApiError('Steam sync cannot use localhost in an Android production build. Configure VITE_STEAM_API_BASE_URL to an HTTPS backend/proxy endpoint.', 'proxy-unavailable');
  }

  if (endpoint === 'GetOwnedGames') {
    url.searchParams.set('include_appinfo', 'true');
    url.searchParams.set('include_played_free_games', 'true');
  }

  let response: Response;
  const safeRequestUrl = getSafeRequestUrl(url);

  try {
    response = await fetchWithTimeout(url);
  } catch (error) {
    recordSteamApiDebug({
      endpoint,
      httpStatus: null,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary:
        error instanceof SteamApiError
          ? error.message
          : `Network request failed before an HTTP response was received: ${formatFetchError(error)}.`,
      steamId64: settings.steamId64,
    });

    if (error instanceof SteamApiError) {
      throw error;
    }

    throw classifySteamNetworkFailure(error, safeRequestUrl);
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
      throw new SteamApiError('Steam sync is not available in this build right now. Try again later.', 'cors-proxy');
    }

    if (response.status === 400) {
      throw new SteamApiError('Steam rejected the request. Check that SteamID64 is valid and numeric.', 'invalid-steamid64');
    }

    if (response.status === 401) {
      throw new SteamApiError('Steam rejected the API key. Check that your Steam Web API key is valid.', 'invalid-api-key');
    }

    if (response.status === 403) {
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

async function requestSteamStatsEndpoint<T>(endpoint: 'GetPlayerAchievements' | 'GetSchemaForGame', settings: SteamSettings, appId: number): Promise<T> {
  validateSettings(settings);

  if (shouldUseSteamIntegrationProxy()) {
    try {
      const payload = await postIntegration<{ schema: unknown; playerAchievements: unknown }>('steam', 'achievements', { apiKey: settings.apiKey.trim(), steamId64: settings.steamId64, appId });
      return (endpoint === 'GetSchemaForGame' ? payload.schema : payload.playerAchievements) as T;
    } catch (error) {
      throw mapSteamProxyError(error);
    }
  }

  const version = endpoint === 'GetSchemaForGame' ? 'v2' : 'v0001';
  const url = new URL(`${STEAM_STATS_API_BASE_URL}/${endpoint}/${version}/`, window.location.origin);

  if (isUnsafeProductionAndroidUrl(url)) {
    recordSteamApiDebug({
      endpoint,
      httpStatus: null,
      parsedGameCount: null,
      requestUrl: getSafeRequestUrl(url),
      responseSummary: 'Blocked unsafe Android production localhost Steam stats URL.',
      steamId64: settings.steamId64,
    });
    throw new SteamApiError('Steam sync cannot use localhost in an Android production build. Configure VITE_STEAM_STATS_API_BASE_URL to an HTTPS backend/proxy endpoint.', 'proxy-unavailable');
  }
  url.searchParams.set('key', settings.apiKey.trim());
  url.searchParams.set('appid', appId.toString());
  url.searchParams.set('format', 'json');

  if (endpoint === 'GetPlayerAchievements') {
    url.searchParams.set('steamid', settings.steamId64);
  }

  let response: Response;
  const safeRequestUrl = getSafeRequestUrl(url);

  try {
    response = await fetchWithTimeout(url, { timeoutMessage: `Steam achievement request for app ${appId} timed out.` });
  } catch (error) {
    recordSteamApiDebug({
      endpoint,
      httpStatus: null,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary:
        error instanceof SteamApiError && error.code === 'timeout'
          ? error.message
          : `Steam achievement request for app ${appId} failed before an HTTP response was received.`,
      steamId64: settings.steamId64,
    });

    if (error instanceof SteamApiError) {
      throw error;
    }

    throw classifySteamNetworkFailure(error, safeRequestUrl);
  }

  let payload: T;

  try {
    payload = (await response.json()) as T;
  } catch {
    recordSteamApiDebug({
      endpoint,
      httpStatus: response.status,
      parsedGameCount: null,
      requestUrl: safeRequestUrl,
      responseSummary: response.ok
        ? `Steam returned achievement data for app ${appId} that could not be parsed as JSON.`
        : `HTTP ${response.status} ${response.statusText} for app ${appId}; response body was not valid JSON.`,
      steamId64: settings.steamId64,
    });

    if (!response.ok) {
      throw new SteamApiError(`Steam achievement request failed with status ${response.status}.`, 'api-failure', {
        httpStatus: response.status,
        isTransient: isTransientSteamStatsHttpStatus(response.status),
      });
    }

    throw new SteamApiError('Steam returned malformed achievement data. Try the request again.', 'malformed-response');
  }

  recordSteamApiDebug({
    endpoint,
    httpStatus: response.status,
    parsedGameCount: getParsedGameCount(payload),
    requestUrl: safeRequestUrl,
    responseSummary: JSON.stringify(payload, null, 2),
    steamId64: settings.steamId64,
  });

  if (!response.ok) {
    const steamError = getSteamStatsResponseError(payload);

    if (response.status === 400 && isSteamNoStatsError(steamError)) {
      throw new SteamApiError('Steam reports this app has no achievement stats.', 'no-achievements');
    }

    if (response.status === 400 && isSteamUnavailableStatsError(steamError)) {
      throw new SteamApiError('Steam achievements are private or unavailable for this SteamID64.', 'private-profile');
    }

    if (response.status === 400 && steamError) {
      throw new SteamApiError(`Steam rejected the achievement request: ${steamError}`, 'api-failure', { httpStatus: response.status });
    }

    if (response.status === 400) {
      throw new SteamApiError('Steam rejected the achievement request. Check the Steam App ID and SteamID64.', 'invalid-steamid64');
    }

    if (response.status === 401 || response.status === 403) {
      throw new SteamApiError('Steam achievements are private or unavailable for this SteamID64.', 'private-profile');
    }

    throw new SteamApiError(`Steam achievement request failed with status ${response.status}.`, 'api-failure', {
      httpStatus: response.status,
      isTransient: isTransientSteamStatsHttpStatus(response.status),
    });
  }

  return payload;
}

function getSteamStatsResponseError(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const playerstats = (payload as { playerstats?: { error?: unknown } }).playerstats;
  return typeof playerstats?.error === 'string' ? playerstats.error : null;
}

function isSteamNoStatsError(error: string | null) {
  return error?.trim().toLowerCase() === 'requested app has no stats';
}

function isSteamUnavailableStatsError(error: string | null) {
  const normalizedError = error?.trim().toLowerCase() ?? '';

  return (
    normalizedError.includes('private') ||
    normalizedError.includes('unavailable') ||
    normalizedError.includes('not available') ||
    normalizedError.includes('profile')
  );
}

function isTransientSteamStatsHttpStatus(status: number) {
  return status === 429 || [500, 502, 503, 504].includes(status);
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

export async function getSteamPlayerSummary(settings: SteamSettings): Promise<SteamPlayerSummary | null> {
  const response = await requestSteamEndpoint<PlayerSummaryResponse>('GetPlayerSummaries', settings);
  const player = response.players?.[0];

  if (!player) {
    return null;
  }

  const personaName = typeof player.personaname === 'string' ? player.personaname.trim() : '';
  const profileName = typeof player.realname === 'string' ? player.realname.trim() : '';
  const profileUrl = typeof player.profileurl === 'string' ? player.profileurl.trim() : '';
  const avatarUrl = typeof player.avatarfull === 'string' ? player.avatarfull.trim() : typeof player.avatarmedium === 'string' ? player.avatarmedium.trim() : '';

  return {
    ...(personaName ? { personaName } : {}),
    ...(profileName ? { profileName } : {}),
    ...(profileUrl ? { profileUrl } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export async function getSteamAchievementSummary(
  settings: SteamSettings,
  appId: number,
): Promise<SteamAchievementSummary | null> {
  const gameSchema = await requestSteamStatsEndpoint<GameSchemaResponse>('GetSchemaForGame', settings, appId);
  const schemaRows = Array.isArray(gameSchema.game?.availableGameStats?.achievements)
    ? gameSchema.game.availableGameStats.achievements
    : [];

  if (schemaRows.length <= 0) {
    return null;
  }

  const playerAchievements = await requestSteamStatsEndpoint<PlayerAchievementsResponse>('GetPlayerAchievements', settings, appId);
  const achievementRows = Array.isArray(playerAchievements.playerstats?.achievements)
    ? playerAchievements.playerstats.achievements
    : [];
  const total = Math.max(achievementRows.length, schemaRows.length);

  if (playerAchievements.playerstats?.success === false && achievementRows.length === 0) {
    return null;
  }

  if (total <= 0) {
    return null;
  }

  const unlocked = achievementRows.filter((achievement) => achievement.achieved === 1).length;
  const lastUnlockTime = achievementRows.reduce<number | undefined>((latestUnlockTime, achievement) => {
    if (achievement.achieved !== 1 || !achievement.unlocktime) {
      return latestUnlockTime;
    }

    return Math.max(latestUnlockTime ?? 0, achievement.unlocktime);
  }, undefined);

  return {
    total,
    unlocked,
    percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
    lastUnlockTime,
  };
}

export async function getSteamAchievements(
  settings: SteamSettings,
  appId: number,
): Promise<{ summary: SteamAchievementSummary; achievements: SteamAchievement[] } | null> {
  const gameSchema = await requestSteamStatsEndpoint<GameSchemaResponse>('GetSchemaForGame', settings, appId);
  const schemaRows = Array.isArray(gameSchema.game?.availableGameStats?.achievements)
    ? gameSchema.game.availableGameStats.achievements
    : [];

  if (schemaRows.length <= 0) {
    return null;
  }

  const playerAchievements = await requestSteamStatsEndpoint<PlayerAchievementsResponse>('GetPlayerAchievements', settings, appId);
  const achievementRows = Array.isArray(playerAchievements.playerstats?.achievements)
    ? playerAchievements.playerstats.achievements
    : [];
  const total = Math.max(achievementRows.length, schemaRows.length);

  if (playerAchievements.playerstats?.success === false && achievementRows.length === 0) {
    return null;
  }

  if (total <= 0) {
    return null;
  }

  const playerByApiName = new Map(achievementRows.map((a) => [a.apiname ?? '', a]));
  const unlocked = achievementRows.filter((a) => a.achieved === 1).length;
  const lastUnlockTime = achievementRows.reduce<number | undefined>((latest, a) => {
    if (a.achieved !== 1 || !a.unlocktime) return latest;
    return Math.max(latest ?? 0, a.unlocktime);
  }, undefined);

  const achievements: SteamAchievement[] = schemaRows.map((schema) => {
    const apiName = schema.name ?? '';
    const player = playerByApiName.get(apiName);
    const isUnlocked = player?.achieved === 1;
    const result: SteamAchievement = {
      apiName,
      displayName: schema.displayName || apiName,
      unlocked: isUnlocked,
    };
    if (schema.description) result.description = schema.description;
    if (schema.icon) result.iconUrl = schema.icon;
    if (schema.icongray) result.grayIconUrl = schema.icongray;
    if (schema.hidden === 1) result.hidden = true;
    if (isUnlocked && player?.unlocktime) result.unlockTime = player.unlocktime;
    return result;
  });

  return {
    summary: {
      total,
      unlocked,
      percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
      lastUnlockTime,
    },
    achievements,
  };
}

export async function getSteamWishlist(
  settings: Pick<SteamSettings, 'apiKey' | 'steamId64' | 'wishlistUrl'>,
): Promise<SteamWishlistItem[]> {
  // Steam wishlist sync does not use an official Steam Web API method. It reads Steam's public
  // store wishlistdata JSON endpoint (via the Vite /api/steam-store proxy in development) and
  // falls back to parsing the public wishlist page's embedded g_rgWishlistData JSON.
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
  const steamId64 = settings.steamId64.trim();
  const profilePathFromUrl = getSteamWishlistProfilePathFromUrl(settings.wishlistUrl);
  const paths = profilePathFromUrl ? [profilePathFromUrl] : [];

  if (steamId64) {
    if (!/^\d{17}$/.test(steamId64)) {
      throw new SteamWishlistError('SteamID64 should be a 17-digit numeric ID, usually starting with 7656.', 'invalid-steamid64');
    }

    const vanityId = await getSteamVanityId(settings);

    if (vanityId) {
      paths.push(`id/${vanityId}`);
    }

    paths.push(`profiles/${steamId64}`);
  }

  if (paths.length === 0) {
    throw new SteamWishlistError('Add a SteamID64 or paste a public Steam profile/wishlist URL before syncing the Steam wishlist.', 'missing-profile');
  }

  return Array.from(new Set(paths));
}

function getSteamWishlistProfilePathFromUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const wishlistMatch = trimmedValue.match(/(?:^|\/)wishlist\/(id\/[^/?#]+|profiles\/\d{17})(?:[/?#]|$)/i);

  if (wishlistMatch?.[1]) {
    return wishlistMatch[1];
  }

  const communityMatch = trimmedValue.match(/steamcommunity\.com\/(id\/[^/?#]+|profiles\/\d{17})(?:[/?#]|$)/i);

  if (communityMatch?.[1]) {
    return communityMatch[1];
  }

  if (/^\d{17}$/.test(trimmedValue)) {
    return `profiles/${trimmedValue}`;
  }

  const vanityOnlyMatch = trimmedValue.match(/^[A-Za-z0-9_-]+$/);
  return vanityOnlyMatch ? `id/${trimmedValue}` : null;
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

  if (isUnsafeProductionAndroidUrl(proxyUrl)) {
    throw new SteamWishlistError('Steam wishlist sync cannot use localhost in an Android production build. Configure VITE_STEAM_STORE_BASE_URL to an HTTPS backend/proxy endpoint.', 'endpoint-failure');
  }

  const response = await fetchSteamWishlistResponse(proxyUrl, directUrl);

  if (response.type === 'opaqueredirect' || response.status === 0 || (response.status >= 300 && response.status < 400)) {
    return getSteamWishlistFromPublicPage(profilePath, page);
  }

  if (!response.ok) {
    if (import.meta.env.DEV && response.status === 404) {
      throw new SteamWishlistError('Steam wishlist sync is not available in this build right now.', 'cors-proxy');
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

  if (isUnsafeProductionAndroidUrl(proxyPageUrl)) {
    throw new SteamWishlistError('Steam wishlist sync cannot use localhost in an Android production build. Configure VITE_STEAM_STORE_BASE_URL to an HTTPS backend/proxy endpoint.', 'endpoint-failure');
  }

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

  if (isSteamPrivateWishlistPage(html)) {
    throw new SteamWishlistError('Steam wishlist is private or unavailable. Make your Steam profile and wishlist public, then try again.', 'private-wishlist');
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

  if (isSteamPrivateWishlistPage(trimmedText)) {
    throw new SteamWishlistError('Steam wishlist is private or unavailable. Make your Steam profile and wishlist public, then try again.', 'private-wishlist');
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
      'Steam returned the wishlist page, but Questory could not find wishlist data in the page. The wishlist may be private, rate-limited, or Steam may have changed the page format.',
      'malformed-response',
    );
  }

  try {
    return JSON.parse(wishlistDataMatch[1]) as unknown;
  } catch {
    throw new SteamWishlistError('Steam wishlist page contained data that could not be parsed as JSON.', 'malformed-response');
  }
}


function isSteamPrivateWishlistPage(html: string) {
  const normalizedHtml = html.toLowerCase();
  return (
    normalizedHtml.includes('profile is private') ||
    normalizedHtml.includes('this profile is private') ||
    normalizedHtml.includes('wishlist is currently private') ||
    normalizedHtml.includes('there was a problem accessing')
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isTransientWishlistStatus(status: number) {
  return [500, 502, 503, 504].includes(status);
}

async function fetchSteamWishlistResponse(proxyUrl: URL, directUrl: URL) {
  let lastProxyError: unknown = null;
  let lastDirectError: unknown = null;

  for (let attempt = 0; attempt <= STEAM_WISHLIST_MAX_TRANSIENT_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await wait(STEAM_WISHLIST_RETRY_DELAY_MS * attempt);
    }

    try {
      logSteamApiRequest('wishlist:proxy', proxyUrl);
      const response = await fetch(proxyUrl, { redirect: 'manual' });

      if (attempt < STEAM_WISHLIST_MAX_TRANSIENT_RETRIES && isTransientWishlistStatus(response.status)) {
        continue;
      }

      return response;
    } catch (proxyError) {
      lastProxyError = proxyError;
    }

    try {
      logSteamApiRequest('wishlist:direct', directUrl);
      const response = await fetch(directUrl, { redirect: 'manual' });

      if (attempt < STEAM_WISHLIST_MAX_TRANSIENT_RETRIES && isTransientWishlistStatus(response.status)) {
        continue;
      }

      return response;
    } catch (directError) {
      lastDirectError = directError;
    }
  }

  if (import.meta.env.DEV) {
    throw new SteamWishlistError('Steam wishlist sync is unavailable right now. Check your connection and try again.', 'cors-proxy');
  }

  throw new SteamWishlistError(
    `Steam wishlist request failed. Proxy error: ${formatFetchError(lastProxyError)}. Direct error: ${formatFetchError(lastDirectError)}.`,
    'endpoint-failure',
  );
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
      artworkSource: 'steam',
      artworkUpdatedAt: importedAt,
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
  const title = getSteamWishlistItemTitle(item);

  console.debug('[Steam Wishlist Sync] Mapping wishlist item to local game.', {
    appid: item.appid,
    incomingTitle: item.name,
    mappedTitle: title,
    usedPlaceholderTitle: isPlaceholderSteamAppTitle(title, item.appid),
  });

  return {
    id: `steam-wishlist-${item.appid}`,
    title,
    platform: 'Steam',
    status: 'Want to play',
    coverImage: artworkUrls.library,
    artworkSource: 'steam',
    artworkUpdatedAt: syncedAt,
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


function getSteamWishlistItemTitle(item: SteamWishlistItem) {
  const title = typeof item.name === 'string' ? item.name.trim() : '';

  if (title) {
    return title;
  }

  const placeholderTitle = `Steam App ${item.appid}`;
  console.warn('[Steam Wishlist Sync] Falling back to placeholder title; wishlist item had no title.', {
    appid: item.appid,
    item,
  });
  return placeholderTitle;
}

function isPlaceholderSteamAppTitle(title: string, appid: number) {
  return title.trim().toLowerCase() === `steam app ${appid}`.toLowerCase();
}

function recordSteamApiDebug(entry: SteamApiDebugEntry) {
  steamApiDebugEntries.push(entry);
  logSteamApiRequest('request:result', { endpoint: entry.endpoint, httpStatus: entry.httpStatus, requestUrl: entry.requestUrl, responseSummary: entry.responseSummary });

  if (steamApiDebugEntries.length > 8) {
    steamApiDebugEntries.shift();
  }

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

function getSteamRuntimeBaseUrl(envName: string, developmentBaseUrl: string, productionFallbackBaseUrl: string) {
  if (import.meta.env.DEV) {
    return developmentBaseUrl;
  }

  const configuredValue = import.meta.env[envName] as string | undefined;
  return configuredValue?.trim() || productionFallbackBaseUrl;
}

function isUnsafeProductionAndroidUrl(url: URL) {
  if (import.meta.env.DEV || !isAndroidWebViewRuntime()) {
    return false;
  }

  return ['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2'].includes(url.hostname);
}

function isAndroidWebViewRuntime() {
  return /Android/i.test(window.navigator.userAgent) && window.location.protocol === 'capacitor:';
}

function classifySteamNetworkFailure(error: unknown, requestUrl: string) {
  const failureMessage = formatFetchError(error);
  const isDirectSteam = requestUrl.includes('api.steampowered.com') || requestUrl.includes('store.steampowered.com');
  const isLikelyOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isLikelyOffline) {
    return new SteamApiError('Network unavailable. Connect to Wi-Fi or mobile data, then try Steam sync again.', 'network-unavailable', { isTransient: true });
  }

  if (!import.meta.env.DEV && isDirectSteam) {
    return new SteamApiError(
      `Steam sync could not reach Steam directly from this build (${failureMessage}). Configure VITE_STEAM_API_BASE_URL, VITE_STEAM_STATS_API_BASE_URL, and VITE_STEAM_USER_API_BASE_URL to an HTTPS backend/proxy for Android/APK builds.`,
      'proxy-unavailable',
      { isTransient: true },
    );
  }

  return new SteamApiError(`Steam sync endpoint is unavailable (${failureMessage}). Check your network or backend proxy URL.`, 'proxy-unavailable', { isTransient: true });
}

function logSteamApiRequest(label: string, details: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } | undefined;
  logger?.debug?.(`[steam-api] ${label}`, details);
}

function formatFetchError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
