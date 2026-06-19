import type { SteamAchievementSyncState, SteamPlaytimeRefreshState, SteamWishlistSyncState } from '../types/steam';

export const initialSteamWishlistSyncState: SteamWishlistSyncState = {
  status: 'idle',
  message: 'Steam wishlist sync runs only when you start it.',
  summary: null,
};

export const initialSteamAchievementSyncState: SteamAchievementSyncState = {
  status: 'idle',
  message: 'Steam achievement sync runs only when you start it.',
  progress: { completed: 0, total: 0 },
  summary: null,
};

export const initialSteamPlaytimeRefreshState: SteamPlaytimeRefreshState = {
  status: 'idle',
  message: 'Steam playtime refresh runs only when you start it.',
  progress: { completed: 0, total: 0 },
  summary: null,
};

export type ItadDealSyncState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  summary: { updatedCount: number; noMatchCount: number; failedCount: number; historicalLowCount: number } | null;
};

export const initialItadDealSyncState: ItadDealSyncState = {
  status: 'idle',
  message: 'Deal sync runs only when you start it.',
  summary: null,
};
