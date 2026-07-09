import type { Dispatch, SetStateAction } from 'react';
import { appendSteamPlaytimeDeltaActivity, type PlayActivityRecord } from '../../../lib/playActivityStorage';
import { loadSteamSettings } from '../../../lib/steamSettingsStorage';
import { isRefreshableSteamGame, refreshSteamPlaytimeForGames } from '../../../lib/steamPlaytimeRefresh';
import { formatGameToastMessage, getDismissAction, getOpenSteamSettingsAction, getViewGameAction, type NotificationDraft } from '../../../lib/notifications';
import { getOwnedGames, SteamApiError } from '../../../services/steamApi';
import type { Game } from '../../../types/game';
import type { SteamPlaytimeRefreshState, SteamPlaytimeRefreshSummary } from '../../../types/steam';
import type { TFunction } from '../../../i18n';
import { formatMessageTemplate, formatSteamPlaytimeRefreshSummary } from '../../../utils/summaryFormatters';

export type SteamPlaytimeSyncOptions = {
  games: Game[];
  setGames: Dispatch<SetStateAction<Game[]>>;
  setPlayActivity: Dispatch<SetStateAction<PlayActivityRecord[]>>;
  setSteamPlaytimeRefreshState: Dispatch<SetStateAction<SteamPlaytimeRefreshState>>;
  addToastNotification: (notification: NotificationDraft) => void;
  t: TFunction;
};

export type RefreshSteamPlaytimeOptions = {
  completionToastMessage?: (summary: SteamPlaytimeRefreshSummary) => string;
  emptyToastMessage?: string;
  showToast?: boolean;
};

export function useSteamPlaytimeSync({ games, setGames, setPlayActivity, setSteamPlaytimeRefreshState, addToastNotification, t }: SteamPlaytimeSyncOptions) {
  return async function refreshSteamPlaytime(gameIds?: string[], options: RefreshSteamPlaytimeOptions = {}) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter((game) => game.collectionType === 'library');
    const refreshableGames = targetGames.filter(isRefreshableSteamGame);
    const total = refreshableGames.length;
    if (total === 0) {
      const summary: SteamPlaytimeRefreshSummary = { deltaMinutes: 0, failedCount: 0, skippedNonSteamCount: targetGames.length, unchangedCount: 0, updatedCount: 0 };
      setSteamPlaytimeRefreshState({ status: 'success', message: options.emptyToastMessage ?? t('app.noSteamLibraryGamesSelectedPlaytime'), progress: { completed: 0, total }, summary });
      addToastNotification({ actions: [getDismissAction()], category: 'warning', dedupeKey: 'steam-playtime-refresh:no-steam-games', message: options.emptyToastMessage ?? t('app.selectSteamLibraryGamesPlaytime') });
      return summary;
    }
    setSteamPlaytimeRefreshState((currentState) => ({ status: 'loading', message: formatMessageTemplate(t('app.fetchingSteamPlaytime'), { count: total }), progress: { completed: 0, total }, summary: currentState.summary }));
    try {
      const settings = loadSteamSettings();
      const ownedGames = await getOwnedGames(settings);
      const refreshedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = refreshSteamPlaytimeForGames(games, targetGameIds, ownedGames, refreshedAt);
      const completed = result.summary.updatedCount + result.summary.unchangedCount + result.summary.failedCount;
      setGames((currentGames) => mergeSteamPlaytimeUpdates(currentGames, result.games, targetGameIds));
      if (result.activityRecords.length > 0) setPlayActivity((currentActivity) => appendSteamPlaytimeDeltaActivity(currentActivity, result.activityRecords));
      setSteamPlaytimeRefreshState({ status: 'success', message: formatSteamPlaytimeRefreshSummary(result.summary), progress: { completed, total }, summary: result.summary });
      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({ actions: [getViewGameAction(refreshableGames[0].id)], category: hasPartialFailures ? 'warning' : 'success', dedupeKey: `steam-playtime-refresh:${refreshableGames[0].id}`, details: options.completionToastMessage?.(result.summary) ?? formatSteamPlaytimeRefreshSummary(result.summary), message: refreshableGames.length === 1 ? formatGameToastMessage(hasPartialFailures ? t('toast.steamPlaytimePartiallyRefreshed') : t('toast.steamPlaytimeRefreshed'), refreshableGames[0]) : hasPartialFailures ? t('app.steamPlaytimePartiallyRefreshed') : t('app.steamPlaytimeRefreshed') });
      }
      return result.summary;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message = error instanceof SteamApiError ? error.message : t('app.steamPlaytimeRefreshFailedDetails');
      setSteamPlaytimeRefreshState((currentState) => ({ status: 'error', message, progress: { completed: 0, total }, summary: currentState.summary }));
      addToastNotification({ actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()], category: isCredentialError ? 'warning' : 'error', dedupeKey: isCredentialError ? 'steam-playtime-refresh:credentials' : 'steam-playtime-refresh:error', details: isCredentialError ? t('app.steamPlaytimeCredentialsHelp') : message, message: isCredentialError ? t('app.steamCredentialsNeeded') : t('app.steamPlaytimeRefreshFailed') });
      return null;
    }
  };
}

function mergeSteamPlaytimeUpdates(currentGames: Game[], syncedGames: Game[], targetGameIds: Set<string>) {
  const syncedGamesById = new Map(syncedGames.map((game) => [game.id, game]));
  return currentGames.map((game) => {
    if (!targetGameIds.has(game.id)) return game;
    const syncedGame = syncedGamesById.get(game.id);
    if (!syncedGame) return game;
    return { ...game, lastPlayedAt: syncedGame.lastPlayedAt, lastSteamActivityAt: syncedGame.lastSteamActivityAt, lastSteamActivityDeltaMinutes: syncedGame.lastSteamActivityDeltaMinutes, playtimeHours: syncedGame.playtimeHours, steamPlaytimeMinutes: syncedGame.steamPlaytimeMinutes, updatedAt: syncedGame.updatedAt };
  });
}
