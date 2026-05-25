import type { Game } from './game';

export type SteamSettings = {
  apiKey: string;
  steamId64: string;
};

export type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number;
  img_icon_url?: string;
  has_community_visible_stats?: boolean;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  rtime_last_played?: number;
};

export type SteamRecentlyPlayedGame = SteamOwnedGame & {
  playtime_2weeks?: number;
};

export type SteamDebugResult = {
  ownedGames: SteamOwnedGame[];
  recentlyPlayedGames: SteamRecentlyPlayedGame[];
  mappedGames: Game[];
  apiDebugEntries?: SteamApiDebugEntry[];
};

export type SteamApiDebugEntry = {
  endpoint: string;
  httpStatus: number | null;
  parsedGameCount: number | null;
  requestUrl: string;
  responseSummary: string;
  steamId64: string;
};

export type SteamConnectionState =
  | { status: 'idle'; message: string; data: SteamDebugResult | null }
  | { status: 'loading'; message: string; data: SteamDebugResult | null }
  | { status: 'success'; message: string; data: SteamDebugResult }
  | { status: 'error'; message: string; data: SteamDebugResult | null };
