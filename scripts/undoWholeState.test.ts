/**
 * AS-04 — Undo is a whole-state rollback.
 *
 * `useQuestShelfNotifications.createUndoSnapshot()` captures the ENTIRE application state
 * (games, ignored Steam ids, Platform Plans, review state, selection) at the moment an
 * undoable action happens, and `undoAction()` blindly restores every slice. Up to three
 * undo toasts can be live at once, so pressing Undo on an older toast rolls the whole app
 * back past every unrelated change made since.
 *
 * These tests CHARACTERIZE that. The assertions marked "documents unsafe current behavior"
 * encode data loss that the scoped-inverse fix is expected to eliminate.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import type { Game } from '../src/types/game';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { ReviewModeState } from '../src/lib/reviewModeStorage';
import type { IgnoredSteamGame } from '../src/lib/steamIgnoredGamesStorage';

assertTestEnvironment();

const { useQuestShelfNotifications } = await import('../src/hooks/useQuestShelfNotifications');
const { normalizePlatformQueueState } = await import('../src/lib/platformQueueStorage');
const { normalizeReviewModeState } = await import('../src/lib/reviewModeStorage');
const { loadPendingUndoActions } = await import('../src/lib/undoHistoryStorage');

const gameA = makeLibraryGame({ id: 'game-a', title: 'Game A', status: 'Want to play' });
const gameB = makeLibraryGame({ id: 'game-b', title: 'Game B', status: 'Want to play' });

/**
 * Mirrors AppController's ownership: one React owner for each slice the undo snapshot
 * captures, wired into the real notifications hook.
 */
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
    selectedGameId,
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
    setSelectedGameId,
  });

  return {
    ...notifications,
    games,
    platformQueueState,
    reviewModeState,
    setGames,
    setPlatformQueueState,
    setReviewModeState,
  };
}

function undoActionFor(handle: { current: ReturnType<typeof useUndoHarness> }, actionType: string) {
  const action = handle.current.pendingUndoActions.find((entry) => entry.historyEntry.actionType === actionType);
  assert.ok(action, `expected a pending undo toast for "${actionType}"`);
  return action;
}

test('AS-04: undoing action A erases unrelated action B that happened after it', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // Action A: mark Game A as Playing (captures a snapshot of the WHOLE app state).
  await actAsync(() => {
    handle.current.addUndoAction('Game A is now playing', {
      actionType: 'mark-playing',
      affectedGameIds: [gameA.id],
      description: 'Restore Game A',
    });
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameA.id ? { ...game, status: 'Playing' } : game)),
    );
  });

  // Action B: an unrelated later change — the user finishes Game B.
  await actAsync(() => {
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameB.id ? { ...game, status: 'Finished', notes: 'loved it' } : game)),
    );
  });
  assert.equal(handle.current.games.find((game) => game.id === gameB.id)?.status, 'Finished');

  // A's toast is still on screen (8 s lifetime). The user presses its Undo.
  await actAsync(() => {
    handle.current.undoAction(undoActionFor(handle, 'mark-playing').id);
  });

  // Undo A correctly reverted A...
  assert.equal(handle.current.games.find((game) => game.id === gameA.id)?.status, 'Want to play');

  // Documents unsafe current behavior: ...and also silently reverted B, which the user never
  // asked to undo. The note they wrote is gone.
  const restoredB = handle.current.games.find((game) => game.id === gameB.id);
  assert.equal(restoredB?.status, 'Want to play', 'unrelated action B was rolled back');
  assert.equal(restoredB?.notes, '', 'the note written during action B was destroyed');

  await handle.unmount();
});

test('AS-04: undoing the OLDER of several toasts discards every newer action', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // Three independently-undoable actions stack up (the toast stack holds up to three).
  await actAsync(() => {
    handle.current.addUndoAction('A', { actionType: 'mark-playing', affectedGameIds: [gameA.id], description: 'a' });
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameA.id ? { ...game, status: 'Playing' } : game)),
    );
  });
  await actAsync(() => {
    handle.current.addUndoAction('B', { actionType: 'mark-finished', affectedGameIds: [gameB.id], description: 'b' });
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameB.id ? { ...game, status: 'Finished' } : game)),
    );
  });
  await actAsync(() => {
    handle.current.addUndoAction('C', { actionType: 'add-manual-game', affectedGameIds: ['game-c'], description: 'c' });
    handle.current.setGames((current) => [...current, makeLibraryGame({ id: 'game-c', title: 'Game C' })]);
  });

  assert.equal(handle.current.pendingUndoActions.length, 3, 'three live undo toasts');
  assert.equal(handle.current.games.length, 3);

  // The user presses Undo on the OLDEST toast (A).
  await actAsync(() => {
    handle.current.undoAction(undoActionFor(handle, 'mark-playing').id);
  });

  // Documents unsafe current behavior: A's snapshot predates B and C, so restoring it
  // rewinds the app past both — Game C disappears and Game B is un-finished.
  assert.deepEqual(handle.current.games.map((game) => game.id), ['game-a', 'game-b'], 'Game C was erased');
  assert.equal(handle.current.games.find((game) => game.id === gameB.id)?.status, 'Want to play', 'B was rolled back');

  // The toasts for B and C are still on screen, now offering to undo actions that no longer exist.
  assert.equal(handle.current.pendingUndoActions.length, 2, 'stale toasts for erased actions remain');

  await handle.unmount();
});

test('AS-04: undo restores unrelated Platform Plan and review state captured in the snapshot', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // Action A snapshots the whole app, including the (empty) Plans and review slices.
  await actAsync(() => {
    handle.current.addUndoAction('A', { actionType: 'mark-playing', affectedGameIds: [gameA.id], description: 'a' });
    handle.current.setGames((current) =>
      current.map((game) => (game.id === gameA.id ? { ...game, status: 'Playing' } : game)),
    );
  });

  // Later, and unrelated to A: the user ignores a game in Quest Queue review.
  await actAsync(() => {
    handle.current.setReviewModeState((current) => ({ ...current, ignoredGameIds: [gameB.id] }));
  });
  assert.deepEqual(handle.current.reviewModeState.ignoredGameIds, [gameB.id]);

  await actAsync(() => {
    handle.current.undoAction(undoActionFor(handle, 'mark-playing').id);
  });

  // Documents unsafe current behavior: undoing a STATUS change also reverted the review slice.
  assert.deepEqual(handle.current.reviewModeState.ignoredGameIds, [], 'the review decision was erased');

  await handle.unmount();
});

test('AS-04: delete followed by re-add — undoing the delete drops the re-added game', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // The user deletes Game B (undoable).
  await actAsync(() => {
    handle.current.addUndoAction('Game B removed', {
      actionType: 'delete-game',
      affectedGameIds: [gameB.id],
      description: 'Restore Game B',
    });
    handle.current.setGames((current) => current.filter((game) => game.id !== gameB.id));
  });

  // Then re-adds it manually, as a fresh record with a new id.
  const reAdded = makeLibraryGame({ id: 'game-b-readded', title: 'Game B', notes: 're-added by hand' });
  await actAsync(() => {
    handle.current.setGames((current) => [...current, reAdded]);
  });
  assert.equal(handle.current.games.length, 2);

  // The delete toast is still up, so the user presses Undo expecting the old copy back.
  await actAsync(() => {
    handle.current.undoAction(undoActionFor(handle, 'delete-game').id);
  });

  // Documents unsafe current behavior: the snapshot predates the re-add, so the user now has
  // the ORIGINAL Game B back and the record they just typed in is gone — a net data loss.
  assert.deepEqual(handle.current.games.map((game) => game.id).sort(), ['game-a', 'game-b']);
  assert.equal(
    handle.current.games.some((game) => game.id === 'game-b-readded'),
    false,
    'the re-added game was destroyed by the undo',
  );

  await handle.unmount();
});

test('AS-04: every undo toast persists a full copy of the games collection to sessionStorage', async () => {
  resetWebStorage();
  const largeLibrary = Array.from({ length: 50 }, (_, index) =>
    makeLibraryGame({ id: `game-${index}`, title: `Game ${index}`, notes: 'x'.repeat(200) }),
  );
  const handle = await renderHook(useUndoHarness, largeLibrary);

  await actAsync(() => {
    handle.current.addUndoAction('A', { actionType: 'mark-playing', affectedGameIds: ['game-0'], description: 'a' });
  });

  const persisted = loadPendingUndoActions();
  assert.equal(persisted.length, 1);

  // Documents unsafe current behavior: the toast carries the whole library, not an inverse
  // patch, so sessionStorage cost scales with library size on every undoable action.
  assert.equal(persisted[0].snapshot.games.length, 50, 'the snapshot copied all 50 games');

  await handle.unmount();
});

test('AS-04: a sessionStorage quota failure is swallowed, so the undo is silently not persisted', async () => {
  resetWebStorage();
  const handle = await renderHook(useUndoHarness, [gameA, gameB]);

  // jsdom's Storage is a Proxy, so a direct `sessionStorage.setItem = ...` assignment is
  // ignored — patch the prototype, and only for the undo key.
  const undoStorageKey = 'questshelf.pendingUndoActions.v1';
  const storagePrototype = Object.getPrototypeOf(window.sessionStorage) as Storage;
  const originalSetItem = storagePrototype.setItem;
  storagePrototype.setItem = function patchedSetItem(this: Storage, key: string, value: string) {
    if (key === undoStorageKey) {
      throw new Error('QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  };

  try {
    // savePendingUndoActions catches and only console.warns.
    await actAsync(() => {
      handle.current.addUndoAction('A', { actionType: 'mark-playing', affectedGameIds: [gameA.id], description: 'a' });
    });

    // Documents unsafe current behavior: the in-memory toast still offers Undo...
    assert.equal(handle.current.pendingUndoActions.length, 1, 'the toast is shown as undoable');

    // ...but nothing was persisted, so the undo would not survive a reload, and the user was
    // never told.
    assert.deepEqual(loadPendingUndoActions(), [], 'the undo was never written to sessionStorage');
  } finally {
    storagePrototype.setItem = originalSetItem;
  }

  await handle.unmount();
});
