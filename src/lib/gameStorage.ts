import { mockGameIds, mockGames } from '../data/mockGames';
import type { Game, GameStatus } from '../types/game';

const STORAGE_KEY = 'questshelf.games.v1';

const isBrowser = typeof window !== 'undefined';

export function loadGames(): Game[] {
  if (!isBrowser) {
    return [];
  }

  const storedGames = window.localStorage.getItem(STORAGE_KEY);

  if (!storedGames) {
    return [];
  }

  try {
    const parsedGames = JSON.parse(storedGames) as Game[];
    return Array.isArray(parsedGames) ? parsedGames.map(normalizeLoadedGame) : [];
  } catch {
    return [];
  }
}

export function saveGames(games: Game[]) {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export function getMockGames(): Game[] {
  return mockGames.map((game) => ({ ...game, tags: [...game.tags] }));
}

export function isMockGame(game: Game) {
  return mockGameIds.has(game.id) && typeof game.steamAppId !== 'number' && game.externalSource !== 'steam';
}

export function removeMockGames(games: Game[]) {
  return games.filter((game) => !isMockGame(game));
}

function normalizeLoadedGame(game: Game): Game {
  return {
    ...game,
    status: normalizeLoadedStatus(game.status),
  };
}

function normalizeLoadedStatus(status: string): GameStatus {
  if (status === 'Completed') {
    return 'Finished';
  }

  if (status === 'Backlog') {
    return 'Want to play';
  }

  return status as GameStatus;
}
