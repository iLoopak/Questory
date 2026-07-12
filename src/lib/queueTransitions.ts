// AS-14: the Plan actions, as pure cross-slice transitions.
//
// A Plan action usually touches two slices — the Platform Plan entries and the games themselves (a
// platform tag, or a status change). Those two writes used to be issued from different places, one
// of them from inside the other's updater, with a mutable summary accumulating on the side. Each
// action is now one function of (games, plan) returning (nextGames, nextPlan, result), so the undo
// operations, the summary and the two state writes are all derived from the same computation and
// cannot disagree with each other.
//
// The Plan rules themselves are unchanged: `platformQueueStorage` remains the only module that knows
// how a Plan entry is added, moved or removed, and `gameStatusTransitions` remains the only module
// that decides what a status change does.

import {
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  getPlatformTag,
  moveQueueEntryToPlatform,
  removeCurrentlyPlayingFromPlatformQueue,
  removeGameFromPlatformQueue,
  type PlatformQueueState,
} from './platformQueueStorage';
import { transitionGameStatus, type StatusTransitionEffects } from './gameStatusTransitions';
import { derivePlanUndoOperations, type UndoOperation } from './undoOperations';
import type { CrossSliceTransitionResult } from './stateTransition';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import type { PlayingGameAction } from '../types/gameActions';

/** Every Plan transition reports the undo operations that invert exactly what it changed. */
type PlanActionResult = {
  operations: UndoOperation[];
};

/** What a batch Plan addition actually did, so the caller can report it honestly. */
export type AddGamesToQueueSummary = {
  addedCount: number;
  alreadyInPlanCount: number;
  /** Games already being played on the target platform: a Plan entry would be stripped anyway. */
  skippedPlayingCount: number;
  platform: GamePlatform;
};

export type AddGamesToQueueResult = PlanActionResult & {
  summary: AddGamesToQueueSummary;
  addedGames: Game[];
};

export type StatusPlanActionResult = PlanActionResult & {
  /** The game as it now stands, for the toast and for the caller's own bookkeeping. */
  nextGame: Game;
};

export type RemoveQueueGameResult = PlanActionResult & {
  /** Null when the game had no entry on that platform — the action is then a no-op. */
  removedEntry: { targetPlatform: GamePlatform; queuePosition: number } | null;
  game: Game | null;
};

export type MoveQueueGameResult = PlanActionResult & {
  movedFromPlatform: GamePlatform | null;
  game: Game | null;
};

function touchGameRecord(game: Game): Game {
  return { ...game, updatedAt: new Date().toISOString() };
}

/** Add the platform's tag to a game, if it has one and does not already carry it. */
function applyPlatformTag(games: Game[], gameId: string, platformTag: string): { nextGames: Game[]; operations: UndoOperation[] } {
  const game = games.find((currentGame) => currentGame.id === gameId);
  if (!game || !platformTag || game.tags.includes(platformTag)) {
    return { nextGames: games, operations: [] };
  }

  const nextTags = Array.from(new Set([...game.tags, platformTag]));
  return {
    nextGames: games.map((currentGame) => (currentGame.id === gameId ? touchGameRecord({ ...currentGame, tags: nextTags }) : currentGame)),
    operations: [{ kind: 'game-fields', gameId, previous: { tags: game.tags }, expected: { tags: nextTags } }],
  };
}

/** The Plan half of a status transition, applied by the owner of Plan state (AS-07). */
function planStateForEffects(state: PlatformQueueState, gameId: string, effects: StatusTransitionEffects): PlatformQueueState {
  if (effects.removeFromAllPlans) {
    return removeGameFromPlatformQueue(state, gameId);
  }
  if (effects.removeFromPlanForPlatform) {
    return removeGameFromPlatformQueue(state, gameId, effects.removeFromPlanForPlatform);
  }
  return state;
}

/** The fields a status transition owns, so the undo guard and inverse cover exactly what it wrote. */
function statusFields(game: Game, nextGame: Game, extra: Array<keyof Game> = []): UndoOperation {
  const fields: Array<keyof Game> = ['status', 'lastPlayedAt', 'finishedAt', 'droppedAt', ...extra];
  const pick = (source: Game) =>
    fields.reduce<Partial<Game>>((picked, field) => {
      (picked as Record<string, unknown>)[field as string] = source[field];
      return picked;
    }, {});

  return { kind: 'game-fields', gameId: game.id, previous: pick(game), expected: pick(nextGame) };
}

export function addGameToQueueTransition(
  games: Game[],
  plan: PlatformQueueState,
  game: Game,
  platform: GamePlatform,
): CrossSliceTransitionResult<PlanActionResult> {
  // A game already being played on this platform has no Plan entry by design, so "add to Plan" on it
  // means "stop planning it here" — the pre-existing behavior, preserved.
  const isRemovingCurrentQueueEntry = game.status === 'Playing' && game.platform === platform;

  const nextPlatformQueueState = isRemovingCurrentQueueEntry
    ? removeGameFromPlatformQueue(plan, game.id, platform)
    : addGameToPlatformQueue(plan, game, platform);

  const tagged = isRemovingCurrentQueueEntry
    ? { nextGames: games, operations: [] as UndoOperation[] }
    : applyPlatformTag(games, game.id, getPlatformTag(plan, platform));

  return {
    nextGames: tagged.nextGames,
    nextPlatformQueueState,
    result: { operations: [...derivePlanUndoOperations(plan, nextPlatformQueueState), ...tagged.operations] },
  };
}

/**
 * Add several games to one Plan in a single action (AS-06: the Retro import's "Add to Platform
 * Plans"). One evolving Plan state, one games array, one summary — no accumulation on the side.
 */
export function addGamesToQueueTransition(
  games: Game[],
  plan: PlatformQueueState,
  targetGames: Game[],
  platform: GamePlatform,
): CrossSliceTransitionResult<AddGamesToQueueResult> {
  const platformTag = getPlatformTag(plan, platform);
  const summary: AddGamesToQueueSummary = { addedCount: 0, alreadyInPlanCount: 0, skippedPlayingCount: 0, platform };
  const addedGames: Game[] = [];

  let nextPlatformQueueState = plan;

  targetGames.forEach((game) => {
    // A game that is already being played on this platform has no Plan entry by design — the Plan
    // owner strips entries for currently-playing games. Adding one would create a row that
    // immediately disappears, so it is reported as skipped rather than faked.
    if (game.status === 'Playing' && game.platform === platform) {
      summary.skippedPlayingCount += 1;
      return;
    }

    const alreadyPlanned = nextPlatformQueueState.entries.some(
      (entry) => entry.gameId === game.id && entry.targetPlatform === platform,
    );

    if (alreadyPlanned) {
      // addGameToPlatformQueue would replace the entry, which is idempotent but would reset its
      // position. Leave it exactly as it is.
      summary.alreadyInPlanCount += 1;
      return;
    }

    summary.addedCount += 1;
    addedGames.push(game);
    nextPlatformQueueState = addGameToPlatformQueue(nextPlatformQueueState, game, platform);
  });

  if (summary.addedCount === 0) {
    return { nextGames: games, nextPlatformQueueState: plan, result: { operations: [], summary, addedGames } };
  }

  let nextGames = games;
  const tagOperations: UndoOperation[] = [];
  addedGames.forEach((game) => {
    const tagged = applyPlatformTag(nextGames, game.id, platformTag);
    nextGames = tagged.nextGames;
    tagOperations.push(...tagged.operations);
  });

  return {
    nextGames,
    nextPlatformQueueState,
    result: {
      operations: [...derivePlanUndoOperations(plan, nextPlatformQueueState), ...tagOperations],
      summary,
      addedGames,
    },
  };
}

/** Start playing a planned game: the Library/Game Detail status transition, plus the Plan effects. */
export function playQueueGameNowTransition(
  games: Game[],
  plan: PlatformQueueState,
  gameId: string,
  platform: GamePlatform,
  now: Date = new Date(),
): CrossSliceTransitionResult<StatusPlanActionResult> | null {
  const game = games.find((currentGame) => currentGame.id === gameId);
  if (!game) {
    return null;
  }

  const platformTag = getPlatformTag(plan, platform);
  const nextTags = platformTag ? Array.from(new Set([...game.tags, platformTag])) : game.tags;

  // Starting a game moves it to the platform it is played on and stamps the play date — through the
  // same canonical transition the Library and Game Detail use.
  const { nextGame, effects } = transitionGameStatus({
    game,
    nextStatus: 'Playing',
    now,
    context: 'plan',
    platform,
    changes: { platform, tags: nextTags },
  });

  const nextGames = games.map((currentGame) => (currentGame.id === gameId ? nextGame : currentGame));
  const nextPlatformQueueState = removeCurrentlyPlayingFromPlatformQueue(
    planStateForEffects(plan, gameId, effects),
    nextGames,
  );

  return {
    nextGames,
    nextPlatformQueueState,
    result: {
      nextGame,
      operations: [statusFields(game, nextGame, ['platform', 'tags']), ...derivePlanUndoOperations(plan, nextPlatformQueueState)],
    },
  };
}

/** Finish, drop, remove-from-playing, or send a currently playing game back to the Plan. */
export function updateCurrentlyPlayingGameTransition(
  games: Game[],
  plan: PlatformQueueState,
  gameId: string,
  platform: GamePlatform,
  action: PlayingGameAction,
  now: Date = new Date(),
): CrossSliceTransitionResult<StatusPlanActionResult> | null {
  const game = games.find((currentGame) => currentGame.id === gameId);
  if (!game) {
    return null;
  }

  const nextStatus: GameStatus = action === 'finished' ? 'Finished' : action === 'drop' ? 'Dropped' : 'Want to play';
  const { nextGame, effects } = transitionGameStatus({ game, nextStatus, now, context: 'plan', platform });

  const nextPlatformQueueState = action === 'move-to-backlog'
    // Moving back to the backlog is the one action that ADDS a Plan entry rather than clearing one:
    // the game stops being played and becomes planned work again, at the top of the Plan.
    ? addGameToPlatformQueueTop(plan, nextGame, platform)
    : planStateForEffects(plan, gameId, effects);

  return {
    nextGames: games.map((currentGame) => (currentGame.id === gameId ? nextGame : currentGame)),
    nextPlatformQueueState,
    result: {
      nextGame,
      operations: [statusFields(game, nextGame), ...derivePlanUndoOperations(plan, nextPlatformQueueState)],
    },
  };
}

/** Remove a game's Plan entry, and with it the platform tag the Plan gave it. */
export function removeQueueGameTransition(
  games: Game[],
  plan: PlatformQueueState,
  gameId: string,
  platform?: GamePlatform,
): CrossSliceTransitionResult<RemoveQueueGameResult> {
  const game = games.find((currentGame) => currentGame.id === gameId) ?? null;
  const entry = plan.entries.find((queueEntry) => queueEntry.gameId === gameId && (!platform || queueEntry.targetPlatform === platform));

  if (!entry) {
    return { nextGames: games, nextPlatformQueueState: plan, result: { operations: [], removedEntry: null, game } };
  }

  const nextPlatformQueueState = removeGameFromPlatformQueue(plan, gameId, entry.targetPlatform);
  const platformTag = getPlatformTag(plan, entry.targetPlatform);

  let nextGames = games;
  const tagOperations: UndoOperation[] = [];
  if (game && platformTag && game.tags.includes(platformTag)) {
    const nextTags = game.tags.filter((tag) => tag !== platformTag);
    tagOperations.push({ kind: 'game-fields', gameId, previous: { tags: game.tags }, expected: { tags: nextTags } });
    nextGames = games.map((currentGame) => (currentGame.id === gameId ? touchGameRecord({ ...currentGame, tags: nextTags }) : currentGame));
  }

  return {
    nextGames,
    nextPlatformQueueState,
    result: {
      operations: [...derivePlanUndoOperations(plan, nextPlatformQueueState), ...tagOperations],
      removedEntry: { targetPlatform: entry.targetPlatform, queuePosition: entry.queuePosition },
      game,
    },
  };
}

/** Move a Plan entry to another platform. Games are untouched. */
export function moveQueueGameToPlatformTransition(
  games: Game[],
  plan: PlatformQueueState,
  gameId: string,
  sourcePlatform: GamePlatform,
  platform: GamePlatform,
): CrossSliceTransitionResult<MoveQueueGameResult> {
  const game = games.find((currentGame) => currentGame.id === gameId) ?? null;
  const currentEntry = plan.entries.find((entry) => entry.gameId === gameId && entry.targetPlatform === sourcePlatform);
  const nextPlatformQueueState = moveQueueEntryToPlatform(plan, gameId, platform, sourcePlatform);

  return {
    nextGames: games,
    nextPlatformQueueState,
    result: {
      operations: derivePlanUndoOperations(plan, nextPlatformQueueState),
      movedFromPlatform: currentEntry && currentEntry.targetPlatform !== platform ? currentEntry.targetPlatform : null,
      game,
    },
  };
}
