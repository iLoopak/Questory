/**
 * AS-07 — Status transitions and Plan invariants are the same from every surface.
 *
 * "Finish a game" used to be implemented three times:
 *  - Library / Game Hub  → `useGameLibraryActions.updateGameStatus`      (no finishedAt at all)
 *  - Platform Plans      → `useQueueActions.updateCurrentlyPlayingGame`  (set finishedAt)
 *  - Quest Queue review  → `useReviewModeActions.handleReviewAction`     (set finishedAt by hand)
 *
 * The rolling completion achievement needs `status === 'Finished' && finishedAt >= cutoff`, so
 * finishing from the Library did not count. Separately, deleting a game left its Plan entry behind
 * and the Plan selectors still counted and virtualized it — a phantom count and a blank row.
 *
 * These began as characterization tests for that divergence (PR #650). They now assert the
 * contract: one canonical transition (`lib/gameStatusTransitions`), one set of Plan selectors.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import type { Game, GamePlatform, GameStatus } from '../src/types/game';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { ReviewModeState } from '../src/lib/reviewModeStorage';
import type { IgnoredSteamGame } from '../src/lib/steamIgnoredGamesStorage';
import type { StatusTransitionEffects } from '../src/lib/gameStatusTransitions';
import type { UndoOperation } from '../src/lib/undoOperations';

assertTestEnvironment();

const { useGameLibraryActions } = await import('../src/hooks/useGameLibraryActions');
const { useQueueActions } = await import('../src/hooks/useQueueActions');
const { useSliceCommands } = await import('../src/features/app/useSliceCommands');
const { useReviewModeActions } = await import('../src/hooks/useReviewModeActions');
const { useQuestShelfNotifications } = await import('../src/hooks/useQuestShelfNotifications');
const { createTranslator } = await import('../src/i18n');
const {
  addGameToPlatformQueue,
  getOrphanedPlatformQueueEntries,
  getPlatformQueueEntryCounts,
  getQueueSummary,
  getVisiblePlatformQueueEntries,
  normalizePlatformQueueState,
  removeGameFromPlatformQueue,
} = await import('../src/lib/platformQueueStorage');
const { normalizeReviewModeState } = await import('../src/lib/reviewModeStorage');
const { getQuestShelfAchievements } = await import('../src/lib/questShelfAchievements');
const { transitionGameStatus, applyGameChanges } = await import('../src/lib/gameStatusTransitions');
const { derivePlanUndoOperations } = await import('../src/lib/undoOperations');

const t = createTranslator('en');
const platform: GamePlatform = 'PC';

/** A fixed clock: every timestamp rule is asserted against it, never against wall time. */
const clock = new Date('2026-07-10T09:00:00.000Z');
const clockDate = '2026-07-10';

const baseGame = (overrides: Partial<Game> = {}): Game =>
  makeLibraryGame({ id: 'game-1', title: 'The Game', platform, status: 'Want to play', ...overrides });
const playingGame = () => baseGame({ status: 'Playing' });

// ════════════════════════════════════════════════════════════════════════════════════
// The pure transition: the full status/timestamp matrix
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-07: entering Playing stamps lastPlayedAt and clears both terminal timestamps', () => {
  const game = baseGame({
    status: 'Finished',
    finishedAt: '2026-01-01T00:00:00.000Z',
    droppedAt: '2026-02-01T00:00:00.000Z',
    lastPlayedAt: '2025-12-01',
    rating: 4,
    notes: 'keep me',
  });

  const { nextGame } = transitionGameStatus({ game, nextStatus: 'Playing', now: clock });

  assert.equal(nextGame.status, 'Playing');
  assert.equal(nextGame.lastPlayedAt, clockDate, 'the injected clock, not wall time');
  assert.equal(nextGame.finishedAt, undefined, 'a game you are playing is not finished');
  assert.equal(nextGame.droppedAt, undefined, 'nor dropped');
  assert.equal(nextGame.rating, 4, 'rating survives');
  assert.equal(nextGame.notes, 'keep me', 'and so does everything else');
});

test('AS-07: re-asserting Playing is idempotent — it does not rewrite the play date', () => {
  const game = baseGame({ status: 'Playing', lastPlayedAt: '2026-06-01' });

  const { nextGame, effects } = transitionGameStatus({ game, nextStatus: 'Playing', now: clock });

  assert.equal(nextGame.lastPlayedAt, '2026-06-01', 'a real play date is not overwritten by a repeat');
  assert.equal(effects.enteredPlaying, false);
});

test('AS-07: entering Finished stamps finishedAt, clears droppedAt, and leaves lastPlayedAt alone', () => {
  const game = baseGame({
    status: 'Playing',
    lastPlayedAt: '2026-06-05',
    droppedAt: '2026-02-01T00:00:00.000Z',
    rating: 5,
  });

  const { nextGame, effects } = transitionGameStatus({ game, nextStatus: 'Finished', now: clock });

  assert.equal(nextGame.status, 'Finished');
  assert.equal(nextGame.finishedAt, clock.toISOString());
  assert.equal(nextGame.droppedAt, undefined, 'a finished game is not also dropped');
  assert.equal(nextGame.lastPlayedAt, '2026-06-05', 'only Playing writes the play date');
  assert.equal(nextGame.rating, 5, 'the completion rating sheet owns the rating, not the transition');
  assert.equal(effects.enteredFinished, true);
});

test('AS-07: re-finishing does not move a completion that already happened', () => {
  const game = baseGame({ status: 'Finished', finishedAt: '2026-03-03T00:00:00.000Z' });

  const { nextGame, effects } = transitionGameStatus({ game, nextStatus: 'Finished', now: clock });

  assert.equal(nextGame.finishedAt, '2026-03-03T00:00:00.000Z', 'completion history stays put');
  assert.equal(effects.enteredFinished, false);
});

test('AS-07: a Finished game missing its finishedAt (a legacy Library write) is backfilled', () => {
  const game = baseGame({ status: 'Finished', finishedAt: undefined });

  const { nextGame } = transitionGameStatus({ game, nextStatus: 'Finished', now: clock });

  assert.equal(nextGame.finishedAt, clock.toISOString(), 'the record the old path could not write is repaired');
});

test('AS-07: entering Dropped stamps droppedAt and clears finishedAt', () => {
  const game = baseGame({ status: 'Playing', finishedAt: '2026-01-01T00:00:00.000Z' });

  const { nextGame, effects } = transitionGameStatus({ game, nextStatus: 'Dropped', now: clock });

  assert.equal(nextGame.status, 'Dropped');
  assert.equal(nextGame.droppedAt, clock.toISOString());
  assert.equal(nextGame.finishedAt, undefined, 'a dropped game must never count as completed');
  assert.equal(effects.enteredDropped, true);
});

test('AS-07: returning to Want to play clears both terminal timestamps but keeps play history', () => {
  const game = baseGame({
    status: 'Finished',
    finishedAt: '2026-01-01T00:00:00.000Z',
    droppedAt: '2026-02-01T00:00:00.000Z',
    lastPlayedAt: '2026-06-01',
  });

  const { nextGame } = transitionGameStatus({ game, nextStatus: 'Want to play', now: clock });

  assert.equal(nextGame.status, 'Want to play');
  assert.equal(nextGame.finishedAt, undefined, 'planned work is not finished work');
  assert.equal(nextGame.droppedAt, undefined);
  assert.equal(nextGame.lastPlayedAt, '2026-06-01', 'lastPlayedAt is history, not a terminal marker');
});

test('AS-07: Paused keeps play history and carries no terminal timestamps', () => {
  const game = baseGame({ status: 'Playing', lastPlayedAt: '2026-06-01', finishedAt: '2026-01-01T00:00:00.000Z' });

  const { nextGame } = transitionGameStatus({ game, nextStatus: 'Paused', now: clock });

  assert.equal(nextGame.status, 'Paused');
  assert.equal(nextGame.lastPlayedAt, '2026-06-01');
  assert.equal(nextGame.finishedAt, undefined);
  assert.equal(nextGame.droppedAt, undefined);
});

test('AS-07: the transition is pure and preserves unknown/future fields', () => {
  const game = { ...baseGame(), futureField: { some: 'value' } } as unknown as Game;
  const snapshot = JSON.stringify(game);

  const { nextGame } = transitionGameStatus({ game, nextStatus: 'Finished', now: clock });

  assert.equal(JSON.stringify(game), snapshot, 'the input was not mutated');
  assert.deepEqual((nextGame as unknown as Record<string, unknown>).futureField, { some: 'value' });
});

test('AS-07: an edit with no status change fires no timestamp rule', () => {
  const game = baseGame({ status: 'Want to play', lastPlayedAt: null });

  const { nextGame, effects } = applyGameChanges(game, { notes: 'just a note' }, clock);

  assert.equal(nextGame.notes, 'just a note');
  assert.equal(nextGame.status, 'Want to play');
  assert.equal(nextGame.lastPlayedAt, null, 'an edit is not a transition');
  assert.equal(effects.removeFromAllPlans, false);
});

// ════════════════════════════════════════════════════════════════════════════════════
// Entry-point parity, through the real hooks
// ════════════════════════════════════════════════════════════════════════════════════

/** One harness wiring the action hooks over shared React state, as AppController does. */
function useTransitionHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>([]);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() =>
    normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3 }] }),
  );
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => normalizeReviewModeState(undefined));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  // The same command boundary AppController owns: one pure transition per action, applied here.
  const commands = useSliceCommands({ games, platformQueueState, setGames, setPlatformQueueState });

  const notifications = useQuestShelfNotifications({
    activeNavItem: 'Library',
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    staleUndoMessage: t('toast.undoUnavailable'),
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
  });

  // The same cross-slice application AppController performs: the transition says what must happen
  // to the Plans, the Plan owner does it and returns the undo operations.
  function applyStatusPlanEffects(game: Game, effects: StatusTransitionEffects): UndoOperation[] {
    if (!effects.removeFromAllPlans && !effects.removeFromPlanForPlatform) {
      return [];
    }

    const nextState = effects.removeFromAllPlans
      ? removeGameFromPlatformQueue(platformQueueState, game.id)
      : removeGameFromPlatformQueue(platformQueueState, game.id, effects.removeFromPlanForPlatform ?? undefined);

    if (nextState.entries.length === platformQueueState.entries.length) {
      return [];
    }

    const operations = derivePlanUndoOperations(platformQueueState, nextState);
    setPlatformQueueState(nextState);
    return operations;
  }

  const libraryActions = useGameLibraryActions({
    addUndoAction: notifications.addUndoAction,
    applyStatusPlanEffects,
    games,
    setGames,
    setIgnoredSteamGames,
    setSelectedGameId,
    t,
  });

  const queueActions = useQueueActions({
    activeQueuePlatforms: [platform],
    addUndoAction: notifications.addUndoAction,
    markOnboardingItemComplete: () => {},
    runCrossSliceCommand: commands.runCrossSliceCommand,
    runPlanCommand: commands.runPlanCommand,
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

  return {
    ...notifications,
    games,
    platformQueueState,
    selectedGameId,
    libraryActions,
    queueActions,
    reviewActions,
    setPlatformQueueState,
  };
}

type Harness = { current: ReturnType<typeof useTransitionHarness>; unmount: () => Promise<void> };
const findGame = (games: Game[], id = 'game-1') => games.find((game) => game.id === id)!;

/** The canonical fields a status transition owns. Parity means these agree, whatever the surface. */
const canonicalFields = (game: Game) => ({
  status: game.status,
  hasFinishedAt: Boolean(game.finishedAt),
  hasDroppedAt: Boolean(game.droppedAt),
  lastPlayedAt: game.lastPlayedAt,
  rating: game.rating,
  notes: game.notes,
});

test('AS-07: finishing from the Library, Game Detail, Plans and Review produces the same record', async () => {
  const results: Array<ReturnType<typeof canonicalFields>> = [];

  // Library (a status button on a card).
  resetWebStorage();
  let handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Finished'));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  // Game Detail (the form save path).
  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.libraryActions.updateGameTracking('game-1', { status: 'Finished' }));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  // Platform Plans (the compact row's Finish button).
  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.queueActions.finishGameFromCompactRow(playingGame()));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  // Quest Queue review.
  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.reviewActions.handleReviewAction(playingGame(), 'finished'));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  // Every surface, one record. The Library used to be the odd one out, with no finishedAt at all.
  results.forEach((result, index) => {
    assert.deepEqual(result, results[0], `entry point ${index} diverged: ${JSON.stringify(result)}`);
  });
  assert.equal(results[0].status, 'Finished');
  assert.equal(results[0].hasFinishedAt, true, 'and every one of them records the completion');
  assert.equal(results[0].hasDroppedAt, false);
});

test('AS-07: dropping from the Library, Plans and Review produces the same record', async () => {
  const results: Array<ReturnType<typeof canonicalFields>> = [];

  resetWebStorage();
  let handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Dropped'));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.queueActions.dropGameFromCompactRow(playingGame()));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => handle.current.reviewActions.handleReviewAction(playingGame(), 'dropped'));
  results.push(canonicalFields(findGame(handle.current.games)));
  await handle.unmount();

  results.forEach((result, index) => {
    assert.deepEqual(result, results[0], `entry point ${index} diverged`);
  });
  assert.equal(results[0].status, 'Dropped');
  assert.equal(results[0].hasDroppedAt, true);
  assert.equal(results[0].hasFinishedAt, false, 'a dropped game is never a completed one');
});

test('AS-07: marking Playing from the Library and from Game Detail agrees on lastPlayedAt', async () => {
  const today = new Date().toISOString().slice(0, 10);

  resetWebStorage();
  let handle: Harness = await renderHook(useTransitionHarness, [baseGame()]);
  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Playing'));
  const fromLibrary = canonicalFields(findGame(handle.current.games));
  await handle.unmount();

  resetWebStorage();
  handle = await renderHook(useTransitionHarness, [baseGame()]);
  await actAsync(() => handle.current.libraryActions.updateGameTracking('game-1', { status: 'Playing' }));
  const fromDetail = canonicalFields(findGame(handle.current.games));
  await handle.unmount();

  assert.deepEqual(fromLibrary, fromDetail);
  assert.equal(fromLibrary.lastPlayedAt, today);
});

// ── Achievements ────────────────────────────────────────────────────────────────────

/** The rolling 30-day completion achievement: `status === 'Finished' && finishedAt >= cutoff`. */
const finishedInWindow = (games: Game[]) => {
  const achievements = getQuestShelfAchievements(games, normalizePlatformQueueState(undefined));
  const rolling = achievements.find((achievement) => achievement.id === 'backlog-slayer-burst');
  return rolling ? rolling.current : null;
};

test('AS-07: finishing through any entry point contributes identically to achievements', async () => {
  const progressBySurface: Array<number | null> = [];

  for (const finish of ['library', 'plans', 'review'] as const) {
    resetWebStorage();
    const handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);

    await actAsync(() => {
      if (finish === 'library') handle.current.libraryActions.updateGameStatus('game-1', 'Finished');
      if (finish === 'plans') handle.current.queueActions.finishGameFromCompactRow(playingGame());
      if (finish === 'review') handle.current.reviewActions.handleReviewAction(playingGame(), 'finished');
    });

    progressBySurface.push(finishedInWindow(handle.current.games));
    await handle.unmount();
  }

  // The Library finish used to contribute 0 while the other two contributed 1.
  assert.ok(progressBySurface[0] !== null, 'the rolling completion achievement exists');
  assert.equal(progressBySurface[0], 1, 'finishing in the Library counts');
  assert.deepEqual(progressBySurface, [progressBySurface[0], progressBySurface[0], progressBySurface[0]]);
});

test('AS-07: a dropped game is not counted as finished, wherever it was dropped', async () => {
  resetWebStorage();
  const handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Dropped'));

  assert.equal(finishedInWindow(handle.current.games), 0);
  assert.equal(findGame(handle.current.games).finishedAt, undefined);

  await handle.unmount();
});

test('AS-07: finishing a game twice does not produce a second, inconsistent completion', async () => {
  resetWebStorage();
  const handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Finished'));
  const firstFinishedAt = findGame(handle.current.games).finishedAt;

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Finished'));

  assert.equal(findGame(handle.current.games).finishedAt, firstFinishedAt, 'the completion did not move');
  assert.equal(finishedInWindow(handle.current.games), 1, 'and it is still counted exactly once');

  await handle.unmount();
});

// ════════════════════════════════════════════════════════════════════════════════════
// Game versus Plan
// ════════════════════════════════════════════════════════════════════════════════════

const planIds = (handle: Harness) => handle.current.platformQueueState.entries.map((entry) => entry.gameId);

test('AS-07: a planned game marked Playing leaves the Plan backlog', async () => {
  resetWebStorage();
  const game = baseGame();
  const handle: Harness = await renderHook(useTransitionHarness, [game]);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) => addGameToPlatformQueue(current, game, platform));
  });
  assert.deepEqual(planIds(handle), ['game-1']);

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Playing'));

  assert.deepEqual(planIds(handle), [], 'a game being played is not also planned work');
  assert.equal(findGame(handle.current.games).status, 'Playing');

  await handle.unmount();
});

test('AS-07: a planned game marked Finished or Dropped leaves the Plan, from any surface', async () => {
  for (const status of ['Finished', 'Dropped'] as GameStatus[]) {
    resetWebStorage();
    const game = baseGame();
    const handle: Harness = await renderHook(useTransitionHarness, [game]);

    await actAsync(() => {
      handle.current.setPlatformQueueState((current) => addGameToPlatformQueue(current, game, platform));
    });

    // The Library path used to leave the entry behind, so a finished game sat in the Plan forever.
    await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', status));

    assert.deepEqual(planIds(handle), [], `${status} is terminal: it is no longer planned work`);
    await handle.unmount();
  }
});

test('AS-07: moving a played game back to the backlog re-plans it (the one add case)', async () => {
  resetWebStorage();
  const handle: Harness = await renderHook(useTransitionHarness, [playingGame()]);

  await actAsync(() =>
    handle.current.queueActions.updateCurrentlyPlayingGame('game-1', platform, 'move-to-backlog'),
  );

  assert.deepEqual(planIds(handle), ['game-1'], 'it becomes planned work again');
  assert.equal(findGame(handle.current.games).status, 'Want to play');
  assert.equal(findGame(handle.current.games).finishedAt, undefined);

  await handle.unmount();
});

test('AS-07: a status change outside Plans does not disturb OTHER games\' Plan entries', async () => {
  resetWebStorage();
  const game = baseGame();
  const other = makeLibraryGame({ id: 'game-2', title: 'Other', platform, status: 'Want to play' });
  const handle: Harness = await renderHook(useTransitionHarness, [game, other]);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) =>
      addGameToPlatformQueue(addGameToPlatformQueue(current, game, platform), other, platform),
    );
  });

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Finished'));

  assert.deepEqual(planIds(handle), ['game-2'], 'only the transitioned game left the Plan');

  await handle.unmount();
});

// ── Orphaned Plan entries ───────────────────────────────────────────────────────────

test('AS-07: deleting a game leaves its Plan entry persisted, but invisible', async () => {
  resetWebStorage();
  const game = baseGame();
  const other = makeLibraryGame({ id: 'game-2', title: 'Other', platform, status: 'Want to play' });
  const handle: Harness = await renderHook(useTransitionHarness, [game, other]);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) =>
      addGameToPlatformQueue(addGameToPlatformQueue(current, game, platform), other, platform),
    );
  });

  await actAsync(() => handle.current.libraryActions.removeGame('game-1'));

  // The entry is still persisted — deleting a game does not silently rewrite Plan storage, and the
  // entry is what makes an undo of the delete restore the game's Plan position.
  assert.deepEqual(planIds(handle).sort(), ['game-1', 'game-2'], 'the record survives for recovery');

  // But it is not visible anywhere: no phantom count, no blank virtualized row.
  const { games, platformQueueState } = handle.current;
  assert.deepEqual(
    getVisiblePlatformQueueEntries(platformQueueState, games).map((entry) => entry.gameId),
    ['game-2'],
  );
  assert.equal(getQueueSummary(platformQueueState, games).queuedCount, 1, 'the count excludes it');
  assert.deepEqual(
    getQueueSummary(platformQueueState, games).platformSizes,
    [{ platform, count: 1 }],
    'and so does the per-platform size that drives the limits',
  );

  await handle.unmount();
});

test('AS-07: orphaned entries are reportable, and separated from visible and persisted counts', () => {
  const game = baseGame();
  const state = addGameToPlatformQueue(
    addGameToPlatformQueue(normalizePlatformQueueState(undefined), game, platform),
    makeLibraryGame({ id: 'ghost', title: 'Deleted', platform }),
    platform,
  );

  // Only `game-1` still exists in the collection.
  const counts = getPlatformQueueEntryCounts(state, [game]);

  assert.deepEqual(counts, { persisted: 2, visible: 1, orphaned: 1 });
  assert.deepEqual(
    getOrphanedPlatformQueueEntries(state, [game]).map((entry) => entry.gameId),
    ['ghost'],
    'the missing reference is observable rather than silently swallowed',
  );

  // Nothing was deleted by asking.
  assert.equal(state.entries.length, 2, 'a selector never mutates persisted state');
});

test('AS-07: an orphaned entry becomes visible again if its game comes back', () => {
  const game = baseGame();
  const state = addGameToPlatformQueue(normalizePlatformQueueState(undefined), game, platform);

  assert.equal(getVisiblePlatformQueueEntries(state, []).length, 0, 'invisible while the game is gone');
  assert.equal(getVisiblePlatformQueueEntries(state, [game]).length, 1, 'and back when it is restored');
});

// ── Undo ────────────────────────────────────────────────────────────────────────────

test('AS-07: undoing a status change restores the timestamps and the Plan entry it removed', async () => {
  resetWebStorage();
  const game = baseGame({ lastPlayedAt: '2026-05-01' });
  const other = makeLibraryGame({ id: 'game-2', title: 'Other', platform, status: 'Want to play' });
  const handle: Harness = await renderHook(useTransitionHarness, [game, other]);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) =>
      addGameToPlatformQueue(addGameToPlatformQueue(current, game, platform), other, platform),
    );
  });

  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-1', 'Finished'));
  assert.equal(findGame(handle.current.games).status, 'Finished');
  assert.deepEqual(planIds(handle), ['game-2']);

  // Unrelated later work, while the toast is still up.
  await actAsync(() => handle.current.libraryActions.updateGameStatus('game-2', 'Playing'));

  const toast = handle.current.pendingUndoActions.find(
    (action) => action.historyEntry.affectedGameIds.includes('game-1'),
  )!;
  await actAsync(() => handle.current.undoAction(toast.id));

  const restored = findGame(handle.current.games);
  assert.equal(restored.status, 'Want to play', 'the status went back');
  assert.equal(restored.finishedAt, undefined, 'and so did the timestamp the transition wrote');
  assert.equal(restored.lastPlayedAt, '2026-05-01', 'while real history was left alone');
  assert.ok(planIds(handle).includes('game-1'), 'the Plan entry the transition removed came back');

  // The unrelated newer action survived.
  assert.equal(findGame(handle.current.games, 'game-2').status, 'Playing');

  await handle.unmount();
});
