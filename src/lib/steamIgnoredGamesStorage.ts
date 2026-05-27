import { loadLocalJson, savePersistedJson } from './localPersistence';

export type IgnoredSteamGame = {
  ignoredAt: string;
  steamAppId: number;
  title?: string;
};

const STORAGE_KEY = 'questshelf.steamIgnoredGames.v1';

export function loadIgnoredSteamGames(): IgnoredSteamGame[] {
  return loadLocalJson(STORAGE_KEY, [], normalizeIgnoredSteamGames);
}

export function saveIgnoredSteamGames(ignoredGames: IgnoredSteamGame[]) {
  savePersistedJson(STORAGE_KEY, ignoredGames);
}

export function addIgnoredSteamGame(
  ignoredGames: IgnoredSteamGame[],
  steamAppId: number,
  title?: string,
): IgnoredSteamGame[] {
  const existingGame = ignoredGames.find((game) => game.steamAppId === steamAppId);

  if (existingGame) {
    return ignoredGames.map((game) =>
      game.steamAppId === steamAppId
        ? {
            ...game,
            title: title || game.title,
          }
        : game,
    );
  }

  return [
    ...ignoredGames,
    {
      ignoredAt: new Date().toISOString(),
      steamAppId,
      title,
    },
  ];
}

export function removeIgnoredSteamGame(ignoredGames: IgnoredSteamGame[], steamAppId: number) {
  return ignoredGames.filter((game) => game.steamAppId !== steamAppId);
}

function isIgnoredSteamGame(value: unknown): value is IgnoredSteamGame {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const game = value as Partial<IgnoredSteamGame>;
  return typeof game.steamAppId === 'number' && typeof game.ignoredAt === 'string';
}

function normalizeIgnoredSteamGames(value: unknown): IgnoredSteamGame[] {
  return Array.isArray(value) ? value.filter(isIgnoredSteamGame) : [];
}
