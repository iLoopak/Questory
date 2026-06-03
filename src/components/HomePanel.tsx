import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { compareQueueEntries, type PlatformQueueEntry } from '../lib/platformQueueStorage';
import { scoreGame } from '../lib/recommendationEngine';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { Game, GamePlatform } from '../types/game';

type HomePanelProps = {
  games: Game[];
  ignoredReviewGameIds: Set<string>;
  queueEntries: PlatformQueueEntry[];
  onOpenDetails: (game: Game) => void;
  onOpenLibrary: () => void;
  onOpenQueue: (platform?: GamePlatform) => void;
  onOpenReviewMode: (source: ReviewSource) => void;
  onOpenWishlist: () => void;
};

type QueuePreview = {
  entries: Array<{ entry: PlatformQueueEntry; game: Game }>;
  platform: GamePlatform;
  totalCount: number;
};

const focusSelector = '[data-home-focus="true"]';

export function HomePanel({
  games,
  ignoredReviewGameIds,
  queueEntries,
  onOpenDetails,
  onOpenLibrary,
  onOpenQueue,
  onOpenReviewMode,
  onOpenWishlist,
}: HomePanelProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const libraryGames = useMemo(() => games.filter((game) => game.collectionType === 'library'), [games]);

  const continuePlayingGames = useMemo(() => {
    return libraryGames
      .filter((game) => game.status === 'Playing')
      .sort((firstGame, secondGame) => getActivityTime(secondGame) - getActivityTime(firstGame))
      .slice(0, 4);
  }, [libraryGames]);

  const activeQueuePreviews = useMemo<QueuePreview[]>(() => {
    const groupedEntries = new Map<GamePlatform, PlatformQueueEntry[]>();

    queueEntries.forEach((entry) => {
      const game = gamesById.get(entry.gameId);
      if (!game) {
        return;
      }

      const platformEntries = groupedEntries.get(entry.targetPlatform) ?? [];
      platformEntries.push(entry);
      groupedEntries.set(entry.targetPlatform, platformEntries);
    });

    return Array.from(groupedEntries.entries())
      .map(([platform, entries]) => ({
        entries: entries
          .sort(compareQueueEntries)
          .slice(0, 2)
          .map((entry) => ({ entry, game: gamesById.get(entry.gameId) as Game })),
        platform,
        totalCount: entries.length,
      }))
      .sort((firstQueue, secondQueue) => {
        const firstEntry = firstQueue.entries[0]?.entry;
        const secondEntry = secondQueue.entries[0]?.entry;
        return (firstEntry?.queuePosition ?? 99) - (secondEntry?.queuePosition ?? 99) || secondQueue.totalCount - firstQueue.totalCount;
      })
      .slice(0, 3);
  }, [gamesById, queueEntries]);

  const queueSnapshot = useMemo(() => {
    const platformCounts = new Map<GamePlatform, number>();
    queueEntries.forEach((entry) => platformCounts.set(entry.targetPlatform, (platformCounts.get(entry.targetPlatform) ?? 0) + 1));

    return Array.from(platformCounts.entries())
      .map(([platform, count]) => ({ count, platform }))
      .sort((first, second) => second.count - first.count || first.platform.localeCompare(second.platform))
      .slice(0, 5);
  }, [queueEntries]);

  const wishlistHighlight = useMemo(() => pickWishlistHighlight(games), [games]);

  const recentlyAddedGames = useMemo(() => {
    return games
      .filter((game) => game.collectionType === 'library' && (game.importedAt || game.updatedAt))
      .sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))
      .slice(0, 4);
  }, [games]);

  const reviewRemainingCount = useMemo(() => {
    return games.filter((game) => isBacklogReviewCandidate(game) && !ignoredReviewGameIds.has(game.id)).length;
  }, [games, ignoredReviewGameIds]);

  const recommendedToday = useMemo(() => {
    const queuedGameIds = new Set(queueEntries.map((entry) => entry.gameId));
    const activePlatforms = new Set<string>([
      ...continuePlayingGames.map((game) => game.platform),
      ...queueEntries.map((entry) => entry.targetPlatform),
    ]);

    return libraryGames
      .filter((game) => game.status !== 'Finished' && game.status !== 'Dropped')
      .map((game) => {
        const scoredGame = scoreGame(game, {
          availableTime: '30 min',
          includeFinishedGames: false,
          includeWishlist: false,
          mood: 'comfort',
          preferredPlatform: 'Any',
        });
        const queueBoost = queuedGameIds.has(game.id) ? 42 : 0;
        const playingBoost = game.status === 'Playing' ? 34 : 0;
        const activePlatformBoost = activePlatforms.has(game.platform) ? 10 : 0;

        return {
          ...scoredGame,
          reasons: [
            queuedGameIds.has(game.id) ? 'Next in Platforms' : null,
            game.status === 'Playing' ? 'Already in progress' : null,
            activePlatforms.has(game.platform) ? `Fits active ${game.platform} play` : null,
            ...scoredGame.reasons,
          ].filter((reason): reason is string => Boolean(reason)).slice(0, 3),
          score: scoredGame.score + queueBoost + playingBoost + activePlatformBoost,
        };
      })
      .sort((first, second) => second.score - first.score)
      .slice(0, 3);
  }, [continuePlayingGames, libraryGames, queueEntries]);

  useEffect(() => {
    function handleHomeKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        !shellRef.current
      ) {
        return;
      }

      const focusableItems = Array.from(shellRef.current.querySelectorAll<HTMLElement>(focusSelector));
      if (focusableItems.length === 0) {
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeIndex = activeElement ? focusableItems.indexOf(activeElement) : -1;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        focusableItems[(activeIndex + 1 + focusableItems.length) % focusableItems.length].focus();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusableItems[(activeIndex - 1 + focusableItems.length) % focusableItems.length].focus();
        return;
      }

      if ((event.key === 'a' || event.key === 'A') && activeElement?.matches(focusSelector)) {
        event.preventDefault();
        activeElement.click();
        return;
      }

      if (event.key === 'Escape' || event.key === 'b' || event.key === 'B') {
        event.preventDefault();
        onOpenLibrary();
        return;
      }

      if (event.key === 'x' || event.key === 'X') {
        event.preventDefault();
        onOpenReviewMode('backlog');
        return;
      }

      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        onOpenQueue();
      }
    }

    window.addEventListener('keydown', handleHomeKeyDown);
    return () => window.removeEventListener('keydown', handleHomeKeyDown);
  }, [onOpenLibrary, onOpenQueue, onOpenReviewMode]);

  return (
    <section ref={shellRef} className="qs-home-shell grid gap-4 lg:h-[calc(100vh-116px)] lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:overflow-hidden">
      <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-1">
        <section className="rounded-2xl border border-mint/18 bg-gradient-to-br from-ink-900 via-ink-900/95 to-ink-950 p-4 shadow-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-mint">Home</div>
              <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">What should I play next?</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">A focused launch view for handheld play: continue, pick the next planned game, or process what needs attention.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              <span>A Open</span>
              <span>Y Platforms</span>
              <span>X Quest Queue</span>
              <span>B Library</span>
            </div>
          </div>
        </section>

        <HomeSection title="Continue Playing" actionLabel="Library" onAction={onOpenLibrary}>
          {continuePlayingGames.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {continuePlayingGames.map((game) => (
                <GamePosterButton key={game.id} game={game} eyebrow="Currently playing" onClick={() => onOpenDetails(game)} />
              ))}
            </div>
          ) : (
            <EmptyState title="No Active Games" text="Choose a game and start playing." actionLabel="Browse Library" onAction={onOpenLibrary} />
          )}
        </HomeSection>

        <HomeSection title="Next Up" actionLabel="Open Platforms" onAction={() => onOpenQueue()}>
          {activeQueuePreviews.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-3">
              {activeQueuePreviews.map((queue) => (
                <article key={queue.platform} className="rounded-xl border border-skyglass/15 bg-ink-950/72 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-base font-semibold text-white">{queue.platform} Plan</h4>
                    <button
                      className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint transition hover:bg-mint/20"
                      data-home-focus="true"
                      onClick={() => onOpenQueue(queue.platform)}
                      type="button"
                    >
                      Open
                    </button>
                  </div>
                  <ol className="mt-3 grid gap-2">
                    {queue.entries.map(({ entry, game }) => (
                      <li key={entry.gameId}>
                        <button
                          className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-left transition hover:border-mint/40 hover:bg-mint/10"
                          data-home-focus="true"
                          onClick={() => onOpenDetails(game)}
                          type="button"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-mint/25 bg-mint/10 text-sm font-semibold text-mint">{entry.queuePosition}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{game.title}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{game.platform}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No Platform Plan Yet" text="Build your first platform plan from Quest Queue." actionLabel="Open Quest Queue" onAction={() => onOpenReviewMode('backlog')} />
          )}
        </HomeSection>

        <HomeSection title="Recommended Today" actionLabel="Process" onAction={() => onOpenReviewMode('backlog')}>
          {recommendedToday.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {recommendedToday.map((recommendation) => (
                <button
                  key={recommendation.game.id}
                  className="min-h-28 rounded-xl border border-skyglass/15 bg-ink-950/70 p-3 text-left transition hover:border-mint/35 hover:bg-mint/10 hover:shadow-glow"
                  data-home-focus="true"
                  onClick={() => onOpenDetails(recommendation.game)}
                  type="button"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{recommendation.game.platform}</span>
                  <span className="mt-2 block line-clamp-2 text-lg font-semibold text-white">{recommendation.game.title}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {recommendation.reasons.map((reason) => (
                      <span key={reason} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">{reason}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No Recommendation Yet" text="Add a game to Platforms or mark something as Playing first." actionLabel="Open Platforms" onAction={() => onOpenQueue()} />
          )}
        </HomeSection>
      </div>

      <aside className="min-w-0 space-y-4 lg:overflow-y-auto lg:pl-1">
        <HomeSection compact title="Your Platforms" actionLabel="All Platforms" onAction={() => onOpenQueue()}>
          {queueSnapshot.length > 0 ? (
            <div className="grid gap-2">
              {queueSnapshot.map((queue) => (
                <button
                  key={queue.platform}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-skyglass/15 bg-ink-950/72 px-3 text-left transition hover:border-mint/35 hover:bg-mint/10"
                  data-home-focus="true"
                  onClick={() => onOpenQueue(queue.platform)}
                  type="button"
                >
                  <span>
                    <span className="block font-semibold text-white">{queue.platform}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Open Platforms</span>
                  </span>
                  <span className="text-sm font-semibold text-mint">{queue.count} {queue.count === 1 ? 'game' : 'games'} planned</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No Platform Plan Yet" text="Build your first platform plan from Quest Queue." actionLabel="Build Plan" onAction={() => onOpenReviewMode('backlog')} />
          )}
        </HomeSection>

        <HomeSection compact title="Wishlist Highlight" actionLabel="Wishlist" onAction={onOpenWishlist}>
          {wishlistHighlight ? (
            <GamePosterButton game={wishlistHighlight} eyebrow={wishlistHighlight.priority === 'high' ? 'High priority' : 'Wishlist pick'} wide onClick={() => onOpenDetails(wishlistHighlight)} />
          ) : (
            <EmptyState title="No Wishlist Yet" text="Add games you want to play later." actionLabel="Open Wishlist" onAction={onOpenWishlist} />
          )}
        </HomeSection>

        <HomeSection compact title="Recently Added" actionLabel="Library" onAction={onOpenLibrary}>
          {recentlyAddedGames.length > 0 ? (
            <div className="grid gap-2">
              {recentlyAddedGames.map((game) => (
                <button
                  key={game.id}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/10 bg-ink-950/70 px-3 text-left transition hover:border-mint/35 hover:bg-mint/10"
                  data-home-focus="true"
                  onClick={() => onOpenDetails(game)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">{game.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{getSourceLabel(game)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{game.platform}</span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing Added Yet" text="Import Steam, Retro, or add a manual game." actionLabel="Open Library" onAction={onOpenLibrary} />
          )}
        </HomeSection>

        <section className="rounded-2xl border border-mint/18 bg-mint/10 p-4 shadow-panel">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Quest Queue Remaining</div>
          <div className="mt-2 text-3xl font-semibold text-white">{reviewRemainingCount}</div>
          <p className="mt-1 text-sm text-slate-300">{reviewRemainingCount === 1 ? 'game ready for Quest Queue' : 'games ready for Quest Queue'}</p>
          <button
            className="mt-4 min-h-11 w-full rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            data-home-focus="true"
            onClick={() => onOpenReviewMode('backlog')}
            type="button"
          >
            Open Quest Queue
          </button>
        </section>
      </aside>
    </section>
  );
}

function HomeSection({
  actionLabel,
  children,
  compact = false,
  title,
  onAction,
}: {
  actionLabel?: string;
  children: ReactNode;
  compact?: boolean;
  title: string;
  onAction?: () => void;
}) {
  return (
    <section className={`rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {actionLabel && onAction ? (
          <button
            className="min-h-10 rounded-lg border border-skyglass/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
            data-home-focus="true"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function GamePosterButton({ game, eyebrow, onClick, wide = false }: { game: Game; eyebrow: string; onClick: () => void; wide?: boolean }) {
  const coverSources = getGameCoverSources(game);
  const coverSource = coverSources[0];

  return (
    <button
      className={`group relative min-h-56 overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-left shadow-panel transition hover:border-mint/40 hover:shadow-glow ${wide ? 'w-full' : ''}`}
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      <div className="absolute inset-0">
        {coverSource ? (
          <img alt="" className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105" decoding="async" loading="lazy" src={coverSource} />
        ) : (
          <div className="grid h-full place-items-center bg-ink-800 text-6xl font-semibold text-mint/60">{game.title.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
      </div>
      <div className="relative flex min-h-56 flex-col justify-end p-3">
        <span className="mb-2 w-fit rounded-full border border-mint/30 bg-ink-950/78 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-mint">{eyebrow}</span>
        <span className="line-clamp-2 text-xl font-semibold leading-tight text-white drop-shadow">{game.title}</span>
        <span className="platform-badge mt-2 w-fit rounded-full px-2.5 py-1 text-xs font-semibold">{game.platform}</span>
      </div>
    </button>
  );
}

function EmptyState({ actionLabel, text, title, onAction }: { actionLabel: string; text: string; title: string; onAction: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-ink-950/55 p-4 text-center">
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      <button
        className="mt-4 min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
        data-home-focus="true"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function pickWishlistHighlight(games: Game[]) {
  const wishlistGames = games.filter((game) => game.collectionType === 'wishlist');

  if (wishlistGames.length === 0) {
    return null;
  }

  const highPriorityGame = wishlistGames
    .filter((game) => game.priority === 'high')
    .sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))[0];

  if (highPriorityGame) {
    return highPriorityGame;
  }

  const recentlyAddedGame = [...wishlistGames].sort((firstGame, secondGame) => getRecentTime(secondGame) - getRecentTime(firstGame))[0];
  if (recentlyAddedGame && getRecentTime(recentlyAddedGame) > 0) {
    return recentlyAddedGame;
  }

  const stableIndex = new Date().getUTCDate() % wishlistGames.length;
  return wishlistGames[stableIndex];
}

function isBacklogReviewCandidate(game: Game) {
  return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped';
}

function getActivityTime(game: Game) {
  return getTime(game.lastPlayedAt) || getTime(game.updatedAt) || getTime(game.importedAt);
}

function getRecentTime(game: Game) {
  return getTime(game.importedAt) || getTime(game.updatedAt) || getTime(game.wishlistImportedAt) || getTime(game.wishlistSyncedAt);
}

function getTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function getSourceLabel(game: Game) {
  if (game.externalSource === 'steam') {
    return 'Steam import';
  }

  if (game.externalSource === 'retro-rom') {
    return 'Retro import';
  }

  if (game.externalSource === 'manual') {
    return 'Manual add';
  }

  return 'Recently added';
}
