import { useMemo, useState } from 'react';
import type { Game } from '../../types/game';
import { computeWeeklyStats, getEligibleGames, getTodayDate, selectDailyGame } from './logic';
import { loadAllSessions, loadSession, saveSession } from './storage';
import type { DailyQuestResult, DailyQuestSession, WeeklyStats } from './types';

export type UseDailyQuestReturn = {
  today: string;
  dailyGame: Game | null;
  eligibleGames: Game[];
  session: DailyQuestSession | null;
  isOpen: boolean;
  weeklyStats: WeeklyStats;
  openChallenge: () => void;
  closeChallenge: () => void;
  completeChallenge: (result: DailyQuestResult) => void;
};

export function useDailyQuest(games: Game[]): UseDailyQuestReturn {
  const today = useMemo(() => getTodayDate(), []);

  const eligibleGames = useMemo(() => getEligibleGames(games), [games]);
  const dailyGame = useMemo(() => selectDailyGame(eligibleGames, today), [eligibleGames, today]);

  const [session, setSession] = useState<DailyQuestSession | null>(() => loadSession(today));
  const [isOpen, setIsOpen] = useState(false);

  const [allSessions, setAllSessions] = useState<DailyQuestSession[]>(() => loadAllSessions());
  const weeklyStats = useMemo(() => computeWeeklyStats(allSessions, today), [allSessions, today]);

  function openChallenge() {
    if (!dailyGame) return;
    let sess = session;
    if (!sess || sess.gameId !== dailyGame.id) {
      sess = { date: today, gameId: dailyGame.id, startedAt: Date.now(), completed: false, result: null };
      saveSession(sess);
      setSession(sess);
    }
    setIsOpen(true);
  }

  function closeChallenge() {
    setIsOpen(false);
  }

  function completeChallenge(result: DailyQuestResult) {
    const prev = session ?? { date: today, gameId: dailyGame!.id, startedAt: Date.now(), completed: false, result: null };
    const updated: DailyQuestSession = { ...prev, completed: true, result };
    saveSession(updated);
    setSession(updated);
    setAllSessions(loadAllSessions());
  }

  return { today, dailyGame, eligibleGames, session, isOpen, weeklyStats, openChallenge, closeChallenge, completeChallenge };
}
