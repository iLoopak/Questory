import { useState } from 'react';
import { initialItadDealSyncState, initialSteamAchievementSyncState, initialSteamPlaytimeRefreshState, initialSteamWishlistSyncState, type ItadDealSyncState } from '../../config/syncStates';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState, SteamWishlistSyncState } from '../../types/steam';

export function useSyncController() {
  const [steamWishlistSyncState, setSteamWishlistSyncState] = useState<SteamWishlistSyncState>(initialSteamWishlistSyncState);
  const [steamAchievementSyncState, setSteamAchievementSyncState] = useState<SteamAchievementSyncState>(initialSteamAchievementSyncState);
  const [steamPlaytimeRefreshState, setSteamPlaytimeRefreshState] = useState<SteamPlaytimeRefreshState>(initialSteamPlaytimeRefreshState);
  const [itadDealSyncState, setItadDealSyncState] = useState<ItadDealSyncState>(initialItadDealSyncState);
  const [isHltbSyncing, setIsHltbSyncing] = useState(false);
  return { isHltbSyncing, itadDealSyncState, setIsHltbSyncing, setItadDealSyncState, setSteamAchievementSyncState, setSteamPlaytimeRefreshState, setSteamWishlistSyncState, steamAchievementSyncState, steamPlaytimeRefreshState, steamWishlistSyncState };
}
