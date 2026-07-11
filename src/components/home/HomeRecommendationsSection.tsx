import type { Game } from '../../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { DiscoveryCompactCard, DiscoveryCompactCardSkeleton } from '../discovery/DiscoveryGameCard';
import { usePersonalizedRecommendations } from '../../hooks/usePersonalizedRecommendations';
import { Icon } from '../Icon';
import { RECOMMENDATION_COPY } from '../../lib/recommendationState';

type HomeRecommendationsSectionProps = {
  games: Game[];
  libraryGameCount: number;
  inboxRawgIds: Set<number>;
  onSelectGame?: (game: DiscoveryGame) => void;
  onOpenPreview?: (candidate: DiscoveryCandidate) => void;
  onOpenRawgSettings?: () => void;
};

export function HomeRecommendationsSection({
  games,
  libraryGameCount,
  inboxRawgIds,
  onSelectGame,
  onOpenPreview,
}: HomeRecommendationsSectionProps) {
  const { candidates, loading, error, diagnostics, state, refresh, isRefreshing } = usePersonalizedRecommendations(games, inboxRawgIds, libraryGameCount > 0);
  const dev = import.meta.env.DEV;

  if (!onSelectGame) return null;

  return (
    <section aria-label="Recommended for You" className="qs-home-section min-w-0 overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
      <div className="min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Recommended for You</h3>
            <p className="mt-0.5 text-xs text-slate-500">Based on your library, ratings and plans</p>
          </div>
          <button
            aria-label="Refresh recommendations"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-skyglass/15 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-mint/40 hover:text-white disabled:opacity-60"
            disabled={isRefreshing || loading}
            onClick={() => void refresh()}
            type="button"
          >
            <Icon name="refresh-cw" size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {error || state.status === 'partial' || state.status === 'stale' ? <p className="text-xs text-amber-300">{RECOMMENDATION_COPY[state.status === 'stale' ? 'stale' : state.status === 'partial' ? 'partial' : 'error'].body}</p> : null}
        <div className="min-w-0 touch-pan-x scroll-px-1 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max gap-3 px-0.5">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => <DiscoveryCompactCardSkeleton key={i} />)
            ) : candidates.length > 0 ? (
              candidates.map((candidate) => (
                <div key={candidate.game.rawgId} className="relative">
                  <DiscoveryCompactCard candidate={candidate} onClick={(game) => (onOpenPreview ? onOpenPreview(candidate) : onSelectGame(game))} />
                  {dev && candidate.source ? <div className="mt-1 truncate text-[10px] text-slate-600">{candidate.source}</div> : null}
                </div>
              ))
            ) : (
              <div className="w-72 rounded-xl border border-dashed border-skyglass/15 bg-ink-950/50 p-4 text-sm text-slate-400">
                {state.status === 'notConfigured' ? RECOMMENDATION_COPY.notConfigured.body : state.status === 'coldStart' ? RECOMMENDATION_COPY.coldStart.body : RECOMMENDATION_COPY.empty.body}
              </div>
            )}
          </div>
        </div>
        {dev && diagnostics ? (
          <details className="text-xs text-slate-600">
            <summary>Home recommendation diagnostics</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ink-950/70 p-2">{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}
