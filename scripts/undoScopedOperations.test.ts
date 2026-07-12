/**
 * AS-04 — Undo is action-scoped, not a whole-state rollback.
 *
 * Undo used to capture games, ignored Steam ids, Platform Plans, review state and selection on
 * every undoable action, and restore all of it. Pressing Undo on a toast that was still on screen
 * therefore rewound the whole app past every unrelated change made since.
 *
 * These began as characterization tests for that loss (PR #650) and now assert the contract: an
 * undo record carries the INVERSE of what its action did, guarded by an expected-current-state
 * check, so undoing A leaves B alone — and when the entity A touched has moved on, the undo is
 * refused rather than applied over the newer work.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import type { Game, GamePlatform } from '../src/types/game';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { ReviewModeState } from '../src/lib/reviewModeStorage';
import type { IgnoredSteamGame } from '../src/lib/steamIgnoredGamesStorage';

assertTestEnvironment();

const { createTranslator } = await import('../src/i18n');
const { useQuestShelfNotifications } = await import('../src/hooks/useQuestShelfNotifications');
const { useGameLibraryActions } = await import('../src/hooks/useGameLibraryActions');
const { useQueueActions } = await import('../src/hooks/useQueueActions');
const { useReviewModeActions } = await import('../src/hooks/useReviewModeActions');
const { addGameToPlatformQueue, normalizePlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { normalizeReviewModeState } = await import('../src/lib/reviewModeStorage');
const { loadPendingUndoActions, savePendingUndoActions } = await import('../src/lib/undoHistoryStorage');
const { applyUndoOperations } = await import('../src/lib/undoOperations');
const { allBackupStorageKeys, createQuestShelfBackup } = await import('../src/lib/backupStorage');

const t = createTranslator('en');
const staleUndoMessage = t('toast.undoUnavailable');

const gameA = makeLibraryGame({ id: 'game-a', title: 'Game A', status: 'Want to play' });
const gameB = makeLibraryGame({ id: 'game-b', title: 'Game B', status: 'Want to play' });

/** Mirrors AppController's ownership: the real hooks, over the real state slices. */
function useUndoHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>([]);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() =>
    normalizePlatformQueueState(undefined),
  );
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => normalizeReviewModeState(undefined));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const notifications = useQuestShelfNotifications({
    activeNavItem: 'Library',
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    staleUndoMessage,
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
  });

  const libraryActions = useGameLibraryActions({
    addUndoAction: notifications.addUndoAction,
    games,
    setGames,
    setIgnoredSteamGames,
    setSelectedGameId,
    t,
  });

  const queueActions = useQueueActions({
    activeQueuePlatforms: ['PC', 'Switch'],
    addUndoAction: notifications.addUndoAction,
    games,
    markOnboardingItemComplete: () => {},
    platformQueueState,
    setGames,
    setPlatformQueueState,
    t,
  });

  return {
    ...notifications,
    ...libraryActions,
    ...queueActions,
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    selectedGameId,
    setGames,
    setPlatformQueueState,
    setReviewModeState,
  };
}

type Harness = { current: ReturnType<typeof useUndoHarness>; unmount: () => Promise<void> };

function toastFor(handle: Harness, actionType: string) {
  const action = handle.current.pendingUndoActions.find((entry) => entry.historyEntry.actionType === actionType);
  assert.ok(action, `expected a pending undo toast for "${actionType}"`);
  return action;
}

const gameById = (handle: Harness, id: string) => handle.current.games.find((game) => game.id === id);
const ids = (handle: Harness) => handle.current.games.map((game) => game.id).sort();
const planKeys = (handle: Harness) =>
  handle.current.platformQueueState.entries.map((entry) => `${entry.gameId}@${entry.targetPlatform}`).sort();

// ── The core defect: undo A must not erase B ────────────────────────────────────────

test('AS-04: undoing action A preserves unrelated action B that happened after it', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // Action A: mark Game A as Playing.
  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));

  // Action B: an unrelated later change — the user finishes Game B and writes a note.
  await actAsync(() => {
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameB.id ? { ...game, status: 'Finished', notes: 'loved it' } : game)),
    );
  });

  // A's toast is still on screen (8 s lifetime). The user presses its Undo.
  await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-playing').id));

  assert.equal(gameById(handle, gameA.id)?.status, 'Want to play', 'A was undone');

  // The whole-state snapshot used to roll B back with it, note and all.
  assert.equal(gameById(handle, gameB.id)?.status, 'Finished', 'action B survived');
  assert.equal(gameById(handle, gameB.id)?.notes, 'loved it', 'and so did the note written during it');

  await handle.unmount();
});

test('AS-04: undoing the OLDEST of three toasts leaves the two newer actions alone', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));
  await actAsync(() => handle.current.updateGameStatus(gameB.id, 'Finished'));
  await actAsync(() =>
    handle.current.addManualGame(makeLibraryGame({ id: 'game-c', title: 'Game C' })),
  );

  assert.equal(handle.current.pendingUndoActions.length, 3, 'three live undo toasts');

  // The user presses Undo on the OLDEST toast.
  await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-playing').id));

  assert.equal(gameById(handle, gameA.id)?.status, 'Want to play', 'the oldest action was undone');
  assert.equal(gameById(handle, gameB.id)?.status, 'Finished', 'the newer status change survived');
  assert.deepEqual(ids(handle), ['game-a', 'game-b', 'game-c'], 'the newly added game survived');

  // Only that toast is gone; the other two still offer their own (still valid) undos.
  assert.equal(handle.current.pendingUndoActions.length, 2);
  assert.deepEqual(
    handle.current.pendingUndoActions.map((action) => action.historyEntry.actionType).sort(),
    ['add-manual-game', 'mark-finished'],
  );

  await handle.unmount();
});

test('AS-04: undoing a status change does not touch Plans or review state', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));

  // Later, and unrelated: a Plan entry and a review decision.
  await actAsync(() => handle.current.addGameToQueue(gameB, 'Switch'));
  await actAsync(() => {
    handle.current.setReviewModeState((current) => ({ ...current, ignoredGameIds: [gameB.id] }));
  });

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-playing').id));

  assert.equal(gameById(handle, gameA.id)?.status, 'Want to play');
  assert.deepEqual(planKeys(handle), ['game-b@Switch'], 'the Plan entry survived');
  assert.deepEqual(handle.current.reviewModeState.ignoredGameIds, [gameB.id], 'the review decision survived');

  await handle.unmount();
});

// ── Staleness ───────────────────────────────────────────────────────────────────────

test('AS-04: two edits to the same game — undoing the older one is refused as stale', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));
  // The same field is changed again before the first toast expires.
  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Finished'));

  const olderToast = toastFor(handle, 'mark-playing');
  await actAsync(() => handle.current.undoAction(olderToast.id));

  // Applying the older inverse would have written "Want to play" over the newer "Finished".
  assert.equal(gameById(handle, gameA.id)?.status, 'Finished', 'the newer status was kept');

  const staleToast = handle.current.pendingUndoActions.find((action) => action.message === staleUndoMessage);
  assert.ok(staleToast, 'the user is told the undo is no longer available');
  assert.equal(staleToast?.category, 'info', 'and it is a non-destructive message, not an error');
  assert.equal(
    handle.current.pendingUndoActions.some((action) => action.id === olderToast.id),
    false,
    'the stale toast is retired',
  );

  await handle.unmount();
});

test('AS-04: the NEWER of two edits to the same game can still be undone', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA]);

  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));
  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Finished'));

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-finished').id));

  // Its guard still holds (the game is Finished, which is what it wrote), so it reverts to the
  // state that action found: Playing.
  assert.equal(gameById(handle, gameA.id)?.status, 'Playing');

  await handle.unmount();
});

test('AS-04: an unrelated edit to the same game does NOT block the undo', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA]);

  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));

  // A different field on the SAME record changes. The guard only looks at what the action wrote.
  await actAsync(() => {
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameA.id ? { ...game, notes: 'a note added later' } : game)),
    );
  });

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-playing').id));

  assert.equal(gameById(handle, gameA.id)?.status, 'Want to play', 'the status was undone');
  assert.equal(gameById(handle, gameA.id)?.notes, 'a note added later', 'and the unrelated note survived');

  await handle.unmount();
});

test('AS-04: undoing a delete is refused when the entity is missing... and when its id came back', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.removeGame(gameB.id));

  // The user re-adds a game under the SAME id (a re-import, or typing it back in).
  const reAdded = makeLibraryGame({ id: gameB.id, title: 'Game B', notes: 're-added by hand' });
  await actAsync(() => handle.current.setGames((current) => [...current, reAdded]));

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'delete-game').id));

  // The snapshot undo replaced the whole collection here, destroying the record the user had just
  // typed in. The scoped inverse refuses instead.
  assert.equal(gameById(handle, gameB.id)?.notes, 're-added by hand', 'the re-added record survived');
  assert.ok(
    handle.current.pendingUndoActions.some((action) => action.message === staleUndoMessage),
    'and the user is told why nothing happened',
  );

  await handle.unmount();
});

test('AS-04: undoing an add is refused once the added game has been deleted again', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA]);

  const gameC = makeLibraryGame({ id: 'game-c', title: 'Game C' });
  await actAsync(() => handle.current.addManualGame(gameC));
  await actAsync(() => handle.current.setGames((current) => current.filter((game) => game.id !== 'game-c')));

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'add-manual-game').id));

  assert.deepEqual(ids(handle), ['game-a'], 'nothing else was disturbed');
  assert.ok(handle.current.pendingUndoActions.some((action) => action.message === staleUndoMessage));

  await handle.unmount();
});

// ── One test per undoable action family ─────────────────────────────────────────────

test('AS-04: game delete undo restores exactly that game', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.removeGame(gameB.id));
  assert.deepEqual(ids(handle), ['game-a']);

  // An unrelated game is added while the toast is up.
  await actAsync(() => handle.current.addManualGame(makeLibraryGame({ id: 'game-c', title: 'Game C' })));

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'delete-game').id));

  assert.deepEqual(ids(handle), ['game-a', 'game-b', 'game-c'], 'B is back and C was not disturbed');
  assert.equal(gameById(handle, gameB.id)?.title, 'Game B');

  await handle.unmount();
});

test('AS-04: Plan add undo removes only that Plan entry', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.addGameToQueue(gameA, 'PC'));
  await actAsync(() => handle.current.addGameToQueue(gameB, 'Switch'));

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'add-to-queue').id));

  // Both toasts share the 'add-to-queue' action type but different games; toastFor returns the
  // first, which is Game A's.
  assert.deepEqual(planKeys(handle), ['game-b@Switch'], 'only Game A left the Plan');

  await handle.unmount();
});

test('AS-04: Plan remove undo restores the entry at its old position', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) =>
      addGameToPlatformQueue(addGameToPlatformQueue(current, gameA, 'PC'), gameB, 'PC'),
    );
  });

  await actAsync(() => handle.current.removeQueueGame(gameA.id, 'PC'));
  assert.deepEqual(planKeys(handle), ['game-b@PC']);

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'remove-from-queue').id));

  assert.deepEqual(planKeys(handle), ['game-a@PC', 'game-b@PC'], 'the entry came back');
  const restored = handle.current.platformQueueState.entries.find((entry) => entry.gameId === gameA.id);
  assert.equal(restored?.queuePosition, 1, 'at the position it held before');

  await handle.unmount();
});

test('AS-04: Plan move undo puts the entry back on its original platform', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA]);

  await actAsync(() => handle.current.addGameToQueue(gameA, 'PC'));
  await actAsync(() => handle.current.moveQueueGameToPlatform(gameA.id, 'PC' as GamePlatform, 'Switch' as GamePlatform));
  assert.deepEqual(planKeys(handle), ['game-a@Switch']);

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'move-between-collections').id));

  assert.deepEqual(planKeys(handle), ['game-a@PC'], 'the move was reversed, not the whole Plan state');

  await handle.unmount();
});

test('AS-04: ignore undo restores the game and un-ignores the Steam id', async () => {
  resetWebStorage();
  const steamGame = makeLibraryGame({ id: 'game-steam', title: 'Steam Game', steamAppId: 400 });
  const handle = await renderHook(useUndoHarness, [gameA, steamGame]);

  await actAsync(() => handle.current.removeAndIgnoreSteamGame(steamGame));
  assert.deepEqual(ids(handle), ['game-a']);
  assert.deepEqual(handle.current.ignoredSteamGames.map((entry) => entry.steamAppId), [400]);

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'ignore-game').id));

  assert.deepEqual(ids(handle), ['game-a', 'game-steam'], 'the game is back');
  assert.deepEqual(handle.current.ignoredSteamGames, [], 'and it is no longer on the ignore list');

  await handle.unmount();
});

test('AS-04: play-now undo restores both the game fields and the Plan entry', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.addGameToQueue(gameA, 'PC'));
  await actAsync(() => handle.current.addGameToQueue(gameB, 'PC'));
  await actAsync(() => handle.current.playQueueGameNow(gameA.id, 'PC' as GamePlatform));

  assert.equal(gameById(handle, gameA.id)?.status, 'Playing');
  assert.deepEqual(planKeys(handle), ['game-b@PC'], 'playing it took it out of the Plan');

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'play-now').id));

  assert.equal(gameById(handle, gameA.id)?.status, 'Want to play', 'the status went back');
  assert.deepEqual(planKeys(handle), ['game-a@PC', 'game-b@PC'], 'and so did the Plan entry');
  assert.equal(gameById(handle, gameB.id)?.status, 'Want to play', 'Game B was never touched');

  await handle.unmount();
});

test('AS-04: bulk status undo reverts every game it changed, and nothing else', async () => {
  resetWebStorage();
  const gameC = makeLibraryGame({ id: 'game-c', title: 'Game C', status: 'Playing' });
  const handle = await renderHook(useUndoHarness, [gameA, gameB, gameC]);

  await actAsync(() => handle.current.updateManyGameStatuses([gameA.id, gameB.id], 'Finished'));
  assert.deepEqual(
    handle.current.games.map((game) => game.status),
    ['Finished', 'Finished', 'Playing'],
  );

  await actAsync(() => handle.current.undoAction(toastFor(handle, 'bulk-mark-finished').id));

  assert.deepEqual(
    handle.current.games.map((game) => game.status),
    ['Want to play', 'Want to play', 'Playing'],
    'the two changed games reverted; the untouched one stayed as it was',
  );

  await handle.unmount();
});

// ── Toast lifecycle, persistence, compatibility ─────────────────────────────────────

test('AS-04: an undo record carries only its inverse, not a copy of the library', async () => {
  resetWebStorage();
  const largeLibrary = Array.from({ length: 50 }, (_, index) =>
    makeLibraryGame({ id: `game-${index}`, title: `Game ${index}`, notes: 'x'.repeat(200) }),
  );
  const handle = await renderHook(useUndoHarness, largeLibrary);

  await actAsync(() => handle.current.updateGameStatus('game-0', 'Playing'));

  const persisted = loadPendingUndoActions();
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0].operations.map((operation) => operation.kind), ['game-fields']);

  // Every toast used to serialize the whole games collection into sessionStorage.
  assert.equal(JSON.stringify(persisted[0]).includes('"game-1"'), false, 'no unrelated game is in the record');
  assert.ok(JSON.stringify(persisted[0]).length < 1000, 'the record is a patch, not a snapshot');

  await handle.unmount();
});

test('AS-04: an undo survives a session reload and still applies to the state it finds', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);
  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));
  await handle.unmount();

  // Reload: the toast is rehydrated from sessionStorage, and the games come back from storage as
  // the forward action left them — A Playing, and played today.
  const today = new Date().toISOString().slice(0, 10);
  const reloaded = await renderHook(useUndoHarness, [
    { ...gameA, status: 'Playing' as const, lastPlayedAt: today },
    { ...gameB, notes: 'edited in the previous session' },
  ]);

  assert.equal(reloaded.current.pendingUndoActions.length, 1, 'the toast survived the reload');

  await actAsync(() => reloaded.current.undoAction(toastFor(reloaded, 'mark-playing').id));

  assert.equal(gameById(reloaded, gameA.id)?.status, 'Want to play', 'and its inverse still applies');
  assert.equal(gameById(reloaded, gameB.id)?.notes, 'edited in the previous session', 'B untouched');

  await reloaded.unmount();
});

test('AS-04: a v1 whole-state history is discarded, not resurrected', async () => {
  resetWebStorage();

  // A pre-AS-04 record: a full snapshot, no inverse information in it at all.
  window.sessionStorage.setItem(
    'questshelf.pendingUndoActions.v1',
    JSON.stringify([
      {
        id: 'old-1',
        message: 'Game A is now playing',
        createdAt: Date.now(),
        expiresAt: Date.now() + 8000,
        category: 'success',
        historyEntry: { actionType: 'mark-playing', affectedGameIds: ['game-a'], description: 'x', createdAt: '' },
        snapshot: { games: [gameA, gameB], ignoredSteamGames: [], platformQueueState: {}, reviewModeState: {}, selectedGameId: null },
      },
    ]),
  );

  assert.deepEqual(loadPendingUndoActions(), [], 'the old history is not loaded');
  assert.equal(
    window.sessionStorage.getItem('questshelf.pendingUndoActions.v1'),
    null,
    'and it is cleaned up rather than left to rot',
  );
});

test('AS-04: malformed history is discarded without crashing startup', async () => {
  resetWebStorage();

  window.sessionStorage.setItem('questshelf.pendingUndoActions.v2', '{not json');
  assert.deepEqual(loadPendingUndoActions(), []);

  // Structurally valid JSON, but the records are junk — including one whose operations are not
  // operations at all, which must never be handed to the applier.
  window.sessionStorage.setItem(
    'questshelf.pendingUndoActions.v2',
    JSON.stringify([
      null,
      { id: 'x' },
      {
        id: 'bad-ops',
        message: 'm',
        createdAt: Date.now(),
        expiresAt: Date.now() + 8000,
        category: 'success',
        historyEntry: { actionType: 'mark-playing', affectedGameIds: [], description: '', createdAt: '' },
        operations: [{ kind: 'drop-everything' }],
      },
    ]),
  );

  assert.deepEqual(loadPendingUndoActions(), [], 'unknown operation kinds disqualify the record');
});

test('AS-04: expired records are dropped on load', async () => {
  resetWebStorage();
  const expired = {
    id: 'old',
    message: 'expired',
    createdAt: Date.now() - 20000,
    expiresAt: Date.now() - 10000,
    category: 'success' as const,
    historyEntry: { actionType: 'mark-playing', affectedGameIds: ['game-a'], description: '', createdAt: '' },
    operations: [],
  };
  const live = { ...expired, id: 'live', message: 'live', expiresAt: Date.now() + 10000 };

  savePendingUndoActions([expired, live]);

  assert.deepEqual(loadPendingUndoActions().map((action) => action.id), ['live']);
});

test('AS-04: a sessionStorage quota failure is non-fatal and the toast still works', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // jsdom's Storage is a Proxy, so patch the prototype, and only for the undo key.
  const storagePrototype = Object.getPrototypeOf(window.sessionStorage) as Storage;
  const originalSetItem = storagePrototype.setItem;
  storagePrototype.setItem = function patchedSetItem(this: Storage, key: string, value: string) {
    if (key === 'questshelf.pendingUndoActions.v2') {
      throw new Error('QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  };

  try {
    await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));
    assert.equal(handle.current.pendingUndoActions.length, 1, 'the toast is shown');

    // The undo cannot survive a reload, but it works right now — which is what the toast offers.
    await actAsync(() => handle.current.undoAction(toastFor(handle, 'mark-playing').id));
    assert.equal(gameById(handle, gameA.id)?.status, 'Want to play');
  } finally {
    storagePrototype.setItem = originalSetItem;
  }

  await handle.unmount();
});


/**
 * The Quest Queue variant: the same owner, with the review hook wired in and Review Mode active.
 *
 * A review decision changes the game AND the review slice, so it is the case where one toast has
 * to carry two halves of an inverse.
 */
function useReviewUndoHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>([]);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() =>
    normalizePlatformQueueState(undefined),
  );
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => ({
    ...normalizeReviewModeState(undefined),
    queueOrder: initialGames.map((game) => game.id),
  }));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const notifications = useQuestShelfNotifications({
    activeNavItem: 'Review Mode',
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    staleUndoMessage,
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
  });

  const libraryActions = useGameLibraryActions({
    addUndoAction: notifications.addUndoAction,
    games,
    setGames,
    setIgnoredSteamGames,
    setSelectedGameId,
    t,
  });

  const queueActions = useQueueActions({
    activeQueuePlatforms: ['PC', 'Switch'],
    addUndoAction: notifications.addUndoAction,
    games,
    markOnboardingItemComplete: () => {},
    platformQueueState,
    setGames,
    setPlatformQueueState,
    t,
  });

  const reviewActions = useReviewModeActions({
    addGameToQueue: queueActions.addGameToQueue,
    addToWishlist: libraryActions.addToWishlist,
    addUndoAction: notifications.addUndoAction,
    platformQueueState,
    refreshGameMetadataFromActions: async () => undefined,
    reviewModeState,
    setActiveNavItem: () => {},
    setActiveReviewSource: () => {},
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
    setSelectedGameId,
    startMetadataWorkflow: () => {},
    t,
    updateGameReviewFields: libraryActions.updateGameReviewFields,
  });

  return { ...notifications, ...reviewActions, games, ignoredSteamGames, platformQueueState, reviewModeState, setGames };
}

type ReviewHarness = { current: ReturnType<typeof useReviewUndoHarness>; unmount: () => Promise<void> };

function reviewToastFor(handle: ReviewHarness, actionType: string) {
  const action = handle.current.pendingUndoActions.find((entry) => entry.historyEntry.actionType === actionType);
  assert.ok(action, `expected a pending undo toast for "${actionType}"`);
  return action;
}

// ── Quest Queue review transitions ──────────────────────────────────────────────────

test('AS-04: undoing a review decision reverts the game AND the review slice, but nothing else', async () => {
  resetWebStorage();
  const handle = await renderHook(useReviewUndoHarness, [gameA, gameB]);

  await actAsync(() => handle.current.handleReviewAction(gameA, 'dropped'));

  assert.equal(handle.current.games.find((game) => game.id === gameA.id)?.status, 'Dropped');
  assert.deepEqual(handle.current.reviewModeState.queueOrder, ['game-b'], 'it left the review queue');
  assert.ok(gameA.id in handle.current.reviewModeState.reviewedGames, 'and was marked reviewed');
  assert.equal(handle.current.reviewModeState.stats.dropped, 1);
  assert.equal(handle.current.reviewModeState.stats.reviewed, 1);

  // An unrelated later edit, while the toast is still up.
  await actAsync(() => {
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameB.id ? { ...game, notes: 'a note about B' } : game)),
    );
  });

  await actAsync(() => handle.current.undoAction(reviewToastFor(handle, 'mark-dropped').id));

  assert.equal(handle.current.games.find((game) => game.id === gameA.id)?.status, 'Want to play', 'status reverted');
  assert.deepEqual(handle.current.reviewModeState.queueOrder.sort(), ['game-a', 'game-b'], 'back in the queue');
  assert.equal(gameA.id in handle.current.reviewModeState.reviewedGames, false, 'no longer marked reviewed');
  assert.equal(handle.current.reviewModeState.stats.dropped, 0, 'the counters were rolled back');
  assert.equal(handle.current.reviewModeState.stats.reviewed, 0);
  assert.equal(
    handle.current.games.find((game) => game.id === gameB.id)?.notes,
    'a note about B',
    'the unrelated edit survived',
  );

  await handle.unmount();
});

test('AS-04: undoing a Quest Queue skip puts the game back where it was', async () => {
  resetWebStorage();
  const gameC = makeLibraryGame({ id: 'game-c', title: 'Game C' });
  const handle = await renderHook(useReviewUndoHarness, [gameA, gameB, gameC]);

  await actAsync(() => handle.current.handleReviewAction(gameA, 'skip'));
  assert.deepEqual(handle.current.reviewModeState.queueOrder, ['game-b', 'game-c', 'game-a'], 'skipped to the end');
  assert.equal(handle.current.reviewModeState.stats.skipped, 1);

  await actAsync(() => handle.current.undoAction(reviewToastFor(handle, 'skip-game').id));

  assert.deepEqual(handle.current.reviewModeState.queueOrder, ['game-a', 'game-b', 'game-c'], 'back at the front');
  assert.equal(handle.current.reviewModeState.stats.skipped, 0);

  await handle.unmount();
});

test('AS-04: undoing a Quest Queue ignore restores the game to the queue and the ignore list', async () => {
  resetWebStorage();
  const steamGame = makeLibraryGame({ id: 'game-steam', title: 'Steam Game', steamAppId: 400 });
  const handle = await renderHook(useReviewUndoHarness, [steamGame, gameB]);

  await actAsync(() => handle.current.handleReviewAction(steamGame, 'ignore'));

  assert.deepEqual(handle.current.reviewModeState.ignoredGameIds, ['game-steam']);
  assert.deepEqual(handle.current.ignoredSteamGames.map((entry) => entry.steamAppId), [400]);
  assert.deepEqual(handle.current.reviewModeState.queueOrder, ['game-b']);

  await actAsync(() => handle.current.undoAction(reviewToastFor(handle, 'ignore-game').id));

  assert.deepEqual(handle.current.reviewModeState.ignoredGameIds, [], 'no longer ignored in review');
  assert.deepEqual(handle.current.ignoredSteamGames, [], 'nor on the Steam ignore list');
  assert.deepEqual(handle.current.reviewModeState.queueOrder.sort(), ['game-b', 'game-steam'], 'back in the queue');
  assert.equal(handle.current.reviewModeState.stats.ignored, 0);

  await handle.unmount();
});

test('AS-04: undo history is session-scoped and never lands in a backup', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);
  await actAsync(() => handle.current.updateGameStatus(gameA.id, 'Playing'));

  assert.ok(loadPendingUndoActions().length > 0, 'the record exists in sessionStorage');

  const undoKeys = ['questshelf.pendingUndoActions.v1', 'questshelf.pendingUndoActions.v2'];
  undoKeys.forEach((key) => {
    assert.equal(allBackupStorageKeys.includes(key as never), false, `${key} is not a backup key`);
  });

  const exported = JSON.stringify(createQuestShelfBackup(false));
  undoKeys.forEach((key) => assert.equal(exported.includes(key), false, `${key} is absent from the export`));

  await handle.unmount();
});

// ── The pure applier ────────────────────────────────────────────────────────────────

test('AS-04: applyUndoOperations is all-or-nothing', async () => {
  const state = {
    games: [gameA, gameB],
    ignoredSteamGames: [],
    platformQueueState: normalizePlatformQueueState(undefined),
    reviewModeState: normalizeReviewModeState(undefined),
  };

  const result = applyUndoOperations(state, [
    // The first would apply cleanly...
    { kind: 'game-fields', gameId: gameA.id, previous: { status: 'Playing' }, expected: { status: 'Want to play' } },
    // ...but the second is stale, so NOTHING is written.
    { kind: 'game-fields', gameId: gameB.id, previous: { status: 'Playing' }, expected: { status: 'Finished' } },
  ]);

  assert.equal(result.status, 'stale');
  assert.equal(result.status === 'stale' && result.reason, 'conflict');
  assert.equal(state.games[0].status, 'Want to play', 'the state object was not mutated');
});

test('AS-04: a missing entity is reported as stale, not applied around', async () => {
  const state = {
    games: [gameA],
    ignoredSteamGames: [],
    platformQueueState: normalizePlatformQueueState(undefined),
    reviewModeState: normalizeReviewModeState(undefined),
  };

  const result = applyUndoOperations(state, [
    { kind: 'game-fields', gameId: 'game-gone', previous: { status: 'Playing' }, expected: { status: 'Finished' } },
  ]);

  assert.equal(result.status, 'stale');
  assert.equal(result.status === 'stale' && result.reason, 'missing');
});
