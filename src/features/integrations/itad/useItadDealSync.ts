import type { Dispatch, SetStateAction } from 'react';
import type { ItadDealSyncState } from '../../../config/syncStates';
import { loadIsThereAnyDealSettings } from '../../../lib/isThereAnyDealSettingsStorage';
import { IsThereAnyDealError, syncItadDealsForWishlistGames, type ItadWishlistSyncResult } from '../../../lib/isThereAnyDeal';
import type { NotificationDraft } from '../../../lib/notifications';
import type { Game } from '../../../types/game';
import type { TFunction } from '../../../i18n';

export type ItadDealSyncOptions = { games: Game[]; itadDealSyncState: ItadDealSyncState; setGames: Dispatch<SetStateAction<Game[]>>; setItadDealSyncState: Dispatch<SetStateAction<ItadDealSyncState>>; addToastNotification: (notification: NotificationDraft) => void; t: TFunction };

export function useItadDealSync({ games, itadDealSyncState, setGames, setItadDealSyncState, addToastNotification, t }: ItadDealSyncOptions) {
  return async function syncWishlistDeals(gameIds: string[]) {
    if (itadDealSyncState.status === 'loading') return null;
    const settings = loadIsThereAnyDealSettings();
    console.debug('[ITAD] hasItadKeyWhenSyncStarts:', Boolean(settings.apiKey.trim()));
    const targetGames = games.filter((game) => game.collectionType === 'wishlist' && gameIds.includes(game.id));
    if (targetGames.length === 0) { const message = t('itad.noWishlistGamesForSync'); setItadDealSyncState({ status: 'error', message, summary: null }); addToastNotification({ category: 'info', dedupeKey: 'itad-deal-sync-empty', message }); return null; }
    const runningMessage = targetGames.length > 12 ? t('itad.syncingDealsLong') : t('itad.syncingDeals');
    setItadDealSyncState({ status: 'loading', message: runningMessage, summary: null });
    try {
      const results = await syncItadDealsForWishlistGames(targetGames, settings.apiKey);
      const syncedAt = new Date().toISOString();
      const summary = results.reduce((currentSummary, result) => ({ updatedCount: currentSummary.updatedCount + (result.status === 'updated' ? 1 : 0), noMatchCount: currentSummary.noMatchCount + (result.status === 'no-match' ? 1 : 0), failedCount: currentSummary.failedCount + (result.status === 'failed' ? 1 : 0), historicalLowCount: currentSummary.historicalLowCount + (result.status === 'updated' && result.deal?.isHistoricalLow ? 1 : 0) }), { updatedCount: 0, noMatchCount: 0, failedCount: 0, historicalLowCount: 0 });
      setGames((currentGames) => applyItadSyncResults(currentGames, results, syncedAt));
      const message = `${summary.updatedCount} deals updated · ${summary.historicalLowCount} historical lows found · ${summary.failedCount} failures${summary.noMatchCount > 0 ? ` · ${summary.noMatchCount} no match` : ''}.`;
      setItadDealSyncState({ status: summary.failedCount > 0 ? 'error' : 'success', message, summary });
      addToastNotification({ category: summary.failedCount > 0 ? 'warning' : 'success', dedupeKey: 'itad-deal-sync-complete', message });
      return summary;
    } catch (error) {
      const message = error instanceof IsThereAnyDealError && error.code === 'missing-api-key' ? t('itad.missingApiKey') : error instanceof Error ? error.message : t('app.dealSyncFailed');
      setItadDealSyncState({ status: 'error', message, summary: null });
      addToastNotification({ category: 'error', dedupeKey: 'itad-deal-sync-error', message });
      return null;
    }
  };
}

export function applyItadSyncResults(games: Game[], results: ItadWishlistSyncResult[], attemptedAt: string): Game[] {
  const resultByGameId = new Map(results.map((result) => [result.gameId, result]));
  return games.map((game) => {
    const result = resultByGameId.get(game.id);
    if (!result) return game;
    if (result.status === 'no-match') return { ...game, itadCurrentBestCurrency: undefined, itadCurrentBestPrice: undefined, itadCurrentBestShop: undefined, itadCurrentBestUrl: undefined, itadDiscountPercent: undefined, itadHistoricalLowPrice: undefined, itadIsHistoricalLow: undefined, itadLastSyncedAt: attemptedAt, itadLastSyncAttemptAt: attemptedAt };
    if (result.status !== 'updated' || !result.match || !result.deal) return { ...game, itadLastSyncAttemptAt: attemptedAt };
    return { ...game, itadId: result.match.id, itadPlain: result.match.slug, itadSlug: result.match.slug, itadMatchConfidence: result.match.confidence, itadCurrentBestPrice: result.deal.currentBestPrice, itadCurrentBestCurrency: result.deal.currentBestCurrency, itadCurrentBestShop: result.deal.currentBestShop, itadCurrentBestUrl: result.deal.currentBestUrl, itadDiscountPercent: result.deal.discountPercent, itadHistoricalLowPrice: result.deal.historicalLowPrice, itadHistoricalLowCurrency: result.deal.historicalLowCurrency, itadIsHistoricalLow: result.deal.isHistoricalLow, itadLastSyncedAt: attemptedAt, itadLastSyncAttemptAt: attemptedAt };
  });
}
