/**
 * AS-07 — Status and Plan invariants depend on the entry point.
 *
 * "Finish a game" is implemented three times:
 *  - Library / Game Hub  → `useGameLibraryActions.updateGameStatus`      (no finishedAt)
 *  - Platform Plans      → `useQueueActions.updateCurrentlyPlayingGame`  (sets finishedAt)
 *  - Quest Queue review  → `useReviewModeActions.handleReviewAction`     (sets finishedAt)
 *
 * Achievements keyed on `finishedAt` therefore only count two of the three. Separately,
 * deleting a game filters `games` but leaves its Platform Plan entry behind, and the Plan
 * selectors do not exclude entries whose game is gone.
 *
 * These tests CHARACTERIZE the divergence; they do not centralize the transitions.
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

const { useGameLibraryActions } = await import('../src/hooks/useGameLibraryActions');
const { useQueueActions } = await import('../src/hooks/useQueueActions');
const { useReviewModeActions } = await import('../src/hooks/useReviewModeActions');
const { createTranslator } = await import('../src/i18n');
const {
  addGameToPlatformQueue,
  getQueueSummary,
  getVisiblePlatformQueueEntries,
  normalizePlatformQueueState,
} = await import('../src/lib/platformQueueStorage');
const { normalizeReviewModeState } = await import('../src/lib/reviewModeStorage');
const { getQuestShelfAchievements } = await import('../src/lib/questShelfAchievements');

const t = createTranslator('en');
const platform: GamePlatform = 'PC';

function playingGame(): Game {
  return makeLibraryGame({ id: 'game-1', title: 'The Game', platform, status: 'Playing' });
}

/** One harness wiring the three action hooks over shared React state, as AppController does. */
function useTransitionHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>([]);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() =>
    normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 3 }] }),
  );
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => normalizeReviewModeState(undefined));
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const noopUndo = () => {};

  const libraryActions = useGameLibraryActions({
    addUndoAction: noopUndo,
    games,
    setGames,
    setIgnoredSteamGames,
    setSelectedGameId,
    t,
  });

  const queueActions = useQueueActions({
    activeQueuePlatforms: [platform],
    addUndoAction: noopUndo,
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
    addUndoAction: noopUndo,
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
    games,
    platformQueueState,
    selectedGameId,
    libraryActions,
    queueActions,
    reviewActions,
    setPlatformQueueState,
  };
}

const findGame = (games: Game[], id = 'game-1') => games.find((game) => game.id === id);

// ── Finishing a game through each entry point ───────────────────────────────────────

test('AS-07: finishing through the Library path sets no finishedAt', async () => {
  resetWebStorage();
  const handle = await renderHook(useTransitionHarness, [playingGame()]);

  await actAsync(() => {
    handle.current.libraryActions.updateGameStatus('game-1', 'Finished');
  });

  const game = findGame(handle.current.games)!;
  assert.equal(game.status, 'Finished');
  // Documents unsafe current behavior: the completion timestamp everything else keys on is
  // never written, so this finish is invisible to history and achievements.
  assert.equal(game.finishedAt, undefined, 'the Library path does not record finishedAt');

  await handle.unmount();
});

test('AS-07: finishing through Platform Plans sets finishedAt', async () => {
  resetWebStorage();
  const handle = await renderHook(useTransitionHarness, [playingGame()]);

  await actAsync(() => {
    handle.current.queueActions.updateCurrentlyPlayingGame('game-1', platform, 'finished');
  });

  const game = findGame(handle.current.games)!;
  assert.equal(game.status, 'Finished');
  assert.ok(game.finishedAt, 'the Plans path records finishedAt');

  await handle.unmount();
});

test('AS-07: finishing through Quest Queue review sets finishedAt', async () => {
  resetWebStorage();
  const game = playingGame();
  const handle = await renderHook(useTransitionHarness, [game]);

  await actAsync(() => {
    handle.current.reviewActions.handleReviewAction(game, 'finished');
  });

  const updated = findGame(handle.current.games)!;
  assert.equal(updated.status, 'Finished');
  assert.ok(updated.finishedAt, 'the review path records finishedAt');

  await handle.unmount();
});

test('AS-07: dropping sets droppedAt from Plans and review, but not from the Library path', async () => {
  resetWebStorage();

  const libraryHandle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => {
    libraryHandle.current.libraryActions.updateGameStatus('game-1', 'Dropped');
  });
  const fromLibrary = findGame(libraryHandle.current.games)!;
  assert.equal(fromLibrary.status, 'Dropped');
  // Documents unsafe current behavior.
  assert.equal(fromLibrary.droppedAt, undefined, 'the Library path does not record droppedAt');
  await libraryHandle.unmount();

  const queueHandle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => {
    queueHandle.current.queueActions.updateCurrentlyPlayingGame('game-1', platform, 'drop');
  });
  assert.ok(findGame(queueHandle.current.games)!.droppedAt, 'the Plans path records droppedAt');
  await queueHandle.unmount();

  const reviewGame = playingGame();
  const reviewHandle = await renderHook(useTransitionHarness, [reviewGame]);
  await actAsync(() => {
    reviewHandle.current.reviewActions.handleReviewAction(reviewGame, 'dropped');
  });
  assert.ok(findGame(reviewHandle.current.games)!.droppedAt, 'the review path records droppedAt');
  await reviewHandle.unmount();
});

test('AS-07: only the Library path touches lastPlayedAt when marking Playing', async () => {
  resetWebStorage();
  const wantToPlay = makeLibraryGame({ id: 'game-1', title: 'The Game', platform, status: 'Want to play' });
  const handle = await renderHook(useTransitionHarness, [wantToPlay]);

  await actAsync(() => {
    handle.current.libraryActions.updateGameStatus('game-1', 'Playing');
  });

  const game = findGame(handle.current.games)!;
  assert.equal(game.status, 'Playing');
  assert.equal(game.lastPlayedAt, new Date().toISOString().slice(0, 10), 'lastPlayedAt is stamped');
  // ...but the completion timestamps still are not managed here at all.
  assert.equal(game.finishedAt, undefined);

  await handle.unmount();
});

// ── The achievement consequence ─────────────────────────────────────────────────────

test('AS-07: a game finished from the Library does not count toward the finishedAt achievement', async () => {
  resetWebStorage();

  const libraryHandle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => {
    libraryHandle.current.libraryActions.updateGameStatus('game-1', 'Finished');
  });
  const libraryGames = libraryHandle.current.games;
  await libraryHandle.unmount();

  const queueHandle = await renderHook(useTransitionHarness, [playingGame()]);
  await actAsync(() => {
    queueHandle.current.queueActions.updateCurrentlyPlayingGame('game-1', platform, 'finished');
  });
  const queueGames = queueHandle.current.games;
  await queueHandle.unmount();

  const progressFor = (games: Game[]) =>
    getQuestShelfAchievements(games).find((achievement) => achievement.id === 'backlog-slayer-burst')?.current ?? -1;

  // Documents unsafe current behavior: the exact same user action ("I finished this game")
  // counts toward the rolling 30-day achievement from Plans/Review but not from the Library.
  assert.equal(progressFor(queueGames), 1, 'finishing in Plans counts');
  assert.equal(progressFor(libraryGames), 0, 'finishing in the Library does not count');

  // Both are genuinely Finished — only the timestamp differs.
  assert.equal(findGame(libraryGames)!.status, 'Finished');
  assert.equal(findGame(queueGames)!.status, 'Finished');
});

// ── Orphaned Platform Plan entries ──────────────────────────────────────────────────

test('AS-07: deleting a game leaves its Platform Plan entry behind', async () => {
  resetWebStorage();
  const game = makeLibraryGame({ id: 'game-1', title: 'The Game', platform, status: 'Want to play' });
  const handle = await renderHook(useTransitionHarness, [game]);

  await actAsync(() => {
    handle.current.queueActions.addGameToQueue(game, platform);
  });
  assert.equal(handle.current.platformQueueState.entries.length, 1, 'the game is planned');

  await actAsync(() => {
    handle.current.libraryActions.removeGame('game-1');
  });

  // Documents unsafe current behavior: removeGame only filters `games`, so the Plan entry
  // survives, now pointing at a game that no longer exists.
  assert.deepEqual(handle.current.games, [], 'the game is gone');
  assert.equal(handle.current.platformQueueState.entries.length, 1, 'the orphaned Plan entry remains');
  assert.equal(handle.current.platformQueueState.entries[0].gameId, 'game-1');

  await handle.unmount();
});

test('AS-07: orphaned Plan entries are still counted and rendered by the Plan selectors', () => {
  const survivingGame = makeLibraryGame({ id: 'kept', title: 'Kept Game', platform, status: 'Want to play' });
  const deletedGame = makeLibraryGame({ id: 'deleted', title: 'Deleted Game', platform, status: 'Want to play' });

  let state = normalizePlatformQueueState({ entries: [], settings: [{ platform, maxActiveGames: 5 }] });
  state = addGameToPlatformQueue(state, survivingGame, platform);
  state = addGameToPlatformQueue(state, deletedGame, platform);

  // The user deletes one of the two planned games.
  const games = [survivingGame];

  const visible = getVisiblePlatformQueueEntries(state, games);
  const summary = getQueueSummary(state, games);

  // Documents unsafe current behavior: the selectors filter only by "currently playing", never
  // by "does this game still exist", so the Plan reports 2 items. QueuePanel then renders null
  // for the missing one — a phantom count and a blank row.
  assert.equal(visible.length, 2, 'the orphaned entry is still visible');
  assert.equal(summary.queuedCount, 2, 'and still counted in the Plan summary');
  assert.equal(
    visible.filter((entry) => !games.some((game) => game.id === entry.gameId)).length,
    1,
    'one visible entry has no backing game',
  );
});
