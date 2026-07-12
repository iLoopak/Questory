/**
 * AS-01 — a rejected IndexedDB write is reported instead of swallowed.
 *
 * This lives in its own bundle on purpose. `fallbackToLegacy` is a permanent latch: once a write
 * rejects, the repository stays in `legacy-fallback` for the life of the module instance, so any
 * test sharing this bundle would silently stop exercising IndexedDB at all.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables, installIdbTransactionControl } from './testUtils/indexedDbControl';
import { makeLibraryGame } from './testUtils/gameFixtures';
import type { QuestShelfBackup, QuestShelfBackupImportResult } from '../src/lib/backupStorage';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
const { playActivityRepository } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { restoreQuestShelfBackup, questShelfAppVersion, questShelfBackupVersion } =
  await import('../src/lib/backupStorage');

const database = getGameDatabase()!;

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

function watch<T>(promise: Promise<T>) {
  const state = { settled: false, value: undefined as T | undefined };
  void promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const noSnapshot = { skipRecoverySnapshot: true };

async function setupStores() {
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

  // Gate transactions only AFTER the one-time legacy migration in ready() has run.
  const idb = installIdbTransactionControl(database);
  idb.setMode('auto');
  return { storage, idb };
}

/** Release both seams and drain until the import settles. */
async function releaseAll(
  storage: ReturnType<typeof createControllableStorageAdapter>,
  idb: ReturnType<typeof installIdbTransactionControl>,
  pending: { settled: boolean },
) {
  idb.setMode('auto');
  storage.setDurableMode('auto');

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await idb.commitAll();
    await storage.settleAll();
    await flush();
    if (pending.settled) return;
  }

  throw new Error('the import never settled after its stores were released');
}

test('AS-01: a rejected IndexedDB write is reported as a partial restore naming the store', async () => {
  const { storage, idb } = await setupStores();
  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  idb.setMode('manual');

  const pending = watch(restoreQuestShelfBackup(backup, noSnapshot));
  await flush();
  assert.equal(pending.settled, false);

  const gamesWrite = idb.pendingTransactions().find((entry) => entry.tables.includes('games'))!;
  await idb.reject(gamesWrite, 'Simulated IndexedDB transaction failure.');
  await releaseAll(storage, idb, pending);

  assert.equal(pending.settled, true, 'restore resolves — it does not hang on a failed store');

  const result = pending.value!;
  assert.equal(result.ok, false);
  assert.equal(result.status, 'partial');

  const failed = (result as Extract<QuestShelfBackupImportResult, { status: 'partial' }>).failedStores;
  assert.equal(failed[0].store, 'games');
  assert.match(String(failed[0].error), /Simulated IndexedDB transaction failure/);

  // The data is not lost: the failed write still falls back to the legacy blob, exactly as it
  // always did. What changed is that the app no longer claims a clean restore.
  assert.equal(failed[0].persistedToLegacy, true);
  assert.equal(gameRepository.getStatus().backend, 'legacy-fallback');
  assert.deepEqual(loadGames().map((game) => game.id), ['g1']);
  idb.restore();
});
