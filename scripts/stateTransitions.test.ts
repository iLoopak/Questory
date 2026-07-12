/**
 * AS-14 — transitions are pure, results are computed, persistence has one owner.
 *
 * What was wrong: import/sync/artwork actions declared a zeroed result, reassigned it inside a
 * `setGames(current => ...)` callback, and reported it on the next line. React is free to defer,
 * replay or discard an updater, so the toast could announce "0 imported" for an import that worked.
 * The Plan controller went further and persisted from inside its own updater, while
 * `useAppPersistence` saved the same Plan state again from an effect — two writes per Plan change,
 * one of them hidden in a callback nobody controls the timing of.
 *
 * These tests pin the three properties that replace all of that: the transitions are pure functions
 * of their inputs, the command boundary hands the result back as a plain value, and one logical
 * action produces exactly one persistence write per slice.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useRef, useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { actAsync, renderHook } from './testUtils/reactHarness';
import { makeLibraryGame, makeWishlistGame } from './testUtils/gameFixtures';
import type { Game, GamePlatform } from '../src/types/game';
import type { NotificationDraft } from '../src/lib/notifications';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { SteamWishlistItem } from '../src/types/steam';

assertTestEnvironment();

const { multiGameImportTransition, steamWishlistSyncTransition, steamWishlistHtmlImportTransition } = await import('../src/lib/importTransitions');
const { applyArtworkTransition } = await import('../src/lib/artworkTransitions');
const { addGamesToQueueTransition, addGameToQueueTransition, removeQueueGameTransition, updateCurrentlyPlayingGameTransition } = await import('../src/lib/queueTransitions');
const { parseMultiGameImportInput } = await import('../src/lib/multiGameImport');
const { addGameToPlatformQueue, normalizePlatformQueueState, loadPlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { loadGames } = await import('../src/lib/gameStorage');
const { loadOnboardingState } = await import('../src/lib/onboardingStorage');
const { useSliceCommands } = await import('../src/features/app/useSliceCommands');
const { useImportSyncActions } = await import('../src/features/imports/useImportSyncActions');
const { useQueueActions } = await import('../src/hooks/useQueueActions');
const { usePlatformQueueController } = await import('../src/features/queue/usePlatformQueueController');
const { useAppPersistence } = await import('../src/features/app/useAppPersistence');
const { createTranslator } = await import('../src/i18n');
const { getStorageAdapter, setStorageAdapter } = await import('../src/lib/storageAdapter');

const t = createTranslator('en');
const PLAN_STORAGE_KEY = 'questshelf.platformQueues.v1';
const platform: GamePlatform = 'PC';

// ════════════════════════════════════════════════════════════════════════════════════
// A recording storage adapter, so "how many times was this slice persisted" is a fact and not an
// inference. Every KV write in Questory goes through the adapter's `writeLocal`.
// ════════════════════════════════════════════════════════════════════════════════════

let recordedWrites: string[] = [];

function recordStorageWrites() {
  resetWebStorage();
  recordedWrites = [];
  const store = new Map<string, string>();
  setStorageAdapter({
    ...getStorageAdapter(),
    readLocal: (key) => store.get(key) ?? null,
    writeLocal: (key, value) => { recordedWrites.push(key); store.set(key, value); },
    removeLocal: (key) => { store.delete(key); },
    localKeys: () => [...store.keys()],
    readDurable: async () => null,
    writeDurable: async () => {},
    removeDurable: async () => {},
    hasDurableBackend: async () => false,
  });
}

const planWrites = () => recordedWrites.filter((key) => key === PLAN_STORAGE_KEY).length;

// ════════════════════════════════════════════════════════════════════════════════════
// Pure transitions
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-14: a multi-game import returns the summary WITH the next state, and mutates neither input', () => {
  recordStorageWrites();
  const currentGames = [makeLibraryGame({ id: 'existing', title: 'Hades' })];
  const frozenGames = JSON.stringify(currentGames);
  const parsed = parseMultiGameImportInput(['Hades', 'Celeste', 'Tunic', 'Celeste'].join('\n'));

  const { nextState, result } = multiGameImportTransition(currentGames, parsed, '2026-01-01T00:00:00.000Z');

  assert.equal(result.importedCount, 2, 'Celeste and Tunic are new');
  assert.equal(result.updatedExisting, 0, 'a plain-text line carries nothing to update an existing game with');
  assert.equal(result.skippedDuplicates, 2, 'the repeated Celeste line, and Hades which is already in the library');
  assert.equal(nextState.length - currentGames.length, result.importedCount, 'the state agrees with the summary');
  assert.equal(JSON.stringify(currentGames), frozenGames, 'the input array is untouched');
  assert.equal(recordedWrites.length, 0, 'a transition persists nothing — that is the caller\'s job, outside the updater');
});

test('AS-14: the Steam Wishlist sync counts every outcome exactly', () => {
  const currentGames = [
    makeLibraryGame({ id: 'owned', title: 'Owned Game', steamAppId: 1 }),
    makeWishlistGame({ id: 'wished', title: 'Wished Game', steamAppId: 2, coverImage: 'https://cdn/old.jpg' }),
  ];
  const frozenGames = JSON.stringify(currentGames);
  const items: SteamWishlistItem[] = [
    { appid: 1, name: 'Owned Game' },
    { appid: 2, name: 'Wished Game' },
    { appid: 3, name: 'New Game' },
    { appid: 4, name: 'Ignored Game' },
    { appid: 0, name: '' },
  ] as SteamWishlistItem[];

  const { nextState, result } = steamWishlistSyncTransition(currentGames, items, new Set([4]), '2026-01-01T00:00:00.000Z');

  assert.equal(result.fetchedCount, 5);
  assert.equal(result.skippedAlreadyInLibraryCount, 1);
  assert.equal(result.skippedIgnoredCount, 1);
  assert.equal(result.failedCount, 1, 'the row without an appid or a name');
  assert.equal(result.addedCount, 1);
  assert.equal(result.addedCount + result.updatedCount + result.unchangedCount, 2);
  assert.equal(nextState.length, currentGames.length + result.addedCount, 'the state agrees with the summary');
  assert.equal(JSON.stringify(currentGames), frozenGames);
});

test('AS-14: the Wishlist HTML import reports added and already-present separately', () => {
  const currentGames = [makeWishlistGame({ id: 'wished', title: 'Wished Game', steamAppId: 2 })];
  const { nextState, result } = steamWishlistHtmlImportTransition(
    currentGames,
    [{ appid: 2, name: 'Wished Game' }, { appid: 9, name: 'Fresh Game' }] as never,
    '2026-01-01T00:00:00.000Z',
    3,
  );

  assert.equal(result.addedCount, 1);
  assert.equal(result.existingCount, 1);
  assert.equal(result.skippedCount, 3, 'rows the parser rejected are carried through, not recounted');
  assert.equal(nextState.length, 2);
});

test('AS-14: artwork protection survives — a game with real artwork is left exactly as it is', () => {
  const custom = makeLibraryGame({ id: 'custom', title: 'Custom', coverImage: 'https://cdn/mine.jpg', artworkSource: 'custom' });
  const currentGames = [custom];

  const { nextState, result } = applyArtworkTransition(currentGames, 'custom', { coverImage: 'https://sgdb/other.jpg', artworkSource: 'steamgriddb' }, {
    coverImage: 'https://rawg/other.jpg',
  } as never);

  assert.equal(result.appliedArtwork, false, 'and the toast therefore says "no artwork found", not "updated"');
  assert.equal(nextState, currentGames, 'the state is not even re-created');
  assert.equal(nextState[0].coverImage, 'https://cdn/mine.jpg');
});

test('AS-14: artwork falls back to RAWG only when SteamGridDB gave nothing and the cover is missing', () => {
  const currentGames = [makeLibraryGame({ id: 'bare', title: 'Bare', coverImage: '' })];

  const sgdb = applyArtworkTransition(currentGames, 'bare', { coverImage: 'https://sgdb/cover.jpg', artworkSource: 'steamgriddb' }, { coverImage: 'https://rawg/cover.jpg' } as never);
  assert.equal(sgdb.result.appliedArtwork, true);
  assert.equal(sgdb.nextState[0].coverImage, 'https://sgdb/cover.jpg', 'SteamGridDB wins when it has artwork');

  const rawgOnly = applyArtworkTransition(currentGames, 'bare', null, { coverImage: 'https://rawg/cover.jpg' } as never);
  assert.equal(rawgOnly.result.appliedArtwork, true);
  assert.equal(rawgOnly.nextState[0].coverImage, 'https://rawg/cover.jpg', 'RAWG artwork is the fallback');

  const nothing = applyArtworkTransition(currentGames, 'bare', null, null);
  assert.equal(nothing.result.appliedArtwork, false);
  assert.equal(nothing.nextState, currentGames);
});

test('AS-14: a batch Plan addition counts added, already-planned and currently-playing exactly', () => {
  const games = [
    makeLibraryGame({ id: 'new-1', title: 'New One' }),
    makeLibraryGame({ id: 'new-2', title: 'New Two' }),
    makeLibraryGame({ id: 'planned', title: 'Already Planned' }),
    makeLibraryGame({ id: 'playing', title: 'Playing Now', status: 'Playing', platform }),
  ];
  const frozenGames = JSON.stringify(games);
  const plan = addGameToPlatformQueue(
    normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3, platformTag: 'pc-plan' }] }),
    games[2],
    platform,
  );
  const frozenPlan = JSON.stringify(plan);

  const { nextGames, nextPlatformQueueState, result } = addGamesToQueueTransition(games, plan, games, platform);

  assert.equal(result.summary.addedCount, 2);
  assert.equal(result.summary.alreadyInPlanCount, 1);
  assert.equal(result.summary.skippedPlayingCount, 1, 'a game already being played here would have its Plan entry stripped anyway');
  assert.equal(nextPlatformQueueState.entries.length, 3, 'one existing entry plus the two added');
  assert.deepEqual(
    nextGames.filter((game) => game.tags.includes('pc-plan')).map((game) => game.id),
    ['new-1', 'new-2'],
    'the platform tag is applied to the added games, and only to them',
  );
  assert.equal(JSON.stringify(games), frozenGames, 'in a new array — the input is untouched');
  assert.equal(JSON.stringify(plan), frozenPlan);
  assert.ok(result.operations.length > 0, 'and the undo operations describe both slices');
});

test('AS-14: finishing a game through a Plan action produces the game AND the Plan change as one value', () => {
  const playing = makeLibraryGame({ id: 'game-1', title: 'Playing', status: 'Playing', platform });
  const planned = makeLibraryGame({ id: 'game-2', title: 'Planned' });
  const games = [playing, planned];
  const plan = addGameToPlatformQueue(normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3 }] }), planned, platform);

  const transitioned = updateCurrentlyPlayingGameTransition(games, plan, 'game-1', platform, 'finished', new Date('2026-02-02T10:00:00.000Z'));
  assert.ok(transitioned);

  assert.equal(transitioned.result.nextGame.status, 'Finished');
  assert.equal(transitioned.result.nextGame.finishedAt, '2026-02-02T10:00:00.000Z');
  assert.equal(transitioned.nextGames.find((game) => game.id === 'game-2'), planned, 'the other game is the same object');
  assert.deepEqual(transitioned.nextPlatformQueueState.entries.map((entry) => entry.gameId), ['game-2'], 'the finished game holds no Plan entry');
  assert.equal(games[0].status, 'Playing', 'the input game was not mutated');
});

test('AS-14: a transition is deterministic — the same inputs give the same answer, so a replay is harmless', () => {
  const games = [makeLibraryGame({ id: 'game-1', title: 'One' })];
  const plan = normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3 }] });

  const first = addGameToQueueTransition(games, plan, games[0], platform);
  const second = addGameToQueueTransition(games, plan, games[0], platform);

  assert.deepEqual(
    first.nextPlatformQueueState.entries.map((entry) => entry.gameId),
    second.nextPlatformQueueState.entries.map((entry) => entry.gameId),
  );
  assert.deepEqual(first.result.operations, second.result.operations);
  assert.equal(plan.entries.length, 0, 'neither run touched the input');
});

test('AS-14: removing a Plan entry the game does not have is a no-op, not a write', () => {
  const games = [makeLibraryGame({ id: 'game-1', title: 'One' })];
  const plan = normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3 }] });

  const { nextGames, nextPlatformQueueState, result } = removeQueueGameTransition(games, plan, 'game-1', platform);

  assert.equal(result.removedEntry, null);
  assert.equal(nextGames, games, 'identity is preserved, so the command boundary applies nothing');
  assert.equal(nextPlatformQueueState, plan);
});

// ════════════════════════════════════════════════════════════════════════════════════
// React execution behavior — the result must not depend on when React runs an updater
// ════════════════════════════════════════════════════════════════════════════════════

const noGames: never[] = [];

function useImportHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() => normalizePlatformQueueState(undefined));
  const toasts = useRef<NotificationDraft[]>([]);

  const { runGamesCommand } = useSliceCommands({ games, platformQueueState, setGames, setPlatformQueueState });
  const imports = useImportSyncActions({
    runGamesCommand,
    addToastNotification: (notification) => { toasts.current.push(notification); },
    t,
  });

  return { games, toasts, ...imports };
}

test('AS-14: the import summary is correct BEFORE React has re-rendered', async () => {
  recordStorageWrites();
  const handle = await renderHook(useImportHarness, [makeLibraryGame({ id: 'existing', title: 'Hades' })]);
  const parsed = parseMultiGameImportInput(['Hades', 'Celeste', 'Tunic'].join('\n'));

  await actAsync(() => {
    const summary = handle.current.importMultiGameItems(parsed);

    // Read inside the same tick the command was issued in: React has not re-rendered, and under the
    // old code the summary was still whatever the updater had (or had not) written to it.
    assert.equal(summary.importedCount, 2);
    assert.equal(summary.skippedDuplicates, 1, 'Hades is already in the library');
    assert.equal(handle.current.games.length, 1, 'React really has not caught up yet');
  });

  assert.equal(handle.current.games.length, 3, 'and the state that lands matches the summary that was reported');
  const [toast] = handle.current.toasts.current;
  assert.match(toast.message, /2 imported · 0 updated · 1 duplicates/, 'the toast reports the merge that actually happened');
  assert.equal(toast.category, 'success', 'not the "info / nothing happened" category');

  await handle.unmount();
});

test('AS-14: two imports in the same tick compose — the second sees the first', async () => {
  recordStorageWrites();
  const handle = await renderHook(useImportHarness, [] as Game[]);

  await actAsync(() => {
    const first = handle.current.importMultiGameItems(parseMultiGameImportInput('Celeste'));
    // No re-render has happened in between: the command must read the games it just applied, not the
    // render closure's stale array.
    const second = handle.current.importMultiGameItems(parseMultiGameImportInput(['Celeste', 'Tunic'].join('\n')));

    assert.equal(first.importedCount, 1);
    assert.equal(second.importedCount, 1, 'only Tunic is new');
    assert.equal(second.skippedDuplicates, 1, 'Celeste was imported a moment ago, by the command before this one');
  });

  assert.deepEqual(handle.current.games.map((game) => game.title).sort(), ['Celeste', 'Tunic'], 'and neither import was lost');

  await handle.unmount();
});

// ════════════════════════════════════════════════════════════════════════════════════
// Persistence ownership — one writer per slice, one write per logical action
// ════════════════════════════════════════════════════════════════════════════════════

function usePlanHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const queue = usePlatformQueueController(games);
  const undoMessages = useRef<string[]>([]);

  const { runCrossSliceCommand, runPlanCommand } = useSliceCommands({
    games,
    platformQueueState: queue.platformQueueState,
    setGames,
    setPlatformQueueState: queue.setPlatformQueueState,
  });

  useAppPersistence({
    games,
    ignoredSteamGames: noGames,
    onboardingState: loadOnboardingState(),
    platformQueueState: queue.platformQueueState,
    playActivity: noGames,
  });

  const actions = useQueueActions({
    activeQueuePlatforms: [platform],
    addUndoAction: (message) => { undoMessages.current.push(message); },
    markOnboardingItemComplete: () => {},
    runCrossSliceCommand,
    runPlanCommand,
    t,
  });

  return { games, platformQueueState: queue.platformQueueState, undoMessages, ...actions };
}

test('AS-14: one Plan action produces exactly one Plan persistence write', async () => {
  recordStorageWrites();
  const handle = await renderHook(usePlanHarness, [makeLibraryGame({ id: 'game-1', title: 'One' })]);

  recordedWrites = [];
  await actAsync(() => handle.current.addGameToQueue(handle.current.games[0], platform));

  assert.equal(planWrites(), 1, 'the Plan controller no longer saves from inside its updater while useAppPersistence saves again');
  assert.deepEqual(loadPlatformQueueState().entries.map((entry) => entry.gameId), ['game-1'], 'and the one write is the right one');

  recordedWrites = [];
  await actAsync(() => handle.current.removeQueueGame('game-1', platform));
  assert.equal(planWrites(), 1);
  assert.deepEqual(loadPlatformQueueState().entries, []);

  await handle.unmount();
});

test('AS-14: a cross-slice Plan action writes each slice through its own single owner', async () => {
  recordStorageWrites();
  const handle = await renderHook(usePlanHarness, [makeLibraryGame({ id: 'game-1', title: 'Planned' })]);

  // Plan it, then start playing it: the game's status changes AND its Plan entry goes away — the two
  // slices that used to be written from inside each other's updater.
  await actAsync(() => handle.current.addGameToQueue(handle.current.games[0], platform));
  recordedWrites = [];

  await actAsync(() => handle.current.playQueueGameNow('game-1', platform));

  assert.equal(handle.current.games[0].status, 'Playing');
  assert.deepEqual(handle.current.platformQueueState.entries, [], 'a game being played holds no Plan entry');
  assert.equal(planWrites(), 1, 'the Plan half is one write, from the Plan owner');
  assert.notEqual(loadGames().find((game) => game.id === 'game-1')?.status, 'Playing', 'and the games half was NOT written by the feature action — the debounced owner still has it');

  // The established games writer, unchanged: the 400 ms debounce lands it.
  await actAsync(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
  assert.equal(loadGames().find((game) => game.id === 'game-1')?.status, 'Playing', 'the debounced writer persisted it');

  assert.equal(handle.current.undoMessages.current.length, 2, 'both actions are undoable, once each');

  await handle.unmount();
});

test('AS-14: reordering and limit changes go through the Plan owner too, one write each', async () => {
  recordStorageWrites();
  const handle = await renderHook(usePlanHarness, [
    makeLibraryGame({ id: 'game-1', title: 'One' }),
    makeLibraryGame({ id: 'game-2', title: 'Two' }),
  ]);

  await actAsync(() => handle.current.addGameToQueue(handle.current.games[0], platform));
  await actAsync(() => handle.current.addGameToQueue(handle.current.games[1], platform));
  recordedWrites = [];

  await actAsync(() => handle.current.moveQueueGame('game-2', platform, 'top'));
  assert.equal(planWrites(), 1);
  assert.deepEqual(handle.current.platformQueueState.entries.map((entry) => entry.gameId), ['game-2', 'game-1']);

  recordedWrites = [];
  await actAsync(() => handle.current.updateQueueLimit(platform, 5));
  assert.equal(planWrites(), 1);
  assert.equal(handle.current.platformQueueState.settings.find((setting) => setting.platform === platform)?.maxActiveGames, 5);

  await handle.unmount();
});
