import { getSteamAchievementSummary, SteamApiError } from '../services/steamApi';
import type { Game } from '../types/game';
import type { SteamAchievementSyncSummary, SteamSettings } from '../types/steam';

export type SteamAchievementSyncProgress = {
  completed: number;
  total: number;
};

export type SteamAchievementSyncResult = {
  games: Game[];
  summary: SteamAchievementSyncSummary;
};

export function isSteamAchievementSyncableGame(game: Pick<Game, 'collectionType' | 'steamAppId'>) {
  return game.collectionType === 'library' && typeof game.steamAppId === 'number';
}

export async function syncSteamAchievementsForGames(
  games: Game[],
  targetGameIds: Set<string>,
  settings: SteamSettings,
  syncedAt: string,
  onProgress?: (progress: SteamAchievementSyncProgress) => void,
): Promise<SteamAchievementSyncResult> {
  const targetGames = games.filter((game) => targetGameIds.has(game.id));
  const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
  const summariesByAppId = new Map<
    number,
    Awaited<ReturnType<typeof getSteamAchievementSummary>>
  >();
  const failedAppIds = new Set<number>();
  let completed = 0;

  const summary: SteamAchievementSyncSummary = {
    failedCount: 0,
    noAchievementDataCount: 0,
    skippedNonSteamCount: targetGames.length - syncableGames.length,
    unchangedCount: 0,
    updatedCount: 0,
  };

  for (const game of syncableGames) {
    const steamAppId = game.steamAppId;

    if (typeof steamAppId !== 'number') {
      continue;
    }

    if (!summariesByAppId.has(steamAppId) && !failedAppIds.has(steamAppId)) {
      try {
        summariesByAppId.set(steamAppId, await getSteamAchievementSummary(settings, steamAppId));
      } catch (error) {
        if (
          error instanceof SteamApiError &&
          ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code)
        ) {
          throw error;
        }

        failedAppIds.add(steamAppId);
      }
    }

    completed += 1;
    onProgress?.({ completed, total: syncableGames.length });
  }

  const nextGames = games.map((game) => {
    if (!targetGameIds.has(game.id)) {
      return game;
    }

    if (!isSteamAchievementSyncableGame(game)) {
      return game;
    }

    const steamAppId = game.steamAppId;

    if (typeof steamAppId !== 'number') {
      return game;
    }

    if (failedAppIds.has(steamAppId)) {
      summary.failedCount += 1;
      return game;
    }

    const achievementSummary = summariesByAppId.get(steamAppId);

    if (!achievementSummary) {
      summary.noAchievementDataCount += 1;
      return game;
    }

    const hasChanged =
      game.steamAchievementsTotal !== achievementSummary.total ||
      game.steamAchievementsUnlocked !== achievementSummary.unlocked ||
      game.steamAchievementsPercent !== achievementSummary.percent ||
      game.steamLastAchievementUnlockTime !== achievementSummary.lastUnlockTime;

    if (!hasChanged) {
      summary.unchangedCount += 1;
      return game;
    }

    summary.updatedCount += 1;
    return {
      ...game,
      steamAchievementsTotal: achievementSummary.total,
      steamAchievementsUnlocked: achievementSummary.unlocked,
      steamAchievementsPercent: achievementSummary.percent,
      steamLastAchievementUnlockTime: achievementSummary.lastUnlockTime,
      updatedAt: syncedAt,
    };
  });

  return { games: nextGames, summary };
}
