import { createSteamPlaytimeDeltaRecord, type PlayActivityRecord } from './playActivityStorage';
import type { Game } from '../types/game';
import type { SteamOwnedGame, SteamPlaytimeRefreshSummary } from '../types/steam';

export type SteamPlaytimeRefreshResult = {
  games: Game[];
  activityRecords: PlayActivityRecord[];
  summary: SteamPlaytimeRefreshSummary;
};

export function isRefreshableSteamGame(game: Pick<Game, 'collectionType' | 'steamAppId'>) {
  return game.collectionType === 'library' && typeof game.steamAppId === 'number';
}

export function refreshSteamPlaytimeForGames(
  games: Game[],
  targetGameIds: Set<string>,
  ownedGames: SteamOwnedGame[],
  refreshedAt: string,
): SteamPlaytimeRefreshResult {
  const steamPlaytimeByAppId = new Map(ownedGames.map((game) => [game.appid, game]));
  const activityRecords: PlayActivityRecord[] = [];
  const detectedAt = new Date(refreshedAt);
  const summary: SteamPlaytimeRefreshSummary = {
    failedCount: 0,
    skippedNonSteamCount: 0,
    unchangedCount: 0,
    updatedCount: 0,
  };

  const nextGames = games.map((game) => {
    if (!targetGameIds.has(game.id)) {
      return game;
    }

    if (!isRefreshableSteamGame(game)) {
      summary.skippedNonSteamCount += 1;
      return game;
    }

    const steamAppId = game.steamAppId;
    const steamGame = typeof steamAppId === 'number' ? steamPlaytimeByAppId.get(steamAppId) : undefined;

    if (!steamGame) {
      summary.failedCount += 1;
      return game;
    }

    const currentPlaytimeMinutes = Math.max(0, Math.round(steamGame.playtime_forever ?? 0));
    const previousPlaytimeMinutes = typeof game.steamPlaytimeMinutes === 'number'
      ? game.steamPlaytimeMinutes
      : Math.max(0, Math.round((game.playtimeHours ?? 0) * 60));
    const playtimeHours = Math.round(currentPlaytimeMinutes / 60);
    const lastPlayedAt = steamGame.rtime_last_played
      ? new Date(steamGame.rtime_last_played * 1000).toISOString().slice(0, 10)
      : game.lastPlayedAt;
    const activityRecord = createSteamPlaytimeDeltaRecord({
      currentPlaytimeMinutes,
      detectedAt,
      gameId: game.id,
      previousPlaytimeMinutes,
    });
    if (activityRecord) {
      activityRecords.push(activityRecord);
    }

    const hasChanged = game.playtimeHours !== playtimeHours
      || game.lastPlayedAt !== lastPlayedAt
      || game.steamPlaytimeMinutes !== currentPlaytimeMinutes
      || Boolean(activityRecord);

    if (!hasChanged) {
      summary.unchangedCount += 1;
      return game;
    }

    summary.updatedCount += 1;
    return {
      ...game,
      lastPlayedAt,
      lastSteamActivityAt: activityRecord?.detectedAt ?? game.lastSteamActivityAt,
      lastSteamActivityDeltaMinutes: activityRecord?.deltaMinutes ?? game.lastSteamActivityDeltaMinutes,
      playtimeHours,
      steamPlaytimeMinutes: currentPlaytimeMinutes,
      updatedAt: refreshedAt,
    };
  });

  return { activityRecords, games: nextGames, summary };
}
