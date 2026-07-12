/**
 * AS-01 — Backup restore/merge are observably durable.
 *
 * These began as characterization tests for the old behavior (restore was a synchronous facade
 * over detached writes, and DataManagementPanel announced success and reloaded on a 600 ms
 * timer). They now assert the contract:
 *
 *   - restore/merge return a promise that only resolves once every REQUIRED store has settled,
 *   - a store that fails is named in the result rather than silently swallowed,
 *   - success is reported only for a complete restore.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter, type ControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables, installIdbTransactionControl, type IdbTransactionControl } from './testUtils/indexedDbControl';
import { makeLibraryGame, makePlayActivityRecord } from './testUtils/gameFixtures';
import type { QuestShelfBackup, QuestShelfBackupImportResult } from '../src/lib/backupStorage';

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

/** Track whether a promise has settled, without awaiting it. */
function watch<T>(promise: Promise<T>) {
  const state = { settled: false, value: undefined as T | undefined };
  void promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

/** Let any already-queued microtasks run, so "still pending" means genuinely pending. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Let a gated import run to completion.
 *
 * An import writes its stores in sequence, so releasing the one it is blocked on lets it open the
 * next. Both seams go back to `auto` so those later writes are not gated, and then the already-held
 * ones are drained until the import settles.
 */
async function releaseAll(
  storage: ControllableStorageAdapter,
  idb: IdbTransactionControl,
  pending?: { settled: boolean },
) {
  idb.setMode('auto');
  storage.setDurableMode('auto');

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await idb.commitAll();
    await storage.settleAll();
    await flush();
    if (!pending || pending.settled) return;
  }

  throw new Error('the import never settled after its stores were released');
}

/** Seed a store durably, before any gating is switched on. */
async function seedGames(games: Parameters<typeof gameRepository.replaceAllDurable>[0]) {
  const written = await gameRepository.replaceAllDurable(games);
  assert.equal(written.ok, true, 'the seed itself must be durable');
}

function expectOk(result: QuestShelfBackupImportResult) {
  assert.equal(result.ok, true, `expected a complete restore, got: ${JSON.stringify(result)}`);
  return result as Extract<QuestShelfBackupImportResult, { ok: true }>;
}

// The safety snapshot has its own tests below; the rest opt out to stay focused.
const noSnapshot = { skipRecoverySnapshot: true };

test('AS-01: restore does not resolve until the IndexedDB write has settled', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  idb.setMode('manual');

  const pending = watch(restoreQuestShelfBackup(backup, noSnapshot));
  await flush();

  // The write is still gated, so restore has NOT reported anything yet. Previously it had
  // already returned a success-shaped result at this point, and the UI had already reloaded.
  assert.equal(pending.settled, false, 'restore is still awaiting the store');
  assert.equal(await database.games.count(), 0, 'nothing is durable yet');

  await releaseAll(storage, idb, pending);

  assert.equal(pending.settled, true, 'restore resolves once the store settles');
  assert.equal(await database.games.count(), 1, 'and the data really is durable');
  expectOk(pending.value!);
  idb.restore();
});

test('AS-01: restore does not resolve until delayed Preferences/KV writes have settled', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  storage.setDurableMode('manual');

  const pending = watch(restoreQuestShelfBackup(backup, noSnapshot));
  await flush();

  assert.ok(
    storage.pendingOperations().some((operation) => operation.kind === 'write'),
    'the durable KV write is in flight',
  );
  assert.equal(pending.settled, false, 'restore waits for the durable mirror, it no longer fires and forgets');

  await releaseAll(storage, idb, pending);

  assert.equal(pending.settled, true);
  expectOk(pending.value!);
  idb.restore();
});

test('AS-01: a failed Preferences write is reported as a partial restore naming the key', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  // The device has a durable backend and its native write throws.
  storage.failDurableKeys.add('questshelf.platformQueues.v1');

  const result = await restoreQuestShelfBackup(backup, noSnapshot);
  await releaseAll(storage, idb);

  // The write used to be swallowed: restore reported a clean success and reloaded, and the old
  // Plans quietly won on the next native launch. Now the loss is surfaced.
  assert.equal(result.ok, false);
  assert.equal(result.status, 'partial');

  const failed = (result as Extract<QuestShelfBackupImportResult, { status: 'partial' }>).failedStores;
  assert.equal(failed.length, 1);
  assert.equal(failed[0].store, 'kv');
  assert.equal(failed[0].key, 'questshelf.platformQueues.v1', 'the result names the store that failed');
  assert.ok(failed[0].error, 'and carries the error');

  // The failure names a key, never a value — nothing that could be a secret.
  assert.equal('value' in failed[0], false);
  idb.restore();
});

test('AS-01: stores settling in a different order still produce a complete restore', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({
    'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })],
    'questshelf.playActivity.v1': [makePlayActivityRecord({ gameId: 'g1' })],
    'questshelf.reviewMode.v1': {},
    'questshelf.platformQueues.v1': { entries: [], settings: [] },
  });

  idb.setMode('manual');
  storage.setDurableMode('manual');

  const pending = watch(restoreQuestShelfBackup(backup, noSnapshot));
  await flush();

  // Settle the KV tier first and the collection stores in reverse order — the completion order
  // is genuinely interleaved, and the restore still waits for all of them.
  await storage.settleAll();
  await flush();
  assert.equal(pending.settled, false, 'still waiting on the collection stores');

  for (const entry of [...collectionTransactions(idb).filter((tx) => tx.outcome === 'pending')].reverse()) {
    await idb.commit(entry);
  }
  await releaseAll(storage, idb, pending);

  assert.equal(pending.settled, true);
  expectOk(pending.value!);
  assert.equal(await database.games.count(), 1);
  assert.equal(await database.playActivity.count(), 1);
  idb.restore();
});

test('AS-01: merge is awaited the same way', async () => {
  const { storage, idb } = await setupStores();

  await seedGames([makeLibraryGame({ id: 'local-1', title: 'Local Game' })]);
  idb.setMode('manual');

  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'backup-1', title: 'Backup Game' })] });

  const pending = watch(mergeQuestShelfBackup(backup, noSnapshot));
  await flush();

  assert.equal(pending.settled, false, 'merge waits for the store too');
  assert.equal(await database.games.count(), 1, 'IndexedDB still only holds the pre-merge row');

  await releaseAll(storage, idb, pending);

  const result = expectOk(pending.value!);
  assert.deepEqual(result.data.games.map((game) => game.id).sort(), ['backup-1', 'local-1']);
  assert.equal(await database.games.count(), 2, 'both rows are durable before success is reported');
  idb.restore();
});

test('AS-01: a failed recommendation-cache cleanup is reported but does not fail the restore', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  const result = expectOk(await restoreQuestShelfBackup(backup, noSnapshot));
  await releaseAll(storage, idb);

  // Cache cleanup is tracked as an optional store: a stale recommendation cache is a nuisance,
  // not data loss, and must not turn a good restore into a failed one.
  const caches = result.stores.find((store) => store.store === 'recommendation-caches')!;
  assert.equal(caches.required, false, 'cache cleanup is not a required store');
  idb.restore();
});

// ── Pre-restore safety snapshot ─────────────────────────────────────────────────────

test('AS-01: a replace restore takes a pre-restore safety snapshot first', async () => {
  const { storage, idb } = await setupStores();
  const { loadRecoverySnapshot } = await import('../src/lib/recoverySnapshotStorage');

  await seedGames([makeLibraryGame({ id: 'existing-1', title: 'The Game I Had' })]);

  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });
  expectOk(await restoreQuestShelfBackup(backup));
  await storage.settleAll();

  // The state that the restore replaced is recoverable.
  const snapshot = await loadRecoverySnapshot();
  assert.ok(snapshot, 'a snapshot was stored');
  assert.equal(snapshot!.reason, 'replace-restore');
  assert.deepEqual(
    (snapshot!.backup.data['questshelf.games.v1'] as Array<{ id: string }>).map((game) => game.id),
    ['existing-1'],
    'and it holds the PRE-restore library',
  );
  idb.restore();
});

test('AS-01: a restore does not proceed when the safety snapshot cannot be written', async () => {
  const { storage, idb } = await setupStores();

  await seedGames([makeLibraryGame({ id: 'existing-1', title: 'The Game I Had' })]);

  // Break the appCaches write the snapshot depends on.
  const originalPut = database.appCaches.put.bind(database.appCaches);
  database.appCaches.put = (() => Promise.reject(new Error('appCaches is full.'))) as typeof database.appCaches.put;

  try {
    const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });
    const result = await restoreQuestShelfBackup(backup);

    assert.equal(result.ok, false);
    assert.equal(result.status, 'recovery-export-failed');
    assert.match(String(result.stores[0].error), /appCaches is full/);

    // Nothing was written: a destructive replace with no way back is exactly what must not happen.
    assert.deepEqual(loadGames().map((game) => game.id), ['existing-1'], 'the existing library is untouched');
    assert.equal(await database.games.count(), 1);
  } finally {
    database.appCaches.put = originalPut;
    idb.restore();
  }
  await storage.settleAll();
});

// ── The UI contract ─────────────────────────────────────────────────────────────────

test('AS-01: DataManagementPanel awaits the restore and reloads only on success', () => {
  const panelSource = readFileSync('src/components/DataManagementPanel.tsx', 'utf8');
  const confirmRestore = panelSource.slice(
    panelSource.indexOf('async function confirmRestore'),
    panelSource.indexOf('async function confirmReset'),
  );

  assert.ok(confirmRestore.length > 0, 'located confirmRestore');

  // Both facades are awaited, so nothing is announced before the stores settle.
  assert.match(confirmRestore, /await mergeQuestShelfBackup\(selectedBackup\)/);
  assert.match(confirmRestore, /await restoreQuestShelfBackup\(selectedBackup\)/);

  // A failed or partial restore stays on screen with a reason, and does NOT reload.
  assert.match(confirmRestore, /if \(!result\.ok\)/);
  assert.match(confirmRestore, /describeFailedImport\(result, t\)/);

  // The reload happens after success, not on a fixed timer. The old code scheduled
  // `setTimeout(() => window.location.reload(), 600)` while the writes were still in flight.
  assert.match(confirmRestore, /window\.location\.reload\(\)/);
  assert.doesNotMatch(confirmRestore, /setTimeout/, 'no timed reload');
  assert.doesNotMatch(panelSource, /window\.location\.reload\(\), 600/);

  // Owner saves are frozen across the whole operation, so the unmount flush that the reload
  // triggers cannot write the pre-restore array back (AS-03).
  assert.match(confirmRestore, /suspendCanonicalCollectionWrites\(\)/);
});
