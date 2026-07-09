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
    <div className="space-y-8 px-3 pb-24 pt-4">
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

      <section className="rounded-2xl border border-skyglass/15 bg-ink-950/35 p-3 shadow-glow/20 sm:p-4">
        <DiscoverSectionHeader
          kicker="Personalized recommendations"
          title="Recommended for You"
          subtitle="Personalized picks from your library history."
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5 sm:gap-3">
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
                  discoveryContextTone="muted"
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DiscoverSectionHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div className="min-w-0">
      <p className="qs-label-caps text-muted">{kicker}</p>
      <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>
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
      <section className="rounded-2xl border border-skyglass/15 bg-gradient-to-b from-mint/10 via-ink-950/50 to-ink-950/30 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DiscoverSectionHeader
            kicker="Release Calendar"
            title="Upcoming for You"
            subtitle="Connect RAWG to see personalized upcoming releases from the next 90 days."
          />
          {onOpenSettings ? <button className="rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint" onClick={onOpenSettings} type="button">Settings → Integrations</button> : null}
        </div>
      </section>
    );
  }

  if (candidates === null) {
    return <div className="h-44 animate-pulse rounded-2xl border border-skyglass/10 bg-ink-900/70" />;
  }

  if (candidates.length === 0) return null;

  return (
    <section className="rounded-2xl border border-mint/15 bg-gradient-to-b from-mint/10 via-ink-950/55 to-ink-950/35 p-3 sm:p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <DiscoverSectionHeader
          kicker="Release Calendar"
          title="Upcoming for You"
          subtitle="Upcoming releases matched to your library taste."
        />
        <button className="rounded-lg border border-skyglass/20 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-mint/40 hover:text-mint focus-visible:border-mint/50 focus-visible:outline-none" onClick={onRefresh} type="button">Refresh</button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5 sm:gap-3">
        {candidates.slice(0, 6).map((candidate) => {
          const game = discoveryCandidateToGame(candidate, [], 'discover');
          return (
            <GameCard
              key={candidate.game.rawgId}
              game={game}
              suppressWantToPlayStatus
              detailsLabel="Preview"
              hideActionMenu
              onOpenDetails={() => onOpenGame(candidate)}
              primaryAction={onAddToWishlist ? { label: 'Wishlist', onClick: () => onAddToWishlist(candidate.game) } : undefined}
              secondaryActions={[
                ...(onAddToPlans ? [{ label: 'Plan', onClick: () => onAddToPlans(candidate.game) }] : []),
                { label: 'Ignore', onClick: () => onIgnore(candidate), tone: 'danger' as const },
              ]}
              coverBadgeTopRight={
                <RatingBadgeStack
                  className="absolute right-3 top-3 z-10 items-end"
                  game={game}
                  metacriticScore={candidate.game.metacritic}
                />
              }
              suppressRawgRatingBadge
              metaEyebrow={<span className="inline-flex rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-xs font-bold text-mint">{formatReleaseDate(candidate.game.released)}</span>}
              discoveryContext={candidate.reason ?? 'Matched to your library taste'}
              discoveryContextTone="accent"
            />
          );
        })}
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
