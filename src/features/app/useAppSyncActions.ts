import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ItadDealSyncState } from '../../config/syncStates';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import { formatGameToastMessage, getViewGameAction, type NotificationDraft } from '../../lib/notifications';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import type { Game } from '../../types/game';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState, SteamWishlistSyncState } from '../../types/steam';
import type { TFunction } from '../../i18n';
import { didSteamAchievementSyncSucceed, didSteamPlaytimeSyncSucceed, formatSteamDataPartialDetails } from '../../utils/summaryFormatters';
import { useHltbSync } from '../integrations/hltb/useHltbSync';
import { useItadDealSync } from '../integrations/itad/useItadDealSync';
import { useSteamAchievementSync } from '../integrations/steam/useSteamAchievementSync';
import { useSteamPlaytimeSync } from '../integrations/steam/useSteamPlaytimeSync';
import { useSteamWishlistSync } from '../integrations/steam/useSteamWishlistSync';
import { useImportSyncActions } from '../imports/useImportSyncActions';
import type { SliceCommands } from './useSliceCommands';

type UseAppSyncActionsOptions = {
  games: Game[];
  /** AS-14: the games command boundary, for the syncs whose summary the user is shown. */
  runGamesCommand: SliceCommands['runGamesCommand'];
  ignoredSteamGames: IgnoredSteamGame[];
  isAppMountedRef: RefObject<boolean>;
  isHltbSyncing: boolean;
  itadDealSyncState: ItadDealSyncState;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIsHltbSyncing: Dispatch<SetStateAction<boolean>>;
  setItadDealSyncState: Dispatch<SetStateAction<ItadDealSyncState>>;
  setPlayActivity: Dispatch<SetStateAction<PlayActivityRecord[]>>;
  setSteamAchievementSyncState: Dispatch<SetStateAction<SteamAchievementSyncState>>;
  setSteamPlaytimeRefreshState: Dispatch<SetStateAction<SteamPlaytimeRefreshState>>;
  setSteamWishlistSyncState: Dispatch<SetStateAction<SteamWishlistSyncState>>;
  addToastNotification: (notification: NotificationDraft) => void;
  t: TFunction;
};

export function useAppSyncActions({
  games,
  runGamesCommand,
  ignoredSteamGames,
  isAppMountedRef,
  isHltbSyncing,
  itadDealSyncState,
  setGames,
  setIsHltbSyncing,
  setItadDealSyncState,
  setPlayActivity,
  setSteamAchievementSyncState,
  setSteamPlaytimeRefreshState,
  setSteamWishlistSyncState,
  addToastNotification,
  t,
}: UseAppSyncActionsOptions) {
  const syncSteamAchievements = useSteamAchievementSync({ games, isAppMountedRef, setGames, setSteamAchievementSyncState, addToastNotification, t });
  const refreshSteamPlaytime = useSteamPlaytimeSync({ games, setGames, setPlayActivity, setSteamPlaytimeRefreshState, addToastNotification, t });
  const { importSteamWishlistItems, syncSteamWishlist } = useSteamWishlistSync({ ignoredSteamGames, runGamesCommand, setSteamWishlistSyncState, addToastNotification, t });
  const syncWishlistDeals = useItadDealSync({ games, itadDealSyncState, setGames, setItadDealSyncState, addToastNotification, t });
  const syncHltb = useHltbSync({ games, isHltbSyncing, setGames, setIsHltbSyncing, addToastNotification, t });
  const { importMultiGameItems, importSteamWishlistHtmlItems } = useImportSyncActions({ runGamesCommand, addToastNotification, t });

  async function syncSteamDataForGame(game: Game) {
    const playtimeSummary = await refreshSteamPlaytime([game.id], { showToast: false });
    const achievementSummary = await syncSteamAchievements([game.id], { force: true, showToast: false });
    const isFullyUpdated = didSteamPlaytimeSyncSucceed(playtimeSummary) && didSteamAchievementSyncSucceed(achievementSummary);
    const message = formatGameToastMessage(isFullyUpdated ? t('toast.steamDataUpdated') : t('toast.steamDataPartiallyUpdated'), game);
    const details = isFullyUpdated ? undefined : formatSteamDataPartialDetails(playtimeSummary, achievementSummary);

    addToastNotification({
      actions: [getViewGameAction(game.id)],
      category: isFullyUpdated ? 'success' : 'warning',
      dedupeKey: `steam-data:${game.id}`,
      details,
      message,
    });

    return { achievementSummary, playtimeSummary };
  }

  return {
    importMultiGameItems,
    importSteamWishlistHtmlItems,
    importSteamWishlistItems,
    refreshSteamPlaytime,
    syncHltb,
    syncSteamAchievements,
    syncSteamDataForGame,
    syncSteamWishlist,
    syncWishlistDeals,
  };
}
