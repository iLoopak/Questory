import {
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  normalizePlatformQueueState,
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
}
