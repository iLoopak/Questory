import { useState, type Dispatch, type SetStateAction } from 'react';
import { formatLocalDate, loadPlayActivity, upsertPlayedTodayActivity, type PlayActivityRecord } from '../../lib/playActivityStorage';
import { touchGameRecord } from '../../lib/gameUtils';
import type { Game } from '../../types/game';

export function usePlayActivity({ setGames }: { setGames: Dispatch<SetStateAction<Game[]>> }) {
  const [playActivity, setPlayActivity] = useState<PlayActivityRecord[]>(() => loadPlayActivity());

  function logPlayedToday(game: Game) {
    const now = new Date();
    setPlayActivity((currentActivity) => upsertPlayedTodayActivity(currentActivity, game.id, now));
    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id
          ? touchGameRecord({ ...currentGame, lastPlayedAt: formatLocalDate(now) })
          : currentGame,
      ),
    );
  }

  return { logPlayedToday, playActivity, setPlayActivity };
}
