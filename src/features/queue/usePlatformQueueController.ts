import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { getActiveQueuePlatforms, getQueuePlatforms, getQueueSummary, loadPlatformQueueState, removeCurrentlyPlayingFromPlatformQueue, savePlatformQueueState, type PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../../types/game';

export function usePlatformQueueController(games: Game[]) {
  const [platformQueueState, setRawPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  const [backlogPickerGame, setBacklogPickerGame] = useState<Game | null>(null);

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
  function openBacklogPicker(game: Game) { setBacklogPickerGame(game); }
  return { activeQueuePlatforms, backlogPickerGame, openBacklogPicker, platformQueueState, queuePlatforms, queueSummary, setBacklogPickerGame, setPlatformQueueState, setTargetQueuePlatform, targetQueuePlatform };
}
