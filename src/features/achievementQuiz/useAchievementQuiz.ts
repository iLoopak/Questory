import { useMemo, useState } from 'react';
import type { Game } from '../../types/game';
import { getTodayDate } from '../dailyQuest/logic';
import {
  calculateScore as _calculateScore,
  computeWeeklyStats,
  generateQuestion,
  getEligibleGames,
  selectDailyGame,
} from './logic';
import { loadAllSessions, loadSession, saveSession } from './storage';
import type { QuizQuestion, QuizResult, QuizSession, WeeklyQuizStats } from './types';

export type UseAchievementQuizReturn = {
  today: string;
  dailyGame: Game | null;
  eligibleGames: Game[];
  session: QuizSession | null;
  question: QuizQuestion | null;
  isOpen: boolean;
  weeklyStats: WeeklyQuizStats;
  openQuiz: () => void;
  closeQuiz: () => void;
  completeQuiz: (result: QuizResult) => void;
};

export function useAchievementQuiz(games: Game[]): UseAchievementQuizReturn {
  const today = useMemo(() => getTodayDate(), []);

  const eligibleGames = useMemo(() => getEligibleGames(games), [games]);
  const dailyGame = useMemo(() => selectDailyGame(eligibleGames, today), [eligibleGames, today]);
  const question = useMemo(
    () => (dailyGame ? generateQuestion(dailyGame, today) : null),
    [dailyGame, today],
  );

  const [session, setSession] = useState<QuizSession | null>(() => loadSession(today));
  const [isOpen, setIsOpen] = useState(false);
  const [allSessions, setAllSessions] = useState<QuizSession[]>(() => loadAllSessions());
  const weeklyStats = useMemo(() => computeWeeklyStats(allSessions, today), [allSessions, today]);

  function openQuiz() {
    if (!dailyGame || !question) return;
    let sess = session;
    if (!sess || sess.gameId !== dailyGame.id) {
      sess = { date: today, gameId: dailyGame.id, startedAt: Date.now(), completed: false, result: null };
      saveSession(sess);
      setSession(sess);
    }
    setIsOpen(true);
  }

  function closeQuiz() {
    setIsOpen(false);
  }

  function completeQuiz(result: QuizResult) {
    const prev = session ?? {
      date: today,
      gameId: dailyGame!.id,
      startedAt: Date.now(),
      completed: false,
      result: null,
    };
    const updated: QuizSession = { ...prev, completed: true, result };
    saveSession(updated);
    setSession(updated);
    setAllSessions(loadAllSessions());
  }

  return {
    today,
    dailyGame,
    eligibleGames,
    session,
    question,
    isOpen,
    weeklyStats,
    openQuiz,
    closeQuiz,
    completeQuiz,
  };
}
