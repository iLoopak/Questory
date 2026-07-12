// AS-04: action-scoped undo.
//
// Undo used to be a whole-application rollback: every undoable action snapshotted games, ignored
// Steam ids, Platform Plans, review state and selection, and Undo restored all of it. Undoing an
// action that was still on screen therefore erased every unrelated change made since.
//
// An undo record is now a short list of INVERSE OPERATIONS scoped to what the action actually
// touched, each carrying its own expected-current-state guard. Two rules make it safe:
//
//   1. Nothing is written unless EVERY operation's guard still holds. A record is applied as a
//      unit or not at all, so a half-undo can never happen.
//   2. A guard only looks at the entity the action touched. Unrelated newer work is invisible to
//      it and therefore can neither be erased by the undo nor block it.
//
// When a guard fails the record is stale: the entity has been changed or removed since, so
// applying the inverse would overwrite work the user did later. The caller reports that instead.

import {
  removeGameFromPlatformQueue,
  restorePlatformQueueEntry,
  type PlatformQueueEntry,
  type PlatformQueueState,
} from './platformQueueStorage';
import type { ReviewDecision, ReviewModeState } from './reviewModeStorage';
import { addIgnoredSteamGame, removeIgnoredSteamGame, type IgnoredSteamGame } from './steamIgnoredGamesStorage';
import type { Game, GamePlatform } from '../types/game';

/** The slices an undo operation is allowed to touch. */
export type UndoableState = {
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
};

export type UndoOperation =
  /**
   * Inverse of a field edit (status change, move to Library, tag change…).
   *
   * `expected` holds the values the forward action WROTE. If the game no longer carries them,
   * something changed those same fields afterwards and the undo is stale. `previous` holds the
   * values to put back — only the fields the action actually changed, so a later edit to an
   * unrelated field on the same game survives the undo.
   */
  | { kind: 'game-fields'; gameId: string; previous: Partial<Game>; expected: Partial<Game> }
  /** Inverse of a deletion: put the before-image back. Stale if the id exists again. */
  | { kind: 'game-restore'; game: Game }
  /** Inverse of an addition: remove the record that was added. Stale if it is already gone. */
  | { kind: 'game-remove'; gameId: string }
  /** Inverse of un-ignoring a Steam game. */
  | { kind: 'ignored-steam-add'; entry: IgnoredSteamGame }
  /** Inverse of ignoring a Steam game. */
  | { kind: 'ignored-steam-remove'; steamAppId: number }
  /** Inverse of a Plan removal or a Plan move: put the entry back where it was. */
  | { kind: 'plan-entry-restore'; entry: PlatformQueueEntry }
  /** Inverse of a Plan addition. */
  | { kind: 'plan-entry-remove'; gameId: string; platform: GamePlatform }
  /** Inverse of a Quest Queue skip: put the game back at the position it was skipped from. */
  | { kind: 'review-queue-reinsert'; gameId: string; index: number }
  /** Inverse of marking a game reviewed (it left the queue and gained a reviewedGames entry). */
  | { kind: 'review-unreview'; gameId: string; index: number }
  /** Inverse of ignoring a game inside Quest Queue. */
  | { kind: 'review-unignore'; gameId: string }
  /** Inverse of the counters a review decision incremented. */
  | { kind: 'review-stats-decrement'; decisions: ReviewDecision[] };

export type UndoStaleReason =
  /** The entity the action touched no longer exists. */
  | 'missing'
  /** The entity exists but no longer carries what the action wrote — it was changed since. */
  | 'conflict';

export type UndoApplyResult =
  | { status: 'applied'; state: UndoableState }
  | { status: 'stale'; reason: UndoStaleReason; operation: UndoOperation };

/**
 * Apply an undo record to the current state.
 *
 * Pure: it returns the next state rather than mutating anything or reaching into storage, so the
 * whole undo contract is testable without React. Operations are applied in order against a
 * working copy, and the copy is only handed back if all of them succeed.
 */
export function applyUndoOperations(state: UndoableState, operations: UndoOperation[]): UndoApplyResult {
  let nextState = state;

  for (const operation of operations) {
    const result = applyUndoOperation(nextState, operation);
    if (result.status === 'stale') {
      return result;
    }
    nextState = result.state;
  }

  return { status: 'applied', state: nextState };
}

function applyUndoOperation(state: UndoableState, operation: UndoOperation): UndoApplyResult {
  switch (operation.kind) {
    case 'game-fields': {
      const game = state.games.find((currentGame) => currentGame.id === operation.gameId);
      if (!game) {
        return stale('missing', operation);
      }

      if (!matchesExpectedFields(game, operation.expected)) {
        return stale('conflict', operation);
      }

      return applied(state, {
        games: state.games.map((currentGame) =>
          currentGame.id === operation.gameId
            ? touch({ ...currentGame, ...operation.previous })
            : currentGame,
        ),
      });
    }

    case 'game-restore': {
      // The id exists again — the user re-added or re-imported it after the delete. Restoring the
      // before-image here would silently destroy that newer record.
      if (state.games.some((currentGame) => currentGame.id === operation.game.id)) {
        return stale('conflict', operation);
      }

      return applied(state, { games: [...state.games, touch(operation.game)] });
    }

    case 'game-remove': {
      if (!state.games.some((currentGame) => currentGame.id === operation.gameId)) {
        return stale('missing', operation);
      }

      // No field guard: the user asked to undo ADDING this record, and an edit they made to it in
      // the meantime is not a reason to keep a game they no longer want.
      return applied(state, { games: state.games.filter((currentGame) => currentGame.id !== operation.gameId) });
    }

    case 'ignored-steam-add': {
      return applied(state, {
        ignoredSteamGames: addIgnoredSteamGame(
          state.ignoredSteamGames,
          operation.entry.steamAppId,
          operation.entry.title,
        ),
      });
    }

    case 'ignored-steam-remove': {
      return applied(state, {
        ignoredSteamGames: removeIgnoredSteamGame(state.ignoredSteamGames, operation.steamAppId),
      });
    }

    case 'plan-entry-restore': {
      const { gameId, targetPlatform } = operation.entry;
      const existing = state.platformQueueState.entries.find(
        (entry) => entry.gameId === gameId && entry.targetPlatform === targetPlatform,
      );
      // The user put the game back on this platform themselves. Restoring the old entry would
      // overwrite the position/notes they just chose.
      if (existing) {
        return stale('conflict', operation);
      }

      return applied(state, {
        platformQueueState: restorePlatformQueueEntry(state.platformQueueState, operation.entry),
      });
    }

    case 'plan-entry-remove': {
      const existing = state.platformQueueState.entries.find(
        (entry) => entry.gameId === operation.gameId && entry.targetPlatform === operation.platform,
      );
      if (!existing) {
        return stale('missing', operation);
      }

      return applied(state, {
        platformQueueState: removeGameFromPlatformQueue(
          state.platformQueueState,
          operation.gameId,
          operation.platform,
        ),
      });
    }

    case 'review-queue-reinsert': {
      const { queueOrder } = state.reviewModeState;
      if (!queueOrder.includes(operation.gameId)) {
        return stale('missing', operation);
      }

      return applied(state, {
        reviewModeState: {
          ...state.reviewModeState,
          queueOrder: reinsertAt(
            queueOrder.filter((gameId) => gameId !== operation.gameId),
            operation.gameId,
            operation.index,
          ),
        },
      });
    }

    case 'review-unreview': {
      const { reviewedGames, queueOrder } = state.reviewModeState;
      if (!(operation.gameId in reviewedGames)) {
        return stale('conflict', operation);
      }

      const nextReviewedGames = { ...reviewedGames };
      delete nextReviewedGames[operation.gameId];

      return applied(state, {
        reviewModeState: {
          ...state.reviewModeState,
          queueOrder: queueOrder.includes(operation.gameId)
            ? queueOrder
            : reinsertAt(queueOrder, operation.gameId, operation.index),
          reviewedGames: nextReviewedGames,
        },
      });
    }

    case 'review-unignore': {
      return applied(state, {
        reviewModeState: {
          ...state.reviewModeState,
          ignoredGameIds: state.reviewModeState.ignoredGameIds.filter((gameId) => gameId !== operation.gameId),
        },
      });
    }

    case 'review-stats-decrement': {
      // Counters are never a reason to refuse an undo, and they never go below zero.
      const stats = { ...state.reviewModeState.stats };
      operation.decisions.forEach((decision) => {
        stats[decision] = Math.max(0, stats[decision] - 1);
      });

      return applied(state, { reviewModeState: { ...state.reviewModeState, stats } });
    }
  }
}

function applied(state: UndoableState, changes: Partial<UndoableState>): UndoApplyResult {
  return { status: 'applied', state: { ...state, ...changes } };
}

function stale(reason: UndoStaleReason, operation: UndoOperation): UndoApplyResult {
  return { status: 'stale', reason, operation };
}

/** Does the record still carry every value the forward action wrote? */
function matchesExpectedFields(game: Game, expected: Partial<Game>): boolean {
  return Object.entries(expected).every(([field, value]) =>
    isSameFieldValue((game as Record<string, unknown>)[field], value),
  );
}

function isSameFieldValue(current: unknown, expected: unknown): boolean {
  if (Array.isArray(current) && Array.isArray(expected)) {
    return current.length === expected.length && current.every((item, index) => item === expected[index]);
  }

  return current === expected;
}

function reinsertAt(list: string[], value: string, index: number): string[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

function touch(game: Game): Game {
  return { ...game, updatedAt: new Date().toISOString() };
}

/**
 * Inverse Plan operations, derived by diffing the Plan state a forward action produced against the
 * one it started from.
 *
 * Every Plan mutation (add, remove, move to another platform, play-now cleanup) goes through the
 * same `platformQueueStorage` functions, so diffing the entries is both simpler and safer than
 * hand-writing an inverse per action — a Plan entry the action did not touch produces no operation
 * and therefore cannot be disturbed by the undo.
 */
export function derivePlanUndoOperations(
  before: PlatformQueueState,
  after: PlatformQueueState,
): UndoOperation[] {
  const entryKey = (entry: PlatformQueueEntry) => `${entry.gameId}::${entry.targetPlatform}`;
  const afterEntries = new Map(after.entries.map((entry) => [entryKey(entry), entry]));
  const beforeEntries = new Map(before.entries.map((entry) => [entryKey(entry), entry]));
  const operations: UndoOperation[] = [];

  // Entries the action added: remove them again.
  after.entries.forEach((entry) => {
    if (!beforeEntries.has(entryKey(entry))) {
      operations.push({ kind: 'plan-entry-remove', gameId: entry.gameId, platform: entry.targetPlatform });
    }
  });

  // Entries the action removed: put the before-image back, position and notes included.
  before.entries.forEach((entry) => {
    if (!afterEntries.has(entryKey(entry))) {
      operations.push({ kind: 'plan-entry-restore', entry });
    }
  });

  return operations;
}
