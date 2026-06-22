import type { Game } from '../../types/game';
import { useI18n } from '../../i18n';
import { useDailyQuest } from './useDailyQuest';
import { stageForRemaining } from './logic';
import { ArtworkReveal } from './components/ArtworkReveal';
import { DailyQuestIcon } from './components/DailyQuestIcon';
import { DailyQuestModal } from './DailyQuestModal';
import type { DailyQuestResult } from './types';

interface DailyQuestCardProps {
  games: Game[];
}

export function DailyQuestCard({ games }: DailyQuestCardProps) {
  const { t } = useI18n();
  const {
    today,
    dailyGame,
    eligibleGames,
    session,
    isOpen,
    weeklyStats,
    openChallenge,
    closeChallenge,
    completeChallenge,
  } = useDailyQuest(games);

  const alreadyCompleted = session?.completed === true;
  const result = session?.result ?? null;

  const cardStage = (() => {
    if (alreadyCompleted) return 4 as const;
    if (!session) return 0 as const;
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    const rem = Math.max(0, 120 - elapsed);
    return stageForRemaining(rem, false);
  })();

  const currentStreak = weeklyStats.currentStreak;

  return (
    <>
      <section className="rounded-2xl border border-skyglass/15 bg-ink-900/70 p-4 shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <DailyQuestIcon size={16} className="shrink-0 text-mint" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-mint truncate">
              {t('dailyQuest.title')}
            </span>
          </div>
          {currentStreak > 0 && (
            <span className="shrink-0 rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-semibold text-amber-400">
              🔥 {currentStreak}
            </span>
          )}
        </div>

        {/* Body */}
        {!dailyGame ? (
          <div className="py-1 text-xs text-slate-500">
            <p>{t('dailyQuest.noEligibleGames')}</p>
            <p className="mt-0.5 text-slate-600">{t('dailyQuest.noEligibleGamesHint')}</p>
          </div>
        ) : alreadyCompleted ? (
          <CompletedBody game={dailyGame} result={result} today={today} onView={openChallenge} t={t} />
        ) : (
          <ReadyBody game={dailyGame} stage={cardStage} today={today} onPlay={openChallenge} t={t} />
        )}
      </section>

      {isOpen && dailyGame && session ? (
        <DailyQuestModal
          game={dailyGame}
          eligibleGames={eligibleGames}
          session={session}
          today={today}
          weeklyStats={weeklyStats}
          onComplete={completeChallenge}
          onClose={closeChallenge}
          t={t}
        />
      ) : null}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useI18n>['t'];

function ReadyBody({
  game,
  stage,
  today,
  onPlay,
  t,
}: {
  game: Game;
  stage: ReturnType<typeof stageForRemaining>;
  today: string;
  onPlay: () => void;
  t: TFn;
}) {
  return (
    <div className="flex items-center gap-3">
      <ArtworkReveal
        game={game}
        stage={stage}
        date={today}
        className="h-[54px] w-[38px] shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs leading-snug text-slate-400">{t('dailyQuest.cardHint')}</p>
        <button
          className="min-h-9 w-full rounded-xl bg-mint px-3 text-xs font-semibold text-ink-950 transition hover:bg-mint/90 focus:outline-none focus:ring-2 focus:ring-mint/40"
          data-home-focus="true"
          onClick={onPlay}
          type="button"
        >
          {t('dailyQuest.play')}
        </button>
      </div>
    </div>
  );
}

function CompletedBody({
  game,
  result,
  today,
  onView,
  t,
}: {
  game: Game;
  result: DailyQuestResult | null;
  today: string;
  onView: () => void;
  t: TFn;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 text-left focus:outline-none"
      onClick={onView}
      type="button"
      data-home-focus="true"
    >
      <ArtworkReveal
        game={game}
        stage={4}
        date={today}
        className="h-[54px] w-[38px] shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{game.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {result ? (
            result.solved ? (
              <>
                <span className="font-semibold text-green-400">{t('dailyQuest.score')}: {result.score}</span>
                <span>·</span>
                <span>{result.remainingTime}s left</span>
              </>
            ) : (
              <span className="text-red-400">{t('dailyQuest.failedTitle')}</span>
            )
          ) : null}
        </div>
        <p className="mt-1.5 text-xs text-slate-600">{t('dailyQuest.alreadyCompleted')} · tap to view</p>
      </div>
      <span className="shrink-0 text-slate-600" aria-hidden="true">›</span>
    </button>
  );
}
