import { getSteamAchievementSummary, SteamApiError } from '../services/steamApi';
import type { Game } from '../types/game';
import type { SteamAchievementSyncSummary, SteamSettings } from '../types/steam';

export const STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE = 4;
export const STEAM_ACHIEVEMENT_SYNC_BATCH_DELAY_MS = 1000;
export const STEAM_ACHIEVEMENT_SYNC_MAX_RETRIES = 2;
export const STEAM_ACHIEVEMENT_SYNC_RETRY_DELAY_MS = 500;

type SteamAchievementSummaryResult = Awaited<ReturnType<typeof getSteamAchievementSummary>>;

type SteamAchievementGameSyncStatus = 'updated' | 'skipped' | 'no-achievements' | 'unavailable' | 'failed';

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
  force = false,
): Promise<SteamAchievementSyncResult> {
  const targetGames = games.filter((game) => targetGameIds.has(game.id));
  const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
  const summariesByAppId = new Map<number, SteamAchievementSummaryResult>();
  const noAchievementAppIds = new Set<number>();
  const failedAppIds = new Set<number>();
  let nextGames = games;
  let completed = 0;

  debugSteamAchievementSync('start', { eligibleGameCount: syncableGames.length, targetGameCount: targetGames.length });

  const summary: SteamAchievementSyncSummary = {
    failedCount: 0,
    noAchievementDataCount: 0,
    skippedNonSteamCount: targetGames.length - syncableGames.length,
    unchangedCount: 0,
    updatedCount: 0,
  };

  for (let batchStart = 0; batchStart < syncableGames.length; batchStart += STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE) {
    const batch = syncableGames.slice(batchStart, batchStart + STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE);
    debugSteamAchievementSync('batch started', {
      batchNumber: Math.floor(batchStart / STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE) + 1,
      batchSize: batch.length,
    });
    const batchResults = await Promise.all(
      batch.map((game) =>
        syncSteamAchievementsForGameWithProgress(
          {
            failedAppIds,
            game,
            noAchievementAppIds,
            settings,
            summariesByAppId,
            force,
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
    debugSteamAchievementSync('batch completed', {
      batchNumber: Math.floor(batchStart / STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE) + 1,
      completed: progress.completed,
      total: progress.total,
      results: batchResults.map(({ steamAppId, status }) => ({ steamAppId, status })),
    });
    onBatchComplete?.({ games: nextGames, progress, summary: { ...summary }, batchResults });

    if (batchStart + STEAM_ACHIEVEMENT_SYNC_BATCH_SIZE < syncableGames.length) {
      await delay(STEAM_ACHIEVEMENT_SYNC_BATCH_DELAY_MS);
    }
  }

  debugSteamAchievementSync('completed', { completed, total: syncableGames.length, summary });

  return { games: nextGames, summary };
}

async function syncSteamAchievementsForGameWithProgress(
  options: {
    failedAppIds: Set<number>;
    game: Game;
    noAchievementAppIds: Set<number>;
    settings: SteamSettings;
    summariesByAppId: Map<number, SteamAchievementSummaryResult>;
    force: boolean;
  },
  onProcessed: () => void,
): Promise<SteamAchievementGameSyncResult> {
  try {
    const result = await syncSteamAchievementsForGame(options);
    debugSteamAchievementSync('game result', {
      appId: result.steamAppId,
      gameId: result.gameId,
      status: result.status,
    });
    return result;
  } finally {
    try {
      onProcessed();
    } catch (error) {
      debugSteamAchievementSync('progress callback failed', { error });
    }
  }
}

async function syncSteamAchievementsForGame({
  failedAppIds,
  game,
  noAchievementAppIds,
  settings,
  summariesByAppId,
  force,
}: {
  failedAppIds: Set<number>;
  game: Game;
  noAchievementAppIds: Set<number>;
  settings: SteamSettings;
  summariesByAppId: Map<number, SteamAchievementSummaryResult>;
  force: boolean;
}): Promise<SteamAchievementGameSyncResult> {
  const steamAppId = game.steamAppId;

  debugSteamAchievementSync('game started', { appId: steamAppId, gameId: game.id, title: game.title });

  if (typeof steamAppId !== 'number') {
    return { gameId: game.id, steamAppId: 0, status: 'skipped' };
  }

  if (!force && game.steamAchievementsUnsupported === true) {
    noAchievementAppIds.add(steamAppId);
    return { gameId: game.id, steamAppId, status: 'no-achievements' };
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

    if (isSteamUnavailableError(error)) {
      return { gameId: game.id, steamAppId, status: 'unavailable' };
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

      const retryDelayMs = getSteamAchievementRetryDelayMs(attempt);
      debugSteamAchievementSync('retry scheduled', {
        appId: steamAppId,
        attempt: attempt + 1,
        retryDelayMs,
        error: getSteamAchievementErrorDebugInfo(error),
      });
      await delay(retryDelayMs);
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

    if (result.status === 'unavailable') {
      summary.noAchievementDataCount += 1;
      return game;
    }

    if (result.status === 'no-achievements') {
      summary.noAchievementDataCount += 1;
      return {
        ...game,
        steamAchievementsUnsupported: true,
        steamAchievementsLastCheckedAt: Date.parse(syncedAt),
        updatedAt: syncedAt,
      };
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
      game.steamLastAchievementUnlockTime !== achievementSummary.lastUnlockTime ||
      game.steamAchievementsUnsupported === true;

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
      steamAchievementsUnsupported: false,
      steamAchievementsLastCheckedAt: Date.parse(syncedAt),
      updatedAt: syncedAt,
    };
  });
}

function isSteamCredentialError(error: unknown) {
  return error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
}

function isSteamUnavailableError(error: unknown) {
  return error instanceof SteamApiError && error.code === 'private-profile';
}

function isPermanentNoAchievementError(error: unknown) {
  if (!(error instanceof SteamApiError)) {
    return false;
  }

  return (
    error.code === 'no-achievements' ||
    (error.code === 'api-failure' && error.httpStatus === 400 && error.isTransient !== true)
  );
}

function isRetryableSteamAchievementError(error: unknown) {
  if (!(error instanceof SteamApiError)) {
    return false;
  }

  if (['cors-proxy', 'malformed-response', 'timeout'].includes(error.code)) {
    return true;
  }

  return error.code === 'api-failure' && error.isTransient === true;
}

function getSteamAchievementRetryDelayMs(attempt: number) {
  return Math.min(STEAM_ACHIEVEMENT_SYNC_RETRY_DELAY_MS * (attempt + 1), 5_000);
}

function getSteamAchievementErrorDebugInfo(error: unknown) {
  if (error instanceof SteamApiError) {
    return {
      code: error.code,
      httpStatus: error.httpStatus,
      isTransient: error.isTransient,
      message: error.message,
    };
  }

  return error instanceof Error ? { message: error.message } : { message: String(error) };
}

function debugSteamAchievementSync(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[SteamAchievementSync] ${message}`, data ?? {});
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
