// AS-14: the shape every state transition in this codebase now has.
//
// A transition is a pure function of the CURRENT state: it returns the next state and the result of
// the operation together, so the caller never has to run business logic inside a React updater to
// find out what happened. React may defer, replay or discard an updater callback; a summary read out
// of one is therefore a guess, and it was frequently a wrong guess (a zero-count import toast).
//
// The rules a transition must obey: no React, no persistence, no toast, no telemetry, no mutation of
// its inputs, and the same output for the same inputs.

import type { Game } from '../types/game';
import type { PlatformQueueState } from './platformQueueStorage';

export type TransitionResult<TState, TResult> = {
  nextState: TState;
  result: TResult;
};

/**
 * A transition that spans the two slices Questory's Plan actions touch: the games collection and the
 * Platform Plans. It is computed as one value so the two React writes stay consistent with each
 * other and with the reported result. It is NOT a durability claim — the games repository
 * (IndexedDB) and the Plan store (KV) are still written by their own owners, independently.
 */
export type CrossSliceTransitionResult<TResult> = {
  nextGames: Game[];
  nextPlatformQueueState: PlatformQueueState;
  result: TResult;
};
