import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from '../../i18n';
import type { QuizQuestion, QuizResult, QuizSession, WeeklyQuizStats } from './types';
import { calculateScore } from './logic';
import { WeeklySummary } from './components/WeeklySummary';

const QUIZ_DURATION = 60;

interface AchievementQuizModalProps {
  question: QuizQuestion;
  session: QuizSession;
  today: string;
  weeklyStats: WeeklyQuizStats;
  onComplete: (result: QuizResult) => void;
  onClose: () => void;
  t: TFunction;
}

type GameOver = 'correct' | 'wrong' | 'timeout';

export function AchievementQuizModal({
  question,
  session,
  today,
  weeklyStats,
  onComplete,
  onClose,
  t,
}: AchievementQuizModalProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    return Math.max(0, QUIZ_DURATION - elapsed);
  });

  const [gameOver, setGameOver] = useState<GameOver | null>(() => {
    if (session.completed && session.result) {
      if (session.result.correct) return 'correct';
      return session.result.timeRemaining === 0 ? 'timeout' : 'wrong';
    }
    return null;
  });

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(
    session.result?.selectedAnswer ?? null,
  );
  const [result, setResult] = useState<QuizResult | null>(session.result ?? null);

  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  const complete = useCallback(
    (chosen: string | null, outcome: GameOver) => {
      const r = remainingRef.current;
      const correct = outcome === 'correct';
      const score = correct ? calculateScore(r) : 0;
      const res: QuizResult = {
        date: today,
        gameId: question.gameId,
        correct,
        score,
        timeRemaining: r,
        selectedAnswer: chosen ?? '',
        correctAnswer: question.fakeOption,
      };
      setGameOver(outcome);
      setResult(res);
      onComplete(res);
    },
    [today, question.gameId, question.fakeOption, onComplete],
  );

  // Timer tick
  useEffect(() => {
    if (gameOver) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [gameOver]);

  // Timeout detection
  useEffect(() => {
    if (gameOver) return;
    if (remaining === 0) {
      complete(null, 'timeout');
    }
  }, [remaining, gameOver, complete]);

  function handleSelect(option: string) {
    if (gameOver) return;
    setSelectedAnswer(option);
    if (option === question.fakeOption) {
      complete(option, 'correct');
    } else {
      complete(option, 'wrong');
    }
  }

  const secs = String(remaining % 60).padStart(2, '0');
  const timerUrgent = remaining <= 15 && !gameOver;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={gameOver ? onClose : undefined}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dailyAchievementQuiz.title')}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border-t border-skyglass/20 bg-ink-950 sm:inset-0 sm:my-auto sm:rounded-2xl sm:border sm:border-skyglass/20"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-skyglass/12 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🧩</span>
            <span className="text-sm font-semibold text-white">{t('dailyAchievementQuiz.title')}</span>
          </div>
          <div className="flex items-center gap-3">
            {!gameOver ? (
              <span className={`font-mono text-sm font-bold tabular-nums ${timerUrgent ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                0:{secs}
              </span>
            ) : null}
            <button
              aria-label={t('dailyAchievementQuiz.close')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-1 focus:ring-mint/40"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-5" style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))' }}>

          {/* Question */}
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              {t('dailyAchievementQuiz.subtitle')}
            </p>
            <p className="text-base font-bold leading-snug text-white">
              {question.gameTitle}
            </p>
          </div>

          {/* Timer progress bar */}
          {!gameOver ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${timerUrgent ? 'bg-red-400' : 'bg-mint'}`}
                style={{ width: `${(remaining / QUIZ_DURATION) * 100}%` }}
              />
            </div>
          ) : null}

          {/* Option buttons */}
          <div className="space-y-3">
            {question.options.map((option, idx) => {
              const letter = ['A', 'B', 'C', 'D'][idx];
              const isSelected = selectedAnswer === option;
              const isCorrect = option === question.fakeOption;

              let optionClass = 'border-skyglass/20 bg-ink-900/60 text-slate-200 hover:border-mint/35 hover:bg-mint/[0.07]';
              if (gameOver) {
                if (isCorrect) {
                  optionClass = 'border-green-500/50 bg-green-950/40 text-green-300';
                } else if (isSelected && !isCorrect) {
                  optionClass = 'border-red-500/50 bg-red-950/40 text-red-300';
                } else {
                  optionClass = 'border-skyglass/10 bg-ink-900/30 text-slate-500';
                }
              }

              return (
                <button
                  key={option}
                  type="button"
                  disabled={!!gameOver}
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition disabled:cursor-default ${optionClass}`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    gameOver && isCorrect
                      ? 'bg-green-500 text-ink-950'
                      : gameOver && isSelected && !isCorrect
                      ? 'bg-red-500 text-white'
                      : 'bg-skyglass/20 text-slate-400'
                  }`}>
                    {gameOver && isCorrect ? '✓' : gameOver && isSelected && !isCorrect ? '✗' : letter}
                  </span>
                  <span className="flex-1">{option}</span>
                </button>
              );
            })}
          </div>

          {/* Result panel */}
          {gameOver ? (
            <ResultPanel gameOver={gameOver} result={result!} weeklyStats={weeklyStats} onClose={onClose} t={t} />
          ) : (
            <p className="text-center text-xs text-slate-600">
              {t('dailyAchievementQuiz.instructionHint')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function ResultPanel({
  gameOver,
  result,
  weeklyStats,
  onClose,
  t,
}: {
  gameOver: GameOver;
  result: QuizResult;
  weeklyStats: WeeklyQuizStats;
  onClose: () => void;
  t: TFunction;
}) {
  const isCorrect = gameOver === 'correct';
  const isTimeout = gameOver === 'timeout';

  return (
    <div className="space-y-4">
      {/* Outcome headline */}
      <div className={`rounded-xl border p-4 text-center ${isCorrect ? 'border-green-500/30 bg-green-950/30' : 'border-red-500/20 bg-red-950/20'}`}>
        <p className={`text-xl font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
          {isCorrect ? t('dailyAchievementQuiz.correctTitle') : isTimeout ? t('dailyAchievementQuiz.timeUpTitle') : t('dailyAchievementQuiz.wrongTitle')}
        </p>

        {isCorrect ? (
          <div className="mt-2 flex justify-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{result.score}</p>
              <p className="text-xs text-slate-500">{t('dailyAchievementQuiz.score')}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{result.timeRemaining}s</p>
              <p className="text-xs text-slate-500">{t('dailyAchievementQuiz.timeRemaining')}</p>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-slate-500">{t('dailyAchievementQuiz.theAnswer')}</p>
            <p className="text-sm font-semibold text-white">{result.correctAnswer}</p>
          </div>
        )}
      </div>

      {/* Weekly stats */}
      <WeeklySummary stats={weeklyStats} t={t} />

      {/* Close */}
      <button
        className="min-h-11 w-full rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
        onClick={onClose}
        type="button"
      >
        {t('dailyAchievementQuiz.close')}
      </button>
    </div>
  );
}
