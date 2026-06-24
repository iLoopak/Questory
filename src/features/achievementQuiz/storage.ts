import type { QuizSession } from './types';

const KEY = 'questshelf.achievementQuiz.sessions.v1';
const SELECTED_GAMES_KEY = 'questshelf.achievementQuiz.selectedGames.v1';

type Stored = Record<string, QuizSession>;

// Lightweight log: { "YYYY-MM-DD": "gameId" }
// Written whenever a game is selected for the day, regardless of whether the quiz is opened.
// Used by the cooldown system to exclude recently shown games from future selections.
export type SelectedGamesLog = Record<string, string>;

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function save(data: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function loadSession(date: string): QuizSession | null {
  return load()[date] ?? null;
}

export function saveSession(session: QuizSession): void {
  const all = load();
  all[session.date] = session;
  save(all);
}

export function loadAllSessions(): QuizSession[] {
  return Object.values(load());
}

export function loadSelectedGamesLog(): SelectedGamesLog {
  try {
    const raw = localStorage.getItem(SELECTED_GAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SelectedGamesLog) : {};
  } catch {
    return {};
  }
}

export function logSelectedGame(date: string, gameId: string): void {
  try {
    const log = loadSelectedGamesLog();
    if (log[date] === gameId) return; // idempotent — skip write if unchanged
    log[date] = gameId;
    localStorage.setItem(SELECTED_GAMES_KEY, JSON.stringify(log));
  } catch { /* ignore */ }
}
