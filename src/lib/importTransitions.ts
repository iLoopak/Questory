// AS-14: the pure import/sync transitions.
//
// These used to live inside `setGames((currentGames) => ...)` callbacks, with the summary assigned
// to a variable in the enclosing function and read back on the next line — before React had
// necessarily run the callback at all. The merge logic itself was already pure; only its execution
// context was wrong. It now runs at the command boundary, against the latest games, and hands the
// summary back with the next state, so the toast can never report counts that disagree with what was
// actually merged.
//
// The merge and identity rules below are unchanged from the hooks they were extracted from.

import { isMissingOrGeneratedCover } from './gameCoverImages';
import { mergeMultiGameImport, type MultiGameImportParseResult, type MultiGameImportSummary } from './multiGameImport';
import type { ParsedSteamWishlistImportItem } from './steamWishlistHtmlImport';
import { mapSteamWishlistItemToLocalGame } from '../services/steamApi';
import type { TransitionResult } from './stateTransition';
import type { Game } from '../types/game';
import type { SteamWishlistItem, SteamWishlistSyncSummary } from '../types/steam';
import type { SteamWishlistHtmlImportSummary } from '../utils/summaryFormatters';

export type SteamOwnedImportSummary = {
  created: number;
  movedFromWishlist: number;
  updated: number;
  skipped: number;
  failed: number;
  transitionedGames: Game[];
};

export function touchGameRecord<T extends { updatedAt?: string }>(game: T): T {
  return { ...game, updatedAt: new Date().toISOString() };
}

/** Collection-aware Steam owned-games import used by every UI surface. */
export function steamOwnedGamesImportTransition(
  currentGames: Game[],
  importedGames: Game[],
  ignoredSteamAppIds: ReadonlySet<number> = new Set(),
  importedAt = new Date().toISOString(),
): TransitionResult<Game[], SteamOwnedImportSummary> {
  const nextGames = [...currentGames];
  const summary: SteamOwnedImportSummary = { created: 0, movedFromWishlist: 0, updated: 0, skipped: 0, failed: 0, transitionedGames: [] };

  for (const imported of importedGames) {
    if (!Number.isSafeInteger(imported.steamAppId) || (imported.steamAppId ?? 0) <= 0) { summary.failed += 1; continue; }
    const appId = imported.steamAppId as number;
    if (ignoredSteamAppIds.has(appId)) { summary.skipped += 1; continue; }
    const libraryIndex = nextGames.findIndex((game) => game.collectionType === 'library' && game.steamAppId === appId);
    if (libraryIndex >= 0) {
      const merged = mergeOwnedSteamGame(nextGames[libraryIndex], imported, importedAt, false);
      if (areGamesEqual(nextGames[libraryIndex], merged)) summary.skipped += 1;
      else { nextGames[libraryIndex] = merged; summary.updated += 1; }
      continue;
    }
    const wishlistIndex = nextGames.findIndex((game) => game.collectionType === 'wishlist' && game.steamAppId === appId);
    if (wishlistIndex >= 0) {
      const moved = mergeOwnedSteamGame(nextGames[wishlistIndex], imported, importedAt, true);
      nextGames[wishlistIndex] = moved;
      summary.movedFromWishlist += 1;
      summary.transitionedGames.push(moved);
      continue;
    }
    const created = { ...imported, collectionType: 'library' as const, updatedAt: importedAt };
    nextGames.push(created);
    summary.created += 1;
    summary.transitionedGames.push(created);
  }
  return { nextState: nextGames, result: summary };
}

/** A multi-game import (CSV/JSON/PlayStation/Nintendo), as a transition. */
export function multiGameImportTransition(
  currentGames: Game[],
  parsed: MultiGameImportParseResult,
  importedAt: string,
): TransitionResult<Game[], MultiGameImportSummary> {
  const merged = mergeMultiGameImport(currentGames, parsed, importedAt);
  return { nextState: merged.games, result: merged.summary };
}

/** The Steam Wishlist HTML import. */
export function steamWishlistHtmlImportTransition(
  currentGames: Game[],
  items: ParsedSteamWishlistImportItem[],
  importedAt: string,
  inputSkippedCount: number,
): TransitionResult<Game[], SteamWishlistHtmlImportSummary> {
  const existingWishlistIndexBySteamAppId = new Map<number, number>();
  const librarySteamAppIds = new Set(currentGames.filter((game) => game.collectionType === 'library' && typeof game.steamAppId === 'number').map((game) => game.steamAppId as number));
  currentGames.forEach((game, index) => { if (game.collectionType === 'wishlist' && typeof game.steamAppId === 'number') existingWishlistIndexBySteamAppId.set(game.steamAppId, index); });
  const existingGameIds = new Set(currentGames.map((game) => game.id));
  const nextGames = [...currentGames];
  const summary: SteamWishlistHtmlImportSummary = { addedCount: 0, existingCount: 0, skippedCount: inputSkippedCount };
  items.forEach((item) => {
    if (!item.appid) { summary.existingCount += 1; console.warn('[Steam Wishlist HTML Import] Skipped parsed item without a Steam app id.', { item }); return; }
    if (librarySteamAppIds.has(item.appid)) { summary.existingCount += 1; return; }
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
  return { nextState: nextGames, result: summary };
}

function mergeOwnedSteamGame(existing: Game, imported: Game, importedAt: string, movingFromWishlist: boolean): Game {
  const preserveArtwork = Boolean(existing.coverImage) && existing.artworkSource !== 'generated-fallback';
  return {
    ...existing,
    ...imported,
    id: existing.id,
    title: existing.displayTitleOverride?.trim() ? existing.title : imported.title || existing.title,
    displayTitleOverride: existing.displayTitleOverride,
    metadataSearchTitle: existing.metadataSearchTitle,
    notes: existing.notes,
    rating: existing.rating,
    favorite: existing.favorite,
    tags: [...new Set([...(existing.tags ?? []), ...(imported.tags ?? [])])],
    coverImage: preserveArtwork ? existing.coverImage : imported.coverImage,
    artworkSource: preserveArtwork ? existing.artworkSource : imported.artworkSource,
    artworkUpdatedAt: preserveArtwork ? existing.artworkUpdatedAt : imported.artworkUpdatedAt,
    artworkSourceMetadata: preserveArtwork ? existing.artworkSourceMetadata : imported.artworkSourceMetadata,
    collectionType: 'library',
    importedAt: existing.importedAt ?? imported.importedAt,
    priority: movingFromWishlist ? undefined : existing.priority,
    expectedPlaytime: movingFromWishlist ? undefined : existing.expectedPlaytime,
    priceTarget: movingFromWishlist ? undefined : existing.priceTarget,
    steamPriceInfo: movingFromWishlist ? undefined : existing.steamPriceInfo,
    steamDiscountInfo: movingFromWishlist ? undefined : existing.steamDiscountInfo,
    status: movingFromWishlist ? 'Want to play' : existing.status,
    updatedAt: importedAt,
  };
}

function areGamesEqual(first: Game, second: Game) {
  const { updatedAt: _firstUpdatedAt, ...firstComparable } = first;
  const { updatedAt: _secondUpdatedAt, ...secondComparable } = second;
  return JSON.stringify(firstComparable) === JSON.stringify(secondComparable);
}

/** The Steam Wishlist API sync. */
export function steamWishlistSyncTransition(
  currentGames: Game[],
  wishlistItems: SteamWishlistItem[],
  ignoredSteamAppIds: Set<number>,
  syncedAt: string,
): TransitionResult<Game[], SteamWishlistSyncSummary> {
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
  return { nextState: nextGames, result: summary };
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
