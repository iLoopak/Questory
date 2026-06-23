import type { QuizSession } from './types';

const KEY = 'questshelf.achievementQuiz.sessions.v1';
type Stored = Record<string, QuizSession>;

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
