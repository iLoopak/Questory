import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { TFunction } from '../../i18n';
import { calculateScore, generateHints, hintsForRemaining, stageForRemaining } from './logic';
import type { DailyQuestResult, DailyQuestSession, WeeklyStats } from './types';
import { ArtworkReveal } from './components/ArtworkReveal';
import { DailyQuestIcon } from './components/DailyQuestIcon';
import { GuessInput } from './components/GuessInput';
import { WeeklySummary } from './components/WeeklySummary';

const CHALLENGE_DURATION = 120;

interface DailyQuestModalProps {
  game: Game;
  eligibleGames: Game[];
  session: DailyQuestSession;
  today: string;
  weeklyStats: WeeklyStats;
  onComplete: (result: DailyQuestResult) => void;
  onClose: () => void;
  t: TFunction;
}

export function DailyQuestModal({
  game,
  eligibleGames,
  session,
  today,
  weeklyStats,
  onComplete,
  onClose,
  t,
}: DailyQuestModalProps) {
  // Compute elapsed time, handling the case where the tab was closed and reopened
  const [remaining, setRemaining] = useState<number>(() => {
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    return Math.max(0, CHALLENGE_DURATION - elapsed);
  });

  const [wrongGuessIds, setWrongGuessIds] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState<'solved' | 'failed' | null>(() => {
    if (session.completed && session.result) {
      return session.result.solved ? 'solved' : 'failed';
    }
    return null;
  });
  const [result, setResult] = useState<DailyQuestResult | null>(session.result ?? null);

  // Stable refs for use in timer callbacks
  const wrongGuessIdsRef = useRef<string[]>([]);
  wrongGuessIdsRef.current = wrongGuessIds;
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;
  const hintsRef = useRef(hintsForRemaining(remaining));

  const hints = useMemo(() => generateHints(game), [game]);

  const hintsRevealed = hintsForRemaining(remaining);
  hintsRef.current = hintsRevealed;

  const revealStage = stageForRemaining(remaining, gameOver !== null);

  const completeChallenge = useCallback(
    (solved: boolean) => {
      const r = remainingRef.current;
      const wg = wrongGuessIdsRef.current;
      const hi = hintsRef.current;
      const score = solved ? calculateScore(hi, wg.length) : 0;
      const res: DailyQuestResult = {
        date: today,
        gameId: game.id,
        solved,
        score,
        remainingTime: r,
        hintsUsed: hi,
        wrongGuesses: wg,
      };
      setGameOver(solved ? 'solved' : 'failed');
      setResult(res);
      onComplete(res);
    },
    [today, game.id, onComplete],
  );

  // Timer tick (only while game is active)
  useEffect(() => {
    if (gameOver) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [gameOver]);

  // Detect timeout — also fires on mount if the timer already expired before opening
  useEffect(() => {
    if (gameOver) return;
    if (remaining === 0) {
      completeChallenge(false);
    }
  }, [remaining, gameOver, completeChallenge]);

  const guessedSet = useMemo(() => new Set(wrongGuessIds), [wrongGuessIds]);

  function handleGuess(guessed: Game) {
    if (guessed.id === game.id) {
      completeChallenge(true);
    } else {
      setWrongGuessIds((prev) => [...prev, guessed.id]);
      setRemaining((r) => Math.max(0, r - 10));
    }
  }

  const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');
  const timerUrgent = remaining <= 30 && !gameOver;

  const wrongGamesById = useMemo(
    () => new Map(eligibleGames.map((g) => [g.id, g])),
    [eligibleGames],
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={gameOver ? onClose : undefined}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dailyQuest.title')}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border-t border-skyglass/20 bg-ink-950 sm:inset-0 sm:my-auto sm:rounded-2xl sm:border sm:border-skyglass/20"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-skyglass/12 px-4 py-3">
          <div className="flex items-center gap-2">
            <DailyQuestIcon size={18} className="shrink-0 text-mint" />
            <span className="text-sm font-semibold text-white">{t('dailyQuest.title')}</span>
          </div>
          <div className="flex items-center gap-3">
            {!gameOver ? (
              <span className={`font-mono text-sm font-bold tabular-nums ${timerUrgent ? 'text-red-400' : 'text-slate-300'}`}>
                {mins}:{secs}
              </span>
            ) : null}
            <button
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-1 focus:ring-mint/40"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">

          {/* Artwork */}
          <div className="flex justify-center">
            <ArtworkReveal
              game={game}
              stage={revealStage}
              date={today}
              className="h-52 w-36"
            />
          </div>

          {/* Game-over result */}
          {gameOver ? (
            <ResultPanel game={game} result={result!} gameOver={gameOver} weeklyStats={weeklyStats} onClose={onClose} t={t} />
          ) : (
            <>
              {/* Hints */}
              <HintPanel hints={hints} revealed={hintsRevealed} t={t} />

              {/* Wrong guesses */}
              {wrongGuessIds.length > 0 ? (
                <div className="space-y-1">
                  {wrongGuessIds.map((id) => {
                    const g = wrongGamesById.get(id);
                    return (
                      <div key={id} className="flex items-center gap-2 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-400">
                        <span aria-hidden="true">✗</span>
                        <span className="truncate">{g?.title ?? id}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Score potential */}
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{t('dailyQuest.score')}</span>
                <span className="font-semibold text-white">{calculateScore(hintsRevealed, wrongGuessIds.length)}</span>
              </div>

              {/* Guess input */}
              <GuessInput
                games={eligibleGames}
                guessedIds={guessedSet}
                onGuess={handleGuess}
                t={t}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HintPanel({ hints, revealed, t }: { hints: [string, string, string]; revealed: number; t: TFunction }) {
  const labels = [t('dailyQuest.hint1Label'), t('dailyQuest.hint2Label'), t('dailyQuest.hint3Label')];

  return (
    <div className="space-y-1.5">
      {hints.map((hint, i) => {
        const unlocked = i < revealed;
        return (
          <div
            key={i}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm transition ${unlocked ? 'bg-amber-950/30 text-amber-200' : 'bg-ink-900/60 text-slate-600'}`}
          >
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider mt-0.5 w-24 text-current opacity-60">
              {labels[i]}
            </span>
            <span className={`flex-1 ${unlocked ? 'font-medium' : 'blur-sm select-none'}`}>
              {unlocked ? hint : '• • •'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResultPanel({
  game,
  result,
  gameOver,
  weeklyStats,
  onClose,
  t,
}: {
  game: Game;
  result: DailyQuestResult;
  gameOver: 'solved' | 'failed';
  weeklyStats: WeeklyStats;
  onClose: () => void;
  t: TFunction;
}) {
  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${gameOver === 'solved' ? 'bg-green-950/40' : 'bg-red-950/30'}`}>
        <span className="text-xl" aria-hidden="true">{gameOver === 'solved' ? '✅' : '⏱️'}</span>
        <div className="min-w-0">
          <div className={`text-sm font-bold ${gameOver === 'solved' ? 'text-green-300' : 'text-red-300'}`}>
            {gameOver === 'solved' ? t('dailyQuest.correctTitle') : t('dailyQuest.failedTitle')}
          </div>
          <div className="text-sm font-semibold text-white truncate">{game.title}</div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <ScoreStat label={t('dailyQuest.score')} value={String(result.score)} accent />
        <ScoreStat label={t('dailyQuest.timeRemaining')} value={`${result.remainingTime}s`} />
        <ScoreStat label={t('dailyQuest.hintsUsed')} value={String(result.hintsUsed)} />
        <ScoreStat label={t('dailyQuest.wrongGuesses')} value={String(result.wrongGuesses.length)} />
      </div>

      {/* Weekly summary */}
      <WeeklySummary stats={weeklyStats} t={t} />

      <button
        className="w-full rounded-xl bg-mint py-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 focus:outline-none focus:ring-2 focus:ring-mint/50"
        onClick={onClose}
        type="button"
      >
        {t('dailyQuest.close')}
      </button>
    </div>
  );
}

function ScoreStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-900/70 px-3 py-2.5 text-center">
      <div className={`text-base font-bold ${accent ? 'text-mint' : 'text-white'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
