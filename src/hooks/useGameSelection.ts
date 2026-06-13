import { useMemo, useState } from 'react';
import type { Game } from '../types/game';

export function useGameSelection(games: Game[]) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const selectedGame = useMemo(
    () => (selectedGameId ? games.find((game) => game.id === selectedGameId) ?? null : null),
    [games, selectedGameId],
  );

  function openGameDetails(gameId: string) {
    setSelectedGameId(gameId);
  }

  function closeGameDetails() {
    setSelectedGameId(null);
  }

  function openAddGame() {
    setIsAddGameOpen(true);
  }

  function closeAddGame() {
    setIsAddGameOpen(false);
  }

  return {
    closeAddGame,
    closeGameDetails,
    isAddGameOpen,
    openAddGame,
    openGameDetails,
    selectedGame,
    selectedGameId,
    setIsAddGameOpen,
    setSelectedGameId,
  };
}
