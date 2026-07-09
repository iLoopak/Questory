import type { Dispatch, RefObject, SetStateAction } from 'react';
import { hasSteamAchievementSummary } from '../../../lib/steamAchievementSummary';
import { getSteamProviderState } from '../../../lib/gameSelectors';
import { saveGames } from '../../../lib/gameStorage';
import { loadSteamSettings } from '../../../lib/steamSettingsStorage';
import { isSteamAchievementSyncableGame, syncSteamAchievementsForGames } from '../../../lib/steamAchievementsSync';
import { formatGameToastMessage, getDismissAction, getOpenSteamSettingsAction, getViewGameAction, type NotificationDraft } from '../../../lib/notifications';
import { SteamApiError } from '../../../services/steamApi';
import type { Game } from '../../../types/game';
import type { SteamAchievementSyncState, SteamAchievementSyncSummary } from '../../../types/steam';
import type { TFunction } from '../../../i18n';
import { formatSteamAchievementSyncSummary } from '../../../utils/summaryFormatters';

export type SteamAchievementSyncOptions = {
  games: Game[];
  isAppMountedRef: RefObject<boolean>;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setSteamAchievementSyncState: Dispatch<SetStateAction<SteamAchievementSyncState>>;
  addToastNotification: (notification: NotificationDraft) => void;
  t: TFunction;
};

export type SyncSteamAchievementsOptions = {
  completionToastMessage?: (summary: SteamAchievementSyncSummary) => string;
  emptyToastMessage?: string;
  force?: boolean;
  showToast?: boolean;
};

export function useSteamAchievementSync({ games, isAppMountedRef, setGames, setSteamAchievementSyncState, addToastNotification, t }: SteamAchievementSyncOptions) {
  return async function syncSteamAchievements(
    gameIds?: string[],
    options: SyncSteamAchievementsOptions = {},
  ) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter((game) => game.collectionType === 'library');
    const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
    const total = syncableGames.length;

    if (total === 0) {
      const summary: SteamAchievementSyncSummary = { failedCount: 0, noAchievementDataCount: 0, skippedNonSteamCount: targetGames.length, unchangedCount: 0, updatedCount: 0 };
      const message = options.emptyToastMessage ?? t('collection.noEligibleSteamGames');
      setSteamAchievementSyncState({ status: 'success', message, progress: { completed: 0, total }, summary });
      addToastNotification({ actions: [getDismissAction()], category: 'warning', dedupeKey: 'steam-achievements:no-steam-games', message });
      return summary;
    }

    setSteamAchievementSyncState({ status: 'loading', message: total > 50 ? t('collection.syncingSteamAchievementsLong') : t('collection.syncingSteamAchievements'), progress: { completed: 0, total }, summary: null });
    let terminalState: SteamAchievementSyncState | null = null;
    let summaryToReturn: SteamAchievementSyncSummary | null = null;

    try {
      const settings = loadSteamSettings();
      const syncedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = await withSteamAchievementSyncWatchdog(syncSteamAchievementsForGames(games, targetGameIds, settings, syncedAt, (progress) => {
        if (!isAppMountedRef.current) return;
        setSteamAchievementSyncState((currentState) => currentState.status === 'loading' ? { ...currentState, progress, summary: null } : currentState);
      }, (batchResult) => {
        if (!isAppMountedRef.current) { saveGames(batchResult.games); return; }
        setGames((currentGames) => mergeSteamAchievementUpdates(currentGames, batchResult.games, targetGameIds));
        setSteamAchievementSyncState((currentState) => currentState.status === 'loading' ? { ...currentState, progress: batchResult.progress, summary: null } : currentState);
      }, options.force), total);

      summaryToReturn = result.summary;
      debugAchievementSyncDiagnostic('helper resolved', { summary: result.summary });
      debugAchievementSyncDiagnostic('updated games count', { updatedGamesCount: result.games.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length });
      if (!isAppMountedRef.current) return summaryToReturn;
      setGames((currentGames) => {
        const mergedGames = mergeSteamAchievementUpdates(currentGames, result.games, targetGameIds);
        debugAchievementSyncDiagnostic('state update dispatched', { updatedGamesCount: mergedGames.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length });
        return mergedGames;
      });
      terminalState = { status: 'success', message: formatSteamAchievementSyncSummary(result.summary), progress: { completed: total, total }, summary: result.summary };
      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({ actions: syncableGames[0] ? [getViewGameAction(syncableGames[0].id)] : [getDismissAction()], category: hasPartialFailures ? 'warning' : 'success', dedupeKey: `steam-achievements:${syncableGames.map((game) => game.id).join(',')}`, details: options.completionToastMessage?.(result.summary) ?? formatSteamAchievementSyncSummary(result.summary), message: syncableGames.length === 1 ? formatGameToastMessage(hasPartialFailures ? t('toast.steamAchievementsPartiallySynced') : t('toast.steamAchievementsSynced'), syncableGames[0]) : hasPartialFailures ? t('app.steamAchievementsBulkPartiallySynced') : t('app.steamAchievementsBulkSynced') });
      }
      return summaryToReturn;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message = error instanceof SteamApiError ? error.message : error instanceof Error ? error.message : t('app.steamAchievementSyncFailedDetails');
      const failedSummary: SteamAchievementSyncSummary = { failedCount: total, noAchievementDataCount: 0, skippedNonSteamCount: targetGames.length - total, unchangedCount: 0, updatedCount: 0 };
      summaryToReturn = failedSummary;
      if (!isAppMountedRef.current) return summaryToReturn;
      terminalState = { status: 'error', message, progress: { completed: total, total }, summary: failedSummary };
      addToastNotification({ actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()], category: isCredentialError ? 'warning' : 'error', dedupeKey: isCredentialError ? 'steam-achievements:credentials' : 'steam-achievements:error', details: isCredentialError ? t('app.steamAchievementCredentialsHelp') : message, message: isCredentialError ? t('app.steamCredentialsNeeded') : t('app.steamAchievementSyncFailed') });
      return summaryToReturn;
    } finally {
      debugSteamAchievementSyncFinalization('finally reached', { total, hasTerminalState: terminalState !== null, hasSummary: summaryToReturn !== null });
      if (isAppMountedRef.current) {
        debugAchievementSyncDiagnostic('sync state success', { status: terminalState?.status ?? 'error', hasSummary: summaryToReturn !== null });
        setSteamAchievementSyncState(terminalState ?? { status: 'error', message: t('app.steamAchievementSyncStopped'), progress: { completed: total, total }, summary: summaryToReturn });
      }
    }
  };
}

function withSteamAchievementSyncWatchdog<T>(promise: Promise<T>, total: number) {
  const timeoutMs = getSteamAchievementSyncWatchdogTimeoutMs(total);
  let timeoutId: number | undefined;
  const watchdog = new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => { reject(new Error(`Steam achievement sync timed out after ${Math.round(timeoutMs / 1000)} seconds.`)); }, timeoutMs); });
  return Promise.race([promise, watchdog]).finally(() => { if (timeoutId !== undefined) window.clearTimeout(timeoutId); });
}
function getSteamAchievementSyncWatchdogTimeoutMs(total: number) { return total <= 2 ? 60_000 : Math.min(Math.max(60_000, total * 20_000), 10 * 60_000); }
function debugSteamAchievementSyncFinalization(message: string, data?: Record<string, unknown>) { if (import.meta.env.DEV) console.debug(`[SteamAchievementSync] ${message}`, data ?? {}); }
function debugAchievementSyncDiagnostic(message: string, data?: Record<string, unknown>) { if (import.meta.env.DEV) console.debug(`[ach-sync] ${message}`, data ?? {}); }
function mergeSteamAchievementUpdates(currentGames: Game[], syncedGames: Game[], targetGameIds: Set<string>) {
  const syncedGamesById = new Map(syncedGames.map((game) => [game.id, game]));
  return currentGames.map((game) => {
    if (!targetGameIds.has(game.id)) return game;
    const syncedGame = syncedGamesById.get(game.id);
    if (!syncedGame) return game;
    const syncedSteamState = getSteamProviderState(syncedGame);
    const currentSteamState = getSteamProviderState(game);
    const hasAchievementSummary = typeof syncedSteamState.achievementsTotal === 'number' && syncedSteamState.achievementsTotal > 0;
    const hasCurrentAchievementSummary = typeof currentSteamState.achievementsTotal === 'number' && currentSteamState.achievementsTotal > 0;
    if (!hasAchievementSummary) {
      if (syncedGame.steamAchievementsUnsupported === true && !hasCurrentAchievementSummary) return { ...game, steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported, steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt, updatedAt: syncedGame.updatedAt };
      return game;
    }
    return { ...game, ...(hasAchievementSummary ? { steamAchievementsTotal: syncedGame.steamAchievementsTotal, steamAchievementsUnlocked: syncedGame.steamAchievementsUnlocked, steamAchievementsPercent: syncedGame.steamAchievementsPercent, steamLastAchievementUnlockTime: syncedGame.steamLastAchievementUnlockTime, ...(syncedGame.steamAchievements ? { steamAchievements: syncedGame.steamAchievements } : {}) } : {}), steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported, steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt, updatedAt: syncedGame.updatedAt };
  });
}
