import type { Dispatch, SetStateAction } from 'react';
import { mergeMultiGameImport, type MultiGameImportParseResult, type MultiGameImportSummary } from '../../lib/multiGameImport';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import { mapSteamWishlistItemToLocalGame } from '../../services/steamApi';
import type { Game } from '../../types/game';
import type { TFunction } from '../../i18n';
import { formatSteamWishlistHtmlImportSummary, type SteamWishlistHtmlImportSummary } from '../../utils/summaryFormatters';
import { type NotificationDraft } from '../../lib/notifications';
import { shouldReplaceSteamWishlistPlaceholderTitle, touchGameRecord } from '../integrations/steam/useSteamWishlistSync';

export type ImportSyncActionsOptions = { setGames: Dispatch<SetStateAction<Game[]>>; addToastNotification: (notification: NotificationDraft) => void; t: TFunction };

export function useImportSyncActions({ setGames, addToastNotification, t }: ImportSyncActionsOptions) {
  function importMultiGameItems(parsed: MultiGameImportParseResult): MultiGameImportSummary {
    const importedAt = new Date().toISOString();
    let summary: MultiGameImportSummary = { importedCount: 0, skippedDuplicates: parsed.duplicateCount, updatedExisting: 0, invalidRows: parsed.skippedCount, source: parsed.source };
    setGames((currentGames) => { const result = mergeMultiGameImport(currentGames, parsed, importedAt); summary = result.summary; return result.games; });
    addToastNotification({ category: summary.importedCount > 0 || summary.updatedExisting > 0 ? 'success' : 'info', dedupeKey: 'multi-game-import', message: `Multi Game Import: ${summary.importedCount} imported · ${summary.updatedExisting} updated · ${summary.skippedDuplicates} duplicates · ${summary.invalidRows} skipped` });
    return summary;
  }

  function importSteamWishlistHtmlItems(items: ParsedSteamWishlistImportItem[], inputSkippedCount = 0): SteamWishlistHtmlImportSummary {
    const importedAt = new Date().toISOString();
    let summary: SteamWishlistHtmlImportSummary = { addedCount: 0, existingCount: 0, skippedCount: inputSkippedCount };
    setGames((currentGames) => { const result = mergeSteamWishlistHtmlItems(currentGames, items, importedAt, inputSkippedCount); summary = result.summary; return result.games; });
    const message = formatSteamWishlistHtmlImportSummary(summary, t);
    addToastNotification({ category: summary.addedCount > 0 ? 'success' : 'info', dedupeKey: 'steam-wishlist-html-import', message });
    return summary;
  }

  return { importMultiGameItems, importSteamWishlistHtmlItems };
}

function mergeSteamWishlistHtmlItems(currentGames: Game[], items: ParsedSteamWishlistImportItem[], importedAt: string, inputSkippedCount: number) {
  const existingWishlistIndexBySteamAppId = new Map<number, number>();
  currentGames.forEach((game, index) => { if (game.collectionType === 'wishlist' && typeof game.steamAppId === 'number') existingWishlistIndexBySteamAppId.set(game.steamAppId, index); });
  const existingGameIds = new Set(currentGames.map((game) => game.id));
  const nextGames = [...currentGames];
  const summary: SteamWishlistHtmlImportSummary = { addedCount: 0, existingCount: 0, skippedCount: inputSkippedCount };
  items.forEach((item) => {
    if (!item.appid) { summary.existingCount += 1; console.warn('[Steam Wishlist HTML Import] Skipped parsed item without a Steam app id.', { item }); return; }
    const mappedGame = mapSteamWishlistItemToLocalGame(item, importedAt);
    const existingWishlistIndex = existingWishlistIndexBySteamAppId.get(item.appid);
    if (typeof existingWishlistIndex === 'number') {
      const existingGame = nextGames[existingWishlistIndex];
      if (shouldReplaceSteamWishlistPlaceholderTitle(existingGame, mappedGame)) {
        nextGames[existingWishlistIndex] = touchGameRecord({ ...existingGame, title: mappedGame.title, steamAppId: existingGame.steamAppId ?? mappedGame.steamAppId, externalSource: existingGame.externalSource ?? mappedGame.externalSource, externalUrl: mappedGame.externalUrl, storeUrl: mappedGame.storeUrl, wishlistImportedAt: existingGame.wishlistImportedAt ?? importedAt, wishlistSyncedAt: importedAt });
        console.info('[Steam Wishlist HTML Import] Repaired existing placeholder wishlist title.', { appid: item.appid, previousTitle: existingGame.title, repairedTitle: mappedGame.title });
      } else {
        console.debug('[Steam Wishlist HTML Import] Existing wishlist item kept unchanged.', { appid: item.appid, existingTitle: existingGame.title, importedTitle: mappedGame.title });
      }
      summary.existingCount += 1;
      return;
    }
    let wishlistId = mappedGame.id;
    let suffix = 2;
    while (existingGameIds.has(wishlistId)) { wishlistId = `${mappedGame.id}-${suffix}`; suffix += 1; }
    existingGameIds.add(wishlistId);
    existingWishlistIndexBySteamAppId.set(item.appid, nextGames.length);
    nextGames.push(touchGameRecord({ ...mappedGame, id: wishlistId, wishlistSyncedAt: undefined }));
    console.debug('[Steam Wishlist HTML Import] Added wishlist item.', { appid: item.appid, title: mappedGame.title, id: wishlistId });
    summary.addedCount += 1;
  });
  return { games: nextGames, summary };
}
