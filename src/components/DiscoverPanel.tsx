import { useEffect, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { DiscoverGameCard } from './discovery/DiscoverGameCard';
import { EmptyState } from './EmptyState';
import { useI18n, type TFunction } from '../i18n';
import { fetchPersonalizedReleaseCalendar, ignoreReleaseCalendarGame } from '../services/releaseCalendarService';
import { loadRawgSettings } from '../lib/rawgSettingsStorage';
import { usePersonalizedRecommendations } from '../hooks/usePersonalizedRecommendations';
import { RECOMMENDATION_COPY } from '../lib/recommendationState';

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

// ── Loading skeleton (proportions match DiscoverGameCard) ─────────────────────

const DEV_RECOMMENDATION_EMPTY_STATE = import.meta.env.DEV;

function DiscoverGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5 sm:gap-3">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="qs-glass min-h-[292px] overflow-hidden rounded-lg border"
        >
          <div className="aspect-[16/9] max-h-36 animate-pulse bg-ink-800" />
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
  const { candidates: personalizedCandidates, loading: recommendationsLoading, state: recommendationState } = usePersonalizedRecommendations(games, discoveryInboxRawgIds, games.length > 0);
  const candidates = recommendationsLoading && personalizedCandidates.length === 0 ? null : personalizedCandidates.filter((candidate) => candidate.libraryStatus === null);
  const [upcoming, setUpcoming] = useState<DiscoveryCandidate[] | null>(null);
  const [releaseRefreshToken, setReleaseRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPersonalizedReleaseCalendar(games, discoveryInboxRawgIds, { forceRefresh: releaseRefreshToken > 0 })
      .then((releaseCalendar) => { if (!cancelled) setUpcoming(releaseCalendar); })
      .catch(() => { if (!cancelled) setUpcoming([]); });
    return () => { cancelled = true; };
  }, [games, discoveryInboxRawgIds, releaseRefreshToken]);

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
              title={DEV_RECOMMENDATION_EMPTY_STATE ? 'No personalized recommendations produced' : recommendationState.status === 'notConfigured' ? RECOMMENDATION_COPY.notConfigured.title : recommendationState.status === 'coldStart' ? RECOMMENDATION_COPY.coldStart.title : t('discover.empty.title')}
              text={DEV_RECOMMENDATION_EMPTY_STATE ? 'Trending fallback is disabled for debugging; check the recommendation diagnostic report for pipeline counts and exclusions.' : recommendationState.status === 'notConfigured' ? RECOMMENDATION_COPY.notConfigured.body : recommendationState.status === 'coldStart' ? RECOMMENDATION_COPY.coldStart.body : t('discover.empty.text')}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5 sm:gap-3">
            {candidates.map((candidate) => {
              const canAddToInbox =
                !candidate.libraryStatus && !candidate.inboxStatus && onAddToInbox != null;
              const context = getDiscoveryContext(candidate, t);

              return (
                <DiscoverGameCard
                  key={candidate.game.rawgId}
                  game={candidate.game}
                  context={context}
                  contextTone={candidate.inboxStatus ? 'status' : 'muted'}
                  primaryAction={{ label: t('action.preview'), onClick: () => onOpenGame(candidate) }}
                  secondaryAction={
                    canAddToInbox
                      ? {
                          label: t('action.reviewLater'),
                          onClick: () => onAddToInbox(candidate.game, candidate.reason ?? ''),
                        }
                      : undefined
                  }
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
          return (
            <DiscoverGameCard
              key={candidate.game.rawgId}
              game={candidate.game}
              variant="upcoming"
              meta={<span className="inline-flex rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-xs font-bold text-mint">{formatReleaseDate(candidate.game.released)}</span>}
              context={candidate.reason ?? 'Matched to your library taste'}
              contextTone="accent"
              primaryAction={{ label: 'Preview', onClick: () => onOpenGame(candidate) }}
              secondaryAction={onAddToPlans ? { label: 'Plan', onClick: () => onAddToPlans(candidate.game) } : onAddToWishlist ? { label: 'Wishlist', onClick: () => onAddToWishlist(candidate.game) } : undefined}
              overflowActions={[
                ...(onAddToWishlist && onAddToPlans ? [{ label: 'Wishlist', onClick: () => onAddToWishlist(candidate.game) }] : []),
                { label: 'Ignore', onClick: () => onIgnore(candidate), tone: 'danger' as const },
              ]}
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
