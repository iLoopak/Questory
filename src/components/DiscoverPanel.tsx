import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../types/game';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { GameCard } from './GameCard';
import { EmptyState } from './EmptyState';
import { useI18n, type TFunction } from '../i18n';
import {
  fetchTrendingGames,
  fetchHiddenGems,
  fetchRecentlyReleasedGames,
} from '../services/discoverFeedsService';
import { fetchPersonalRecommendations } from '../services/personalRecommendationsService';

type DiscoverPanelProps = {
  games: Game[];
  discoveryInboxRawgIds: Set<number>;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
  onOpenGame: (candidate: DiscoveryCandidate) => void;
};

// ── Type adapter ──────────────────────────────────────────────────────────────

function candidateToGame(candidate: DiscoveryCandidate, userGames: Game[]): Game {
  const { game, libraryStatus } = candidate;

  // For library/wishlist games use the real Game object so the card reflects
  // actual status, rating, artwork, etc., and Details opens the right game.
  if (libraryStatus !== null) {
    const real = userGames.find((g) => g.rawgId === game.rawgId);
    if (real) return real;
  }

  return {
    id: `discover-${game.rawgId}`,
    title: game.title,
    platform: game.hasSteamVersion ? 'Steam' : (game.platforms[0] ?? 'PC'),
    status: 'Want to play',
    coverImage: game.coverUrl ?? '',
    backgroundImage: game.coverUrl ?? null,
    playtimeHours: 0,
    tags: game.tags.slice(0, 5),
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rawgId: game.rawgId,
    genres: game.genres,
    metacritic: game.metacritic ?? null,
    released: game.released,
  };
}

function metacriticColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

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

export function DiscoverPanel({ games, discoveryInboxRawgIds, onAddToInbox, onOpenGame }: DiscoverPanelProps) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchPersonalRecommendations(games, discoveryInboxRawgIds).catch(
        (): DiscoveryCandidate[] => [],
      ),
      fetchTrendingGames(games, discoveryInboxRawgIds).catch((): DiscoveryCandidate[] => []),
      fetchHiddenGems(games, discoveryInboxRawgIds).catch((): DiscoveryCandidate[] => []),
      fetchRecentlyReleasedGames(games, discoveryInboxRawgIds).catch(
        (): DiscoveryCandidate[] => [],
      ),
    ]).then(([recommended, trending, hiddenGems, recent]) => {
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

      setCandidates(all);
    });

    return () => {
      cancelled = true;
    };
    // games / discoveryInboxRawgIds re-stamp library and inbox status each time;
    // RAWG responses are served from module-level caches so re-fetching is fast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, discoveryInboxRawgIds, t]);

  const adaptedGames = useMemo(
    () => (candidates ?? []).map((c) => candidateToGame(c, games)),
    [candidates, games],
  );

  return (
    <div className="px-3 pb-24 pt-4">
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
                  metacritic ? (
                    <span
                      className={`absolute right-3 top-3 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm ${metacriticColor(metacritic)}`}
                    >
                      {metacritic}
                    </span>
                  ) : undefined
                }
                discoveryContext={context}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
