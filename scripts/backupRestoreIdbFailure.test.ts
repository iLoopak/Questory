/**
 * AS-01 (continued) — a REJECTED IndexedDB write during restore.
 *
 * This lives in its own file on purpose: a failed Dexie transaction flips the repository
 * to `legacy-fallback` for the rest of the module's life (`fallbackToLegacy` is a
 * closure-level latch). Each test bundle gets its own copy of the `src/` modules, so
 * isolating the rejection here keeps it from poisoning the sibling AS-01 tests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables, installIdbTransactionControl } from './testUtils/indexedDbControl';
import { makeLibraryGame } from './testUtils/gameFixtures';
import type { QuestShelfBackup } from '../src/lib/backupStorage';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
const { playActivityRepository } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { restoreQuestShelfBackup, questShelfAppVersion, questShelfBackupVersion } = await import('../src/lib/backupStorage');

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

test('AS-01: a rejected IndexedDB write is only handled AFTER restore reported success', async () => {
  resetWebStorage();
  const storage = createControllableStorageAdapter({ durableMode: 'auto' });
  setStorageAdapter(storage.adapter);

  await gameRepository.ready();
  await playActivityRepository.ready();
  await rawgMetadataCacheRepository.ready();
  await clearQuestoryTables(database);

  const idb = installIdbTransactionControl(database);
  idb.setMode('manual');

  const backup = makeBackup({ 'questshelf.games.v1': [makeLibraryGame({ id: 'g1', title: 'Restored Game' })] });

  const result = restoreQuestShelfBackup(backup);

  // Documents unsafe current behavior: restore has already returned a success-shaped result
  // and DataManagementPanel has already shown "backup imported" — while the write that will
  // FAIL has not even been attempted yet.
  assert.deepEqual(result.games.map((game) => game.id), ['g1'], 'success is reported up front');
  assert.equal(gameRepository.getStatus().backend, 'indexeddb', 'still believed healthy at that point');

  const gamesWrite = idb.pendingTransactions().find((entry) => entry.tables.includes('games'));
  assert.ok(gamesWrite, 'the games write is still pending');

  await idb.reject(gamesWrite, 'Simulated IndexedDB transaction failure.');

  // The repository only now learns the write failed. It degrades to the legacy blob so the
  // data is not lost — but nothing propagates that back to the restore caller or the UI.
  const status = gameRepository.getStatus();
  assert.equal(status.backend, 'legacy-fallback', 'repository degraded after the failure');
  assert.match(String(status.lastError), /Simulated IndexedDB transaction failure/);
  assert.equal(await database.games.count(), 0, 'IndexedDB never received the row');

  // The rescue path wrote the games to the legacy blob instead, via savePersistedJson.
  const legacyWrites = storage.operationsForKey('questshelf.games.v1');
  assert.ok(legacyWrites.some((operation) => operation.kind === 'write'), 'games fell back to the legacy blob');
  assert.deepEqual(loadGames().map((game) => game.id), ['g1'], 'the snapshot still shows the restored game');

  idb.restore();
});
