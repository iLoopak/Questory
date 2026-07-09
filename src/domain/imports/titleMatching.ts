import type { Game } from '../../types/game';

export function normalizeImportMatchTitle(title: string) {
  return title.trim().toLocaleLowerCase().replace(/[â„˘Â®Â©]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getSafeWishlistTitleMatches(games: Game[]) {
  const titleCounts = new Map<string, number>();
  const titleIds = new Map<string, string>();

  games
    .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId !== 'number')
    .forEach((game) => {
      const title = normalizeImportMatchTitle(game.title);
      if (!title) return;
      titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
      titleIds.set(title, game.id);
    });

  return new Map(
    Array.from(titleIds.entries()).filter(([title]) => titleCounts.get(title) === 1),
  );
}
