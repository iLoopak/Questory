import type { Game } from '../types/game';
import type { SteamOwnedGame, SteamRecentlyPlayedGame, SteamSettings } from '../types/steam';
import { getSteamArtworkUrls } from '../lib/steamArtwork';

const DEVELOPMENT_STEAM_API_BASE_URL = '/api/steam/IPlayerService';
// Production placeholder only. A deployed client will still need a safe proxy/backend before Steam sync is production-ready.
const PRODUCTION_STEAM_API_BASE_URL = 'https://api.steampowered.com/IPlayerService';
const STEAM_API_BASE_URL = import.meta.env.DEV ? DEVELOPMENT_STEAM_API_BASE_URL : PRODUCTION_STEAM_API_BASE_URL;

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

export class SteamApiError extends Error {
  constructor(
    message: string,
    public code:
      | 'missing-api-key'
      | 'missing-steamid64'
      | 'invalid-steamid64'
      | 'private-profile'
      | 'cors-proxy'
      | 'api-failure',
  ) {
    super(message);
    this.name = 'SteamApiError';
  }
}

function validateSettings(settings: SteamSettings) {
  if (!settings.apiKey.trim()) {
    throw new SteamApiError('Add a Steam Web API key before testing the connection.', 'missing-api-key');
  }

  if (!settings.steamId64.trim()) {
    throw new SteamApiError('Add a SteamID64 before testing the connection.', 'missing-steamid64');
  }

  if (!/^\d{17}$/.test(settings.steamId64.trim())) {
    throw new SteamApiError('SteamID64 should be a 17-digit numeric ID, usually starting with 7656.', 'invalid-steamid64');
  }
}

async function requestSteamEndpoint<T>(endpoint: string, settings: SteamSettings): Promise<T> {
  validateSettings(settings);

  const url = new URL(`${STEAM_API_BASE_URL}/${endpoint}/v0001/`, window.location.origin);
  url.searchParams.set('key', settings.apiKey.trim());
  url.searchParams.set('steamid', settings.steamId64.trim());
  url.searchParams.set('format', 'json');

  if (endpoint === 'GetOwnedGames') {
    url.searchParams.set('include_appinfo', 'true');
    url.searchParams.set('include_played_free_games', 'true');
  }

  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    if (import.meta.env.DEV) {
      throw new SteamApiError(
        'Steam API request failed. Make sure the Vite dev server is running with the /api/steam proxy configured.',
        'cors-proxy',
      );
    }

    throw new SteamApiError(
      'Steam API request failed. The production client needs a Steam proxy/backend before direct browser sync is reliable.',
      'api-failure',
    );
  }

  if (!response.ok) {
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

  const payload = (await response.json()) as SteamApiResponse<T>;

  if (!payload.response) {
    throw new SteamApiError('Steam profile or game details are private or unavailable for this SteamID64.', 'private-profile');
  }

  return payload.response;
}

export async function getOwnedGames(settings: SteamSettings): Promise<SteamOwnedGame[]> {
  const response = await requestSteamEndpoint<OwnedGamesResponse>('GetOwnedGames', settings);

  if (!Array.isArray(response.games)) {
    throw new SteamApiError('Steam owned games are private or unavailable for this SteamID64.', 'private-profile');
  }

  return response.games;
}

export async function getRecentlyPlayedGames(settings: SteamSettings): Promise<SteamRecentlyPlayedGame[]> {
  const response = await requestSteamEndpoint<RecentlyPlayedResponse>('GetRecentlyPlayedGames', settings);

  return Array.isArray(response.games) ? response.games : [];
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
      steamAppId: game.appid,
      externalSource: 'steam',
      externalUrl: `https://store.steampowered.com/app/${game.appid}`,
      importedAt,
    };
  });
}
