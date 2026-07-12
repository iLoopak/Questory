import type { Dispatch, SetStateAction } from 'react';
import { loadSteamSettings } from '../../../lib/steamSettingsStorage';
import { formatSteamWishlistSyncSummary } from '../../../utils/summaryFormatters';
import { getDismissAction, getOpenSteamSettingsAction, type NotificationDraft } from '../../../lib/notifications';
import type { IgnoredSteamGame } from '../../../lib/steamIgnoredGamesStorage';
import { steamWishlistSyncTransition } from '../../../lib/importTransitions';
import { getSteamWishlist, SteamWishlistError } from '../../../services/steamApi';
import type { SteamWishlistItem, SteamWishlistSyncState, SteamWishlistSyncSummary } from '../../../types/steam';
import type { TFunction } from '../../../i18n';
import type { SliceCommands } from '../../app/useSliceCommands';

export type SteamWishlistSyncOptions = {
  ignoredSteamGames: IgnoredSteamGame[];
  runGamesCommand: SliceCommands['runGamesCommand'];
  setSteamWishlistSyncState: Dispatch<SetStateAction<SteamWishlistSyncState>>;
  addToastNotification: (notification: NotificationDraft) => void;
  t: TFunction;
};

/**
 * AS-14: the sync summary drives both the sync state panel and the toast, and it used to be read out
 * of a `setGames` updater — so a deferred updater could report a sync that added nothing.
 */
export function useSteamWishlistSync({ ignoredSteamGames, runGamesCommand, setSteamWishlistSyncState, addToastNotification, t }: SteamWishlistSyncOptions) {
  function importSteamWishlistItems(wishlistItems: SteamWishlistItem[]): SteamWishlistSyncSummary {
    const syncedAt = new Date().toISOString();
    const ignoredSteamAppIds = new Set(ignoredSteamGames.map((game) => game.steamAppId));

    return runGamesCommand((currentGames) => steamWishlistSyncTransition(currentGames, wishlistItems, ignoredSteamAppIds, syncedAt));
  }

  async function syncSteamWishlist() {
    setSteamWishlistSyncState({ status: 'loading', message: t('collection.syncingSteamWishlist'), summary: null });
    try {
      const settings = loadSteamSettings();
      const wishlistItems = await getSteamWishlist(settings);
      const summary = importSteamWishlistItems(wishlistItems);
      const message = formatSteamWishlistSyncSummary(summary, t);
      setSteamWishlistSyncState({ status: 'success', message, summary });
      addToastNotification({ actions: [getDismissAction()], category: summary.failedCount > 0 ? 'warning' : 'success', dedupeKey: 'steam-wishlist-sync:complete', message });
    } catch (error) {
      const isCredentialError = error instanceof SteamWishlistError && ['missing-profile', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message = error instanceof SteamWishlistError ? error.message : t('app.steamWishlistSyncFailedDetails');
      setSteamWishlistSyncState({ status: 'error', message, summary: null });
      addToastNotification({ actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()], category: isCredentialError ? 'warning' : 'error', dedupeKey: isCredentialError ? 'steam-wishlist-sync:settings' : 'steam-wishlist-sync:error', message });
    }
  }

  return { importSteamWishlistItems, syncSteamWishlist };
}
