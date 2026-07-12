import { useEffect, useMemo, useState } from 'react';
import { getActiveQueuePlatforms, getQueuePlatforms, getQueueSummary, loadPlatformQueueState, removeCurrentlyPlayingFromPlatformQueue, type PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../../types/game';

/**
 * AS-14: this controller owns Plan STATE, and nothing else.
 *
 * It used to wrap the setter and call `savePlatformQueueState` from inside the React updater, while
 * `useAppPersistence` saved the very same state again from an effect — two writes per logical Plan
 * change, one of them hidden where a replayed or discarded updater could fire it (or not fire it) at
 * a time nobody could predict. The effect in `useAppPersistence` is now the single Plan writer.
 */
export function usePlatformQueueController(games: Game[]) {
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  // AS-06: the picker can be opened for a BATCH (the Retro import's "Add to Platform Plans"), so
  // one destination is chosen once for all of them instead of asking per game. A single-game open
  // is just a batch of one, which keeps every existing caller unchanged.
  const [backlogPickerGames, setBacklogPickerGames] = useState<Game[]>([]);

  // A game that started being played no longer belongs in a Plan. This updater is pure: it computes
  // the normalized state and returns it, with no write and no other setter inside.
  useEffect(() => {
    setPlatformQueueState((currentState) => {
      const normalizedState = removeCurrentlyPlayingFromPlatformQueue(currentState, games);
      return normalizedState.entries.length === currentState.entries.length ? currentState : normalizedState;
    });
  }, [games]);

  const queueSummary = useMemo(() => getQueueSummary(platformQueueState, games), [games, platformQueueState]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, platformQueueState), [games, platformQueueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(platformQueueState), [platformQueueState]);
  function openBacklogPicker(game: Game) { setBacklogPickerGames([game]); }
  function openBacklogPickerForGames(gamesToPlan: Game[]) { setBacklogPickerGames(gamesToPlan); }
  function closeBacklogPicker() { setBacklogPickerGames([]); }

  return { activeQueuePlatforms, backlogPickerGames, closeBacklogPicker, openBacklogPicker, openBacklogPickerForGames, platformQueueState, queuePlatforms, queueSummary, setPlatformQueueState, setTargetQueuePlatform, targetQueuePlatform };
}
