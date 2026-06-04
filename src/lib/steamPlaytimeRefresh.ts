import type { Game } from '../types/game';
import type { SteamOwnedGame, SteamPlaytimeRefreshSummary } from '../types/steam';

export type SteamPlaytimeRefreshResult = {
  games: Game[];
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

    const playtimeHours = Math.round((steamGame.playtime_forever ?? 0) / 60);
    const lastPlayedAt = steamGame.rtime_last_played
      ? new Date(steamGame.rtime_last_played * 1000).toISOString().slice(0, 10)
      : game.lastPlayedAt;
    const hasChanged = game.playtimeHours !== playtimeHours || game.lastPlayedAt !== lastPlayedAt;

    if (!hasChanged) {
      summary.unchangedCount += 1;
      return game;
    }

    summary.updatedCount += 1;
    return {
      ...game,
      lastPlayedAt,
      playtimeHours,
      updatedAt: refreshedAt,
    };
  });

  return { games: nextGames, summary };
}
