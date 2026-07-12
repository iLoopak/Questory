// AS-07: one canonical Game status transition, for every surface.
//
// The same user intent ("finish this game") used to run through a different implementation
// depending on where it was pressed. Library set `status` and nothing else, Quest Queue and the
// Platform Plans compact rows set `finishedAt`/`droppedAt`, and nobody cleared a stale terminal
// timestamp. The rolling completion achievement requires `status === 'Finished' && finishedAt >=
// cutoff` (`questShelfAchievements.ts`), so finishing from the Library literally did not count.
//
// This module is the single answer to "what does the game record look like after this status
// change". It is pure: no React, no persistence, no toasts, an injected clock, and it returns a
// NEW game rather than mutating one. Unknown/future fields are carried through untouched, so a
// record written by a newer build survives a transition applied by an older one.
//
// Cross-slice consequences (a game that starts being played must not also sit in a Plan backlog)
// are returned as EXPLICIT effects for the owning controller to apply. The transition never
// reaches into Platform Plans itself: Game and Plan remain separate entities.

import type { Game, GamePlatform, GameStatus } from '../types/game';

/** Which surface asked for the transition. Diagnostics/telemetry only — it must not change rules. */
export type StatusTransitionContext =
  | 'library'
  | 'game-detail'
  | 'plan'
  | 'review'
  | 'quick-action'
  | 'bulk';

export type StatusTransitionEffects = {
  /**
   * The game is now being played, so it must not remain in a planned backlog for the platform it
   * is being played on. This mirrors what the Plan owner already enforces for playing games; it is
   * surfaced here so every entry point requests it explicitly instead of some of them relying on a
   * side effect elsewhere.
   */
  removeFromPlanForPlatform: GamePlatform | null;
  /**
   * The game reached a terminal status (Finished/Dropped), so it is no longer planned work and its
   * Plan entries are dropped. The Platform Plans compact rows already did this; the Library and
   * Game Detail paths did not, which is how a finished game could sit in a Plan forever.
   */
  removeFromAllPlans: boolean;
  /** True when this transition ENTERED the status (not a repeat of one already held). */
  enteredPlaying: boolean;
  enteredFinished: boolean;
  enteredDropped: boolean;
};

export type StatusTransitionInput = {
  game: Game;
  nextStatus: GameStatus;
  /** Injected clock. Every timestamp this transition writes comes from here. */
  now: Date;
  context?: StatusTransitionContext;
  /**
   * The platform the game is played on, when the surface knows it (the Plans "play now" action
   * moves a game to a platform as it starts it). Defaults to the game's own platform.
   */
  platform?: GamePlatform;
  /**
   * Other fields the calling action changes in the same edit (notes, rating, platform…). Applied
   * on top of the transition, so a caller never has to hand-write a timestamp to get them in.
   */
  changes?: Partial<Game>;
};

export type StatusTransitionResult = {
  nextGame: Game;
  effects: StatusTransitionEffects;
};

/** `lastPlayedAt` is a local calendar date (YYYY-MM-DD), as every existing writer stored it. */
export function toPlayedDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The status/timestamp matrix. One rule per destination status, applied identically everywhere.
 *
 *   → Playing       lastPlayedAt = today, but only when the game was not ALREADY playing (so a
 *                   repeat is idempotent and cannot rewrite a real play date);
 *                   finishedAt and droppedAt cleared — a game you are playing is neither.
 *   → Finished      finishedAt = now, set only when entering Finished or when it is missing, so a
 *                   repeated finish cannot move a completion that already happened;
 *                   droppedAt cleared; lastPlayedAt untouched (only Playing writes it);
 *                   rating untouched — the completion rating sheet owns that, separately.
 *   → Dropped       droppedAt = now (same entering/missing rule); finishedAt cleared, so a dropped
 *                   game can never be counted as completed.
 *   → Want to play  both terminal timestamps cleared: the game is planned work again, and keeping
 *                   them would leave it counting as finished/dropped in the very selectors that
 *                   read those fields. `lastPlayedAt` is KEPT — it is play history, not a terminal
 *                   marker.
 *   → Paused        status only. A paused game keeps its play history and has no terminal
 *                   timestamps to hold; it is a non-terminal state that says nothing about
 *                   completion.
 */
export function transitionGameStatus({
  game,
  nextStatus,
  now,
  platform,
  changes = {},
}: StatusTransitionInput): StatusTransitionResult {
  const wasPlaying = game.status === 'Playing';
  const enteredPlaying = nextStatus === 'Playing' && !wasPlaying;
  const enteredFinished = nextStatus === 'Finished' && game.status !== 'Finished';
  const enteredDropped = nextStatus === 'Dropped' && game.status !== 'Dropped';

  // Start from the record as it is, so notes, rating, tags, metadata and any unknown/future field
  // written by a newer build are preserved by construction.
  const nextGame: Game = {
    ...game,
    ...changes,
    status: nextStatus,
    lastPlayedAt: resolveLastPlayedAt(game, nextStatus, now),
    finishedAt: resolveFinishedAt(game, nextStatus, now),
    droppedAt: resolveDroppedAt(game, nextStatus, now),
    updatedAt: now.toISOString(),
  };

  const playedOn = platform ?? nextGame.platform;

  return {
    nextGame,
    effects: {
      removeFromPlanForPlatform: nextStatus === 'Playing' ? playedOn : null,
      removeFromAllPlans: nextStatus === 'Finished' || nextStatus === 'Dropped',
      enteredPlaying,
      enteredFinished,
      enteredDropped,
    },
  };
}

function resolveLastPlayedAt(game: Game, nextStatus: GameStatus, now: Date): string | null {
  if (nextStatus !== 'Playing') {
    return game.lastPlayedAt;
  }

  // Entering Playing stamps today. Re-asserting Playing leaves the existing date alone, so a
  // repeated action is idempotent.
  return game.status === 'Playing' && game.lastPlayedAt ? game.lastPlayedAt : toPlayedDate(now);
}

function resolveFinishedAt(game: Game, nextStatus: GameStatus, now: Date): string | undefined {
  if (nextStatus === 'Finished') {
    return game.status === 'Finished' && game.finishedAt ? game.finishedAt : now.toISOString();
  }

  // Every other status is either non-terminal or the OTHER terminal one. In both cases a surviving
  // completion timestamp would be a lie — and one that `questShelfAchievements` reads.
  return undefined;
}

function resolveDroppedAt(game: Game, nextStatus: GameStatus, now: Date): string | undefined {
  if (nextStatus === 'Dropped') {
    return game.status === 'Dropped' && game.droppedAt ? game.droppedAt : now.toISOString();
  }

  return undefined;
}

/**
 * The same transition, for an edit that may or may not include a status change (Game Detail's form
 * save, a Quest Queue decision that also writes notes). When `changes` carries no status, the
 * record is updated without any timestamp rule firing — an edit is not a transition.
 */
export function applyGameChanges(
  game: Game,
  changes: Partial<Game>,
  now: Date,
  context?: StatusTransitionContext,
): StatusTransitionResult {
  if (!changes.status) {
    // No status in the edit: only `updatedAt` moves. Notably this does NOT stamp lastPlayedAt,
    // which some callers used to do by hand. An edit is not a transition.
    //
    // A status that is present but UNCHANGED still runs the transition below: it is idempotent by
    // construction, and it backfills a timestamp a legacy write left missing (a game marked
    // Finished by the old Library path has no `finishedAt` at all).
    return {
      nextGame: { ...game, ...changes, updatedAt: now.toISOString() },
      effects: {
        removeFromPlanForPlatform: null,
        removeFromAllPlans: false,
        enteredPlaying: false,
        enteredFinished: false,
        enteredDropped: false,
      },
    };
  }

  const { status, ...otherChanges } = changes;
  return transitionGameStatus({ game, nextStatus: status, now, context, changes: otherChanges });
}
