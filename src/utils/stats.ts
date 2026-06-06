import type { Game, GameCollectionType, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';
import { hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import { getPrimaryHltbHours, hasHltbData } from '../lib/hltb';

export const statsScopeOptions = ['library', 'wishlist', 'all'] as const;

export type StatsScope = (typeof statsScopeOptions)[number];

export type StatsBarItem = {
  count: number;
  hours?: number;
  label: string;
};

export type QuestShelfStats = {
  achievementAverageCompletionPercent: number;
  achievementCompleteCount: number;
  achievementNearlyCompleteCount: number;
  achievementSyncedSteamGameCount: number;
  achievementTotalUnlocked: number;
  activeBacklogCount: number;
  collectionCounts: Record<GameCollectionType, number>;
  enrichmentCompletionPercent: number;
  hltbAverageGameLength: number;
  hltbGamesWithDataCount: number;
  hltbLongGameCount: number;
  hltbMediumGameCount: number;
  hltbShortGameCount: number;
  finishedPercent: number;
  gamesMissingMetadata: Game[];
  gamesNeverPlayed: number;
  gamesWithPlaytimeNotFinished: number;
  libraryTotal: number;
  longestPausedGames: Game[];
  missingMetadataCount: number;
  platformBreakdown: StatsBarItem[];
  rawgEnrichedCount: number;
  recentlyImportedGames: Game[];
  recentlyPlayedGames: Game[];
  scopedGames: Game[];
  sourceBreakdown: StatsBarItem[];
  statusBreakdown: StatsBarItem[];
  statusCounts: Record<GameStatus, number>;
  topPlayedGames: Game[];
  totalTrackedPlaytime: number;
  wishlistTotal: number;
};

export function getQuestShelfStats(games: Game[], scope: StatsScope): QuestShelfStats {
  const scopedGames = games.filter((game) => matchesStatsScope(game, scope));
  const libraryGames = games.filter((game) => game.collectionType === 'library');
  const wishlistGames = games.filter((game) => game.collectionType === 'wishlist');
  const statusCounts = countStatuses(scopedGames);
  const finishedCount = statusCounts.Finished;
  const droppedCount = statusCounts.Dropped;
  const activeBacklogCount = scopedGames.filter(
    (game) => game.status === 'Want to play' || game.status === 'Playing' || game.status === 'Paused',
  ).length;
  const rawgEnrichedGames = scopedGames.filter((game) => game.metadataSource === 'rawg');
  const achievementGames = scopedGames.filter(hasSteamAchievementSummary);
  const missingMetadataGames = scopedGames.filter((game) => game.metadataSource !== 'rawg' && !game.metadataManualManagedAt);
  const hltbGames = scopedGames.filter(hasHltbData);
  const hltbMainHours = hltbGames.map(getPrimaryHltbHours).filter((hours): hours is number => typeof hours === 'number');

  return {
    achievementAverageCompletionPercent: getPercent(
      achievementGames.reduce((sum, game) => sum + (game.steamAchievementsPercent ?? 0), 0),
      achievementGames.length * 100,
    ),
    achievementCompleteCount: achievementGames.filter((game) => (game.steamAchievementsPercent ?? 0) >= 100).length,
    achievementNearlyCompleteCount: achievementGames.filter((game) => {
      const percent = game.steamAchievementsPercent ?? 0;
      return percent >= 80 && percent < 100;
    }).length,
    achievementSyncedSteamGameCount: achievementGames.length,
    achievementTotalUnlocked: achievementGames.reduce((sum, game) => sum + (game.steamAchievementsUnlocked ?? 0), 0),
    activeBacklogCount,
    collectionCounts: {
      library: libraryGames.length,
      wishlist: wishlistGames.length,
    },
    enrichmentCompletionPercent: getPercent(rawgEnrichedGames.length, scopedGames.length),
    // Dropped games are excluded from the progress denominator so abandoned titles do not make completion feel worse.
    finishedPercent: getPercent(finishedCount, Math.max(scopedGames.length - droppedCount, 0)),
    gamesMissingMetadata: sortByTitle(missingMetadataGames).slice(0, 10),
    hltbAverageGameLength: hltbMainHours.length > 0 ? Math.round((hltbMainHours.reduce((sum, hours) => sum + hours, 0) / hltbMainHours.length) * 10) / 10 : 0,
    hltbGamesWithDataCount: hltbGames.length,
    hltbLongGameCount: hltbMainHours.filter((hours) => hours > 25).length,
    hltbMediumGameCount: hltbMainHours.filter((hours) => hours >= 10 && hours <= 25).length,
    hltbShortGameCount: hltbMainHours.filter((hours) => hours < 10).length,
    gamesNeverPlayed: scopedGames.filter((game) => game.playtimeHours <= 0).length,
    gamesWithPlaytimeNotFinished: scopedGames.filter((game) => game.playtimeHours > 0 && game.status !== 'Finished').length,
    libraryTotal: libraryGames.length,
    // Without a paused-at timestamp, lastPlayedAt is the best local signal for how long a game has been waiting.
    longestPausedGames: scopedGames
      .filter((game) => game.status === 'Paused')
      .sort((firstGame, secondGame) => getDateTime(firstGame.lastPlayedAt) - getDateTime(secondGame.lastPlayedAt))
      .slice(0, 10),
    missingMetadataCount: missingMetadataGames.length,
    platformBreakdown: getPlatformBreakdown(scopedGames),
    rawgEnrichedCount: rawgEnrichedGames.length,
    recentlyImportedGames: [...scopedGames]
      .sort((firstGame, secondGame) => getImportedTime(secondGame) - getImportedTime(firstGame))
      .slice(0, 10),
    recentlyPlayedGames: scopedGames
      .filter((game) => Boolean(game.lastPlayedAt))
      .sort((firstGame, secondGame) => getDateTime(secondGame.lastPlayedAt) - getDateTime(firstGame.lastPlayedAt))
      .slice(0, 10),
    scopedGames,
    sourceBreakdown: getSourceBreakdown(scopedGames),
    statusBreakdown: gameStatuses.map((status) => ({
      count: statusCounts[status],
      label: status,
    })),
    statusCounts,
    topPlayedGames: [...scopedGames]
      .filter((game) => game.playtimeHours > 0)
      .sort((firstGame, secondGame) => secondGame.playtimeHours - firstGame.playtimeHours || compareTitle(firstGame, secondGame))
      .slice(0, 10),
    totalTrackedPlaytime: scopedGames.reduce((sum, game) => sum + game.playtimeHours, 0),
    wishlistTotal: wishlistGames.length,
  };
}

function matchesStatsScope(game: Game, scope: StatsScope) {
  return scope === 'all' || game.collectionType === scope;
}

function countStatuses(games: Game[]) {
  return gameStatuses.reduce(
    (counts, status) => {
      counts[status] = games.filter((game) => game.status === status).length;
      return counts;
    },
    {} as Record<GameStatus, number>,
  );
}

function getPlatformBreakdown(games: Game[]) {
  const byPlatform = new Map<string, { count: number; hours: number }>();

  games.forEach((game) => {
    const currentValue = byPlatform.get(game.platform) ?? { count: 0, hours: 0 };
    byPlatform.set(game.platform, {
      count: currentValue.count + 1,
      hours: currentValue.hours + game.playtimeHours,
    });
  });

  return Array.from(byPlatform.entries())
    .map(([label, value]) => ({
      count: value.count,
      hours: value.hours,
      label,
    }))
    .sort((firstItem, secondItem) => secondItem.count - firstItem.count || firstItem.label.localeCompare(secondItem.label));
}

function getSourceBreakdown(games: Game[]) {
  const sourceCounts = new Map<string, number>([
    ['Steam', 0],
    ['Steam Wishlist', 0],
    ['Retro ROM', 0],
    ['Manual', 0],
    ['Future/Other', 0],
  ]);

  games.forEach((game) => {
    const source = getSourceLabel(game);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  });

  return Array.from(sourceCounts.entries()).map(([label, count]) => ({ count, label }));
}

function getSourceLabel(game: Game) {
  if (game.externalSource === 'steam-wishlist') {
    return 'Steam Wishlist';
  }

  if (game.externalSource === 'steam' || typeof game.steamAppId === 'number') {
    return 'Steam';
  }

  if (game.externalSource === 'retro-rom') {
    return 'Retro ROM';
  }

  if (game.externalSource === 'manual') {
    return 'Manual';
  }

  return 'Future/Other';
}

function getPercent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function getImportedTime(game: Game) {
  return Math.max(
    getDateTime(game.importedAt),
    getDateTime(game.wishlistImportedAt),
    getDateTime(game.wishlistSyncedAt),
    getDateTime(game.metadataUpdatedAt),
  );
}

function getDateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortByTitle(games: Game[]) {
  return [...games].sort(compareTitle);
}

function compareTitle(firstGame: Game, secondGame: Game) {
  return firstGame.title.localeCompare(secondGame.title, undefined, { sensitivity: 'base' });
}
