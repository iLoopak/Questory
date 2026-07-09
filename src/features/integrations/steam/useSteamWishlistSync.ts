import type { Dispatch, SetStateAction } from 'react';
import { isMissingOrGeneratedCover } from '../../../lib/gameCoverImages';
import { loadSteamSettings } from '../../../lib/steamSettingsStorage';
import { formatSteamWishlistSyncSummary } from '../../../utils/summaryFormatters';
import { getDismissAction, getOpenSteamSettingsAction, type NotificationDraft } from '../../../lib/notifications';
import type { IgnoredSteamGame } from '../../../lib/steamIgnoredGamesStorage';
import { getSteamWishlist, mapSteamWishlistItemToLocalGame, SteamWishlistError } from '../../../services/steamApi';
import type { Game } from '../../../types/game';
import type { SteamWishlistItem, SteamWishlistSyncState, SteamWishlistSyncSummary } from '../../../types/steam';
import type { TFunction } from '../../../i18n';

export type SteamWishlistSyncOptions = { games: Game[]; ignoredSteamGames: IgnoredSteamGame[]; setGames: Dispatch<SetStateAction<Game[]>>; setSteamWishlistSyncState: Dispatch<SetStateAction<SteamWishlistSyncState>>; addToastNotification: (notification: NotificationDraft) => void; t: TFunction };

export function useSteamWishlistSync({ ignoredSteamGames, setGames, setSteamWishlistSyncState, addToastNotification, t }: SteamWishlistSyncOptions) {
  function importSteamWishlistItems(wishlistItems: SteamWishlistItem[]): SteamWishlistSyncSummary {
    const syncedAt = new Date().toISOString();
    const ignoredSteamAppIds = new Set(ignoredSteamGames.map((game) => game.steamAppId));
    let summary: SteamWishlistSyncSummary = { addedCount: 0, failedCount: 0, fetchedCount: wishlistItems.length, skippedAlreadyInLibraryCount: 0, skippedIgnoredCount: 0, unchangedCount: 0, updatedCount: 0 };
    setGames((currentGames) => { const result = mergeSteamWishlistItems(currentGames, wishlistItems, ignoredSteamAppIds, syncedAt); summary = result.summary; return result.games; });
    return summary;
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

function mergeSteamWishlistItems(currentGames: Game[], wishlistItems: SteamWishlistItem[], ignoredSteamAppIds: Set<number>, syncedAt: string) {
  const nextGames = [...currentGames];
  const librarySteamAppIds = new Set(currentGames.filter((game) => game.collectionType === 'library').map((game) => game.steamAppId).filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'));
  const wishlistIndexBySteamAppId = new Map<number, number>();
  const wishlistIndexByTitle = new Map<string, number>();
  const summary: SteamWishlistSyncSummary = { addedCount: 0, failedCount: 0, fetchedCount: wishlistItems.length, skippedAlreadyInLibraryCount: 0, skippedIgnoredCount: 0, unchangedCount: 0, updatedCount: 0 };
  currentGames.forEach((game, index) => { if (game.collectionType !== 'wishlist') return; if (typeof game.steamAppId === 'number') wishlistIndexBySteamAppId.set(game.steamAppId, index); const normalizedTitle = normalizeGameTitleForWishlistMatch(game.title); if (normalizedTitle && !wishlistIndexByTitle.has(normalizedTitle)) wishlistIndexByTitle.set(normalizedTitle, index); });
  wishlistItems.forEach((item) => {
    if (!item.appid || !item.name) { summary.failedCount += 1; return; }
    if (ignoredSteamAppIds.has(item.appid)) { summary.skippedIgnoredCount += 1; return; }
    if (librarySteamAppIds.has(item.appid)) { summary.skippedAlreadyInLibraryCount += 1; return; }
    const normalizedTitle = normalizeGameTitleForWishlistMatch(item.name);
    const existingWishlistIndex = wishlistIndexBySteamAppId.get(item.appid) ?? (normalizedTitle ? wishlistIndexByTitle.get(normalizedTitle) : undefined);
    const mappedGame = mapSteamWishlistItemToLocalGame(item, syncedAt);
    if (typeof existingWishlistIndex === 'number') {
      const existingGame = nextGames[existingWishlistIndex];
      const mergedGame = touchGameRecord(mergeSteamWishlistSync(existingGame, mappedGame, syncedAt));
      nextGames[existingWishlistIndex] = mergedGame;
      wishlistIndexBySteamAppId.set(item.appid, existingWishlistIndex);
      if (normalizedTitle) wishlistIndexByTitle.set(normalizedTitle, existingWishlistIndex);
      if (areSteamWishlistSyncedFieldsEqual(existingGame, mergedGame)) summary.unchangedCount += 1; else summary.updatedCount += 1;
      return;
    }
    nextGames.push(touchGameRecord(mappedGame));
    wishlistIndexBySteamAppId.set(item.appid, nextGames.length - 1);
    if (normalizedTitle) wishlistIndexByTitle.set(normalizedTitle, nextGames.length - 1);
    summary.addedCount += 1;
  });
  return { games: nextGames, summary };
}
export function normalizeGameTitleForWishlistMatch(title: string) { return title.trim().toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function areSteamWishlistSyncedFieldsEqual(previousGame: Game, nextGame: Game) { return previousGame.title === nextGame.title && previousGame.coverImage === nextGame.coverImage && previousGame.steamAppId === nextGame.steamAppId && previousGame.externalSource === nextGame.externalSource && previousGame.externalUrl === nextGame.externalUrl && previousGame.storeUrl === nextGame.storeUrl && previousGame.releaseDate === nextGame.releaseDate && previousGame.steamPriceInfo === nextGame.steamPriceInfo && previousGame.steamDiscountInfo === nextGame.steamDiscountInfo && previousGame.steamReviewInfo === nextGame.steamReviewInfo; }
function mergeSteamWishlistSync(existingGame: Game, syncedGame: Game, syncedAt: string): Game {
  const shouldUseSyncedArtwork = isMissingOrGeneratedCover(existingGame.coverImage) && syncedGame.coverImage;
  const shouldUseSyncedTitle = shouldReplaceSteamWishlistPlaceholderTitle(existingGame, syncedGame);
  if (shouldUseSyncedTitle) console.info('[Steam Wishlist Sync] Repaired placeholder wishlist title.', { appid: syncedGame.steamAppId, previousTitle: existingGame.title, repairedTitle: syncedGame.title });
  return { ...existingGame, title: shouldUseSyncedTitle ? syncedGame.title : existingGame.title || syncedGame.title, platform: existingGame.platform || syncedGame.platform, artworkSource: shouldUseSyncedArtwork ? syncedGame.artworkSource : existingGame.artworkSource, artworkUpdatedAt: shouldUseSyncedArtwork ? syncedAt : existingGame.artworkUpdatedAt, coverImage: shouldUseSyncedArtwork ? syncedGame.coverImage : existingGame.coverImage, steamAppId: existingGame.steamAppId ?? syncedGame.steamAppId, externalSource: existingGame.externalSource ?? syncedGame.externalSource, externalUrl: syncedGame.externalUrl, storeUrl: syncedGame.storeUrl, releaseDate: syncedGame.releaseDate ?? existingGame.releaseDate, steamPriceInfo: syncedGame.steamPriceInfo, steamDiscountInfo: syncedGame.steamDiscountInfo, steamReviewInfo: syncedGame.steamReviewInfo, wishlistImportedAt: existingGame.wishlistImportedAt ?? syncedAt, wishlistSyncedAt: syncedAt };
}
export function shouldReplaceSteamWishlistPlaceholderTitle(existingGame: Game, syncedGame: Game) { const appid = existingGame.steamAppId ?? syncedGame.steamAppId; return typeof appid === 'number' && isPlaceholderSteamWishlistTitle(existingGame.title, appid) && !isPlaceholderSteamWishlistTitle(syncedGame.title, appid); }
function isPlaceholderSteamWishlistTitle(title: string, appid: number) { return title.trim().toLowerCase() === `steam app ${appid}`.toLowerCase(); }
export function touchGameRecord<T extends { updatedAt?: string }>(game: T): T { return { ...game, updatedAt: new Date().toISOString() }; }
