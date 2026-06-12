import {
  achievementFilterOptions,
  allOption,
  enrichmentFilterOptions,
  initialCollectionFilters,
  librarySortOptions,
  quickFilterOptions,
  sourceFilterOptions,
  type AchievementFilter,
  type CollectionFilters,
  type EnrichmentFilter,
  type LibrarySortOption,
  type QuickFilter,
  type SourceFilter,
} from '../config/collection';
import { getPrimaryHltbHours, hasHltbData } from '../lib/hltb';
import { hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import type { Game } from '../types/game';
import { gameStatuses } from '../types/game';

export function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function filterGames(games: Game[], filters: CollectionFilters) {
  const normalizedSearch = filters.searchTerm.trim().toLowerCase();

  return games
    .filter((game) => {
      const matchesTitle = game.title.toLowerCase().includes(normalizedSearch);
      const matchesPlatform = filters.platform === allOption || game.platform === filters.platform;
      const matchesStatus = filters.status === allOption || game.status === filters.status;
      const matchesTag = filters.tag === allOption || game.tags.includes(filters.tag);
      const matchesSource = matchesSourceFilter(game, filters.source);
      const matchesEnrichment = matchesEnrichmentFilter(game, filters.enrichment);
      const matchesAchievement = matchesAchievementFilter(game, filters.achievement);
      const matchesQuickFilters = filters.quickFilters.every((quickFilter) => matchesQuickFilter(game, quickFilter));

      return (
        matchesTitle &&
        matchesPlatform &&
        matchesStatus &&
        matchesTag &&
        matchesSource &&
        matchesEnrichment &&
        matchesAchievement &&
        matchesQuickFilters
      );
    })
    .sort((firstGame, secondGame) => compareGames(firstGame, secondGame, filters.sortBy));
}

export function matchesSourceFilter(game: Game, source: SourceFilter) {
  if (source === 'All') {
    return true;
  }

  if (source === 'Steam') {
    return game.externalSource === 'steam' || game.externalSource === 'steam-wishlist' || typeof game.steamAppId === 'number';
  }

  if (source === 'Manual') {
    return game.externalSource === 'manual';
  }

  if (source === 'Wishlist') {
    return game.collectionType === 'wishlist';
  }

  return isRetroOrFutureReady(game);
}

export function matchesEnrichmentFilter(game: Game, enrichment: EnrichmentFilter) {
  if (enrichment === 'All') {
    return true;
  }

  if (enrichment === 'Enriched') {
    return game.metadataSource === 'rawg';
  }

  if (enrichment === 'Manual metadata') {
    return Boolean(game.metadataManualManagedAt);
  }

  return isMissingRawgMetadata(game);
}

export function matchesAchievementFilter(game: Game, achievement: AchievementFilter) {
  if (achievement === 'All') {
    return true;
  }

  const hasSummary = hasSteamAchievementSummary(game);
  const percent = hasSummary ? game.steamAchievementsPercent ?? 0 : 0;

  if (achievement === 'Has achievements') {
    return hasSummary;
  }

  if (achievement === 'No achievements synced') {
    return !hasSummary;
  }

  if (achievement === 'Nearly completed') {
    return hasSummary && percent >= 80 && percent < 100;
  }

  if (achievement === 'Completed') {
    return hasSummary && percent >= 100;
  }

  return hasSummary && percent > 0 && percent < 100;
}

export function matchesQuickFilter(game: Game, quickFilter: QuickFilter) {
  if (quickFilter === 'Playing Now') {
    return game.status === 'Playing';
  }

  if (quickFilter === 'Paused') {
    return game.status === 'Paused';
  }

  if (quickFilter === 'Queue / Want to play') {
    return game.status === 'Want to play';
  }

  if (quickFilter === 'Missing info') {
    return isMissingRawgMetadata(game);
  }

  if (quickFilter === 'On sale') {
    return typeof game.itadDiscountPercent === 'number' && game.itadDiscountPercent > 0;
  }

  if (quickFilter === 'Historical low') {
    return game.itadIsHistoricalLow === true;
  }

  if (quickFilter === 'Deal synced') {
    return Boolean(game.itadId && game.itadLastSyncedAt);
  }

  if (quickFilter === 'No deal match') {
    return Boolean(game.itadLastSyncedAt && !game.itadId);
  }

  const hltbHours = getPrimaryHltbHours(game);

  if (quickFilter === 'Has HLTB data') {
    return hasHltbData(game);
  }

  if (quickFilter === 'Under 10 hours') {
    return typeof hltbHours === 'number' && hltbHours < 10;
  }

  if (quickFilter === '10–25 hours') {
    return typeof hltbHours === 'number' && hltbHours >= 10 && hltbHours <= 25;
  }

  if (quickFilter === 'Over 25 hours') {
    return typeof hltbHours === 'number' && hltbHours > 25;
  }

  if (quickFilter === 'Unknown length') {
    return !hasHltbData(game);
  }

  return game.playtimeHours > 0;
}

export function compareGames(firstGame: Game, secondGame: Game, sortBy: LibrarySortOption) {
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
    return Number(isMissingRawgMetadata(secondGame)) - Number(isMissingRawgMetadata(firstGame)) || compareTitle(firstGame, secondGame);
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
    return (secondGame.itadDiscountPercent ?? -1) - (firstGame.itadDiscountPercent ?? -1) || compareTitle(firstGame, secondGame);
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

  return compareTitle(firstGame, secondGame);
}

export function getHltbSortValue(game: Game, fallback = Number.POSITIVE_INFINITY) {
  return getPrimaryHltbHours(game) ?? fallback;
}

export function getDealPriceSortValue(game: Game) {
  return typeof game.itadCurrentBestPrice === 'number' ? game.itadCurrentBestPrice : Number.POSITIVE_INFINITY;
}

export function getAchievementSortValue(game: Game) {
  return hasSteamAchievementSummary(game) ? game.steamAchievementsPercent ?? 0 : -1;
}

export function compareTitle(firstGame: Game, secondGame: Game) {
  return firstGame.title.localeCompare(secondGame.title, undefined, { sensitivity: 'base' });
}

export function compareDateDesc(firstDate: string | null | undefined, secondDate: string | null | undefined) {
  return getDateTime(secondDate) - getDateTime(firstDate);
}

export function getDateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function isMissingRawgMetadata(game: Game) {
  return game.metadataSource !== 'rawg' && !game.metadataManualManagedAt;
}

export function isRetroOrFutureReady(game: Game) {
  const retroPlatforms = new Set(['PSP', 'PS2', 'GBA', 'SNES', 'Other']);
  const planningTags = new Set(['retro', 'emulated', 'emulation', 'physical', 'future', 'future-ready']);

  return retroPlatforms.has(game.platform) || game.tags.some((tag) => planningTags.has(tag.toLowerCase()));
}

export function isCollectionFiltered(filters: CollectionFilters) {
  return getActiveFilterCount(filters) > 0;
}

export function getActiveFilterCount(filters: CollectionFilters) {
  return [
    filters.achievement !== allOption,
    filters.enrichment !== allOption,
    filters.platform !== allOption,
    filters.quickFilters.length > 0,
    filters.searchTerm.trim().length > 0,
    filters.source !== allOption,
    filters.status !== allOption,
    filters.tag !== allOption,
    filters.sortBy !== initialCollectionFilters.sortBy,
  ].filter(Boolean).length;
}

export function getActiveAdvancedFilterCount(filters: CollectionFilters) {
  return [
    filters.achievement !== allOption,
    filters.enrichment !== allOption,
    filters.quickFilters.length > 0,
    filters.source !== allOption,
    filters.tag !== allOption,
    filters.sortBy !== initialCollectionFilters.sortBy,
  ].filter(Boolean).length;
}

export function normalizeCollectionFilters(value: unknown): CollectionFilters {
  if (!value || typeof value !== 'object') {
    return initialCollectionFilters;
  }

  const filters = value as Partial<CollectionFilters>;

  return {
    achievement: isOption(filters.achievement, achievementFilterOptions) ? filters.achievement : allOption,
    enrichment: isOption(filters.enrichment, enrichmentFilterOptions) ? filters.enrichment : allOption,
    platform: typeof filters.platform === 'string' ? filters.platform : allOption,
    quickFilters: Array.isArray(filters.quickFilters)
      ? filters.quickFilters.filter((quickFilter): quickFilter is QuickFilter =>
          isOption(quickFilter, quickFilterOptions),
        )
      : [],
    searchTerm: typeof filters.searchTerm === 'string' ? filters.searchTerm : '',
    sortBy: isOption(filters.sortBy, librarySortOptions) ? filters.sortBy : 'Title A-Z',
    source: isOption(filters.source, sourceFilterOptions) ? filters.source : allOption,
    status: isOption(filters.status, [allOption, ...gameStatuses] as const) ? filters.status : allOption,
    tag: typeof filters.tag === 'string' ? filters.tag : allOption,
  };
}

export function isOption<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}
