import { seedGames } from '../data/seedGames';
import type { Game } from '../types/game';

const STORAGE_KEY = 'questshelf.games.v1';

const isBrowser = typeof window !== 'undefined';

export function loadGames(): Game[] {
  if (!isBrowser) {
    return seedGames;
  }

  const storedGames = window.localStorage.getItem(STORAGE_KEY);

  if (!storedGames) {
    saveGames(seedGames);
    return seedGames;
  }

  try {
    const parsedGames = JSON.parse(storedGames) as Game[];
    return Array.isArray(parsedGames) ? parsedGames : seedGames;
  } catch {
    return seedGames;
  }
}

export function saveGames(games: Game[]) {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}
