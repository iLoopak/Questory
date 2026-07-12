// One identity contract for comparing persisted Game records (backup merge today; other
// import paths can adopt it later).
//
// The rule that matters: Questory deliberately allows a Wishlist COPY of a Library game.
// `addToWishlist` clones the record with a NEW id while keeping the provider ids, title and
// platform, so two legitimate records can share every external identity there is. Matching on
// those identities alone therefore cannot tell "the same record" from "the wishlist copy of
// that record", and merging on it collapses the pair.
//
// So identity is resolved in two tiers:
//   1. The explicit game id identifies a record ACROSS collections. It is the record's own
//      primary key, and a record legitimately changes collection while keeping it (see
//      `moveWishlistToLibrary`), so an id match must win even when collectionType differs.
//   2. Every other signal (Steam id, RAWG id, ROM path, normalized title+platform) only
//      identifies a record WITHIN one collection. Across collections the same signals mean
//      "related records", not "one record".

import { gameExternalSources, type Game, type GameExternalSource } from '../types/game';

/** Which signal matched, for diagnostics and for callers that care why. */
export type GameIdentitySignal = 'id' | 'steam-app-id' | 'rawg-id' | 'rom-path' | 'title-platform';

const externalSourceValues = new Set<string>(gameExternalSources);

/** The canonical `Game.externalSource` guard. Never narrows the union silently. */
export function isGameExternalSource(value: unknown): value is GameExternalSource {
  return typeof value === 'string' && externalSourceValues.has(value);
}

export function getGameRomKey(game: Pick<Game, 'romPath' | 'romUri'>): string {
  return (game.romPath ?? game.romUri ?? '').trim().toLowerCase();
}

export function getGameTitlePlatformKey(game: Pick<Game, 'title' | 'platform'>): string {
  const title = game.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return `${title}|${String(game.platform).trim().toLowerCase()}`;
}

/**
 * The identity signal shared by two records, ignoring collection membership.
 *
 * Use this to detect that records are RELATED (a Library game and its Wishlist copy). It is
 * not sufficient to conclude they are the same persisted record — see `findGameRecordIndex`.
 */
export function getSharedGameIdentitySignal(first: Game, second: Game): GameIdentitySignal | null {
  if (first.id === second.id) {
    return 'id';
  }

  if (typeof first.steamAppId === 'number' && first.steamAppId === second.steamAppId) {
    return 'steam-app-id';
  }

  if (typeof first.rawgId === 'number' && first.rawgId === second.rawgId) {
    return 'rawg-id';
  }

  const firstRom = getGameRomKey(first);
  const secondRom = getGameRomKey(second);
  if (firstRom && secondRom && firstRom === secondRom) {
    return 'rom-path';
  }

  if (getGameTitlePlatformKey(first) === getGameTitlePlatformKey(second)) {
    return 'title-platform';
  }

  return null;
}

/**
 * True when the two records share an external identity but sit in different collections —
 * i.e. they are a Library record and its Wishlist copy. They stay DISTINCT records.
 */
export function areRelatedAcrossCollections(first: Game, second: Game): boolean {
  if (first.collectionType === second.collectionType || first.id === second.id) {
    return false;
  }

  return getSharedGameIdentitySignal(first, second) !== null;
}

/**
 * Locate the record in `games` that `candidate` IS, or -1.
 *
 * An id match wins across collections (the record moved). Any other signal only counts inside
 * the candidate's own collection, so a Wishlist copy never resolves to its Library original.
 */
export function findGameRecordIndex(games: Game[], candidate: Game): number {
  const byId = games.findIndex((game) => game.id === candidate.id);
  if (byId !== -1) {
    return byId;
  }

  return games.findIndex(
    (game) =>
      game.collectionType === candidate.collectionType &&
      getSharedGameIdentitySignal(game, candidate) !== null,
  );
}
