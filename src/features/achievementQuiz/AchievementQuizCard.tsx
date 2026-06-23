import type { Game } from '../../types/game';
import { useI18n } from '../../i18n';
import { useAchievementQuiz } from './useAchievementQuiz';
import { AchievementQuizModal } from './AchievementQuizModal';
import type { QuizResult } from './types';

interface AchievementQuizCardProps {
  games: Game[];
}

export function AchievementQuizCard({ games }: AchievementQuizCardProps) {
  const { t } = useI18n();
  const {
    dailyGame,
    question,
    session,
    isOpen,
    weeklyStats,
    today,
    openQuiz,
    closeQuiz,
    completeQuiz,
  } = useAchievementQuiz(games);

  const alreadyCompleted = session?.completed === true;
  const result = session?.result ?? null;
  const currentStreak = weeklyStats.currentStreak;

  return (
    <>
      <section className="rounded-2xl border border-skyglass/15 bg-ink-900/70 p-4 shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0" aria-hidden="true">🧩</span>
            <span className="text-xs font-semibold uppercase tracking-spread text-mint truncate">
              {t('dailyAchievementQuiz.title')}
            </span>
          </div>
          {currentStreak > 0 && (
            <span className="shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-semibold text-amber-400">
              🔥 {currentStreak}
            </span>
          )}
        </div>

        {/* Body */}
        {!dailyGame || !question ? (
          <div className="py-1 text-xs text-slate-500">
            <p>{t('dailyAchievementQuiz.noEligibleGames')}</p>
            <p className="mt-0.5 text-slate-600">{t('dailyAchievementQuiz.noEligibleGamesHint')}</p>
          </div>
        ) : alreadyCompleted ? (
          <CompletedBody
            gameTitle={dailyGame.title}
            result={result}
            onView={openQuiz}
            t={t}
          />
        ) : (
          <ReadyBody gameTitle={dailyGame.title} onPlay={openQuiz} t={t} />
        )}
      </section>

      {isOpen && question && session ? (
        <AchievementQuizModal
          question={question}
          session={session}
          today={today}
          weeklyStats={weeklyStats}
          onComplete={completeQuiz}
          onClose={closeQuiz}
          t={t}
        />
      ) : null}
    </>
  );
}

type TFn = ReturnType<typeof useI18n>['t'];

function ReadyBody({
  gameTitle,
  onPlay,
  t,
}: {
  gameTitle: string;
  onPlay: () => void;
  t: TFn;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-snug text-slate-400">
        {t('dailyAchievementQuiz.cardHint')}
      </p>
      <p className="text-sm font-semibold text-white truncate">{gameTitle}</p>
      <button
        className="min-h-9 w-full rounded-xl bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 focus:outline-none focus:ring-2 focus:ring-mint/40"
        data-home-focus="true"
        onClick={onPlay}
        type="button"
      >
        {t('dailyAchievementQuiz.play')}
      </button>
    </div>
  );
}

function CompletedBody({
  gameTitle,
  result,
  onView,
  t,
}: {
  gameTitle: string;
  result: QuizResult | null;
  onView: () => void;
  t: TFn;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 text-left focus:outline-none"
      onClick={onView}
      type="button"
      data-home-focus="true"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{gameTitle}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {result ? (
            result.correct ? (
              <>
                <span className="font-semibold text-green-400">
                  {t('dailyAchievementQuiz.score')}: {result.score}
                </span>
                <span>·</span>
                <span>{result.timeRemaining}s left</span>
              </>
            ) : (
              <span className="text-red-400">{t('dailyAchievementQuiz.wrongTitle')}</span>
            )
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-slate-600">
          {t('dailyAchievementQuiz.alreadyCompleted')} · tap to view
        </p>
      </div>
      <span className="shrink-0 text-slate-600 mt-0.5" aria-hidden="true">›</span>
    </button>
  );
}
