import type { Dispatch, RefObject, SetStateAction } from 'react';
import { isMissingOrGeneratedCover } from '../../lib/gameCoverImages';
import { hasSteamAchievementSummary } from '../../lib/steamAchievementSummary';
import type { ItadDealSyncState } from '../../config/syncStates';
import { appendSteamPlaytimeDeltaActivity, type PlayActivityRecord } from '../../lib/playActivityStorage';
import { saveGames } from '../../lib/gameStorage';
import { loadIsThereAnyDealSettings } from '../../lib/isThereAnyDealSettingsStorage';
import { loadSteamSettings } from '../../lib/steamSettingsStorage';
import { IsThereAnyDealError, syncItadDealsForWishlistGames } from '../../lib/isThereAnyDeal';
import { syncHltbForGames, type HltbSyncSummary } from '../../lib/hltb';
import { isSteamAchievementSyncableGame, syncSteamAchievementsForGames } from '../../lib/steamAchievementsSync';
import { isRefreshableSteamGame, refreshSteamPlaytimeForGames } from '../../lib/steamPlaytimeRefresh';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import {
  didSteamAchievementSyncSucceed,
  didSteamPlaytimeSyncSucceed,
  formatHltbSyncSummary,
  formatMessageTemplate,
  formatSteamAchievementSyncSummary,
  formatSteamDataPartialDetails,
  formatSteamPlaytimeRefreshSummary,
  formatSteamWishlistHtmlImportSummary,
  formatSteamWishlistSyncSummary,
  type SteamWishlistHtmlImportSummary,
} from '../../utils/summaryFormatters';
import {
  formatGameToastMessage,
  getDismissAction,
  getOpenSteamSettingsAction,
  getViewGameAction,
  type NotificationDraft,
} from '../../lib/notifications';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import { getOwnedGames, getSteamWishlist, mapSteamWishlistItemToLocalGame, SteamApiError, SteamWishlistError } from '../../services/steamApi';
import type { Game } from '../../types/game';
import type {
  SteamAchievementSyncState,
  SteamAchievementSyncSummary,
  SteamPlaytimeRefreshState,
  SteamPlaytimeRefreshSummary,
  SteamWishlistItem,
  SteamWishlistSyncState,
  SteamWishlistSyncSummary,
} from '../../types/steam';
import type { TFunction } from '../../i18n';

type UseAppSyncActionsOptions = {
  games: Game[];
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
  async function syncSteamWishlist() {
    setSteamWishlistSyncState({
      status: 'loading',
      message: t('collection.syncingSteamWishlist'),
      summary: null,
    });

    try {
      const settings = loadSteamSettings();
      const wishlistItems = await getSteamWishlist(settings);
      const summary = importSteamWishlistItems(wishlistItems);
      const message = formatSteamWishlistSyncSummary(summary, t);

      setSteamWishlistSyncState({
        status: 'success',
        message,
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: summary.failedCount > 0 ? 'warning' : 'success',
        dedupeKey: 'steam-wishlist-sync:complete',
        message,
      });
    } catch (error) {
      const isCredentialError = error instanceof SteamWishlistError && ['missing-profile', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamWishlistError
          ? error.message
          : t('app.steamWishlistSyncFailedDetails');

      setSteamWishlistSyncState({
        status: 'error',
        message,
        summary: null,
      });
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-wishlist-sync:settings' : 'steam-wishlist-sync:error',
        message,
      });
    }
  }

  async function syncSteamAchievements(
    gameIds?: string[],
    options: { completionToastMessage?: (summary: SteamAchievementSyncSummary) => string; emptyToastMessage?: string; force?: boolean; showToast?: boolean } = {},
  ) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter(
      (game) => game.collectionType === 'library',
    );
    const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
    const total = syncableGames.length;

    if (total === 0) {
      const summary: SteamAchievementSyncSummary = {
        failedCount: 0,
        noAchievementDataCount: 0,
        skippedNonSteamCount: targetGames.length,
        unchangedCount: 0,
        updatedCount: 0,
      };
      const message = options.emptyToastMessage ?? t('collection.noEligibleSteamGames');

      setSteamAchievementSyncState({
        status: 'success',
        message,
        progress: { completed: 0, total },
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: 'warning',
        dedupeKey: 'steam-achievements:no-steam-games',
        message,
      });
      return summary;
    }

    setSteamAchievementSyncState({
      status: 'loading',
      message: total > 50 ? t('collection.syncingSteamAchievementsLong') : t('collection.syncingSteamAchievements'),
      progress: { completed: 0, total },
      summary: null,
    });

    let terminalState: SteamAchievementSyncState | null = null;
    let summaryToReturn: SteamAchievementSyncSummary | null = null;

    try {
      const settings = loadSteamSettings();
      const syncedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = await withSteamAchievementSyncWatchdog(
        syncSteamAchievementsForGames(
          games,
          targetGameIds,
          settings,
          syncedAt,
          (progress) => {
            if (!isAppMountedRef.current) {
              return;
            }

            setSteamAchievementSyncState((currentState) =>
              currentState.status === 'loading'
                ? {
                    ...currentState,
                    progress,
                    summary: null,
                  }
                : currentState,
            );
          },
          (batchResult) => {
            if (!isAppMountedRef.current) {
              saveGames(batchResult.games);
              return;
            }

            setGames((currentGames) => {
              return mergeSteamAchievementUpdates(currentGames, batchResult.games, targetGameIds);
            });
            setSteamAchievementSyncState((currentState) =>
              currentState.status === 'loading'
                ? {
                    ...currentState,
                    progress: batchResult.progress,
                    summary: null,
                  }
                : currentState,
            );
          },
          options.force,
        ),
        total,
      );

      summaryToReturn = result.summary;

      debugAchievementSyncDiagnostic('helper resolved', { summary: result.summary });
      debugAchievementSyncDiagnostic('updated games count', {
        updatedGamesCount: result.games.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length,
      });

      if (!isAppMountedRef.current) {
        return summaryToReturn;
      }

      setGames((currentGames) => {
        const mergedGames = mergeSteamAchievementUpdates(currentGames, result.games, targetGameIds);
        debugAchievementSyncDiagnostic('state update dispatched', {
          updatedGamesCount: mergedGames.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length,
        });
        return mergedGames;
      });
      terminalState = {
        status: 'success',
        message: formatSteamAchievementSyncSummary(result.summary),
        progress: { completed: total, total },
        summary: result.summary,
      };

      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({
          actions: syncableGames[0] ? [getViewGameAction(syncableGames[0].id)] : [getDismissAction()],
          category: hasPartialFailures ? 'warning' : 'success',
          dedupeKey: `steam-achievements:${syncableGames.map((game) => game.id).join(',')}`,
          details: options.completionToastMessage?.(result.summary) ?? formatSteamAchievementSyncSummary(result.summary),
          message: syncableGames.length === 1
            ? formatGameToastMessage(hasPartialFailures ? t('toast.steamAchievementsPartiallySynced') : t('toast.steamAchievementsSynced'), syncableGames[0])
            : hasPartialFailures ? t('app.steamAchievementsBulkPartiallySynced') : t('app.steamAchievementsBulkSynced'),
        });
      }

      return summaryToReturn;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : t('app.steamAchievementSyncFailedDetails');
      const failedSummary: SteamAchievementSyncSummary = {
        failedCount: total,
        noAchievementDataCount: 0,
        skippedNonSteamCount: targetGames.length - total,
        unchangedCount: 0,
        updatedCount: 0,
      };

      summaryToReturn = failedSummary;

      if (!isAppMountedRef.current) {
        return summaryToReturn;
      }

      terminalState = {
        status: 'error',
        message,
        progress: { completed: total, total },
        summary: failedSummary,
      };
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-achievements:credentials' : 'steam-achievements:error',
        details: isCredentialError
          ? t('app.steamAchievementCredentialsHelp')
          : message,
        message: isCredentialError ? t('app.steamCredentialsNeeded') : t('app.steamAchievementSyncFailed'),
      });

      return summaryToReturn;
    } finally {
      debugSteamAchievementSyncFinalization('finally reached', {
        total,
        hasTerminalState: terminalState !== null,
        hasSummary: summaryToReturn !== null,
      });

      if (isAppMountedRef.current) {
        debugAchievementSyncDiagnostic('sync state success', {
          status: terminalState?.status ?? 'error',
          hasSummary: summaryToReturn !== null,
        });
        setSteamAchievementSyncState(
          terminalState ?? {
            status: 'error',
            message: t('app.steamAchievementSyncStopped'),
            progress: { completed: total, total },
            summary: summaryToReturn,
          },
        );
      }
    }
  }

  async function refreshSteamPlaytime(
    gameIds?: string[],
    options: { completionToastMessage?: (summary: SteamPlaytimeRefreshSummary) => string; emptyToastMessage?: string; showToast?: boolean } = {},
  ) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter(
      (game) => game.collectionType === 'library',
    );
    const refreshableGames = targetGames.filter(isRefreshableSteamGame);
    const total = refreshableGames.length;

    if (total === 0) {
      const summary: SteamPlaytimeRefreshSummary = {
        deltaMinutes: 0,
        failedCount: 0,
        skippedNonSteamCount: targetGames.length,
        unchangedCount: 0,
        updatedCount: 0,
      };
      setSteamPlaytimeRefreshState({
        status: 'success',
        message: options.emptyToastMessage ?? t('app.noSteamLibraryGamesSelectedPlaytime'),
        progress: { completed: 0, total },
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: 'warning',
        dedupeKey: 'steam-playtime-refresh:no-steam-games',
        message: options.emptyToastMessage ?? t('app.selectSteamLibraryGamesPlaytime'),
      });
      return summary;
    }

    setSteamPlaytimeRefreshState((currentState) => ({
      status: 'loading',
      message: formatMessageTemplate(t('app.fetchingSteamPlaytime'), { count: total }),
      progress: { completed: 0, total },
      summary: currentState.summary,
    }));

    try {
      const settings = loadSteamSettings();
      const ownedGames = await getOwnedGames(settings);
      const refreshedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = refreshSteamPlaytimeForGames(games, targetGameIds, ownedGames, refreshedAt);
      const completed = result.summary.updatedCount + result.summary.unchangedCount + result.summary.failedCount;

      setGames(result.games);
      if (result.activityRecords.length > 0) {
        setPlayActivity((currentActivity) => appendSteamPlaytimeDeltaActivity(currentActivity, result.activityRecords));
      }
      setSteamPlaytimeRefreshState({
        status: 'success',
        message: formatSteamPlaytimeRefreshSummary(result.summary),
        progress: { completed, total },
        summary: result.summary,
      });

      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({
          actions: [getViewGameAction(refreshableGames[0].id)],
          category: hasPartialFailures ? 'warning' : 'success',
          dedupeKey: `steam-playtime-refresh:${refreshableGames[0].id}`,
          details: options.completionToastMessage?.(result.summary) ?? formatSteamPlaytimeRefreshSummary(result.summary),
          message: refreshableGames.length === 1
            ? formatGameToastMessage(hasPartialFailures ? t('toast.steamPlaytimePartiallyRefreshed') : t('toast.steamPlaytimeRefreshed'), refreshableGames[0])
            : hasPartialFailures ? t('app.steamPlaytimePartiallyRefreshed') : t('app.steamPlaytimeRefreshed'),
        });
      }

      return result.summary;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamApiError
          ? error.message
          : t('app.steamPlaytimeRefreshFailedDetails');

      setSteamPlaytimeRefreshState((currentState) => ({
        status: 'error',
        message,
        progress: { completed: 0, total },
        summary: currentState.summary,
      }));
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-playtime-refresh:credentials' : 'steam-playtime-refresh:error',
        details: isCredentialError
          ? t('app.steamPlaytimeCredentialsHelp')
          : message,
        message: isCredentialError ? t('app.steamCredentialsNeeded') : t('app.steamPlaytimeRefreshFailed'),
      });

      return null;
    }
  }

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

  async function syncHltb(gameIds: string[]): Promise<HltbSyncSummary | null> {
    if (isHltbSyncing) {
      return null;
    }

    const targetGames = games.filter((game) => gameIds.includes(game.id));

    if (targetGames.length === 0) {
      const message = t('hltb.noGamesForSync');
      addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-empty', message });
      return null;
    }

    const runningMessage = targetGames.length > 12 ? t('hltb.syncingLong') : t('hltb.syncing');
    setIsHltbSyncing(true);
    addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-start', message: runningMessage });

    try {
      const result = await syncHltbForGames(targetGames, undefined, { force: true });
      const updatedGamesById = new Map(result.games.map((game) => [game.id, game]));

      setGames((currentGames) => currentGames.map((game) => updatedGamesById.get(game.id) ?? game));

      const message = result.summary.unavailableCount > 0 && result.summary.updatedCount === 0 && result.summary.noMatchCount === 0
        ? `${t('hltb.unavailable')} ${formatHltbSyncSummary(result.summary, t)}`
        : formatHltbSyncSummary(result.summary, t);
      addToastNotification({
        category: result.summary.failedCount > 0 ? 'warning' : 'success',
        dedupeKey: 'hltb-sync-complete',
        message,
      });
      return result.summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : t('hltb.syncFailed');
      addToastNotification({ category: 'error', dedupeKey: 'hltb-sync-error', message });
      return null;
    } finally {
      setIsHltbSyncing(false);
    }
  }

  async function syncWishlistDeals(gameIds: string[]) {
    if (itadDealSyncState.status === 'loading') {
      return null;
    }

    const settings = loadIsThereAnyDealSettings();
    const targetGames = games.filter((game) => game.collectionType === 'wishlist' && gameIds.includes(game.id));

    if (targetGames.length === 0) {
      const message = t('itad.noWishlistGamesForSync');
      setItadDealSyncState({ status: 'error', message, summary: null });
      addToastNotification({ category: 'info', dedupeKey: 'itad-deal-sync-empty', message });
      return null;
    }

    const runningMessage = targetGames.length > 12 ? t('itad.syncingDealsLong') : t('itad.syncingDeals');
    setItadDealSyncState({ status: 'loading', message: runningMessage, summary: null });

    try {
      const results = await syncItadDealsForWishlistGames(targetGames, settings.apiKey);
      const syncedAt = new Date().toISOString();
      const summary = results.reduce(
        (currentSummary, result) => ({
          updatedCount: currentSummary.updatedCount + (result.status === 'updated' ? 1 : 0),
          noMatchCount: currentSummary.noMatchCount + (result.status === 'no-match' ? 1 : 0),
          failedCount: currentSummary.failedCount + (result.status === 'failed' ? 1 : 0),
          historicalLowCount: currentSummary.historicalLowCount + (result.status === 'updated' && result.deal?.isHistoricalLow ? 1 : 0),
        }),
        { updatedCount: 0, noMatchCount: 0, failedCount: 0, historicalLowCount: 0 },
      );
      const resultByGameId = new Map(results.map((result) => [result.gameId, result]));

      setGames((currentGames) => currentGames.map((game) => {
        const result = resultByGameId.get(game.id);

        if (!result) {
          return game;
        }

        if (result.status === 'no-match') {
          return {
            ...game,
            itadCurrentBestCurrency: undefined,
            itadCurrentBestPrice: undefined,
            itadCurrentBestShop: undefined,
            itadCurrentBestUrl: undefined,
            itadDiscountPercent: undefined,
            itadHistoricalLowPrice: undefined,
            itadIsHistoricalLow: undefined,
            itadLastSyncedAt: syncedAt,
          };
        }

        if (result.status !== 'updated' || !result.match || !result.deal) {
          return { ...game, itadLastSyncedAt: syncedAt };
        }

        return {
          ...game,
          itadId: result.match.id,
          itadPlain: result.match.slug,
          itadSlug: result.match.slug,
          itadMatchConfidence: result.match.confidence,
          itadCurrentBestPrice: result.deal.currentBestPrice,
          itadCurrentBestCurrency: result.deal.currentBestCurrency,
          itadCurrentBestShop: result.deal.currentBestShop,
          itadCurrentBestUrl: result.deal.currentBestUrl,
          itadDiscountPercent: result.deal.discountPercent,
          itadHistoricalLowPrice: result.deal.historicalLowPrice,
          itadHistoricalLowCurrency: result.deal.historicalLowCurrency,
          itadIsHistoricalLow: result.deal.isHistoricalLow,
          itadLastSyncedAt: syncedAt,
        };
      }));

      const message = `${summary.updatedCount} deals updated · ${summary.historicalLowCount} historical lows found · ${summary.failedCount} failures${summary.noMatchCount > 0 ? ` · ${summary.noMatchCount} no match` : ''}.`;
      setItadDealSyncState({ status: summary.failedCount > 0 ? 'error' : 'success', message, summary });
      addToastNotification({ category: summary.failedCount > 0 ? 'warning' : 'success', dedupeKey: 'itad-deal-sync-complete', message });
      return summary;
    } catch (error) {
      const message = error instanceof IsThereAnyDealError && error.code === 'missing-api-key'
        ? t('itad.missingApiKey')
        : error instanceof Error
          ? error.message
          : t('app.dealSyncFailed');
      setItadDealSyncState({ status: 'error', message, summary: null });
      addToastNotification({ category: 'error', dedupeKey: 'itad-deal-sync-error', message });
      return null;
    }
  }

  function importSteamWishlistItems(wishlistItems: SteamWishlistItem[]): SteamWishlistSyncSummary {
    const syncedAt = new Date().toISOString();
    const ignoredSteamAppIds = new Set(ignoredSteamGames.map((game) => game.steamAppId));
    const nextGames = [...games];
    const librarySteamAppIds = new Set(
      games
        .filter((game) => game.collectionType === 'library')
        .map((game) => game.steamAppId)
        .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
    );
    const wishlistIndexBySteamAppId = new Map<number, number>();
    const wishlistIndexByTitle = new Map<string, number>();
    const summary: SteamWishlistSyncSummary = {
      addedCount: 0,
      failedCount: 0,
      fetchedCount: wishlistItems.length,
      skippedAlreadyInLibraryCount: 0,
      skippedIgnoredCount: 0,
      unchangedCount: 0,
      updatedCount: 0,
    };

    games.forEach((game, index) => {
      if (game.collectionType !== 'wishlist') {
        return;
      }

      if (typeof game.steamAppId === 'number') {
        wishlistIndexBySteamAppId.set(game.steamAppId, index);
      }

      const normalizedTitle = normalizeGameTitleForWishlistMatch(game.title);

      if (normalizedTitle && !wishlistIndexByTitle.has(normalizedTitle)) {
        wishlistIndexByTitle.set(normalizedTitle, index);
      }
    });

    wishlistItems.forEach((item) => {
      if (!item.appid || !item.name) {
        summary.failedCount += 1;
        return;
      }

      if (ignoredSteamAppIds.has(item.appid)) {
        summary.skippedIgnoredCount += 1;
        return;
      }

      if (librarySteamAppIds.has(item.appid)) {
        summary.skippedAlreadyInLibraryCount += 1;
        return;
      }

      const normalizedTitle = normalizeGameTitleForWishlistMatch(item.name);
      const existingWishlistIndex = wishlistIndexBySteamAppId.get(item.appid) ?? (normalizedTitle ? wishlistIndexByTitle.get(normalizedTitle) : undefined);
      const mappedGame = mapSteamWishlistItemToLocalGame(item, syncedAt);

      if (typeof existingWishlistIndex === 'number') {
        const existingGame = nextGames[existingWishlistIndex];
        const mergedGame = touchGameRecord(mergeSteamWishlistSync(existingGame, mappedGame, syncedAt));
        nextGames[existingWishlistIndex] = mergedGame;
        wishlistIndexBySteamAppId.set(item.appid, existingWishlistIndex);

        if (normalizedTitle) {
          wishlistIndexByTitle.set(normalizedTitle, existingWishlistIndex);
        }

        if (areSteamWishlistSyncedFieldsEqual(existingGame, mergedGame)) {
          summary.unchangedCount += 1;
        } else {
          summary.updatedCount += 1;
        }

        return;
      }

      nextGames.push(touchGameRecord(mappedGame));
      wishlistIndexBySteamAppId.set(item.appid, nextGames.length - 1);

      if (normalizedTitle) {
        wishlistIndexByTitle.set(normalizedTitle, nextGames.length - 1);
      }

      summary.addedCount += 1;
    });

    setGames(nextGames);
    return summary;
  }

  function importSteamWishlistHtmlItems(items: ParsedSteamWishlistImportItem[], inputSkippedCount = 0): SteamWishlistHtmlImportSummary {
    const importedAt = new Date().toISOString();
    const existingWishlistIndexBySteamAppId = new Map<number, number>();

    games.forEach((game, index) => {
      if (game.collectionType === 'wishlist' && typeof game.steamAppId === 'number') {
        existingWishlistIndexBySteamAppId.set(game.steamAppId, index);
      }
    });

    const existingGameIds = new Set(games.map((game) => game.id));
    const nextGames = [...games];
    const summary: SteamWishlistHtmlImportSummary = {
      addedCount: 0,
      existingCount: 0,
      skippedCount: inputSkippedCount,
    };

    items.forEach((item) => {
      if (!item.appid) {
        summary.existingCount += 1;
        console.warn('[Steam Wishlist HTML Import] Skipped parsed item without a Steam app id.', { item });
        return;
      }

      const mappedGame = mapSteamWishlistItemToLocalGame(item, importedAt);
      const existingWishlistIndex = existingWishlistIndexBySteamAppId.get(item.appid);

      if (typeof existingWishlistIndex === 'number') {
        const existingGame = nextGames[existingWishlistIndex];

        if (shouldReplaceSteamWishlistPlaceholderTitle(existingGame, mappedGame)) {
          nextGames[existingWishlistIndex] = touchGameRecord({
            ...existingGame,
            title: mappedGame.title,
            steamAppId: existingGame.steamAppId ?? mappedGame.steamAppId,
            externalSource: existingGame.externalSource ?? mappedGame.externalSource,
            externalUrl: mappedGame.externalUrl,
            storeUrl: mappedGame.storeUrl,
            wishlistImportedAt: existingGame.wishlistImportedAt ?? importedAt,
            wishlistSyncedAt: importedAt,
          });
          console.info('[Steam Wishlist HTML Import] Repaired existing placeholder wishlist title.', {
            appid: item.appid,
            previousTitle: existingGame.title,
            repairedTitle: mappedGame.title,
          });
        } else {
          console.debug('[Steam Wishlist HTML Import] Existing wishlist item kept unchanged.', {
            appid: item.appid,
            existingTitle: existingGame.title,
            importedTitle: mappedGame.title,
          });
        }

        summary.existingCount += 1;
        return;
      }

      let wishlistId = mappedGame.id;
      let suffix = 2;

      while (existingGameIds.has(wishlistId)) {
        wishlistId = `${mappedGame.id}-${suffix}`;
        suffix += 1;
      }

      existingGameIds.add(wishlistId);
      existingWishlistIndexBySteamAppId.set(item.appid, nextGames.length);
      nextGames.push(touchGameRecord({
        ...mappedGame,
        id: wishlistId,
        wishlistSyncedAt: undefined,
      }));
      console.debug('[Steam Wishlist HTML Import] Added wishlist item.', {
        appid: item.appid,
        title: mappedGame.title,
        id: wishlistId,
      });
      summary.addedCount += 1;
    });

    setGames(nextGames);

    const message = formatSteamWishlistHtmlImportSummary(summary, t);
    addToastNotification({
      category: summary.addedCount > 0 ? 'success' : 'info',
      dedupeKey: 'steam-wishlist-html-import',
      message,
    });

    return summary;
  }

  return {
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

function withSteamAchievementSyncWatchdog<T>(promise: Promise<T>, total: number) {
  const timeoutMs = getSteamAchievementSyncWatchdogTimeoutMs(total);
  let timeoutId: number | undefined;

  const watchdog = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Steam achievement sync timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });

  return Promise.race([promise, watchdog]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function getSteamAchievementSyncWatchdogTimeoutMs(total: number) {
  if (total <= 2) {
    return 60_000;
  }

  return Math.min(Math.max(60_000, total * 20_000), 10 * 60_000);
}

function debugSteamAchievementSyncFinalization(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[SteamAchievementSync] ${message}`, data ?? {});
}

function debugAchievementSyncDiagnostic(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[ach-sync] ${message}`, data ?? {});
}

function mergeSteamAchievementUpdates(currentGames: Game[], syncedGames: Game[], targetGameIds: Set<string>) {
  const syncedGamesById = new Map(syncedGames.map((game) => [game.id, game]));

  return currentGames.map((game) => {
    if (!targetGameIds.has(game.id)) {
      return game;
    }

    const syncedGame = syncedGamesById.get(game.id);

    if (!syncedGame) {
      return game;
    }

    const hasAchievementSummary = typeof syncedGame.steamAchievementsTotal === 'number' && syncedGame.steamAchievementsTotal > 0;
    const hasCurrentAchievementSummary = typeof game.steamAchievementsTotal === 'number' && game.steamAchievementsTotal > 0;

    if (!hasAchievementSummary) {
      if (syncedGame.steamAchievementsUnsupported === true && !hasCurrentAchievementSummary) {
        return {
          ...game,
          steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported,
          steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt,
          updatedAt: syncedGame.updatedAt,
        };
      }

      return game;
    }

    return {
      ...game,
      ...(hasAchievementSummary
        ? {
            steamAchievementsTotal: syncedGame.steamAchievementsTotal,
            steamAchievementsUnlocked: syncedGame.steamAchievementsUnlocked,
            steamAchievementsPercent: syncedGame.steamAchievementsPercent,
            steamLastAchievementUnlockTime: syncedGame.steamLastAchievementUnlockTime,
            ...(syncedGame.steamAchievements ? { steamAchievements: syncedGame.steamAchievements } : {}),
          }
        : {}),
      steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported,
      steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt,
      updatedAt: syncedGame.updatedAt,
    };
  });
}

function normalizeGameTitleForWishlistMatch(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areSteamWishlistSyncedFieldsEqual(previousGame: Game, nextGame: Game) {
  return (
    previousGame.title === nextGame.title &&
    previousGame.coverImage === nextGame.coverImage &&
    previousGame.steamAppId === nextGame.steamAppId &&
    previousGame.externalSource === nextGame.externalSource &&
    previousGame.externalUrl === nextGame.externalUrl &&
    previousGame.storeUrl === nextGame.storeUrl &&
    previousGame.releaseDate === nextGame.releaseDate &&
    previousGame.steamPriceInfo === nextGame.steamPriceInfo &&
    previousGame.steamDiscountInfo === nextGame.steamDiscountInfo &&
    previousGame.steamReviewInfo === nextGame.steamReviewInfo
  );
}

function mergeSteamWishlistSync(existingGame: Game, syncedGame: Game, syncedAt: string): Game {
  const shouldUseSyncedArtwork = isMissingOrGeneratedCover(existingGame.coverImage) && syncedGame.coverImage;
  const shouldUseSyncedTitle = shouldReplaceSteamWishlistPlaceholderTitle(existingGame, syncedGame);

  if (shouldUseSyncedTitle) {
    console.info('[Steam Wishlist Sync] Repaired placeholder wishlist title.', {
      appid: syncedGame.steamAppId,
      previousTitle: existingGame.title,
      repairedTitle: syncedGame.title,
    });
  }

  return {
    ...existingGame,
    title: shouldUseSyncedTitle ? syncedGame.title : existingGame.title || syncedGame.title,
    platform: existingGame.platform || syncedGame.platform,
    artworkSource: shouldUseSyncedArtwork ? syncedGame.artworkSource : existingGame.artworkSource,
    artworkUpdatedAt: shouldUseSyncedArtwork ? syncedAt : existingGame.artworkUpdatedAt,
    coverImage: shouldUseSyncedArtwork ? syncedGame.coverImage : existingGame.coverImage,
    steamAppId: existingGame.steamAppId ?? syncedGame.steamAppId,
    externalSource: existingGame.externalSource ?? syncedGame.externalSource,
    externalUrl: syncedGame.externalUrl,
    storeUrl: syncedGame.storeUrl,
    releaseDate: syncedGame.releaseDate ?? existingGame.releaseDate,
    steamPriceInfo: syncedGame.steamPriceInfo,
    steamDiscountInfo: syncedGame.steamDiscountInfo,
    steamReviewInfo: syncedGame.steamReviewInfo,
    wishlistImportedAt: existingGame.wishlistImportedAt ?? syncedAt,
    wishlistSyncedAt: syncedAt,
  };
}

function shouldReplaceSteamWishlistPlaceholderTitle(existingGame: Game, syncedGame: Game) {
  const appid = existingGame.steamAppId ?? syncedGame.steamAppId;

  if (typeof appid !== 'number') {
    return false;
  }

  return isPlaceholderSteamWishlistTitle(existingGame.title, appid) && !isPlaceholderSteamWishlistTitle(syncedGame.title, appid);
}

function isPlaceholderSteamWishlistTitle(title: string, appid: number) {
  return title.trim().toLowerCase() === `steam app ${appid}`.toLowerCase();
}

function touchGameRecord<T extends { updatedAt?: string }>(game: T): T {
  return { ...game, updatedAt: new Date().toISOString() };
}
