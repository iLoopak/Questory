export type IgnoredSteamGame = {
  ignoredAt: string;
  steamAppId: number;
  title?: string;
};

const STORAGE_KEY = 'questshelf.steamIgnoredGames.v1';
const isBrowser = typeof window !== 'undefined';

export function loadIgnoredSteamGames(): IgnoredSteamGame[] {
  if (!isBrowser) {
    return [];
  }

  const storedGames = window.localStorage.getItem(STORAGE_KEY);

  if (!storedGames) {
    return [];
  }

  try {
    const parsedGames = JSON.parse(storedGames) as IgnoredSteamGame[];
    return Array.isArray(parsedGames) ? parsedGames.filter(isIgnoredSteamGame) : [];
  } catch {
    return [];
  }
}

export function saveIgnoredSteamGames(ignoredGames: IgnoredSteamGame[]) {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ignoredGames));
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
