import type { GamePlatform, GameStatus } from '../types/game';

export const allOption = 'All';

export const libraryFiltersStorageKey = 'questshelf.libraryFilters.v1';
export const collectionViewModeStorageKey = 'questshelf.collectionViewMode.v1';
export const wishlistFiltersStorageKey = 'questshelf.wishlistFilters.v1';

export const sourceFilterOptions = ['All', 'Steam', 'Manual', 'Wishlist', 'Retro / future-ready'] as const;
export const enrichmentFilterOptions = ['All', 'Enriched', 'Missing info', 'Manual metadata'] as const;
export const librarySortOptions = [
  'Title A-Z',
  'Recently played',
  'Most playtime',
  'Least playtime',
  'Recently imported',
  'Missing info first',
  'Status',
  'Achievement completion %',
  'Best discount',
  'Lowest price',
  'Shortest first',
  'Longest first',
] as const;
export const quickFilterOptions = ['Playing Now', 'Paused', 'Queue / Want to play', 'Missing info', 'Played > 0h', 'On sale', 'Historical low', 'Deal synced', 'No deal match', 'Has HLTB data', 'Under 10 hours', '10–25 hours', 'Over 25 hours', 'Unknown length'] as const;
export const achievementFilterOptions = ['All', 'Has achievements', 'No achievements synced', 'Nearly completed', 'Completed', 'Started'] as const;
export const collectionViewModes = ['Grid View', 'Shelf View', 'Compact View'] as const;

export const collectionInitialRenderCount = 56;
export const collectionRenderBatchSize = 40;
export const collectionLoadAheadMargin = '720px 0px';

export type SourceFilter = (typeof sourceFilterOptions)[number];
export type EnrichmentFilter = (typeof enrichmentFilterOptions)[number];
export type LibrarySortOption = (typeof librarySortOptions)[number];
export type AchievementFilter = (typeof achievementFilterOptions)[number];
export type QuickFilter = (typeof quickFilterOptions)[number];
export type CollectionViewMode = (typeof collectionViewModes)[number];

export type CollectionFilters = {
  achievement: AchievementFilter;
  enrichment: EnrichmentFilter;
  platform: GamePlatform | typeof allOption;
  quickFilters: QuickFilter[];
  searchTerm: string;
  sortBy: LibrarySortOption;
  source: SourceFilter;
  status: GameStatus | typeof allOption;
  tag: string;
};

export const initialCollectionFilters: CollectionFilters = {
  achievement: allOption,
  enrichment: allOption,
  platform: allOption,
  quickFilters: [],
  searchTerm: '',
  sortBy: 'Title A-Z',
  source: allOption,
  status: allOption,
  tag: allOption,
};
