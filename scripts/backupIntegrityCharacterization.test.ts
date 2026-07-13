/** DPI-02/03/06 and registry-wide backup characterization. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables } from './testUtils/indexedDbControl';
import { makeLibraryGame, makePlayActivityRecord, makeWishlistGame } from './testUtils/gameFixtures';
import type { QuestShelfBackup, QuestShelfBackupImportResult } from '../src/lib/backupStorage';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
const { playActivityRepository, loadPlayActivity } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { loadPlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { loadReviewModeState } = await import('../src/lib/reviewModeStorage');
const { coreBackupStorageKeys } = await import('../src/lib/storageRegistry');
const {
  createQuestShelfBackup,
  mergeQuestShelfBackup,
  restoreQuestShelfBackup,
  questShelfAppVersion,
  questShelfBackupVersion,
} = await import('../src/lib/backupStorage');

const database = getGameDatabase()!;
const noSnapshot = { skipRecoverySnapshot: true };

function backup(data: QuestShelfBackup['data']): QuestShelfBackup {
  return {
    app: 'Questory',
    schemaVersion: questShelfBackupVersion,
    metadata: {
      appVersion: questShelfAppVersion,
      exportedAt: '2026-07-01T00:00:00.000Z',
      includesIntegrationSettings: false,
      includesSecrets: false,
      schemaVersion: questShelfBackupVersion,
    },
    data,
  };
}

async function setup() {
  resetWebStorage();
  const storage = createControllableStorageAdapter({ durableMode: 'auto' });
  setStorageAdapter(storage.adapter);
  await gameRepository.ready();
  await playActivityRepository.ready();
  await rawgMetadataCacheRepository.ready();
  await gameRepository.clear();
  await playActivityRepository.clear();
  await rawgMetadataCacheRepository.clear();
  await clearQuestoryTables(database);
  storage.reset();
  return storage;
}

function expectOk(result: QuestShelfBackupImportResult) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result as Extract<QuestShelfBackupImportResult, { ok: true }>;
}

function planState(gameId: string, note: string) {
  return {
    activePlatforms: ['PC'],
    plans: [{
      gameIds: [gameId],
      id: 'platform-plan-pc',
      items: [{ gameId, queueNotes: note, queuedAt: '2026-07-01T10:00:00.000Z' }],
      platform: 'PC',
    }],
    schemaVersion: 2,
    settings: [{ platform: 'PC', maxActiveGames: 4 }],
  };
}

function reviewState(gameId: string) {
  return {
    ignoredGameIds: [gameId],
    queueOrder: [gameId],
    reviewedGames: { [gameId]: { reviewedAt: '2026-07-01T11:00:00.000Z' } },
    lastSource: 'backlog',
    schemaVersion: 2,
    stats: { dropped: 0, enriched: 0, ignored: 1, playing: 0, queueCandidates: 0, reviewed: 1, skipped: 0, wishlisted: 0 },
  };
}

test('DPI-06 current behavior: duplicate Game.id rows survive the snapshot but collapse in IndexedDB', async () => {
  await setup();
  const duplicateId = 'duplicate-game';
  const result = expectOk(await restoreQuestShelfBackup(backup({
    'questshelf.games.v1': [
      makeLibraryGame({ id: duplicateId, title: 'First duplicate' }),
      makeWishlistGame({ id: duplicateId, title: 'Second duplicate' }),
    ],
  }), noSnapshot));

  assert.equal(result.games.acceptedCount, 2, 'backup validation accepts both rows');
  assert.equal(loadGames().length, 2, 'the optimistic repository snapshot keeps both rows');
  assert.equal(await database.games.count(), 1, 'the IndexedDB primary key silently keeps only one row');
  assert.equal((await database.games.get(duplicateId))?.title, 'Second duplicate');
});

test('DPI-03: merge preserves a local ID and remaps every dependent backup reference', async () => {
  await setup();
  const local = makeLibraryGame({
    id: 'local-game-id', title: 'Alias Game', steamAppId: 123, updatedAt: '2026-06-01T00:00:00.000Z',
  });
  expectOk(await restoreQuestShelfBackup(backup({ 'questshelf.games.v1': [local] }), noSnapshot));

  const backupSide = makeLibraryGame({
    ...local, id: 'backup-game-id', notes: 'new backup notes', updatedAt: '2026-07-01T00:00:00.000Z',
  });
  expectOk(await mergeQuestShelfBackup(backup({
    'questshelf.games.v1': [backupSide],
    'questshelf.platformQueues.v1': planState(backupSide.id, 'backup plan'),
    'questshelf.reviewMode.v1': reviewState(backupSide.id),
    'questshelf.playActivity.v1': [makePlayActivityRecord({ id: 'backup-activity', gameId: backupSide.id })],
  }), noSnapshot));

  assert.deepEqual(loadGames().map((game) => game.id), [local.id], 'the canonical game keeps the local id');
  assert.equal(loadGames()[0].notes, 'new backup notes');
  assert.deepEqual(loadPlatformQueueState().entries.map((entry) => entry.gameId), [local.id]);
  assert.deepEqual(loadReviewModeState().queueOrder, [local.id]);
  assert.deepEqual(loadReviewModeState().ignoredGameIds, [local.id]);
  assert.deepEqual(Object.keys(loadReviewModeState().reviewedGames), [local.id]);
  assert.deepEqual(loadPlayActivity().map((row) => row.gameId), [local.id]);

  const knownIds = new Set(loadGames().map((game) => game.id));
  assert.equal(knownIds.has(local.id), true, 'all dependent references resolve to the canonical game');
});

test('DPI-02: present merge sections preserve local-only Plans, ignored Steam IDs and activity', async () => {
  const storage = await setup();
  const localGame = makeLibraryGame({ id: 'local-only', title: 'Local only' });
  const backupGame = makeLibraryGame({ id: 'backup-only', title: 'Backup only' });
  expectOk(await restoreQuestShelfBackup(backup({
    'questshelf.games.v1': [localGame],
    'questshelf.platformQueues.v1': planState(localGame.id, 'local plan'),
    'questshelf.steamIgnoredGames.v1': [{ steamAppId: 10, title: 'Local ignored', ignoredAt: '2026-06-01T00:00:00.000Z' }],
    'questshelf.playActivity.v1': [makePlayActivityRecord({ id: 'local-activity', gameId: localGame.id })],
  }), noSnapshot));

  expectOk(await mergeQuestShelfBackup(backup({
    'questshelf.games.v1': [backupGame],
    'questshelf.platformQueues.v1': planState(backupGame.id, 'backup plan'),
    'questshelf.steamIgnoredGames.v1': [{ steamAppId: 20, title: 'Backup ignored', ignoredAt: '2026-07-01T00:00:00.000Z' }],
    'questshelf.playActivity.v1': [makePlayActivityRecord({ id: 'backup-activity', gameId: backupGame.id })],
  }), noSnapshot));

  assert.deepEqual(loadGames().map((game) => game.id).sort(), [backupGame.id, localGame.id].sort(), 'games merge additively');
  assert.deepEqual(loadPlatformQueueState().entries.map((entry) => entry.gameId).sort(), [backupGame.id, localGame.id].sort(), 'local-only Plan survives');
  assert.deepEqual(JSON.parse(storage.local.get('questshelf.steamIgnoredGames.v1')!).map((row: { steamAppId: number }) => row.steamAppId), [10, 20]);
  assert.deepEqual(loadPlayActivity().map((row) => row.gameId).sort(), [backupGame.id, localGame.id].sort(), 'local-only activity survives');
});

function goldenData(): QuestShelfBackup['data'] {
  const artwork = 'data:image/png;base64,cXVlc3RvcnktYXJ0';
  const library = {
    ...makeLibraryGame({
      id: 'gold-library', title: 'Golden Library', rating: 5, notes: 'manual notes', coverImage: artwork,
      status: 'Playing', steamAppId: 100, rawgId: 200, updatedAt: '2026-07-01T00:00:00.000Z',
    }),
    futureOptionalField: { preserve: true },
  } as unknown as Game;
  const wishlist = makeWishlistGame({
    id: 'gold-wishlist', title: 'Golden Wishlist', rating: 4, notes: 'wishlist notes', coverImage: artwork,
    rawgId: 201, updatedAt: '2026-07-01T00:00:00.000Z',
  });

  return {
    'questshelf.achievementCounters.v1': { activeDays: ['2026-07-01'], backupExports: 2 },
    'questshelf.games.v1': [library, wishlist],
    'questshelf.rawgMetadataCache.v1': {},
    'questshelf.recommendationFeedback.v1': [{ rawgId: 300, normalizedTitle: 'feedback game', feedbackType: 'hide', createdAt: 1, surface: 'home' }],
    'questshelf.recommendationPreferences.v1': { explorationMode: true, reduceFranchiseRepetition: true },
    'questshelf.tasteProfile.v1': {
      observed: [],
      explicit: [{ kind: 'tag', key: 'cozy', label: 'Cozy', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-01T00:00:00.000Z' }],
      temporary: [],
    },
    'questshelf.steamIgnoredGames.v1': [{ steamAppId: 999, title: 'Ignored game', ignoredAt: '2026-07-01T00:00:00.000Z' }],
    'questshelf.libraryFilters.v1': { search: 'library' },
    'questshelf.wishlistFilters.v1': { search: 'wishlist' },
    'questshelf.onboarding.v1': { completedItemIds: ['welcome'] },
    'questshelf.platformQueues.v1': {
      ...planState(library.id, 'Golden Plan'),
      settings: [{ platform: 'PC', maxActiveGames: 4, artworkUrl: artwork, accentColor: '#22c55e' }],
    },
    'questshelf.playActivity.v1': [makePlayActivityRecord({ id: 'gold-activity', gameId: library.id })],
    'questshelf.reviewMode.v1': reviewState(wishlist.id),
    'questshelf.appPersonalization.v1': { libraryOwnerNickname: 'Golden Player' },
    'questshelf.shelfIdentity.v1': { shelfName: 'Golden Shelf', avatarDataUrl: artwork },
  };
}

function referencedGameIds(data: QuestShelfBackup['data']) {
  const plans = data['questshelf.platformQueues.v1'] as { plans?: Array<{ gameIds?: string[]; items?: Array<{ gameId: string }> }> };
  const review = data['questshelf.reviewMode.v1'] as { ignoredGameIds?: string[]; queueOrder?: string[]; reviewedGames?: Record<string, unknown> };
  const activity = data['questshelf.playActivity.v1'] as Array<{ gameId: string }>;
  return [
    ...(plans.plans ?? []).flatMap((plan) => [...(plan.gameIds ?? []), ...(plan.items ?? []).map((item) => item.gameId)]),
    ...(review.ignoredGameIds ?? []),
    ...(review.queueOrder ?? []),
    ...Object.keys(review.reviewedGames ?? {}),
    ...activity.map((row) => row.gameId),
  ];
}

function mirrorAdapterLocalStorage(storage: ReturnType<typeof createControllableStorageAdapter>) {
  window.localStorage.clear();
  for (const [key, value] of storage.local) window.localStorage.setItem(key, value);
}

test('registry golden fixture: backup -> clean restore -> backup preserves every default section and references', async () => {
  const storage = await setup();
  expectOk(await restoreQuestShelfBackup(backup(goldenData()), noSnapshot));
  mirrorAdapterLocalStorage(storage);
  const first = createQuestShelfBackup(false);

  assert.deepEqual(Object.keys(first.data).sort(), [...coreBackupStorageKeys].sort(), 'every registry default key is covered');
  const gameIds = new Set((first.data['questshelf.games.v1'] as Game[]).map((game) => game.id));
  for (const reference of referencedGameIds(first.data)) {
    assert.equal(gameIds.has(reference), true, `dependent reference ${reference} resolves to a game`);
  }

  await gameRepository.clear();
  await playActivityRepository.clear();
  await rawgMetadataCacheRepository.clear();
  await clearQuestoryTables(database);
  storage.reset();
  window.localStorage.clear();
  expectOk(await restoreQuestShelfBackup(first, noSnapshot));
  mirrorAdapterLocalStorage(storage);
  const second = createQuestShelfBackup(false);

  // Only export metadata is intentionally volatile; all registry-owned portable data is exact.
  assert.deepEqual(second.data, first.data);
  assert.equal((second.data['questshelf.games.v1'] as Array<Record<string, unknown>>)[0].futureOptionalField !== undefined, true);
});
