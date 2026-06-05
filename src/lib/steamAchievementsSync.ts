import { getSteamAchievementSummary, SteamApiError } from '../services/steamApi';
import type { Game } from '../types/game';
import type { SteamAchievementSyncSummary, SteamSettings } from '../types/steam';

export const STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE = 4;
export const STEAM_ACHIEVEMENT_SYNC_BATCH_DELAY_MS = 1000;
export const STEAM_ACHIEVEMENT_SYNC_MAX_RETRIES = 2;
export const STEAM_ACHIEVEMENT_SYNC_RETRY_DELAY_MS = 500;

type SteamAchievementSummaryResult = Awaited<ReturnType<typeof getSteamAchievementSummary>>;

type SteamAchievementGameSyncStatus = 'updated' | 'skipped' | 'no-achievements' | 'failed';

export type SteamAchievementSyncProgress = {
  completed: number;
  total: number;
};

export type SteamAchievementGameSyncResult = {
  gameId: string;
  steamAppId: number;
  status: SteamAchievementGameSyncStatus;
};

export type SteamAchievementSyncBatchResult = {
  games: Game[];
  progress: SteamAchievementSyncProgress;
  summary: SteamAchievementSyncSummary;
  batchResults: SteamAchievementGameSyncResult[];
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
  onBatchComplete?: (result: SteamAchievementSyncBatchResult) => void,
): Promise<SteamAchievementSyncResult> {
  const targetGames = games.filter((game) => targetGameIds.has(game.id));
  const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
  const summariesByAppId = new Map<number, SteamAchievementSummaryResult>();
  const noAchievementAppIds = new Set<number>();
  const failedAppIds = new Set<number>();
  let nextGames = games;
  let completed = 0;

  const summary: SteamAchievementSyncSummary = {
    failedCount: 0,
    noAchievementDataCount: 0,
    skippedNonSteamCount: targetGames.length - syncableGames.length,
    unchangedCount: 0,
    updatedCount: 0,
  };

  for (let batchStart = 0; batchStart < syncableGames.length; batchStart += STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE) {
    const batch = syncableGames.slice(batchStart, batchStart + STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((game) =>
        syncSteamAchievementsForGameWithProgress(
          {
            failedAppIds,
            game,
            noAchievementAppIds,
            settings,
            summariesByAppId,
          },
          () => {
            completed = Math.min(completed + 1, syncableGames.length);
            onProgress?.({ completed, total: syncableGames.length });
          },
        ),
      ),
    );

    nextGames = mergeSteamAchievementBatch(nextGames, batchResults, summariesByAppId, syncedAt, summary);

    const progress = { completed, total: syncableGames.length };
    onBatchComplete?.({ games: nextGames, progress, summary: { ...summary }, batchResults });

    if (batchStart + STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE < syncableGames.length) {
      await delay(STEAM_ACHIEVEMENT_SYNC_BATCH_DELAY_MS);
    }
  }

  return { games: nextGames, summary };
}

async function syncSteamAchievementsForGameWithProgress(
  options: {
    failedAppIds: Set<number>;
    game: Game;
    noAchievementAppIds: Set<number>;
    settings: SteamSettings;
    summariesByAppId: Map<number, SteamAchievementSummaryResult>;
  },
  onProcessed: () => void,
): Promise<SteamAchievementGameSyncResult> {
  try {
    return await syncSteamAchievementsForGame(options);
  } finally {
    onProcessed();
  }
}

async function syncSteamAchievementsForGame({
  failedAppIds,
  game,
  noAchievementAppIds,
  settings,
  summariesByAppId,
}: {
  failedAppIds: Set<number>;
  game: Game;
  noAchievementAppIds: Set<number>;
  settings: SteamSettings;
  summariesByAppId: Map<number, SteamAchievementSummaryResult>;
}): Promise<SteamAchievementGameSyncResult> {
  const steamAppId = game.steamAppId;

  if (typeof steamAppId !== 'number') {
    return { gameId: game.id, steamAppId: 0, status: 'skipped' };
  }

  if (summariesByAppId.has(steamAppId)) {
    return { gameId: game.id, steamAppId, status: 'updated' };
  }

  if (noAchievementAppIds.has(steamAppId)) {
    return { gameId: game.id, steamAppId, status: 'no-achievements' };
  }

  if (failedAppIds.has(steamAppId)) {
    return { gameId: game.id, steamAppId, status: 'failed' };
  }

  try {
    const achievementSummary = await getSteamAchievementSummaryWithRetry(settings, steamAppId);

    if (achievementSummary) {
      summariesByAppId.set(steamAppId, achievementSummary);
      return { gameId: game.id, steamAppId, status: 'updated' };
    }

    noAchievementAppIds.add(steamAppId);
    return { gameId: game.id, steamAppId, status: 'no-achievements' };
  } catch (error) {
    if (isSteamCredentialError(error)) {
      throw error;
    }

    if (isPermanentNoAchievementError(error)) {
      noAchievementAppIds.add(steamAppId);
      return { gameId: game.id, steamAppId, status: 'no-achievements' };
    }

    failedAppIds.add(steamAppId);
    return { gameId: game.id, steamAppId, status: 'failed' };
  }
}

async function getSteamAchievementSummaryWithRetry(settings: SteamSettings, steamAppId: number) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= STEAM_ACHIEVEMENT_SYNC_MAX_RETRIES; attempt += 1) {
    try {
      return await getSteamAchievementSummary(settings, steamAppId);
    } catch (error) {
      lastError = error;

      if (!isRetryableSteamAchievementError(error) || attempt >= STEAM_ACHIEVEMENT_SYNC_MAX_RETRIES) {
        throw error;
      }

      await delay(STEAM_ACHIEVEMENT_SYNC_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

function mergeSteamAchievementBatch(
  games: Game[],
  batchResults: SteamAchievementGameSyncResult[],
  summariesByAppId: Map<number, SteamAchievementSummaryResult>,
  syncedAt: string,
  summary: SteamAchievementSyncSummary,
) {
  const resultsByGameId = new Map(batchResults.map((result) => [result.gameId, result]));

  return games.map((game) => {
    const result = resultsByGameId.get(game.id);

    if (!result) {
      return game;
    }

    if (result.status === 'failed') {
      summary.failedCount += 1;
      return game;
    }

    if (result.status === 'no-achievements') {
      summary.noAchievementDataCount += 1;
      return game;
    }

    if (result.status === 'skipped') {
      summary.skippedNonSteamCount += 1;
      return game;
    }

    const achievementSummary = summariesByAppId.get(result.steamAppId);

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
}

function isSteamCredentialError(error: unknown) {
  return error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
}

function isPermanentNoAchievementError(error: unknown) {
  return error instanceof SteamApiError && ['no-achievements', 'private-profile'].includes(error.code);
}

function isRetryableSteamAchievementError(error: unknown) {
  if (!(error instanceof SteamApiError)) {
    return false;
  }

  if (['cors-proxy', 'malformed-response'].includes(error.code)) {
    return true;
  }

  return error.code === 'api-failure' && error.isTransient === true;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
