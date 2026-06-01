import { mockGameIds, mockGames } from '../data/mockGames';
import { loadLocalJson, loadPersistedJson, savePersistedJson } from './localPersistence';
import { gameStatuses, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';

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

function normalizeLoadedGame(value: unknown): Game | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const game = value as Partial<Game>;

  if (typeof game.id !== 'string' || typeof game.title !== 'string') {
    return null;
  }

  return {
    ...(game as Game),
    collectionType: normalizeLoadedCollectionType(game.collectionType),
    coverImage: typeof game.coverImage === 'string' ? game.coverImage : '',
    id: game.id,
    lastPlayedAt: typeof game.lastPlayedAt === 'string' ? game.lastPlayedAt : null,
    notes: typeof game.notes === 'string' ? game.notes : '',
    platform: normalizeLoadedPlatform(game.platform),
    playtimeHours: getNonNegativeNumber(game.playtimeHours),
    status: normalizeLoadedStatus(game.status),
    tags: Array.isArray(game.tags) ? game.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    title: game.title,
  };
}

function normalizeLoadedGames(value: unknown): Game[] {
  return Array.isArray(value)
    ? value.map(normalizeLoadedGame).filter((game): game is Game => Boolean(game))
    : [];
}

function normalizeLoadedCollectionType(collectionType: unknown): GameCollectionType {
  return collectionType === 'wishlist' ? 'wishlist' : 'library';
}

function normalizeLoadedPlatform(platform: unknown): GamePlatform {
  return typeof platform === 'string' && platform.trim() ? platform : 'Other';
}

function normalizeLoadedStatus(status: unknown): GameStatus {
  if (typeof status !== 'string') {
    return 'Want to play';
  }
  if (status === 'Completed') {
    return 'Finished';
  }

  if (status === 'Backlog') {
    return 'Want to play';
  }

  return gameStatuses.includes(status as GameStatus) ? (status as GameStatus) : 'Want to play';
}

function getNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
