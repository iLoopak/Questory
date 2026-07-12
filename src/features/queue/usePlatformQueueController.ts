import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { getActiveQueuePlatforms, getQueuePlatforms, getQueueSummary, loadPlatformQueueState, removeCurrentlyPlayingFromPlatformQueue, savePlatformQueueState, type PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../../types/game';

export function usePlatformQueueController(games: Game[]) {
  const [platformQueueState, setRawPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  // AS-06: the picker can be opened for a BATCH (the Retro import's "Add to Platform Plans"), so
  // one destination is chosen once for all of them instead of asking per game. A single-game open
  // is just a batch of one, which keeps every existing caller unchanged.
  const [backlogPickerGames, setBacklogPickerGames] = useState<Game[]>([]);

  const setPlatformQueueState = useCallback((nextStateAction: SetStateAction<PlatformQueueState>) => {
    setRawPlatformQueueState((currentState) => {
      const nextState = typeof nextStateAction === 'function'
        ? (nextStateAction as (currentState: PlatformQueueState) => PlatformQueueState)(currentState)
        : nextStateAction;

      if (nextState !== currentState) {
        savePlatformQueueState(nextState);
      }

      return nextState;
    });
  }, []);

  useEffect(() => {
    setPlatformQueueState((currentState) => {
      const normalizedState = removeCurrentlyPlayingFromPlatformQueue(currentState, games);
      return normalizedState.entries.length === currentState.entries.length ? currentState : normalizedState;
    });
  }, [games, setPlatformQueueState]);

  const queueSummary = useMemo(() => getQueueSummary(platformQueueState, games), [games, platformQueueState]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, platformQueueState), [games, platformQueueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(platformQueueState), [platformQueueState]);
  function openBacklogPicker(game: Game) { setBacklogPickerGames([game]); }
  function openBacklogPickerForGames(gamesToPlan: Game[]) { setBacklogPickerGames(gamesToPlan); }
  function closeBacklogPicker() { setBacklogPickerGames([]); }

  return { activeQueuePlatforms, backlogPickerGames, closeBacklogPicker, openBacklogPicker, openBacklogPickerForGames, platformQueueState, queuePlatforms, queueSummary, setPlatformQueueState, setTargetQueuePlatform, targetQueuePlatform };
}
