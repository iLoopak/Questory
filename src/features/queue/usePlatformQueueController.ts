import { useMemo, useState } from 'react';
import { getActiveQueuePlatforms, getQueuePlatforms, getQueueSummary, loadPlatformQueueState, type PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../../types/game';

export function usePlatformQueueController(games: Game[]) {
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  const [backlogPickerGame, setBacklogPickerGame] = useState<Game | null>(null);
  const queueSummary = useMemo(() => getQueueSummary(platformQueueState, games), [games, platformQueueState]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, platformQueueState), [games, platformQueueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(platformQueueState), [platformQueueState]);
  function openBacklogPicker(game: Game) { setBacklogPickerGame(game); }
  return { activeQueuePlatforms, backlogPickerGame, openBacklogPicker, platformQueueState, queuePlatforms, queueSummary, setBacklogPickerGame, setPlatformQueueState, setTargetQueuePlatform, targetQueuePlatform };
}
