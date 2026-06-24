import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types/game';
import { getTodayDate } from '../dailyQuest/logic';
import {
  QUIZ_GAME_COOLDOWN_DAYS,
  buildRecentlyUsedSet,
  calculateScore as _calculateScore,
  computeWeeklyStats,
  generateQuestion,
  getEligibleGames,
  selectDailyGame,
} from './logic';
import {
  loadAllSessions,
  loadSelectedGamesLog,
  loadSession,
  logSelectedGame,
  saveSession,
} from './storage';
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

const FALLBACK_WINDOWS = [QUIZ_GAME_COOLDOWN_DAYS, 7, 3];
const MIN_CANDIDATES = 5;

export function useAchievementQuiz(games: Game[]): UseAchievementQuizReturn {
  const today = useMemo(() => getTodayDate(), []);

  const eligibleGames = useMemo(() => getEligibleGames(games), [games]);

  // Load the selected-games log once on mount. Historical entries ensure the cooldown
  // applies even to days before the user first opened the quiz.
  const [selectedGamesLog] = useState(() => loadSelectedGamesLog());

  // Use the tightest cooldown window that still leaves enough candidates.
  const recentlyUsed = useMemo(() => {
    for (const days of FALLBACK_WINDOWS) {
      const set = buildRecentlyUsedSet(eligibleGames, today, days, selectedGamesLog);
      const remaining = eligibleGames.filter((g) => !set.has(g.id)).length;
      if (remaining >= MIN_CANDIDATES) return set;
    }
    return new Set<string>(); // pool too small — no cooldown applied
  }, [eligibleGames, today, selectedGamesLog]);

  const dailyGame = useMemo(
    () => selectDailyGame(eligibleGames, today, recentlyUsed),
    [eligibleGames, today, recentlyUsed],
  );
  const question = useMemo(
    () => (dailyGame ? generateQuestion(dailyGame, today) : null),
    [dailyGame, today],
  );

  const [session, setSession] = useState<QuizSession | null>(() => loadSession(today));
  const [isOpen, setIsOpen] = useState(false);
  const [allSessions, setAllSessions] = useState<QuizSession[]>(() => loadAllSessions());
  const weeklyStats = useMemo(() => computeWeeklyStats(allSessions, today), [allSessions, today]);

  // Persist today's selection so future days can exclude it during cooldown evaluation.
  useEffect(() => {
    if (dailyGame) {
      logSelectedGame(today, dailyGame.id);
    }
  }, [today, dailyGame]);

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
