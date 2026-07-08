import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../types/game';
import { discoveryCandidateToGame, type DiscoveryCandidate, type DiscoveryGame } from '../lib/discovery';
import { GameCard } from './GameCard';
import { EmptyState } from './EmptyState';
import { RatingBadgeStack } from './RatingBadgeStack';
import { useI18n, type TFunction } from '../i18n';
import {
  fetchTrendingGames,
  fetchHiddenGems,
  fetchRecentlyReleasedGames,
} from '../services/discoverFeedsService';
import { fetchPersonalRecommendations } from '../services/personalRecommendationsService';
import { fetchPersonalizedReleaseCalendar, ignoreReleaseCalendarGame } from '../services/releaseCalendarService';
import { loadRawgSettings } from '../lib/rawgSettingsStorage';

type DiscoverPanelProps = {
  games: Game[];
  discoveryInboxRawgIds: Set<number>;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
  onOpenGame: (candidate: DiscoveryCandidate) => void;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToPlans?: (game: DiscoveryGame) => void;
  onOpenSettings?: () => void;
};

function getDiscoveryContext(candidate: DiscoveryCandidate, t: TFunction): string | undefined {
  if (candidate.libraryStatus === 'library') return t('discovery.inYourLibrary');
  if (candidate.libraryStatus === 'wishlist') return t('discovery.inYourWishlist');
  if (candidate.inboxStatus) return t('discovery.inDiscoveryInbox');
  return candidate.reason ?? undefined;
}

// ── Loading skeleton (proportions match GameCard) ─────────────────────────────

function DiscoverGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="qs-glass min-h-[260px] overflow-hidden rounded-lg border sm:min-h-[292px]"
        >
          <div className="aspect-[16/9] max-h-32 animate-pulse bg-ink-800 sm:max-h-36" />
          <div className="space-y-2 p-3 sm:p-3.5">
            <div className="h-5 w-3/4 animate-pulse rounded bg-ink-800" />
            <div className="mt-2 h-5 w-1/2 animate-pulse rounded bg-ink-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function DiscoverPanel({ games, discoveryInboxRawgIds, onAddToInbox, onOpenGame, onAddToWishlist, onAddToPlans, onOpenSettings }: DiscoverPanelProps) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);
  const [upcoming, setUpcoming] = useState<DiscoveryCandidate[] | null>(null);
  const [releaseRefreshToken, setReleaseRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchPersonalizedReleaseCalendar(games, discoveryInboxRawgIds, { forceRefresh: releaseRefreshToken > 0 }).catch((): DiscoveryCandidate[] => []),
      fetchPersonalRecommendations(games, discoveryInboxRawgIds).catch(
        (): DiscoveryCandidate[] => [],
      ),
      fetchTrendingGames(games, discoveryInboxRawgIds).catch((): DiscoveryCandidate[] => []),
      fetchHiddenGems(games, discoveryInboxRawgIds).catch((): DiscoveryCandidate[] => []),
      fetchRecentlyReleasedGames(games, discoveryInboxRawgIds).catch(
        (): DiscoveryCandidate[] => [],
      ),
    ]).then(([releaseCalendar, recommended, trending, hiddenGems, recent]) => {
      if (cancelled) return;

      // Deduplicate by rawgId. Priority: Recommended > Trending > Hidden Gem > Recent.
      const seen = new Set<number>();
      const all: DiscoveryCandidate[] = [];

      const tagged = [
        ...recommended,
        ...trending.map((c) => ({ ...c, reason: c.reason ?? t('discover.reason.trending') })),
        ...hiddenGems.map((c) => ({ ...c, reason: c.reason ?? t('discover.reason.hiddenGem') })),
        ...recent.map((c) => ({ ...c, reason: c.reason ?? t('discover.reason.recentlyReleased') })),
      ];

      for (const c of tagged) {
        if (seen.has(c.game.rawgId)) continue;
        seen.add(c.game.rawgId);
        // Skip games already in the user's library or wishlist.
        if (c.libraryStatus === null) {
          all.push(c);
        }
      }

      setUpcoming(releaseCalendar);
      setCandidates(all);
    });

    return () => {
      cancelled = true;
    };
    // games / discoveryInboxRawgIds re-stamp library and inbox status each time;
    // RAWG responses are served from module-level caches so re-fetching is fast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, discoveryInboxRawgIds, t, releaseRefreshToken]);

  const adaptedGames = useMemo(
    () => (candidates ?? []).map((c) => discoveryCandidateToGame(c, games, 'discover')),
    [candidates, games],
  );

  return (
    <div className="px-3 pb-24 pt-4">
      <ReleaseCalendarSection
        candidates={upcoming}
        isRawgConfigured={loadRawgSettings().apiKey.trim().length > 0}
        onAddToWishlist={onAddToWishlist}
        onAddToPlans={onAddToPlans}
        onIgnore={(candidate) => { ignoreReleaseCalendarGame(candidate.game.rawgId); setUpcoming((current) => current?.filter((item) => item.game.rawgId !== candidate.game.rawgId) ?? null); }}
        onOpenGame={onOpenGame}
        onOpenSettings={onOpenSettings}
        onRefresh={() => setReleaseRefreshToken((value) => value + 1)}
      />

      {candidates === null ? (
        <DiscoverGridSkeleton />
      ) : candidates.length === 0 ? (
        <div className="mx-auto max-w-md py-16">
          <EmptyState
            icon="compass"
            title={t('discover.empty.title')}
            text={t('discover.empty.text')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2">
          {candidates.map((candidate, i) => {
            const game = adaptedGames[i];
            if (!game) return null;

            const canAddToInbox =
              !candidate.libraryStatus && !candidate.inboxStatus && onAddToInbox != null;
            const metacritic = candidate.game.metacritic;
            const context = getDiscoveryContext(candidate, t);

            return (
              <GameCard
                key={game.id}
                game={game}
                suppressWantToPlayStatus={candidate.libraryStatus === null}
                detailsLabel={t('action.preview')}
                hideActionMenu
                onOpenDetails={() => onOpenGame(candidate)}
                primaryAction={
                  canAddToInbox
                    ? {
                        label: t('action.reviewLater'),
                        onClick: () => onAddToInbox(candidate.game, candidate.reason ?? ''),
                      }
                    : undefined
                }
                coverBadgeTopRight={
                  <RatingBadgeStack
                    className="absolute right-3 top-3 z-10 items-end"
                    game={game}
                    metacriticScore={metacritic}
                  />
                }
                suppressRawgRatingBadge
                discoveryContext={context}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReleaseCalendarSection({
  candidates,
  isRawgConfigured,
  onAddToWishlist,
  onAddToPlans,
  onIgnore,
  onOpenGame,
  onOpenSettings,
  onRefresh,
}: {
  candidates: DiscoveryCandidate[] | null;
  isRawgConfigured: boolean;
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToPlans?: (game: DiscoveryGame) => void;
  onIgnore: (candidate: DiscoveryCandidate) => void;
  onOpenGame: (candidate: DiscoveryCandidate) => void;
  onOpenSettings?: () => void;
  onRefresh: () => void;
}) {
  if (!isRawgConfigured) {
    return (
      <section className="mb-4 rounded-xl border border-skyglass/15 bg-ink-900/70 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="qs-label-caps text-muted">Release Calendar</p>
            <h2 className="text-lg font-semibold text-white">Upcoming for You</h2>
            <p className="mt-1 text-sm text-slate-400">Connect RAWG to see personalized upcoming releases from the next 90 days.</p>
          </div>
          {onOpenSettings ? <button className="rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint" onClick={onOpenSettings} type="button">Settings → Integrations</button> : null}
        </div>
      </section>
    );
  }

  if (candidates === null) {
    return <div className="mb-4 h-36 animate-pulse rounded-xl border border-skyglass/10 bg-ink-900/70" />;
  }

  if (candidates.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="qs-label-caps text-muted">Release Calendar</p>
          <h2 className="text-xl font-semibold text-white">Upcoming for You</h2>
          <p className="text-sm text-slate-400">Ordered by release date, filtered by your library taste.</p>
        </div>
        <button className="rounded-lg border border-skyglass/20 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-mint/40 hover:text-mint" onClick={onRefresh} type="button">Refresh</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] sm:overflow-visible">
        {candidates.slice(0, 6).map((candidate) => (
          <article key={candidate.game.rawgId} className="qs-glass w-56 shrink-0 overflow-hidden rounded-xl border sm:w-auto">
            <button className="block w-full text-left" onClick={() => onOpenGame(candidate)} type="button">
              <div className="aspect-[16/9] bg-ink-800">
                {candidate.game.coverUrl ? <img alt="" className="h-full w-full object-cover" src={candidate.game.coverUrl} /> : null}
              </div>
              <div className="space-y-2 p-3">
                <div>
                  <h3 className="line-clamp-2 font-semibold text-white">{candidate.game.title}</h3>
                  <p className="text-xs text-mint">{formatReleaseDate(candidate.game.released)}</p>
                </div>
                <p className="line-clamp-1 text-xs text-slate-400">{candidate.game.platforms.join(' · ') || 'Platforms TBA'}</p>
                <p className="line-clamp-2 text-xs text-slate-300">{candidate.reason}</p>
                <p className="text-xs text-slate-500">{candidate.game.metacritic ? `MC ${candidate.game.metacritic}` : candidate.game.rawgRating ? `RAWG ★ ${candidate.game.rawgRating.toFixed(1)}` : 'Rating TBA'}</p>
              </div>
            </button>
            <div className="grid grid-cols-3 gap-1 px-3 pb-3 text-[11px] font-semibold">
              <button className="rounded bg-mint/10 px-2 py-1 text-mint" onClick={() => onAddToWishlist?.(candidate.game)} type="button">Wishlist</button>
              <button className="rounded bg-skyglass/10 px-2 py-1 text-slate-200" onClick={() => onAddToPlans?.(candidate.game)} type="button">Plan</button>
              <button className="rounded bg-ink-800 px-2 py-1 text-slate-400" onClick={() => onIgnore(candidate)} type="button">Ignore</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatReleaseDate(value: string | null): string {
  if (!value) return 'Date TBA';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}
