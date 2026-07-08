import { useState } from 'react';
import type { Game, GameStatus } from '../../types/game';

export function useCompletionRating({
  games,
  updateGameReviewFields,
  updateGameStatus,
}: {
  games: Game[];
  updateGameReviewFields: (gameId: string, changes: Partial<Game>) => void;
  updateGameStatus: (gameId: string, status: GameStatus) => void;
}) {
  const [completionRatingGame, setCompletionRatingGame] = useState<Game | null>(null);

  function triggerCompletionSheet(gameId: string) {
    const game = games.find((g) => g.id === gameId);
    if (game) setCompletionRatingGame(game);
  }

  function updateGameStatusWithCompletion(gameId: string, status: GameStatus) {
    updateGameStatus(gameId, status);
    if (status === 'Finished') triggerCompletionSheet(gameId);
  }

  function updateGameReviewFieldsWithCompletion(gameId: string, changes: Partial<Game>) {
    updateGameReviewFields(gameId, changes);
    if (changes.status === 'Finished') triggerCompletionSheet(gameId);
  }

  return { completionRatingGame, setCompletionRatingGame, updateGameReviewFieldsWithCompletion, updateGameStatusWithCompletion };
}
