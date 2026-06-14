import {
  achievementFilterOptions,
  allOption,
  enrichmentFilterOptions,
  initialCollectionFilters,
  librarySortOptions,
  quickFilterOptions,
  sourceFilterOptions,
  type CollectionFilters,
  type QuickFilter,
} from '../config/collection';
import { gameStatuses } from '../types/game';

export { filterGames, getCollectionGames, getVisibleCollectionGames } from './collectionFilters';
export {
  compareDateDesc,
  compareGames,
  compareTitle,
  getAchievementSortValue,
  getDateTime,
  getDealPriceSortValue,
  getHltbSortValue,
  isMissingRawgMetadata,
} from './collectionSort';
export {
  isRetroOrFutureReady,
  matchesAchievementFilter,
  matchesCollectionFilters,
  matchesEnrichmentFilter,
  matchesPlatformFilter,
  matchesQuickFilter,
  matchesSearchFilter,
  matchesSourceFilter,
  matchesStatusFilter,
  matchesTagFilter,
} from './collectionFilters';

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
    filters.platform !== allOption,
    filters.quickFilters.length > 0,
    filters.source !== allOption,
    filters.status !== allOption,
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
