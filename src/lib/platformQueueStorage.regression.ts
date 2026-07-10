import {
  addActiveQueuePlatform,
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  getVisiblePlatformQueueEntries,
  moveQueueEntry,
  moveQueueEntryToPlatform,
  normalizePlatformQueuePersistedState,
  normalizePlatformQueueState,
  removeCurrentlyPlayingFromPlatformQueue,
  updatePlatformQueueVisualSettings,
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
  schemaVersion: 2,
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

  const customEmptyState = addActiveQueuePlatform({ activePlatforms: [], entries: [], schemaVersion: 2, settings: [] }, 'Analogue Pocket');
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

  const persistentArtwork = 'data:image/png;base64,cGVyc2lzdGVudC1hcnR3b3Jr';
  const identityState = updatePlatformQueueVisualSettings(
    addActiveQueuePlatform({ activePlatforms: [], entries: [], schemaVersion: 2, settings: [] }, 'Analogue Pocket'),
    'Analogue Pocket',
    { accentColor: '#8b5cf6', artworkUrl: persistentArtwork, platformTag: 'fpga' },
  );
  const hydratedIdentityState = normalizePlatformQueueState(JSON.parse(JSON.stringify(identityState)));
  const hydratedIdentity = hydratedIdentityState.settings.find((setting) => setting.platform === 'Analogue Pocket');
  if (!hydratedIdentityState.activePlatforms.includes('Analogue Pocket') || hydratedIdentity?.artworkUrl !== persistentArtwork || hydratedIdentity.platformTag !== 'fpga') {
    throw new Error('Expected custom platform identity Data URL artwork, platform tag, and active platform to survive reload hydration.');
  }

  const legacyIdentityState = normalizePlatformQueueState({
    activePlatforms: ['Analogue Pocket'],
    entries: [],
    schemaVersion: 2,
    settings: [{ platform: 'Analogue Pocket', accentColor: '#8b5cf6', artworkUrl: persistentArtwork, platformTag: 'fpga' }],
  });
  const legacyIdentity = legacyIdentityState.settings.find((setting) => setting.platform === 'Analogue Pocket');
  if (legacyIdentity?.artworkUrl !== persistentArtwork || legacyIdentity.maxActiveGames < 1) {
    throw new Error('Expected legacy identity-only platform settings to hydrate without losing custom artwork.');
  }

  const temporaryArtworkState = normalizePlatformQueueState({
    activePlatforms: ['Analogue Pocket'],
    entries: [],
    schemaVersion: 2,
    settings: [{ platform: 'Analogue Pocket', maxActiveGames: 3, artworkUrl: 'blob:http://localhost/not-persistent' }],
  });
  if (temporaryArtworkState.settings.find((setting) => setting.platform === 'Analogue Pocket')?.artworkUrl) {
    throw new Error('Expected temporary blob/object artwork URLs to be rejected during hydration.');
  }

  const legacyState = {
    activePlatforms: ['Analogue Pocket'],
    entries: [
      { gameId: 'alpha', targetPlatform: 'Analogue Pocket', queuedAt: '2026-01-01T00:00:00.000Z', queuePosition: 2, queueNotes: 'second', queuePriority: 'high', estimatedPlaytime: 12, description: 'ignored duplicate game metadata' },
      { gameId: 'missing-game', targetPlatform: 'Analogue Pocket', queuedAt: '2026-01-02T00:00:00.000Z', queuePosition: 1, queueNotes: '', queuePriority: 'normal', coverImage: 'https://example.test/cover.jpg' },
      { gameId: 'alpha', targetPlatform: 'Analogue Pocket', queuedAt: '2026-01-03T00:00:00.000Z', queuePosition: 99, queueNotes: 'duplicate', queuePriority: 'low' },
    ],
    schemaVersion: 1,
    settings: [{ platform: 'Analogue Pocket', maxActiveGames: 5, accentColor: '#8b5cf6', artworkUrl: persistentArtwork, platformTag: 'fpga' }],
  };
  const migrated = normalizePlatformQueuePersistedState(legacyState);
  if (migrated.schemaVersion !== 2 || !Array.isArray(migrated.plans) || migrated.plans[0]?.gameIds.join('|') !== 'missing-game|alpha') {
    throw new Error('Expected legacy platform queue migration to write normalized plans with preserved ordering and missing-game references.');
  }
  if (JSON.stringify(migrated).includes('example.test') || JSON.stringify(migrated).includes('description')) {
    throw new Error('Expected migration to discard duplicated game/artwork metadata from legacy entries.');
  }
  const migratedAgain = normalizePlatformQueuePersistedState(migrated);
  if (migratedAgain.plans.length !== migrated.plans.length || migratedAgain.plans[0]?.gameIds.join('|') !== migrated.plans[0]?.gameIds.join('|')) {
    throw new Error('Expected platform queue migration to be idempotent.');
  }
  const hydratedMigrated = normalizePlatformQueueState(migrated);
  assertPlatformEntryCount(hydratedMigrated, 'alpha', 'Analogue Pocket', 1);
  assertPlatformEntryCount(hydratedMigrated, 'missing-game', 'Analogue Pocket', 1);

  let movedState = normalizePlatformQueueState(migrated);
  movedState = moveQueueEntryToPlatform(movedState, 'alpha', 'Steam Deck', 'Analogue Pocket');
  assertPlatformEntryCount(movedState, 'alpha', 'Steam Deck', 1);
  movedState = removeGameFromPlatformQueue(movedState, 'alpha', 'Steam Deck');
  assertPlatformEntryCount(movedState, 'alpha', 'Steam Deck', 0);

  const largeLegacyState = {
    activePlatforms: ['Steam Deck'],
    entries: Array.from({ length: 1000 }, (_, index) => ({
      gameId: `game-${index}`,
      targetPlatform: 'Steam Deck',
      queuedAt: '2026-01-01T00:00:00.000Z',
      queuePosition: index + 1,
      queueNotes: '',
      queuePriority: 'normal',
      coverImage: `https://images.example.test/${index}.jpg`,
      screenshots: Array.from({ length: 5 }, (__, shot) => `https://images.example.test/${index}-${shot}.jpg`),
      rawgMetadata: { description: 'Long duplicated description '.repeat(20), rating: 4.5 },
    })),
    schemaVersion: 1,
    settings: [],
  };
  const largeLegacyBytes = JSON.stringify(largeLegacyState).length;
  const largeNormalizedBytes = JSON.stringify(normalizePlatformQueuePersistedState(largeLegacyState)).length;
  if (largeNormalizedBytes >= largeLegacyBytes / 2) {
    throw new Error(`Expected normalized large-library payload to be much smaller than duplicated legacy payload (${largeNormalizedBytes} vs ${largeLegacyBytes}).`);
  }

}
