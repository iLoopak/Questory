import type { Dispatch, SetStateAction } from 'react';
import { syncHltbForGames, type HltbSyncSummary } from '../../../lib/hltb';
import { formatHltbSyncSummary } from '../../../utils/summaryFormatters';
import type { NotificationDraft } from '../../../lib/notifications';
import type { Game } from '../../../types/game';
import type { TFunction } from '../../../i18n';

export type HltbSyncOptions = { games: Game[]; isHltbSyncing: boolean; setGames: Dispatch<SetStateAction<Game[]>>; setIsHltbSyncing: Dispatch<SetStateAction<boolean>>; addToastNotification: (notification: NotificationDraft) => void; t: TFunction };

export function useHltbSync({ games, isHltbSyncing, setGames, setIsHltbSyncing, addToastNotification, t }: HltbSyncOptions) {
  return async function syncHltb(gameIds: string[]): Promise<HltbSyncSummary | null> {
    if (isHltbSyncing) return null;
    const targetGames = games.filter((game) => gameIds.includes(game.id));
    if (targetGames.length === 0) { const message = t('hltb.noGamesForSync'); addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-empty', message }); return null; }
    const runningMessage = targetGames.length > 12 ? t('hltb.syncingLong') : t('hltb.syncing');
    setIsHltbSyncing(true);
    addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-start', message: runningMessage });
    try {
      const result = await syncHltbForGames(targetGames, undefined, { force: true });
      const updatedGamesById = new Map(result.games.map((game) => [game.id, game]));
      setGames((currentGames) => currentGames.map((game) => updatedGamesById.get(game.id) ?? game));
      const message = result.summary.unavailableCount > 0 && result.summary.updatedCount === 0 && result.summary.noMatchCount === 0 ? `${t('hltb.unavailable')} ${formatHltbSyncSummary(result.summary, t)}` : formatHltbSyncSummary(result.summary, t);
      addToastNotification({ category: result.summary.failedCount > 0 ? 'warning' : 'success', dedupeKey: 'hltb-sync-complete', message });
      return result.summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : t('hltb.syncFailed');
      addToastNotification({ category: 'error', dedupeKey: 'hltb-sync-error', message });
      return null;
    } finally { setIsHltbSyncing(false); }
  };
}
