/**
 * AS-03 — Storage recovery bypasses React state ownership.
 *
 * `AppController` owns `games` in React and `useAppPersistence` writes that array back to the
 * repository on a 400 ms debounce, on unmount, and on visibilitychange→hidden. The Data
 * Management recovery/repair tools call the repository directly and never tell the mounted
 * owner, so the React array is still the PRE-recovery snapshot. The next ordinary save then
 * replaces the recovered data with it.
 *
 * These tests CHARACTERIZE that data loss. They are expected to be inverted by the fix.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables } from './testUtils/indexedDbControl';
import { makeLibraryGame, makePlayActivityRecord } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { savePersistedJson } = await import('../src/lib/localPersistence');
const { gameRepository, loadGames, recoverGamesFromLegacyBlob } = await import('../src/lib/gameStorage');
const { playActivityRepository, loadPlayActivity, recoverPlayActivityFromLegacyBlob } =
  await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { normalizeOnboardingState } = await import('../src/lib/onboardingStorage');
const { normalizePlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { useAppPersistence } = await import('../src/features/app/useAppPersistence');

const database = getGameDatabase()!;
const onboardingState = normalizeOnboardingState(undefined);
const platformQueueState = normalizePlatformQueueState(undefined);

/** The snapshot the mounted app is holding (A). */
const snapshotA: Game[] = [makeLibraryGame({ id: 'a1', title: 'Game In React State' })];
/** The snapshot recovery puts into storage (B) — e.g. legacy-only games the user rescued. */
const snapshotB: Game[] = [
  makeLibraryGame({ id: 'b1', title: 'Recovered Game One' }),
  makeLibraryGame({ id: 'b2', title: 'Recovered Game Two' }),
];

type PersistenceProps = Parameters<typeof useAppPersistence>[0];

function persistenceProps(games: Game[], playActivity: ReturnType<typeof loadPlayActivity> = []): PersistenceProps {
  return { games, ignoredSteamGames: [], onboardingState, platformQueueState, playActivity };
}

async function setupMountedWithSnapshotA() {
  resetWebStorage();
  const storage = createControllableStorageAdapter({ durableMode: 'auto' });
  setStorageAdapter(storage.adapter);

  await gameRepository.ready();
  await playActivityRepository.ready();
  await rawgMetadataCacheRepository.ready();
  await gameRepository.clear();
  await playActivityRepository.clear();
  await clearQuestoryTables(database);

  // The mounted app owns snapshot A, and storage agrees with it.
  gameRepository.replaceAll(snapshotA);
  await settleWrites();

  return storage;
}

/** Let the repository's detached Dexie transactions finish. */
async function settleWrites(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/** Put snapshot B in the legacy blob, then recover it into IndexedDB (as the panel does). */
async function recoverSnapshotBIntoStorage(): Promise<void> {
  savePersistedJson('questshelf.games.v1', snapshotB);
  const result = await recoverGamesFromLegacyBlob('replace');
  assert.equal(result.importedCount, 2, 'recovery imported the legacy-only games');
  assert.deepEqual(loadGames().map((game) => game.id), ['b1', 'b2'], 'storage now holds snapshot B');
}

test('AS-03: unmounting after a recovery overwrites the recovered games with stale React state', async () => {
  await setupMountedWithSnapshotA();

  // 1. The owner is mounted holding snapshot A.
  const handle = await renderHook(useAppPersistence, persistenceProps(snapshotA));

  // 2. Recovery replaces storage with snapshot B, behind the mounted owner's back.
  await recoverSnapshotBIntoStorage();

  // 3. The user navigates away / the app unmounts. useAppPersistence flushes gamesRef.
  await handle.unmount();
  await settleWrites();

  // 4. Documents unsafe current behavior: the unmount flush wrote the PRE-recovery array,
  //    so both recovered games are gone — from the snapshot and from IndexedDB.
  assert.deepEqual(loadGames().map((game) => game.id), ['a1'], 'snapshot B was overwritten by stale snapshot A');
  const durableIds = (await database.games.toArray()).map((game) => game.id);
  assert.deepEqual(durableIds, ['a1'], 'the recovered rows were deleted from IndexedDB');
});

test('AS-03: an ordinary game edit after a recovery erases it on the 400 ms debounce', async () => {
  await setupMountedWithSnapshotA();

  const handle = await renderHook(useAppPersistence, persistenceProps(snapshotA));
  await recoverSnapshotBIntoStorage();

  // The user makes an unrelated edit to the game they can still see (a note change).
  const editedA: Game[] = [{ ...snapshotA[0], notes: 'a new note' }];
  await actAsync(() => {
    handle.rerender(persistenceProps(editedA));
  });

  // Wait out the debounce (400 ms).
  await new Promise((resolve) => setTimeout(resolve, 450));
  await settleWrites();

  // Documents unsafe current behavior: saving one edited game replaced the whole collection.
  assert.deepEqual(loadGames().map((game) => game.id), ['a1'], 'the recovered games were deleted');
  assert.equal(loadGames()[0].notes, 'a new note', 'only the edited stale record survives');

  await handle.unmount();
});

test('AS-03: a visibilitychange flush after a recovery erases it too', async () => {
  await setupMountedWithSnapshotA();

  const handle = await renderHook(useAppPersistence, persistenceProps(snapshotA));

  // Queue a pending debounced save by changing games...
  const editedA: Game[] = [{ ...snapshotA[0], notes: 'edited' }];
  await actAsync(() => {
    handle.rerender(persistenceProps(editedA));
  });

  // ...then recover B while that save is still pending...
  await recoverSnapshotBIntoStorage();

  // ...and background the app, which flushes the pending save immediately.
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  await actAsync(() => {
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  await settleWrites();

  // Documents unsafe current behavior: the flush wrote the stale array over the recovery.
  assert.deepEqual(loadGames().map((game) => game.id), ['a1']);

  await handle.unmount();
});

test('AS-03: play-activity recovery is overwritten by the mounted play-activity array', async () => {
  await setupMountedWithSnapshotA();

  const mountedActivity = [makePlayActivityRecord({ id: 'react-1', gameId: 'a1', date: '2026-07-02' })];
  const handle = await renderHook(useAppPersistence, persistenceProps(snapshotA, mountedActivity));

  // Recover legacy-only play activity straight into the repository.
  const recoveredActivity = [
    makePlayActivityRecord({ id: 'legacy-1', gameId: 'b1', date: '2026-06-01' }),
    makePlayActivityRecord({ id: 'legacy-2', gameId: 'b2', date: '2026-06-02' }),
  ];
  savePersistedJson('questshelf.playActivity.v1', recoveredActivity);
  const recovery = await recoverPlayActivityFromLegacyBlob('replace');
  assert.equal(recovery.importedCount, 2);
  assert.equal(loadPlayActivity().length, 2, 'storage holds the recovered activity');

  // Any later change to the mounted array triggers savePlayActivity(reactArray), which is a
  // whole-collection replace.
  const nextActivity = [...mountedActivity, makePlayActivityRecord({ id: 'react-2', gameId: 'a1', date: '2026-07-03' })];
  await actAsync(() => {
    handle.rerender(persistenceProps(snapshotA, nextActivity));
  });
  await settleWrites();

  // Documents unsafe current behavior: the same split-ownership bug exists for play activity.
  // (Ids are re-derived by the normalizer, so identify the records by the game they belong to:
  // the recovered rows were for b1/b2, the mounted ones for a1.)
  const remaining = loadPlayActivity();
  assert.deepEqual(
    remaining.map((record) => record.gameId).sort(),
    ['a1', 'a1'],
    'only the mounted array survived',
  );
  assert.equal(
    remaining.filter((record) => record.gameId === 'b1' || record.gameId === 'b2').length,
    0,
    'the recovered play activity was erased',
  );

  await handle.unmount();
});

test('AS-03: repairSnapshot only rebuilds memory — it does not repair the rows in IndexedDB', async () => {
  await setupMountedWithSnapshotA();

  // Write an invalid row (no title) directly into IndexedDB, as a corrupted store would have.
  await database.games.put({ id: 'broken', platform: 'PC' } as unknown as Game);
  assert.equal(await database.games.count(), 2, 'IndexedDB holds the good row and the broken one');

  const repair = await gameRepository.repairSnapshot();

  // The in-memory snapshot drops the invalid row...
  assert.equal(repair.removedInvalid, 1);
  assert.deepEqual(loadGames().map((game) => game.id), ['a1']);

  // Documents unsafe current behavior: ...but the broken row is still in IndexedDB, so the
  // "repair" is undone by the next restart. The label promises more than it delivers.
  assert.equal(await database.games.count(), 2, 'the invalid row was never removed from IndexedDB');
});
