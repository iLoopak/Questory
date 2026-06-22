import type { Game } from '../../types/game';
import { useI18n } from '../../i18n';
import { useDailyQuest } from './useDailyQuest';
import { ArtworkReveal } from './components/ArtworkReveal';
import { DailyQuestModal } from './DailyQuestModal';
import { stageForRemaining } from './logic';

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

  // Compute remaining for the home card preview (for stage display)
  const cardStage = (() => {
    if (alreadyCompleted) return 4;
    if (!session) return 0;
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    const rem = Math.max(0, 120 - elapsed);
    return stageForRemaining(rem, false);
  })();

  return (
    <>
      <section className="qs-home-section overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/70 shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-skyglass/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">🧩</span>
            <div>
              <h2 className="text-sm font-semibold text-white">{t('dailyQuest.title')}</h2>
              <p className="text-xs text-slate-500">
                {alreadyCompleted
                  ? t('dailyQuest.alreadyCompleted')
                  : t('dailyQuest.subtitle')}
              </p>
            </div>
          </div>
          {alreadyCompleted && result ? (
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('dailyQuest.score')}</div>
              <div className="text-base font-bold text-mint">{result.score}</div>
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {!dailyGame ? (
            /* Empty state: no eligible games */
            <div className="py-2 text-center text-sm text-slate-500">
              <p>{t('dailyQuest.noEligibleGames')}</p>
              <p className="mt-1 text-xs text-slate-600">{t('dailyQuest.noEligibleGamesHint')}</p>
            </div>
          ) : alreadyCompleted ? (
            /* Completed state */
            <CompletedCardBody game={dailyGame} result={result} today={today} onView={openChallenge} t={t} />
          ) : (
            /* Ready-to-play state */
            <ReadyCardBody game={dailyGame} stage={cardStage} today={today} onPlay={openChallenge} t={t} />
          )}
        </div>
      </section>

      {/* Modal rendered here so it's always in the DOM when needed */}
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

function ReadyCardBody({
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
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="flex items-center gap-3">
      <ArtworkReveal
        game={game}
        stage={stage}
        date={today}
        className="h-20 w-14 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <p className="text-xs text-slate-400">{t('dailyQuest.cardHint')}</p>
        <button
          className="qs-home-section-action w-full rounded-xl border border-mint/30 bg-mint/10 px-4 py-2 text-sm font-semibold text-mint transition hover:bg-mint/20 focus:outline-none focus:ring-2 focus:ring-mint/40"
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

function CompletedCardBody({
  game,
  result,
  today,
  onView,
  t,
}: {
  game: Game;
  result: ReturnType<typeof useDailyQuest>['session'] extends null ? never : NonNullable<ReturnType<typeof useDailyQuest>['session']>['result'];
  today: string;
  onView: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <button
      className="flex w-full items-center gap-3 text-left focus:outline-none"
      onClick={onView}
      type="button"
    >
      <ArtworkReveal
        game={game}
        stage={4}
        date={today}
        className="h-20 w-14 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{game.title}</p>
        <p className="text-xs text-slate-500">{game.platform}</p>
        {result ? (
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
            {result.solved ? (
              <span className="text-green-400">✓ {t('dailyQuest.solved')}</span>
            ) : (
              <span className="text-red-400">✗ {t('dailyQuest.failedTitle')}</span>
            )}
            <span>·</span>
            <span>{result.remainingTime}s</span>
            {result.hintsUsed > 0 && (
              <>
                <span>·</span>
                <span>{result.hintsUsed} hints</span>
              </>
            )}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-slate-600">›</span>
    </button>
  );
}
