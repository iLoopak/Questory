import type { Game } from './game';

export type LibraryGame = Game & { collectionType: 'library' };
export type WishlistGame = Game & { collectionType: 'wishlist' };
export type CollectionItem = LibraryGame | WishlistGame;

export function isLibraryGame(game: Game): game is LibraryGame {
  return game.collectionType === 'library';
}

export function isWishlistGame(game: Game): game is WishlistGame {
  return game.collectionType === 'wishlist';
}

export function asLibraryGame(game: Game): LibraryGame | null {
  return isLibraryGame(game) ? game : null;
}

export function asWishlistGame(game: Game): WishlistGame | null {
  return isWishlistGame(game) ? game : null;
}

export function toLibraryGame(game: Game): LibraryGame {
  return { ...game, collectionType: 'library' };
}

export function toWishlistGame(game: Game): WishlistGame {
  return { ...game, collectionType: 'wishlist' };
}
