import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { CrossSliceTransitionResult, TransitionResult } from '../../lib/stateTransition';
import type { Game } from '../../types/game';

/**
 * AS-14: the command boundary.
 *
 * Feature actions used to compute their result inside a React updater and read it back immediately.
 * React is allowed to defer, replay or discard an updater, so that result was a guess. A command
 * instead reads the latest state from a controller-owned ref, runs one pure transition, applies the
 * next state, and returns the result — a plain value the caller can toast, count and log against.
 *
 * The refs are the "latest state" strategy the audit asks for, and they are kept current from two
 * places: React assigns them on every render, and a command advances them the moment it applies a
 * transition. That second part is what lets two commands fired in the same tick compose (the second
 * sees the first's games) instead of the second silently overwriting the first.
 *
 * No global store, no reducer rewrite, no `flushSync`.
 */
export type SliceCommands = {
  /** The latest games. Read it instead of a render closure when a command needs current data. */
  gamesRef: RefObject<Game[]>;
  platformQueueStateRef: RefObject<PlatformQueueState>;
  runGamesCommand: <TResult>(transition: (games: Game[]) => TransitionResult<Game[], TResult>) => TResult;
  runPlanCommand: <TResult>(transition: (plan: PlatformQueueState) => TransitionResult<PlatformQueueState, TResult>) => TResult;
  /**
   * One games+Plan action. Both slices are computed together and applied together; each is then
   * persisted by its own single writer. This is deterministic application and explicit ownership —
   * it is not a transaction across IndexedDB and the KV store, and it does not pretend to be.
   */
  runCrossSliceCommand: <TResult>(
    transition: (games: Game[], plan: PlatformQueueState) => CrossSliceTransitionResult<TResult> | null,
  ) => TResult | null;
};

type UseSliceCommandsOptions = {
  games: Game[];
  platformQueueState: PlatformQueueState;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
};

export function useSliceCommands({ games, platformQueueState, setGames, setPlatformQueueState }: UseSliceCommandsOptions): SliceCommands {
  const gamesRef = useRef(games);
  gamesRef.current = games;

  const platformQueueStateRef = useRef(platformQueueState);
  platformQueueStateRef.current = platformQueueState;

  const applyGames = useCallback((nextGames: Game[]) => {
    if (nextGames === gamesRef.current) {
      return;
    }
    gamesRef.current = nextGames;
    setGames(nextGames);
  }, [setGames]);

  const applyPlatformQueueState = useCallback((nextState: PlatformQueueState) => {
    if (nextState === platformQueueStateRef.current) {
      return;
    }
    platformQueueStateRef.current = nextState;
    setPlatformQueueState(nextState);
  }, [setPlatformQueueState]);

  const runGamesCommand = useCallback(<TResult,>(transition: (games: Game[]) => TransitionResult<Game[], TResult>): TResult => {
    const { nextState, result } = transition(gamesRef.current);
    applyGames(nextState);
    return result;
  }, [applyGames]);

  const runPlanCommand = useCallback(<TResult,>(transition: (plan: PlatformQueueState) => TransitionResult<PlatformQueueState, TResult>): TResult => {
    const { nextState, result } = transition(platformQueueStateRef.current);
    applyPlatformQueueState(nextState);
    return result;
  }, [applyPlatformQueueState]);

  const runCrossSliceCommand = useCallback(<TResult,>(
    transition: (games: Game[], plan: PlatformQueueState) => CrossSliceTransitionResult<TResult> | null,
  ): TResult | null => {
    const transitioned = transition(gamesRef.current, platformQueueStateRef.current);
    if (!transitioned) {
      return null;
    }

    applyGames(transitioned.nextGames);
    applyPlatformQueueState(transitioned.nextPlatformQueueState);
    return transitioned.result;
  }, [applyGames, applyPlatformQueueState]);

  return { gamesRef, platformQueueStateRef, runGamesCommand, runPlanCommand, runCrossSliceCommand };
}
