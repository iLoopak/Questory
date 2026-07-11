import { useMemo } from 'react';
import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { getUserProfileReadiness } from '../../lib/userProfile';
import { loadRawgSettings } from '../../lib/rawgSettingsStorage';
import { usePersonalizedRecommendations } from '../../hooks/usePersonalizedRecommendations';
import { DiscoveryCompactCard, DiscoveryCompactCardSkeleton } from './DiscoveryGameCard';
import { useI18n, type TFunction } from '../../i18n';

const SKELETON_COUNT = 5;

// ---------------------------------------------------------------------------
// Cold start
// ---------------------------------------------------------------------------

function ColdStart({ progress, t }: { progress: number; t: TFunction }) {
  return (
    <section
      aria-label={t('recommendations.forYouTitle')}
      className="rounded-2xl border border-white/8 bg-ink-950/60 p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-white">{t('recommendations.forYouTitle')}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">
        {t('recommendations.coldStartLearning')}
      </p>
      <p className="text-xs text-slate-600 leading-relaxed">
        {t('recommendations.coldStartUnlock')}
      </p>
      <div className="space-y-1.5 pt-1">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/6">
          <div
            className="h-full rounded-full bg-mint/40 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loaded section (fetches recommendations)
// ---------------------------------------------------------------------------

type LoadedProps = {
  userGames: Game[];
  onOpenRawgSettings?: () => void;
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  t: TFunction;
};

function PersonalRecommendationsLoaded({
  userGames,
  onOpenRawgSettings,
  inboxRawgIds,
  onSelectGame,
  onOpenPreview,
  t,
}: LoadedProps) {
  const isRawgConfigured = loadRawgSettings().apiKey.trim().length > 0;
  const { candidates, loading } = usePersonalizedRecommendations(userGames, inboxRawgIds, isRawgConfigured && userGames.length > 0);
  const visible = candidates.filter((candidate) => candidate.libraryStatus === null);

  if (!isRawgConfigured) {
    return (
      <section aria-label={t('recommendations.forYouTitle')} className="qs-home-section min-w-0 rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{t('recommendations.forYouTitle')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('recommendations.rawgRequiredText')}</p>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">{t('recommendations.rawgRequiredHelp')}</p>
          {onOpenRawgSettings ? (
            <button className="min-h-10 rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90" onClick={onOpenRawgSettings} type="button">
              {t('recommendations.openIntegrationsCta')}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!loading && visible.length === 0) return null;

  return (
    <section aria-label={t('recommendations.forYouTitle')} className="qs-home-section min-w-0 overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
      <div className="min-w-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{t('recommendations.forYouTitle')}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{t('recommendations.tapHint')}</p>
        </div>
        <div className="min-w-0 touch-pan-x scroll-px-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max gap-3 px-0.5">
          {loading && visible.length === 0 ? (
            Array.from({ length: SKELETON_COUNT }, (_, i) => <DiscoveryCompactCardSkeleton key={i} />)
          ) : (
            visible.map((candidate) => (
              <DiscoveryCompactCard
                key={candidate.game.rawgId}
                candidate={candidate}
                onClick={(game) => {
                  if (candidate.libraryStatus === 'library') {
                    onSelectGame(game);
                  } else {
                    onOpenPreview?.(candidate);
                  }
                }}
              />
            ))
          )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

type Props = {
  userGames: Game[];
  onOpenRawgSettings?: () => void;
  inboxRawgIds: Set<number>;
  onSelectGame: (game: DiscoveryGame) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
};

export function PersonalRecommendationsSection({
  userGames,
  onOpenRawgSettings,
  inboxRawgIds,
  onSelectGame,
  onOpenPreview,
}: Props) {
  const { t } = useI18n();
  const readiness = useMemo(() => getUserProfileReadiness(userGames), [userGames]);

  if (!readiness.ready) {
    return <ColdStart progress={readiness.progress} t={t} />;
  }

  return (
    <PersonalRecommendationsLoaded
      userGames={userGames}
      onOpenRawgSettings={onOpenRawgSettings}
      inboxRawgIds={inboxRawgIds}
      onSelectGame={onSelectGame}
      onOpenPreview={onOpenPreview}
      t={t}
    />
  );
}
