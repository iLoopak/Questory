import {
  addActiveQueuePlatform,
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  getVisiblePlatformQueueEntries,
  moveQueueEntry,
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

function assertPlatformOrder(state: PlatformQueueState, platform: string, expectedGameIds: string[]) {
  const actualGameIds = state.entries
    .filter((entry) => entry.targetPlatform === platform)
    .sort((first, second) => first.queuePosition - second.queuePosition)
    .map((entry) => entry.gameId);

  if (actualGameIds.join('|') !== expectedGameIds.join('|')) {
    throw new Error(`Expected ${platform} order ${expectedGameIds.join(', ')}, received ${actualGameIds.join(', ')}.`);
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
    entries: [...state.entries, { ...state.entries[0], queuePosition: 99, queueNotes: 'duplicate note' }],
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

  const secondGame: Game = { ...baseGame, id: 'tekken-3', title: 'Tekken 3' };
  const thirdGame: Game = { ...baseGame, id: 'tony-hawk', title: `Tony Hawk's Pro Skater` };
  const otherPlatformGame: Game = { ...baseGame, id: 'ridge-racer', title: 'Ridge Racer', platform: 'PS1' };
  let reorderState = addGameToPlatformQueue(emptyState, thirdGame, 'PS2');
  reorderState = addGameToPlatformQueue(reorderState, secondGame, 'PS2');
  reorderState = addGameToPlatformQueue(reorderState, otherPlatformGame, 'PS1');

  reorderState = moveQueueEntry(reorderState, thirdGame.id, 'down', 'PS2');
  assertPlatformOrder(reorderState, 'PS2', [secondGame.id, thirdGame.id]);
  assertPlatformOrder(reorderState, 'PS1', [otherPlatformGame.id]);

  reorderState = moveQueueEntry(reorderState, thirdGame.id, 'top', 'PS2');
  assertPlatformOrder(reorderState, 'PS2', [thirdGame.id, secondGame.id]);

  reorderState = moveQueueEntry(reorderState, secondGame.id, 'up', 'PS2');
  assertPlatformOrder(reorderState, 'PS2', [secondGame.id, thirdGame.id]);
  assertPlatformEntryCount(reorderState, secondGame.id, 'PS2', 1);
  assertPlatformEntryCount(reorderState, thirdGame.id, 'PS2', 1);

  const customEmptyState = addActiveQueuePlatform({ activePlatforms: [], entries: [], schemaVersion: 1, settings: [] }, 'Analogue Pocket');
  const hydratedCustomEmptyState = normalizePlatformQueueState(JSON.parse(JSON.stringify(customEmptyState)));
  if (!hydratedCustomEmptyState.activePlatforms.includes('Analogue Pocket')) {
    throw new Error('Expected empty custom platform to survive normalization/hydration.');
  }

  const existingCustomState = addActiveQueuePlatform(customEmptyState, 'Retroid');
  const qqAddedState = addGameToPlatformQueue(existingCustomState, baseGame, 'Analogue Pocket');
  if (!qqAddedState.activePlatforms.includes('Retroid') || !qqAddedState.activePlatforms.includes('Analogue Pocket')) {
    throw new Error('Expected Quest Queue add to preserve existing custom platforms while activating the target platform.');
  }
  const hydratedQqAddedState = normalizePlatformQueueState(JSON.parse(JSON.stringify(qqAddedState)));
  assertPlatformEntryCount(hydratedQqAddedState, baseGame.id, 'Analogue Pocket', 1);
  if (!hydratedQqAddedState.activePlatforms.includes('Retroid') || !hydratedQqAddedState.activePlatforms.includes('Analogue Pocket')) {
    throw new Error('Expected custom platform and QQ-added game assignment to survive reload hydration.');
  }
}
