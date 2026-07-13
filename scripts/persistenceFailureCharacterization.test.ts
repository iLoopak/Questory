/**
 * DPI-01 characterization: a rescued legacy blob is not authoritative after restart.
 *
 * These assertions intentionally pin the unsafe CURRENT behavior. They should change
 * in the later production-fix PR when a versioned fallback-authority marker exists.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { clearQuestoryTables } from './testUtils/indexedDbControl';
import { createPersistenceFailureHarness } from './testUtils/persistenceFailureHarness';
import { makeLibraryGame, makePlayActivityRecord } from './testUtils/gameFixtures';
import type { Game } from '../src/types/game';
import type { PlayActivityRecord } from '../src/lib/playActivityStorage';

assertTestEnvironment();

const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { normalizeLoadedGames } = await import('../src/lib/gameStorage');
const { normalizePlayActivityRecords } = await import('../src/lib/playActivityStorage');
const database = getGameDatabase()!;

async function characterizeRestart<T extends { id: string }>(options: {
  key: string;
  table: typeof database.games | typeof database.playActivity;
  normalize: (value: unknown) => T[];
  stateA: T[];
  stateB: T[];
  stateC: T[];
}) {
  resetWebStorage();
  await clearQuestoryTables(database);

  const harness = createPersistenceFailureHarness<T>({
    database,
    legacyKey: options.key,
    table: options.table as never,
    normalize: options.normalize,
  });
  const repository = harness.createRepository();
  await repository.ready();
  assert.equal((await repository.replaceAllDurable(options.stateA)).ok, true);

  const idb = harness.controlIndexedDb();
  idb.setMode('manual');
  const failedWrite = repository.replaceAllDurable(options.stateB);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(idb.pendingTransactions().length, 1, 'the selected IndexedDB write is delayed');
  await idb.reject(idb.pendingTransactions()[0], 'simulated quota failure');
  const failed = await failedWrite;
  assert.equal(failed.ok, false);
  assert.equal(failed.persistedToLegacy, true);

  // Once the repository has degraded, later writes continue to the fallback blob.
  assert.equal((await repository.replaceAllDurable(options.stateC)).persistedToLegacy, true);
  await harness.storage.settleAll();

  const normalizedFallback = options.normalize(JSON.parse(JSON.stringify(options.stateC)));

  assert.deepEqual(await harness.inspectIndexedDb(), options.stateA, 'IndexedDB still contains stale state A');
  assert.deepEqual(harness.inspectLocalStorage(), normalizedFallback, 'localStorage rescued the newest state C');
  assert.deepEqual(harness.inspectPreferences(), normalizedFallback, 'Preferences independently holds state C');

  idb.restore();
  const restarted = harness.restart();
  await restarted.ready();

  // Known defect: non-empty IDB wins merely because it has rows. The newer rescued
  // fallback state is ignored, so the application comes back with stale state A.
  assert.deepEqual(restarted.getAllSync(), options.normalize(options.stateA), 'restart exposes the safe normalized runtime view of stale state A');
  assert.equal(restarted.getStatus().backend, 'indexeddb');
  assert.deepEqual(harness.inspectLocalStorage(), normalizedFallback, 'the ignored rescue blob remains inspectable');
}

test('DPI-01 current behavior: failed game write + later fallback writes restart into stale IndexedDB', async () => {
  const stateA = [makeLibraryGame({ id: 'game-a', title: 'Durable A' })];
  const stateB = [makeLibraryGame({ id: 'game-b', title: 'Rescued B' })];
  const stateC = [
    makeLibraryGame({ id: 'game-b', title: 'Rescued B, edited again' }),
    makeLibraryGame({ id: 'game-c', title: 'Rescued C' }),
  ];
  await characterizeRestart<Game>({
    key: 'characterization.games.legacy',
    table: database.games,
    normalize: normalizeLoadedGames,
    stateA,
    stateB,
    stateC,
  });
});

test('DPI-01 current behavior: failed play-activity write restarts into stale IndexedDB', async () => {
  const stateA = [makePlayActivityRecord({ id: 'activity-a', gameId: 'game-a', date: '2026-07-01' })];
  const stateB = [makePlayActivityRecord({ id: 'activity-b', gameId: 'game-b', date: '2026-07-02' })];
  const stateC = [
    ...stateB,
    makePlayActivityRecord({ id: 'activity-c', gameId: 'game-c', date: '2026-07-03' }),
  ];
  await characterizeRestart<PlayActivityRecord>({
    key: 'characterization.activity.legacy',
    table: database.playActivity,
    normalize: normalizePlayActivityRecords,
    stateA,
    stateB,
    stateC,
  });
});
