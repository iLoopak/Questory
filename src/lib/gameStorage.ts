import { mockGameIds, mockGames } from '../data/mockGames';
import { loadLocalJson, loadPersistedJson, savePersistedJson } from './localPersistence';
import type { Game, GameStatus } from '../types/game';

const STORAGE_KEY = 'questshelf.games.v1';

export function loadGames(): Game[] {
  return loadLocalJson(STORAGE_KEY, [], normalizeLoadedGames);
}

export function loadGamesFromPersistentStorage(): Promise<Game[]> {
  return loadPersistedJson(STORAGE_KEY, [], normalizeLoadedGames);
}

export function saveGames(games: Game[]) {
  savePersistedJson(STORAGE_KEY, games);
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
    collectionType: game.collectionType ?? 'library',
    status: normalizeLoadedStatus(game.status),
  };
}

function normalizeLoadedGames(value: unknown): Game[] {
  return Array.isArray(value) ? value.map((game) => normalizeLoadedGame(game as Game)) : [];
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
