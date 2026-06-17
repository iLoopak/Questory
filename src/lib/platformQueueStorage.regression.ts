import {
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  getVisiblePlatformQueueEntries,
  normalizePlatformQueueState,
  removeCurrentlyPlayingFromPlatformQueue,
  removeGameFromPlatformQueue,
  type PlatformQueueState,
} from './platformQueueStorage';
import type { Game } from '../types/game';

const baseGame: Game = {
  id: 'god-of-war',
  title: 'God of War',
  platform: 'PS2',
  status: 'Want to play',
  collectionType: 'library',
  coverImage: '',
  playtimeHours: 0,
  lastPlayedAt: null,
  tags: [],
  notes: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const emptyState: PlatformQueueState = {
  activePlatforms: ['PS2'],
  entries: [],
  schemaVersion: 1,
  settings: [],
};

function assertPlatformEntryCount(state: PlatformQueueState, gameId: string, platform: string, expectedCount: number) {
  const count = state.entries.filter((entry) => entry.gameId === gameId && entry.targetPlatform === platform).length;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} entries for ${gameId} on ${platform}, received ${count}.`);
  }
}

function assertVisiblePlatformEntryCount(state: PlatformQueueState, games: Game[], gameId: string, platform: string, expectedCount: number) {
  const count = getVisiblePlatformQueueEntries(state, games).filter((entry) => entry.gameId === gameId && entry.targetPlatform === platform).length;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} visible entries for ${gameId} on ${platform}, received ${count}.`);
  }
}

export function runPlatformQueueUniquenessRegressionAssertions() {
  let state = addGameToPlatformQueue(emptyState, baseGame, 'PS2');
  state = addGameToPlatformQueueTop(state, { ...baseGame, status: 'Playing' }, 'PS2');
  assertPlatformEntryCount(state, baseGame.id, 'PS2', 1);

  state = removeGameFromPlatformQueue(state, baseGame.id, 'PS2');
  assertPlatformEntryCount(state, baseGame.id, 'PS2', 0);

  state = addGameToPlatformQueueTop(state, { ...baseGame, status: 'Want to play' }, 'PS2');
  assertPlatformEntryCount(state, baseGame.id, 'PS2', 1);

  state = addGameToPlatformQueue(state, baseGame, 'PS2');
  assertPlatformEntryCount(state, baseGame.id, 'PS2', 1);

  state = addGameToPlatformQueue(state, baseGame, 'PS5');
  assertPlatformEntryCount(state, baseGame.id, 'PS2', 1);
  assertPlatformEntryCount(state, baseGame.id, 'PS5', 1);

  const normalized = normalizePlatformQueueState({
    ...state,
    entries: [
      ...state.entries,
      { ...state.entries[0], queuePosition: 99, queueNotes: 'duplicate note' },
    ],
  });
  assertPlatformEntryCount(normalized, baseGame.id, 'PS2', 1);

  const playingPs2Game: Game = { ...baseGame, platform: 'PS2', status: 'Playing' };
  const playingPs5Game: Game = { ...baseGame, platform: 'PS5', status: 'Playing' };
  let activePlanState = addGameToPlatformQueue(emptyState, baseGame, 'PS2');

  activePlanState = removeCurrentlyPlayingFromPlatformQueue(activePlanState, [playingPs2Game]);
  assertPlatformEntryCount(activePlanState, baseGame.id, 'PS2', 0);

  activePlanState = addGameToPlatformQueue(emptyState, baseGame, 'PS2');
  activePlanState = removeCurrentlyPlayingFromPlatformQueue(activePlanState, [playingPs5Game]);
  assertPlatformEntryCount(activePlanState, baseGame.id, 'PS2', 1);

  activePlanState = addGameToPlatformQueueTop(activePlanState, { ...baseGame, status: 'Want to play' }, 'PS2');
  assertPlatformEntryCount(activePlanState, baseGame.id, 'PS2', 1);

  const persistedConflictState = addGameToPlatformQueue(emptyState, baseGame, 'PS2');
  assertVisiblePlatformEntryCount(persistedConflictState, [playingPs2Game], baseGame.id, 'PS2', 0);
  const cleanedConflictState = removeCurrentlyPlayingFromPlatformQueue(persistedConflictState, [playingPs2Game]);
  assertPlatformEntryCount(cleanedConflictState, baseGame.id, 'PS2', 0);
}
