import assert from 'node:assert/strict';
import test from 'node:test';
import { AutoBackupScheduler, getBackupRevision, resetBackupRevision } from '../src/lib/backupRevision';
import { createQuestShelfBackup } from '../src/lib/backupStorage';
import { prepareCanonicalBackup, registerCanonicalCollectionOwner, resetCanonicalCollectionOwner } from '../src/lib/canonicalCollections';
import { savePersistedJson } from '../src/lib/localPersistence';
import { getStorageAdapter, setStorageAdapter, type StorageAdapter } from '../src/lib/storageAdapter';
import type { Game } from '../src/types/game';
import { saveGames } from '../src/lib/gameStorage';
import { savePlayActivity } from '../src/lib/playActivityStorage';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function installMemoryStorage() {
  const values = new Map<string, string>();
  const previous = getStorageAdapter();
  const adapter: StorageAdapter = {
    readLocal: (key) => values.get(key) ?? null,
    writeLocal: (key, value) => { values.set(key, value); },
    removeLocal: (key) => { values.delete(key); },
    localKeys: () => [...values.keys()],
    readDurable: async () => null,
    writeDurable: async () => {},
    removeDurable: async () => {},
    hasDurableBackend: async () => false,
  };
  setStorageAdapter(adapter);
  return () => setStorageAdapter(previous);
}

const game = (notes: string): Game => ({
  id: 'fresh-game', title: 'Fresh Game', platform: 'PC', status: 'Want to play', coverImage: '',
  playtimeHours: 0, tags: [], lastPlayedAt: null, notes, collectionType: 'library',
});

test('AS-16: every default KV owner advances one revision and equivalent writes do not churn', () => {
  const restore = installMemoryStorage();
  resetBackupRevision();
  try {
    for (const [key, value] of [
      ['questshelf.platformQueues.v1', { entries: [{ gameId: 'g', queueNotes: 'note', queuePosition: 1 }] }],
      ['questshelf.reviewMode.v1', { ignoredGameIds: ['g'] }],
      ['questshelf.tasteProfile.v1', { observed: [], explicit: [{ id: 'taste' }] }],
      ['questshelf.recommendationFeedback.v1', [{ rawgId: 1, feedbackType: 'hide' }]],
      ['questshelf.recommendationPreferences.v1', { explorationMode: true }],
      ['questshelf.steamIgnoredGames.v1', [{ steamAppId: 1 }]],
      ['questshelf.onboarding.v1', { completedItemIds: ['welcome'] }],
      ['questshelf.shelfIdentity.v1', { shelfName: 'Latest' }],
      ['questshelf.appPersonalization.v1', { libraryOwnerNickname: 'Player' }],
    ] as const) {
      const before = getBackupRevision();
      savePersistedJson(key, value);
      assert.equal(getBackupRevision(), before + 1, key);
      savePersistedJson(key, value);
      assert.equal(getBackupRevision(), before + 1, `${key} equivalent write`);
    }
  } finally {
    restore();
  }
});

test('AS-16: Plan reorder and note edits trigger, while cache and backup metadata do not', () => {
  const restore = installMemoryStorage();
  resetBackupRevision();
  try {
    savePersistedJson('questshelf.platformQueues.v1', { entries: [{ gameId: 'a', queuePosition: 0, queueNotes: '' }, { gameId: 'b', queuePosition: 1, queueNotes: '' }] });
    const added = getBackupRevision();
    savePersistedJson('questshelf.platformQueues.v1', { entries: [{ gameId: 'b', queuePosition: 0, queueNotes: '' }, { gameId: 'a', queuePosition: 1, queueNotes: '' }] });
    assert.equal(getBackupRevision(), added + 1);
    savePersistedJson('questshelf.platformQueues.v1', { entries: [{ gameId: 'b', queuePosition: 0, queueNotes: 'next' }, { gameId: 'a', queuePosition: 1, queueNotes: '' }] });
    assert.equal(getBackupRevision(), added + 2);
    savePersistedJson('questshelf.personalRecommendations.v2', { generatedAt: Date.now() });
    savePersistedJson('questshelf.syncFolderSettings.v1', { lastBackupAt: new Date().toISOString() });
    assert.equal(getBackupRevision(), added + 2);
  } finally {
    restore();
  }
});

test('AS-16: game and play-activity collection owners advance the revision', () => {
  resetBackupRevision();
  saveGames([game('collection edit')]);
  assert.equal(getBackupRevision(), 1);
  savePlayActivity([{
    id: 'activity-1', gameId: 'fresh-game', date: '2026-07-12', detectedAt: '2026-07-12T12:00:00.000Z',
    source: 'manual', timestamp: '2026-07-12T12:00:00.000Z', type: 'played_today', action: 'played_today',
  }]);
  assert.equal(getBackupRevision(), 2);
});

test('AS-16: immediate export uses the mounted canonical snapshot before the debounce', async () => {
  resetCanonicalCollectionOwner();
  const latest = game('edited immediately');
  const unregister = registerCanonicalCollectionOwner({
    replaceGames: () => {},
    replacePlayActivity: () => {},
    prepareBackup: async () => ({ games: [latest], playActivity: [] }),
  });
  try {
    const snapshots = await prepareCanonicalBackup();
    const backup = createQuestShelfBackup(false, snapshots);
    assert.equal((backup.data['questshelf.games.v1'] as Game[])[0].notes, 'edited immediately');
    assert.equal(backup.metadata.includesSecrets, false);
  } finally {
    unregister();
    resetCanonicalCollectionOwner();
  }
});

test('AS-16: a flush failure prevents creation from being reported as fresh', async () => {
  resetCanonicalCollectionOwner();
  const unregister = registerCanonicalCollectionOwner({
    replaceGames: () => {}, replacePlayActivity: () => {},
    prepareBackup: async () => { throw new Error('games store unavailable'); },
  });
  try {
    await assert.rejects(prepareCanonicalBackup(), /games store unavailable/);
  } finally {
    unregister();
    resetCanonicalCollectionOwner();
  }
});

test('AS-16: rapid revisions coalesce and a mid-flight change causes one latest rerun', async () => {
  let runs = 0;
  let releaseFirst: (() => void) | null = null;
  const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const scheduler = new AutoBackupScheduler(async () => {
    runs += 1;
    if (runs === 1) await firstRun;
    return true;
  }, 0);

  scheduler.schedule(1);
  scheduler.schedule(2);
  scheduler.schedule(3);
  await wait(5);
  assert.equal(runs, 1);
  scheduler.schedule(4);
  scheduler.schedule(5);
  releaseFirst?.();
  await wait(5);
  assert.equal(runs, 2);
  scheduler.dispose();
});
