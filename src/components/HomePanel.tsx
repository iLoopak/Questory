import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDealPrice } from './DealCoverBadges';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { compareQueueEntries, type PlatformQueueEntry, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState } from '../types/steam';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { PlatformBadge } from './PlatformBadge';

type HomePanelProps = {
  appTitle?: string;
  avatar?: ReactNode;
  shelfTitle?: string;
  featuredGame?: Game | null;
  games: Game[];
  ignoredReviewGameIds: Set<string>;
  queueState: PlatformQueueState;
  steamAchievementSyncState?: SteamAchievementSyncState;
  steamPlaytimeRefreshState?: SteamPlaytimeRefreshState;
  onOpenDetails: (game: Game) => void;
  onOpenLibrary: () => void;
  onOpenQueue: (platform?: GamePlatform) => void;
  onOpenReviewMode: (source: ReviewSource) => void;
  onOpenWishlist: () => void;
  onPlayToday: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onSyncSteamData?: () => void;
};

type QueuePreview = {
  entries: Array<{ entry: PlatformQueueEntry; game: Game }>;
  platform: GamePlatform;
  totalCount: number;
};

type KeepPlayingEntry = { game: Game; reason: string };

const focusSelector = '[data-home-focus="true"]';

export function HomePanel({
  appTitle = 'QuestShelf',
  avatar,
  shelfTitle = '',
  featuredGame = null,
  games,
  ignoredReviewGameIds,
  queueState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  onOpenDetails,
  onOpenLibrary,
  onOpenQueue,
  onOpenReviewMode,
  onOpenWishlist,
  onPlayToday,
  onStatusChange,
  onSyncSteamData,
}: HomePanelProps) {
  const { t } = useI18n();
  const [actionSheetGame, setActionSheetGame] = useState<Game | null>(null);
  const queueEntries = queueState.entries;
  const shellRef = useRef<HTMLElement | null>(null);
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const libraryGames = useMemo(() => games.filter((game) => game.collectionType === 'library'), [games]);

  const continuePlayingGames = useMemo(() => {
    return libraryGames
      .filter((game) => game.status === 'Playing')
      .sort((a, b) => getActivityTime(b) - getActivityTime(a))
      .slice(0, 4);
  }, [libraryGames]);

  const activeQueuePreviews = useMemo<QueuePreview[]>(() => {
    const groupedEntries = new Map<GamePlatform, PlatformQueueEntry[]>();
    queueEntries.forEach((entry) => {
      const game = gamesById.get(entry.gameId);
      if (!game) return;
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
      .sort((a, b) => {
        const ae = a.entries[0]?.entry;
        const be = b.entries[0]?.entry;
        return (ae?.queuePosition ?? 99) - (be?.queuePosition ?? 99) || b.totalCount - a.totalCount;
      })
      .slice(0, 3);
  }, [gamesById, queueEntries]);

  const keepPlayingGames = useMemo<KeepPlayingEntry[]>(() => {
    const shownIds = new Set(continuePlayingGames.map((g) => g.id));
    const result: KeepPlayingEntry[] = [];

    const addedPlatforms = new Set<GamePlatform>();
    for (const entry of [...queueEntries].sort(compareQueueEntries)) {
      if (result.length >= 3) break;
      const game = gamesById.get(entry.gameId);
      if (!game || shownIds.has(game.id) || game.status === 'Playing') continue;
      if (addedPlatforms.has(entry.targetPlatform)) continue;
      result.push({ game, reason: `${t('home.topPlanCandidate')} · ${entry.targetPlatform}` });
      addedPlatforms.add(entry.targetPlatform);
      shownIds.add(game.id);
    }

    if (result.length < 3) {
      const recentlyPlayed = libraryGames
        .filter(
          (g) =>
            !shownIds.has(g.id) &&
            g.status !== 'Finished' &&
            g.status !== 'Dropped' &&
            g.status !== 'Playing' &&
            getActivityTime(g) > 0,
        )
        .sort((a, b) => getActivityTime(b) - getActivityTime(a));
      for (const game of recentlyPlayed) {
        if (result.length >= 3) break;
        result.push({ game, reason: t('home.playedRecently') });
      }
    }

    return result;
  }, [continuePlayingGames, gamesById, libraryGames, queueEntries, t]);

  const wishlistDeals = useMemo(() => {
    return games
      .filter(
        (g) =>
          g.collectionType === 'wishlist' &&
          typeof g.itadDiscountPercent === 'number' &&
          g.itadDiscountPercent > 0 &&
          typeof g.itadCurrentBestPrice === 'number' &&
          g.itadCurrentBestCurrency,
      )
      .sort((a, b) => {
        if (a.itadIsHistoricalLow && !b.itadIsHistoricalLow) return -1;
        if (!a.itadIsHistoricalLow && b.itadIsHistoricalLow) return 1;
        return (b.itadDiscountPercent ?? 0) - (a.itadDiscountPercent ?? 0);
      })
      .slice(0, 8);
  }, [games]);

  const reviewRemainingCount = useMemo(() => {
    return games.filter((game) => isBacklogReviewCandidate(game) && !ignoredReviewGameIds.has(game.id)).length;
  }, [games, ignoredReviewGameIds]);

  const hasSteamGames = useMemo(() => games.some((g) => g.steamAppId != null), [games]);

  const lastPlaytimeSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.steamAppId != null && g.lastSteamActivityAt)
      .map((g) => g.lastSteamActivityAt as string);
    return times.length > 0 ? times.reduce((a, b) => (a > b ? a : b)) : null;
  }, [games]);

  const lastAchievementSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.steamAchievementsLastCheckedAt != null)
      .map((g) => g.steamAchievementsLastCheckedAt as number);
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [games]);

  const activePlayingPlatforms = useMemo(() => {
    const platformCounts = new Map<GamePlatform, number>();
    continuePlayingGames.forEach((g) => {
      platformCounts.set(g.platform, (platformCounts.get(g.platform) ?? 0) + 1);
    });
    return Array.from(platformCounts.entries()).map(([platform, count]) => ({ count, platform }));
  }, [continuePlayingGames]);

  const isSteamSyncing =
    steamAchievementSyncState?.status === 'loading' || steamPlaytimeRefreshState?.status === 'loading';

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
      if (focusableItems.length === 0) return;

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
        if (actionSheetGame) {
          setActionSheetGame(null);
          return;
        }
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
  }, [actionSheetGame, onOpenLibrary, onOpenQueue, onOpenReviewMode]);

  return (
    <section ref={shellRef} className="qs-home-shell space-y-4 pb-4">
      {/* Compact Hero — full width */}
      <section className="flex items-center gap-3 rounded-xl border border-mint/18 bg-gradient-to-r from-ink-900 to-ink-950 px-4 py-3 shadow-panel">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{appTitle}</div>
          {shelfTitle ? <div className="text-xs font-semibold text-mint">{shelfTitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="text-xl font-bold text-white">{continuePlayingGames.length}</div>
            <div className="text-xs text-slate-400">{t('home.heroActiveGames')}</div>
          </div>
          <div className="h-8 w-px bg-skyglass/20" />
          <div className="text-right">
            <div className="text-xl font-bold text-white">{reviewRemainingCount}</div>
            <div className="text-xs text-slate-400">{t('home.heroQueueCount')}</div>
          </div>
        </div>
        {featuredGame ? (
          <button
            className="ml-1 shrink-0 rounded-full border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint transition hover:bg-mint/20"
            data-home-focus="true"
            onClick={() => onOpenDetails(featuredGame)}
            type="button"
          >
            ⭐ {featuredGame.title}
          </button>
        ) : null}
      </section>

      {/* Two-column layout on desktop — no overflow on either column, window scroll only */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:items-start lg:gap-4">
        {/* Left: main content */}
        <div className="space-y-4">
          {/* Continue Playing */}
          <HomeSection title={t('home.continuePlaying')} actionLabel={t('collection.library')} onAction={onOpenLibrary}>
            {continuePlayingGames.length > 0 ? (
              <div className={`grid gap-3 ${continuePlayingGames.length === 1 ? '' : 'sm:grid-cols-2'}`}>
                {continuePlayingGames.map((game) => (
                  <GamePosterButton
                    key={game.id}
                    game={game}
                    eyebrow={t('home.currentlyPlaying')}
                    hero={continuePlayingGames.length === 1}
                    onClick={() => setActionSheetGame(game)}
                    queueState={queueState}
                  />
                ))}
              </div>
            ) : (
              <OnboardingSteps
                onOpenLibrary={onOpenLibrary}
                onOpenReviewMode={() => onOpenReviewMode('backlog')}
                t={t}
              />
            )}
          </HomeSection>

          {/* Keep Playing — clear-reason picks */}
          {keepPlayingGames.length > 0 ? (
            <HomeSection title={t('home.keepPlaying')}>
              <div className="grid gap-3 sm:grid-cols-3">
                {keepPlayingGames.map(({ game, reason }) => (
                  <KeepPlayingCard
                    key={game.id}
                    game={game}
                    reason={reason}
                    onClick={() => setActionSheetGame(game)}
                    queueState={queueState}
                  />
                ))}
              </div>
            </HomeSection>
          ) : null}

          {/* Platform Plans — Next Up */}
          <HomeSection title={t('home.nextUp')} actionLabel={t('home.openQueue')} onAction={() => onOpenQueue()}>
            {activeQueuePreviews.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeQueuePreviews.map((queue) => (
                  <article key={queue.platform} className="rounded-xl border border-skyglass/15 bg-ink-950/72 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-base font-semibold text-white">
                        {queue.platform} {t('home.planSuffix')}
                      </h4>
                      <button
                        className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-3 text-xs font-semibold text-mint transition hover:bg-mint/20"
                        data-home-focus="true"
                        onClick={() => onOpenQueue(queue.platform)}
                        type="button"
                      >
                        {t('home.open')}
                      </button>
                    </div>
                    <ol className="mt-3 grid gap-2">
                      {queue.entries.map(({ entry, game }) => (
                        <li key={entry.gameId}>
                          <button
                            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-left transition hover:border-mint/40 hover:bg-mint/10"
                            data-home-focus="true"
                            onClick={() => setActionSheetGame(game)}
                            type="button"
                          >
                            <span className="w-7 shrink-0 text-center text-xs font-semibold text-slate-500">
                              #{entry.queuePosition}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-white">{game.title}</span>
                              <PlatformBadge
                                className="mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold"
                                platform={entry.targetPlatform}
                                queueState={queueState}
                              />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('home.noPlatformPlan')}
                text={t('home.noPlatformPlanText')}
                actionLabel={t('review.title')}
                onAction={() => onOpenReviewMode('backlog')}
              />
            )}
          </HomeSection>

          {/* Quest Queue widget */}
          <section className="rounded-2xl border border-mint/18 bg-mint/10 p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('home.reviewRemaining')}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{reviewRemainingCount}</div>
            <p className="mt-1 text-sm text-slate-300">
              {reviewRemainingCount === 1 ? t('home.gameReadyReview') : t('home.gamesReadyReview')}
            </p>
            <button
              className="mt-4 min-h-11 w-full rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
              data-home-focus="true"
              onClick={() => onOpenReviewMode('backlog')}
              type="button"
            >
              {t('home.reviewNextGame')}
            </button>
          </section>
        </div>

        {/* Right sidebar — stacks below main on mobile, sits beside it on desktop */}
        <div className="mt-4 space-y-4 lg:mt-0">
          {/* Wishlist Deals */}
          <HomeSection compact title={t('home.wishlistDeals')} actionLabel={t('wishlist.title')} onAction={onOpenWishlist}>
            {wishlistDeals.length > 0 ? (
              <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2">
                {wishlistDeals.map((game) => (
                  <WishlistDealCard key={game.id} game={game} onClick={() => onOpenDetails(game)} t={t} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('home.noWishlistDeals')}
                text={t('home.noWishlistDealsText')}
                actionLabel={t('home.openWishlist')}
                onAction={onOpenWishlist}
              />
            )}
          </HomeSection>

          {/* Active Platforms */}
          <HomeSection compact title={t('home.activePlatforms')} actionLabel={t('home.allPlatforms')} onAction={() => onOpenQueue()}>
            {activePlayingPlatforms.length > 0 ? (
              <div className="grid gap-2">
                {activePlayingPlatforms.map(({ platform, count }) => (
                  <button
                    key={platform}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-skyglass/15 bg-ink-950/72 px-3 text-left transition hover:border-mint/35 hover:bg-mint/10"
                    data-home-focus="true"
                    onClick={() => onOpenQueue(platform)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{platform}</span>
                      <PlatformBadge
                        className="mt-0.5 w-fit rounded-full px-2 py-0.5 text-xs font-semibold"
                        platform={platform}
                        queueState={queueState}
                      />
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-mint">
                      {count} {count === 1 ? t('home.activeGame') : t('home.activeGames')}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('home.noActivePlatforms')}
                text={t('home.noActivePlatformsText')}
                actionLabel={t('home.browseLibrary')}
                onAction={onOpenLibrary}
              />
            )}
          </HomeSection>

          {/* Steam Sync */}
          {hasSteamGames && onSyncSteamData ? (
            <HomeSection compact title={t('home.steamSync')}>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5">
                  <span className="text-xs text-slate-400">{t('home.playtimeSync')}</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {steamPlaytimeRefreshState?.status === 'loading'
                      ? t('home.syncingSteamData')
                      : formatRelativeTime(lastPlaytimeSyncAt, t('home.neverSynced'))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5">
                  <span className="text-xs text-slate-400">{t('home.achievementSync')}</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {steamAchievementSyncState?.status === 'loading'
                      ? t('home.syncingSteamData')
                      : formatRelativeTime(lastAchievementSyncAt, t('home.neverSynced'))}
                  </span>
                </div>
              </div>
              <button
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-skyglass/15 px-3 text-xs font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:opacity-50"
                data-home-focus="true"
                disabled={isSteamSyncing}
                onClick={onSyncSteamData}
                type="button"
              >
                <Icon
                  name={isSteamSyncing ? 'refresh-cw' : 'steam'}
                  size={13}
                  strokeWidth={2}
                  className={isSteamSyncing ? 'animate-spin' : ''}
                />
                {isSteamSyncing ? t('home.syncingSteamData') : t('home.syncSteamData')}
              </button>
            </HomeSection>
          ) : null}
        </div>
      </div>

      {/* Action sheet for game cards */}
      {actionSheetGame ? (
        <HomeActionSheet
          game={actionSheetGame}
          onClose={() => setActionSheetGame(null)}
          onOpenDetails={(game) => {
            setActionSheetGame(null);
            onOpenDetails(game);
          }}
          onPlayToday={(game) => {
            onPlayToday(game);
            setActionSheetGame(null);
          }}
          onStatusChange={(gameId, status) => {
            onStatusChange(gameId, status);
            setActionSheetGame(null);
          }}
          t={t}
        />
      ) : null}
    </section>
  );
}

function getGamePlatformLabel(game: Game, queueState: PlatformQueueState): GamePlatform {
  return queueState.entries.find((entry) => entry.gameId === game.id)?.targetPlatform ?? game.platform;
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

function GamePosterButton({
  game,
  eyebrow,
  hero = false,
  onClick,
  queueState,
  wide = false,
}: {
  game: Game;
  eyebrow: string;
  hero?: boolean;
  onClick: () => void;
  queueState: PlatformQueueState;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const coverSources = getGameCoverSources(game);
  const coverSource = coverSources[0];
  const minHeightClass = hero ? 'min-h-72' : 'min-h-56';
  const playtime = game.playtimeHours > 0 ? `${Math.round(game.playtimeHours)}${t('home.hoursPlayed')}` : null;

  return (
    <button
      className={`group relative overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-left shadow-panel transition hover:border-mint/40 hover:shadow-glow ${minHeightClass} ${wide ? 'w-full' : ''}`}
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      <div className="absolute inset-0">
        {coverSource ? (
          <img
            alt=""
            className="h-full w-full object-cover opacity-90 transition duration-300 group-hover:scale-105"
            decoding="async"
            loading="lazy"
            src={coverSource}
          />
        ) : (
          <div className="grid h-full place-items-center bg-ink-800 text-6xl font-semibold text-mint/60">
            {game.title.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-transparent" />
      </div>
      <div className={`relative flex flex-col justify-end p-3 ${minHeightClass}`}>
        <span className="mb-2 w-fit rounded-full border border-mint/30 bg-ink-950/78 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-mint">
          {eyebrow}
        </span>
        <span className={`line-clamp-2 font-semibold leading-tight text-white drop-shadow ${hero ? 'text-2xl' : 'text-xl'}`}>
          {game.title}
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PlatformBadge
            className="w-fit rounded-full px-2.5 py-1 text-xs font-semibold"
            platform={getGamePlatformLabel(game, queueState)}
            queueState={queueState}
          />
          {playtime ? <span className="text-xs text-slate-400">{playtime}</span> : null}
        </div>
      </div>
    </button>
  );
}

function KeepPlayingCard({
  game,
  onClick,
  reason,
  queueState,
}: {
  game: Game;
  onClick: () => void;
  reason: string;
  queueState: PlatformQueueState;
}) {
  const coverSources = getGameCoverSources(game);
  const coverSource = coverSources[0];

  return (
    <button
      className="group relative min-h-32 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70 text-left transition hover:border-mint/35 hover:shadow-glow"
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      {coverSource ? (
        <div className="absolute inset-0">
          <img
            alt=""
            className="h-full w-full object-cover opacity-20 transition duration-300 group-hover:opacity-30"
            decoding="async"
            loading="lazy"
            src={coverSource}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 to-transparent" />
        </div>
      ) : null}
      <div className="relative p-3">
        <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
          {reason}
        </span>
        <PlatformBadge
          className="mt-2 w-fit rounded-full px-2 py-0.5 text-xs font-semibold"
          platform={getGamePlatformLabel(game, queueState)}
          queueState={queueState}
        />
        <p className="mt-1 line-clamp-2 text-sm font-semibold text-white">{game.title}</p>
      </div>
    </button>
  );
}

function WishlistDealCard({
  game,
  onClick,
  t,
}: {
  game: Game;
  onClick: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const coverSources = getGameCoverSources(game);
  const coverSource = coverSources[0];
  const discount = typeof game.itadDiscountPercent === 'number' ? `-${game.itadDiscountPercent}%` : null;
  const price =
    typeof game.itadCurrentBestPrice === 'number' && game.itadCurrentBestCurrency
      ? formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency)
      : null;

  return (
    <button
      className="w-36 shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70 text-left transition hover:border-mint/35"
      data-home-focus="true"
      onClick={onClick}
      type="button"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-ink-800">
        {coverSource ? (
          <img alt="" className="h-full w-full object-cover" decoding="async" loading="lazy" src={coverSource} />
        ) : (
          <div className="grid h-full place-items-center text-3xl font-bold text-mint/40">
            {game.title.slice(0, 1).toUpperCase()}
          </div>
        )}
        {discount ? (
          <div className="absolute left-1.5 top-1.5 rounded bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">
            {discount}
          </div>
        ) : null}
        {game.itadIsHistoricalLow ? (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-xs font-bold text-amber-950">
            <Icon name="trophy" size={9} strokeWidth={2.5} />
            {t('itad.historicalLow')}
          </div>
        ) : null}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold text-white">{game.title}</p>
        {price ? <p className="mt-1 text-xs font-semibold text-mint">{price}</p> : null}
        {game.itadCurrentBestShop ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">{game.itadCurrentBestShop}</p>
        ) : null}
      </div>
    </button>
  );
}

function HomeActionSheet({
  game,
  onClose,
  onOpenDetails,
  onPlayToday,
  onStatusChange,
  t,
}: {
  game: Game;
  onClose: () => void;
  onOpenDetails: (game: Game) => void;
  onPlayToday: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const isPlaying = game.status === 'Playing';
  const toggleStatus: GameStatus = isPlaying ? 'Finished' : 'Playing';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-t-2xl border-t border-skyglass/20 bg-ink-900 px-4 pb-safe-bottom pt-4 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-skyglass/30" />
        <div className="mb-4">
          <p className="font-semibold text-white">{game.title}</p>
          <p className="text-xs text-slate-400">{game.platform}</p>
        </div>
        <div className="grid gap-2">
          <button
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-mint/25 bg-mint/10 px-4 text-left transition hover:bg-mint/20"
            onClick={() => onPlayToday(game)}
            type="button"
          >
            <Icon name="play-circle" size={18} strokeWidth={2} className="shrink-0 text-mint" />
            <span className="font-semibold text-mint">{t('home.playToday')}</span>
          </button>
          <button
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-skyglass/15 bg-ink-950/70 px-4 text-left transition hover:border-mint/35 hover:bg-mint/10"
            onClick={() => onOpenDetails(game)}
            type="button"
          >
            <Icon name="external-link" size={18} strokeWidth={2} className="shrink-0 text-slate-300" />
            <span className="text-slate-200">{t('home.openDetails')}</span>
          </button>
          <button
            className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 text-left transition ${
              isPlaying
                ? 'border-emerald-500/25 bg-emerald-500/10 hover:border-emerald-500/45 hover:bg-emerald-500/15'
                : 'border-skyglass/15 bg-ink-950/70 hover:border-mint/35 hover:bg-mint/10'
            }`}
            onClick={() => onStatusChange(game.id, toggleStatus)}
            type="button"
          >
            <Icon
              name="check-circle"
              size={18}
              strokeWidth={2}
              className={`shrink-0 ${isPlaying ? 'text-emerald-400' : 'text-slate-300'}`}
            />
            <span className={isPlaying ? 'text-emerald-300' : 'text-slate-200'}>
              {isPlaying ? t('home.markFinished') : t('home.markAsPlaying')}
            </span>
          </button>
        </div>
        <button
          className="mt-3 min-h-11 w-full rounded-xl text-sm text-slate-400 transition hover:text-slate-200"
          onClick={onClose}
          type="button"
        >
          {t('home.cancelAction')}
        </button>
      </div>
    </div>
  );
}

function OnboardingSteps({
  onOpenLibrary,
  onOpenReviewMode,
  t,
}: {
  onOpenLibrary: () => void;
  onOpenReviewMode: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const steps = [
    { action: onOpenLibrary, label: t('home.importGamesTitle'), text: t('home.importGamesText') },
    { action: onOpenReviewMode, label: t('home.reviewQueueTitle'), text: t('home.reviewQueueText') },
    { action: undefined as (() => void) | undefined, label: t('home.chooseToPlayTitle'), text: t('home.chooseToPlayText') },
  ];

  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-ink-950/55 p-4">
      <p className="mb-4 text-sm font-semibold text-white">{t('home.getStarted')}</p>
      <p className="mb-4 text-xs text-slate-400">{t('home.getStartedSubtitle')}</p>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-xs font-bold text-mint">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{step.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{step.text}</p>
            </div>
            {step.action ? (
              <button
                className="shrink-0 rounded-lg border border-mint/30 bg-mint/10 px-3 py-1.5 text-xs font-semibold text-mint transition hover:bg-mint/20"
                data-home-focus="true"
                onClick={step.action}
                type="button"
              >
                {index === 0 ? t('home.openLibrary') : t('home.reviewNextGame')}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState({
  actionLabel,
  text,
  title,
  onAction,
}: {
  actionLabel: string;
  text: string;
  title: string;
  onAction: () => void;
}) {
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

function isBacklogReviewCandidate(game: Game) {
  return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped';
}

function getActivityTime(game: Game) {
  return getTime(game.lastPlayedAt) || getTime(game.updatedAt) || getTime(game.importedAt);
}

function getTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function formatRelativeTime(value: string | Date | number | null | undefined, neverLabel: string): string {
  if (!value) return neverLabel;
  const ms = typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : value;
  if (!ms || isNaN(ms)) return neverLabel;
  const diffMs = Date.now() - ms;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 2) return 'Just now';
  if (diffHours < 1) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ms).toLocaleDateString();
}
