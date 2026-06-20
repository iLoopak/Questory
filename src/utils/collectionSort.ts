import { type LibrarySortOption } from '../config/collection';
import { getPrimaryHltbHours } from '../lib/hltb';
import { hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import type { Game } from '../types/game';
import { gameStatuses } from '../types/game';

export function compareGames(firstGame: Game, secondGame: Game, sortBy: LibrarySortOption): number {
  if (sortBy === 'Recently played') {
    return compareDateDesc(firstGame.lastPlayedAt, secondGame.lastPlayedAt) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Most playtime') {
    return secondGame.playtimeHours - firstGame.playtimeHours || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Least playtime') {
    return firstGame.playtimeHours - secondGame.playtimeHours || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Recently imported') {
    return compareDateDesc(firstGame.importedAt, secondGame.importedAt) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Missing info first') {
    return (
      Number(isMissingRawgMetadata(secondGame)) - Number(isMissingRawgMetadata(firstGame)) ||
      compareTitle(firstGame, secondGame)
    );
  }

  if (sortBy === 'Status') {
    return (
      gameStatuses.indexOf(firstGame.status) - gameStatuses.indexOf(secondGame.status) ||
      compareTitle(firstGame, secondGame)
    );
  }

  if (sortBy === 'Achievement completion %') {
    return getAchievementSortValue(secondGame) - getAchievementSortValue(firstGame) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Best discount') {
    return (
      (secondGame.itadDiscountPercent ?? -1) - (firstGame.itadDiscountPercent ?? -1) ||
      compareTitle(firstGame, secondGame)
    );
  }

  if (sortBy === 'Lowest price') {
    return getDealPriceSortValue(firstGame) - getDealPriceSortValue(secondGame) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Shortest first') {
    return getHltbSortValue(firstGame) - getHltbSortValue(secondGame) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Longest first') {
    return getHltbSortValue(secondGame, -1) - getHltbSortValue(firstGame, -1) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Favorites First') {
    return Number(secondGame.favorite) - Number(firstGame.favorite) || compareTitle(firstGame, secondGame);
  }

  return compareTitle(firstGame, secondGame);
}

export function getHltbSortValue(game: Game, fallback = Number.POSITIVE_INFINITY): number {
  return getPrimaryHltbHours(game) ?? fallback;
}

export function getDealPriceSortValue(game: Game): number {
  return typeof game.itadCurrentBestPrice === 'number' ? game.itadCurrentBestPrice : Number.POSITIVE_INFINITY;
}

export function getAchievementSortValue(game: Game): number {
  return hasSteamAchievementSummary(game) ? game.steamAchievementsPercent ?? 0 : -1;
}

export function compareTitle(firstGame: Game, secondGame: Game): number {
  return firstGame.title.localeCompare(secondGame.title, undefined, { sensitivity: 'base' });
}

export function compareDateDesc(firstDate: string | null | undefined, secondDate: string | null | undefined): number {
  return getDateTime(secondDate) - getDateTime(firstDate);
}

export function getDateTime(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function isMissingRawgMetadata(game: Game): boolean {
  return game.metadataSource !== 'rawg' && !game.metadataManualManagedAt;
}
