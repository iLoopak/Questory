/**
 * AS-01 — Backup restore/merge report success before durable writes settle.
 *
 * These tests CHARACTERIZE current behavior; several of them assert unsafe outcomes on
 * purpose (each is marked "documents unsafe current behavior"). They are the guard rail
 * for the follow-up PR that makes restore/merge await durable completion: when that lands,
 * the assertions marked below must be inverted.
 *
 * The facts under test:
 *  - `restoreQuestShelfBackup` / `mergeQuestShelfBackup` are SYNCHRONOUS (they return
 *    `RestoredQuestShelfData`, not a Promise), while every store they write is async:
 *    `IndexedDbCollectionRepository.replaceAll` returns void and detaches a Dexie
 *    transaction, and `savePersistedJson` fires `void adapter.writeDurable(...)`.
 *  - `DataManagementPanel.confirmRestore` therefore shows "backup imported" and schedules
 *    `window.location.reload()` 600 ms later while those writes are still in flight.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter, type ControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables, installIdbTransactionControl, type IdbTransactionControl } from './testUtils/indexedDbControl';
import { makeLibraryGame, makePlayActivityRecord } from './testUtils/gameFixtures';
import type { QuestShelfBackup } from '../src/lib/backupStorage';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
const { playActivityRepository } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { restoreQuestShelfBackup, mergeQuestShelfBackup, questShelfAppVersion, questShelfBackupVersion } =
  await import('../src/lib/backupStorage');

const database = getGameDatabase()!;
const collectionTables = new Set(['games', 'playActivity', 'rawgMetadataCache']);

function makeBackup(data: Partial<QuestShelfBackup['data']>): QuestShelfBackup {
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

/** Fresh stores + a durable tier that resolves immediately (the "healthy device" baseline). */
async function setupStores(): Promise<{ storage: ControllableStorageAdapter; idb: IdbTransactionControl }> {
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
  storage.setDurableMode('auto');

  // Gate transactions only AFTER the one-time legacy migration in ready() has run.
  const idb = installIdbTransactionControl(database);
  idb.setMode('auto');
  return { storage, idb };
}

/** Gated writes that belong to the three backup-restored collection stores. */
function collectionTransactions(idb: IdbTransactionControl) {
  return idb.transactions.filter((entry) => entry.tables.some((table) => collectionTables.has(table)));
}

test('AS-01: restore returns synchronously while IndexedDB writes are still pending', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  idb.setMode('manual');
  storage.setDurableMode('manual');

  const result = restoreQuestShelfBackup(backup);

  // The facade is not async at all: there is nothing a caller COULD await.
  assert.ok(!(result instanceof Promise), 'restoreQuestShelfBackup is synchronous');

  // Documents unsafe current behavior: it has already returned a "restored" result...
  assert.deepEqual(result.games.map((game) => game.id), ['g1']);
  // ...while the IndexedDB transaction that would make that durable has not run.
  const pending = collectionTransactions(idb).filter((entry) => entry.outcome === 'pending');
  assert.ok(pending.length > 0, 'expected at least one un-awaited IndexedDB transaction');
  assert.equal(await database.games.count(), 0, 'nothing is durable in IndexedDB yet');

  // Only once the gate opens does the write actually land.
  await idb.commitAll();
  await storage.settleAll();
  assert.equal(await database.games.count(), 1);
  idb.restore();
});

test('AS-01: restore returns before delayed Preferences/KV writes settle', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  storage.setDurableMode('manual');

  restoreQuestShelfBackup(backup);

  // Documents unsafe current behavior: savePersistedJson wrote the synchronous local tier
  // but only *fired* the durable write, so restore reports success with it still pending.
  const pendingWrites = storage.pendingOperations().filter((operation) => operation.kind === 'write');
  assert.ok(pendingWrites.length > 0, 'expected un-awaited durable KV writes');
  assert.ok(
    storage.local.has('questshelf.platformQueues.v1'),
    'the local tier is written synchronously',
  );

  await storage.settleAll();
  await idb.commitAll();
  idb.restore();
});

test('AS-01: a failed Preferences/KV write is swallowed and never reaches the caller', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  storage.setDurableMode('manual');
  // The native Preferences write throws. Production's adapter catches that and resolves
  // anyway (localStoragePreferencesAdapter.writeDurable), which is what this reproduces.
  storage.failDurableKeys.add('questshelf.platformQueues.v1');

  const result = restoreQuestShelfBackup(backup);
  await storage.settleAll();
  await idb.commitAll();

  // Documents unsafe current behavior: the Plans section never became durable, yet restore
  // neither threw nor reported anything — on the next native launch the OLD Plans win.
  const planWrites = storage.operationsForKey('questshelf.platformQueues.v1');
  assert.ok(planWrites.some((operation) => operation.outcome === 'failed'), 'the durable write failed');
  assert.deepEqual(result.games.map((game) => game.id), ['g1'], 'restore still reported success');
  assert.ok(
    storage.local.has('questshelf.platformQueues.v1'),
    'the local tier kept the value, so the two tiers now disagree',
  );
  idb.restore();
});

test('AS-01: stores settling in a different order does not change the reported outcome', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.playActivity.v1': [makePlayActivityRecord({ gameId: 'g1' })],
    'questshelf.reviewMode.v1': {},
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  idb.setMode('manual');
  storage.setDurableMode('manual');

  restoreQuestShelfBackup(backup);

  // Settle the LAST-started stores first: restore has no cross-store completion contract,
  // so ordering is unobservable to it either way.
  const gated = collectionTransactions(idb).filter((entry) => entry.outcome === 'pending');
  for (const entry of [...gated].reverse()) {
    await idb.commit(entry);
  }
  await storage.settleKey('questshelf.platformQueues.v1');
  await storage.settleKey('questshelf.reviewMode.v1');
  await storage.settleAll();

  assert.equal(await database.games.count(), 1);
  assert.equal(await database.playActivity.count(), 1);

  // The completion order is genuinely interleaved, and nothing in the restore path observed it.
  const completed = storage.durableCompletionOrder();
  assert.ok(completed.includes('questshelf.platformQueues.v1'));
  idb.restore();
});

test('AS-01: merge also returns synchronously with IndexedDB writes outstanding', async () => {
  const { storage, idb } = await setupStores();

  // Gate from the start so the pre-merge row is provably durable before the merge runs
  // (replaceAll detaches its transaction, so it cannot simply be awaited).
  idb.setMode('manual');
  gameRepository.replaceAll([makeLibraryGame({ id: 'local-1', title: 'Local Game' })]);
  await idb.commitAll();
  assert.equal(await database.games.count(), 1, 'pre-merge row is durable');

  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'backup-1', title: 'Backup Game' })] });

  storage.setDurableMode('manual');

  const result = mergeQuestShelfBackup(backup);
  assert.ok(!(result instanceof Promise), 'mergeQuestShelfBackup is synchronous');

  // Documents unsafe current behavior: the merged set is reported (and rendered) while
  // the durable write is still gated.
  assert.deepEqual(result.games.map((game) => game.id).sort(), ['backup-1', 'local-1']);
  assert.equal(await database.games.count(), 1, 'IndexedDB still only holds the pre-merge row');

  await idb.commitAll();
  await storage.settleAll();
  assert.equal(await database.games.count(), 2);
  idb.restore();
});

test('AS-01: the in-memory snapshot is updated before anything is durable', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  idb.setMode('manual');
  storage.setDurableMode('manual');

  restoreQuestShelfBackup(backup);

  // Documents unsafe current behavior: this is exactly what the UI reads after restore.
  // It looks complete, so a reload triggered now can race the pending durable writes.
  assert.deepEqual(loadGames().map((game) => game.id), ['g1'], 'snapshot (what the UI sees) is already restored');
  assert.equal(await database.games.count(), 0, 'but IndexedDB has nothing');

  await idb.commitAll();
  await storage.settleAll();
  idb.restore();
});

test('AS-01: DataManagementPanel reports success and reloads without awaiting any store', () => {
  const panelSource = readFileSync('src/components/DataManagementPanel.tsx', 'utf8');
  const confirmRestore = panelSource.slice(
    panelSource.indexOf('function confirmRestore'),
    panelSource.indexOf('async function confirmReset'),
  );

  assert.ok(confirmRestore.length > 0, 'located confirmRestore');
  // Documents unsafe current behavior: neither restore nor merge is awaited (they cannot be),
  // success is announced unconditionally, and the reload is on a fixed 600 ms timer.
  assert.ok(/(?<!await\s)restoreQuestShelfBackup\(selectedBackup\)/.test(confirmRestore), 'restore is not awaited');
  assert.ok(/(?<!await\s)mergeQuestShelfBackup\(selectedBackup\)/.test(confirmRestore), 'merge is not awaited');
  assert.ok(confirmRestore.includes("showMessage(t('data.backupImported'), 'success')"), 'success is reported inline');
  assert.ok(/setTimeout\(\(\) => window\.location\.reload\(\), 600\)/.test(confirmRestore), 'reload fires 600 ms later');
  assert.ok(!confirmRestore.includes('function confirmRestore(mode: \'merge\' | \'replace\'): Promise'), 'confirmRestore is not async');
});
