import type { Game } from './game';

export type SteamSettings = {
  apiKey: string;
  steamId64: string;
  wishlistUrl: string;
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

export type SteamWishlistItem = {
  appid: number;
  name: string;
  capsule?: string;
  reviewScore?: number | null;
  reviewSummary?: string;
  releaseDate?: string;
  storeUrl: string;
  priceInfo?: string;
  discountInfo?: string;
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

export type SteamWishlistSyncSummary = {
  addedCount: number;
  failedCount: number;
  fetchedCount: number;
  skippedAlreadyInLibraryCount: number;
  skippedIgnoredCount: number;
  updatedCount: number;
};

export type SteamWishlistSyncState =
  | { status: 'idle'; message: string; summary: SteamWishlistSyncSummary | null }
  | { status: 'loading'; message: string; summary: SteamWishlistSyncSummary | null }
  | { status: 'success'; message: string; summary: SteamWishlistSyncSummary }
  | { status: 'error'; message: string; summary: SteamWishlistSyncSummary | null };
