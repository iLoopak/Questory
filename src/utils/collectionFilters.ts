import {
  allOption,
  type AchievementFilter,
  type CollectionFilters,
  type EnrichmentFilter,
  type QuickFilter,
  type SourceFilter,
} from '../config/collection';
import { getPrimaryHltbHours, hasHltbData } from '../lib/hltb';
import { hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import type { Game, GameCollectionType } from '../types/game';
import { compareGames, isMissingRawgMetadata } from './collectionSort';

export function getCollectionGames(games: Game[], collectionType: GameCollectionType): Game[] {
  return games.filter((game) => game.collectionType === collectionType);
}

export function getVisibleCollectionGames(
  games: Game[],
  filters: CollectionFilters,
  collectionType?: GameCollectionType,
): Game[] {
  const collectionGames = collectionType ? getCollectionGames(games, collectionType) : games;
  return filterGames(collectionGames, filters);
}

export function filterGames(games: Game[], filters: CollectionFilters): Game[] {
  return games
    .filter((game) => matchesCollectionFilters(game, filters))
    .sort((firstGame, secondGame) => compareGames(firstGame, secondGame, filters.sortBy));
}

export function matchesCollectionFilters(game: Game, filters: CollectionFilters): boolean {
  return (
    matchesSearchFilter(game, filters.searchTerm) &&
    matchesPlatformFilter(game, filters.platform) &&
    matchesStatusFilter(game, filters.status) &&
    matchesTagFilter(game, filters.tag) &&
    matchesSourceFilter(game, filters.source) &&
    matchesEnrichmentFilter(game, filters.enrichment) &&
    matchesAchievementFilter(game, filters.achievement) &&
    filters.quickFilters.every((quickFilter) => matchesQuickFilter(game, quickFilter))
  );
}

const normalizedTitleCache = new WeakMap<Game, { title: string; normalizedTitle: string }>();

export function matchesSearchFilter(game: Game, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return getNormalizedSearchTitle(game).includes(normalizedSearch);
}

function getNormalizedSearchTitle(game: Game): string {
  const cachedTitle = normalizedTitleCache.get(game);

  if (cachedTitle?.title === game.title) {
    return cachedTitle.normalizedTitle;
  }

  const normalizedTitle = game.title.toLowerCase();
  normalizedTitleCache.set(game, { title: game.title, normalizedTitle });

  return normalizedTitle;
}

export function matchesPlatformFilter(game: Game, platform: CollectionFilters['platform']): boolean {
  return platform === allOption || game.platform === platform;
}

export function matchesStatusFilter(game: Game, status: CollectionFilters['status']): boolean {
  return status === allOption || game.status === status;
}

export function matchesTagFilter(game: Game, tag: string): boolean {
  return tag === allOption || game.tags.includes(tag);
}

export function matchesSourceFilter(game: Game, source: SourceFilter): boolean {
  if (source === 'All') {
    return true;
  }

  if (source === 'Steam') {
    return (
      game.externalSource === 'steam' ||
      game.externalSource === 'steam-wishlist' ||
      typeof game.steamAppId === 'number'
    );
  }

  if (source === 'Manual') {
    return game.externalSource === 'manual';
  }

  if (source === 'Wishlist') {
    return game.collectionType === 'wishlist';
  }

  return isRetroOrFutureReady(game);
}

export function matchesEnrichmentFilter(game: Game, enrichment: EnrichmentFilter): boolean {
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

export function matchesAchievementFilter(game: Game, achievement: AchievementFilter): boolean {
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

export function matchesQuickFilter(game: Game, quickFilter: QuickFilter): boolean {
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

export function isRetroOrFutureReady(game: Game): boolean {
  const retroPlatforms = new Set(['PSP', 'PS2', 'GBA', 'SNES', 'Other']);
  const planningTags = new Set(['retro', 'emulated', 'emulation', 'physical', 'future', 'future-ready']);

  return retroPlatforms.has(game.platform) || game.tags.some((tag) => planningTags.has(tag.toLowerCase()));
}
