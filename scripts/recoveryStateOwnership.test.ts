/**
 * AS-03 — Storage recovery and the mounted React owner.
 *
 * `AppController` owns `games`/`playActivity` in React, and `useAppPersistence` writes those
 * arrays back to the repository on a 400 ms debounce, on unmount, and on visibilitychange→hidden.
 * Recovery used to call the repository directly and never tell the owner, so the React array was
 * still the PRE-recovery snapshot and the next ordinary save replaced the recovered data with it.
 *
 * These tests started as characterization tests for that loss (PR #650) and now assert the fix:
 * every Data Management command goes through `storageRecoveryCommands`, which suspends owner
 * writes for the duration and hands the recovered snapshot back to the owner once it is durable.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables } from './testUtils/indexedDbControl';
import { makeLibraryGame, makePlayActivityRecord } from './testUtils/gameFixtures';
import { actAsync, renderComponent } from './testUtils/reactHarness';
import type { PlayActivityRecord } from '../src/lib/playActivityStorage';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { savePersistedJson } = await import('../src/lib/localPersistence');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
const { playActivityRepository, loadPlayActivity } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const { normalizeOnboardingState } = await import('../src/lib/onboardingStorage');
const { normalizePlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { useAppPersistence } = await import('../src/features/app/useAppPersistence');
const { useCanonicalCollectionOwner } = await import('../src/features/app/useCanonicalCollectionOwner');
const { resetCanonicalCollectionOwner } = await import('../src/lib/canonicalCollections');
const { runGameRecovery, runGameRepair, runPlayActivityRecovery } =
  await import('../src/features/storage/storageRecoveryCommands');

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

/** A handle on the mounted owner: what it is holding, and how an ordinary edit would change it. */
type OwnerControl = {
  games: Game[];
  playActivity: PlayActivityRecord[];
  setGames: (games: Game[]) => void;
  setPlayActivity: (records: PlayActivityRecord[]) => void;
};

/** AppController's collection ownership, reduced to the two hooks under test. */
function TestOwner({ control, initialGames }: { control: OwnerControl; initialGames: Game[] }) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [playActivity, setPlayActivity] = useState<PlayActivityRecord[]>([]);

  useAppPersistence({ games, ignoredSteamGames: [], onboardingState, platformQueueState, playActivity });
  useCanonicalCollectionOwner({ games, playActivity, setGames, setPlayActivity });

  control.games = games;
  control.playActivity = playActivity;
  control.setGames = setGames;
  control.setPlayActivity = setPlayActivity;
  return null;
}

/** Let the repository's detached Dexie transactions finish. */
const settleWrites = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Fresh stores holding snapshot A, with the owner mounted and holding the same array. */
async function mountOwnerWithSnapshotA() {
  resetWebStorage();
  resetCanonicalCollectionOwner();
  setStorageAdapter(createControllableStorageAdapter({ durableMode: 'auto' }).adapter);

  await gameRepository.ready();
  await playActivityRepository.ready();
  await rawgMetadataCacheRepository.ready();
  await gameRepository.clear();
  await playActivityRepository.clear();
  await clearQuestoryTables(database);

  const seed = await gameRepository.replaceAllDurable(snapshotA);
  assert.equal(seed.ok, true, 'the mounted app and storage start in agreement');

  const control = {} as OwnerControl;
  const handle = await renderComponent(TestOwner, { control, initialGames: snapshotA });
  return { control, handle };
}

/** Put snapshot B in the legacy blob and recover it, exactly as the Data Management panel does. */
async function recoverSnapshotB() {
  savePersistedJson('questshelf.games.v1', snapshotB);

  let command!: Awaited<ReturnType<typeof runGameRecovery>>;
  await actAsync(async () => {
    command = await runGameRecovery('replace');
  });

  assert.equal(command.result.importedCount, 2, 'recovery imported the legacy-only games');
  assert.equal(command.ownerSynced, true, 'the mounted owner accepted the recovered snapshot');
  assert.deepEqual(loadGames().map((game) => game.id), ['b1', 'b2'], 'storage holds snapshot B');
  return command;
}

const idsIn = (games: Game[]) => games.map((game) => game.id).sort();
/** Play-activity ids are re-derived by the normalizer, so identify those records by their game. */
const gameIdsIn = (records: PlayActivityRecord[]) => records.map((record) => record.gameId).sort();

test('AS-03: recovery replaces the mounted owner state, so it is no longer stale', async () => {
  const { control, handle } = await mountOwnerWithSnapshotA();

  await recoverSnapshotB();

  // The owner used to still be holding snapshot A here, which is what made every later save
  // destructive. It now holds exactly what is in storage.
  assert.deepEqual(idsIn(control.games), ['b1', 'b2'], 'React state IS the recovered snapshot');

  await handle.unmount();
});

test('AS-03: an ordinary game edit after a recovery no longer erases it', async () => {
  const { control, handle } = await mountOwnerWithSnapshotA();

  await recoverSnapshotB();

  // The user edits one of the games they can now see (a note change) — an ordinary debounced save.
  await actAsync(() => {
    control.setGames(control.games.map((game) => (game.id === 'b1' ? { ...game, notes: 'a new note' } : game)));
  });
  await new Promise((resolve) => setTimeout(resolve, 450));
  await settleWrites();

  assert.deepEqual(idsIn(loadGames()), ['b1', 'b2'], 'the recovered games survive the edit');
  assert.equal(loadGames().find((game) => game.id === 'b1')?.notes, 'a new note', 'and the edit applied');
  assert.deepEqual(idsIn(await database.games.toArray()), ['b1', 'b2'], 'IndexedDB agrees');

  await handle.unmount();
});

test('AS-03: the unmount flush after a recovery writes the recovered games, not the stale ones', async () => {
  const { handle } = await mountOwnerWithSnapshotA();

  await recoverSnapshotB();

  // The user navigates away / the app unmounts; useAppPersistence flushes its games ref.
  await handle.unmount();
  await settleWrites();

  assert.deepEqual(idsIn(loadGames()), ['b1', 'b2'], 'the flush did not resurrect snapshot A');
  assert.deepEqual(idsIn(await database.games.toArray()), ['b1', 'b2'], 'and IndexedDB kept the rows');
});

test('AS-03: a debounced save pending from BEFORE the recovery cannot overwrite it', async () => {
  const { control, handle } = await mountOwnerWithSnapshotA();

  // Queue a pending debounced save of the pre-recovery array...
  await actAsync(() => {
    control.setGames([{ ...snapshotA[0], notes: 'edited before the recovery' }]);
  });

  // ...recover while that save is still in flight...
  await recoverSnapshotB();

  // ...and background the app, which flushes the pending save immediately.
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  await actAsync(() => {
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  await settleWrites();

  // The suspension covered the recovery, and by the time it lifted the owner was holding B, so
  // the flush had nothing stale left to write.
  assert.deepEqual(idsIn(loadGames()), ['b1', 'b2'], 'the stale in-flight save was not applied');

  await handle.unmount();
});

test('AS-03: play-activity recovery survives the next ordinary play-activity save', async () => {
  const { control, handle } = await mountOwnerWithSnapshotA();

  // The owner is holding its own activity for the game it can see.
  const mountedActivity = [makePlayActivityRecord({ id: 'react-1', gameId: 'a1', date: '2026-07-02' })];
  await actAsync(() => {
    control.setPlayActivity(mountedActivity);
  });
  await settleWrites();

  savePersistedJson('questshelf.playActivity.v1', [
    makePlayActivityRecord({ id: 'legacy-1', gameId: 'b1', date: '2026-06-01' }),
    makePlayActivityRecord({ id: 'legacy-2', gameId: 'b2', date: '2026-06-02' }),
  ]);

  let command!: Awaited<ReturnType<typeof runPlayActivityRecovery>>;
  await actAsync(async () => {
    command = await runPlayActivityRecovery('replace');
  });

  assert.equal(command.result.importedCount, 2);
  assert.equal(command.ownerSynced, true);
  assert.deepEqual(gameIdsIn(control.playActivity), ['b1', 'b2'], 'the owner took the recovered activity');

  // Any later change to the mounted array is a whole-collection replace — previously that is
  // exactly where the recovered rows disappeared.
  await actAsync(() => {
    control.setPlayActivity([
      ...control.playActivity,
      makePlayActivityRecord({ id: 'react-2', gameId: 'b1', date: '2026-07-03' }),
    ]);
  });
  await settleWrites();

  assert.deepEqual(
    loadPlayActivity().map((record) => record.gameId).sort(),
    ['b1', 'b1', 'b2'],
    'the recovered activity is still there, with the new record on top',
  );

  await handle.unmount();
});

// ── Repair is durable, and reports what it removed ──────────────────────────────────

test('AS-03: repair rewrites IndexedDB and reports the rows it removed', async () => {
  const { control, handle } = await mountOwnerWithSnapshotA();

  // An invalid row (no title), as a corrupted store would hold.
  await database.games.put({ id: 'broken', platform: 'PC' } as unknown as Game);
  assert.equal(await database.games.count(), 2, 'IndexedDB holds the good row and the broken one');

  let command!: Awaited<ReturnType<typeof runGameRepair>>;
  await actAsync(async () => {
    command = await runGameRepair();
  });

  assert.equal(command.result.removedInvalid, 1);
  assert.equal(command.result.durable, true, 'the repair claims durability only because it IS durable');

  // The broken row is gone from IndexedDB, not just from the in-memory snapshot — the old
  // repairSnapshot left it behind, so the next restart undid the "repair".
  assert.deepEqual(idsIn(await database.games.toArray()), ['a1'], 'the invalid row was removed from IndexedDB');
  assert.deepEqual(idsIn(loadGames()), ['a1']);
  assert.deepEqual(idsIn(control.games), ['a1'], 'and the owner was told');

  // Nothing is deleted silently: the removed row is handed back so the user can download it.
  assert.equal(command.result.removedRows.length, 1);
  assert.equal((command.result.removedRows[0] as { id: string }).id, 'broken');

  await handle.unmount();
});
