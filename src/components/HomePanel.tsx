import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatDealPrice } from './DealCoverBadges';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { compareQueueEntries, type PlatformQueueEntry, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { ReviewSource } from '../lib/reviewModeStorage';
import type { ItadDealSyncState } from '../config/syncStates';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState } from '../types/steam';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { PlatformBadge } from './PlatformBadge';
import { QSActionSheet } from './QSActionSheet';

type HomePanelProps = {
  appTitle?: string;
  avatar?: ReactNode;
  shelfTitle?: string;
  featuredGame?: Game | null;
  games: Game[];
  ignoredReviewGameIds: Set<string>;
  reviewQueueOrder: string[];
  queueState: PlatformQueueState;
  itadDealSyncState?: ItadDealSyncState;
  steamAchievementSyncState?: SteamAchievementSyncState;
  steamPlaytimeRefreshState?: SteamPlaytimeRefreshState;
  onOpenDetails: (game: Game) => void;
  onOpenLibrary: () => void;
  onOpenQueue: (platform?: GamePlatform) => void;
  onOpenReviewMode: (source: ReviewSource) => void;
  onOpenWishlist: () => void;
  onPlayToday: (game: Game) => void;
  onQuickNote: (gameId: string, note: string) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onSyncItadDeals?: () => void;
  onSyncSteamAchievements?: () => void;
  onSyncSteamPlaytime?: () => void;
};

type NextAdventureEntry = { game: Game; entry: PlatformQueueEntry };

const focusSelector = '[data-home-focus="true"]';

export function HomePanel({
  appTitle = 'QuestShelf',
  avatar,
  shelfTitle = '',
  featuredGame = null,
  games,
  ignoredReviewGameIds,
  reviewQueueOrder,
  queueState,
  itadDealSyncState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  onOpenDetails,
  onOpenLibrary,
  onOpenQueue,
  onOpenReviewMode,
  onOpenWishlist,
  onPlayToday,
  onQuickNote,
  onStatusChange,
  onSyncItadDeals,
  onSyncSteamAchievements,
  onSyncSteamPlaytime,
}: HomePanelProps) {
  const { t } = useI18n();
  const [actionSheetGame, setActionSheetGame] = useState<Game | null>(null);
  const [dealSheetGame, setDealSheetGame] = useState<Game | null>(null);
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
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

  const nextAdventureEntries = useMemo<NextAdventureEntry[]>(() => {
    const playingIds = new Set(continuePlayingGames.map((g) => g.id));
    const seenPlatforms = new Set<GamePlatform>();
    const result: NextAdventureEntry[] = [];
    for (const entry of [...queueEntries].sort(compareQueueEntries)) {
      if (result.length >= 5) break;
      const game = gamesById.get(entry.gameId);
      if (!game || playingIds.has(game.id) || game.status === 'Playing') continue;
      if (seenPlatforms.has(entry.targetPlatform)) continue;
      result.push({ game, entry });
      seenPlatforms.add(entry.targetPlatform);
    }
    return result;
  }, [continuePlayingGames, gamesById, queueEntries]);

  const nextReviewCandidate = useMemo<Game | null>(() => {
    const queueOrderPositions = new Map(reviewQueueOrder.map((id, i) => [id, i]));
    return (
      games
        .filter((g) => isBacklogReviewCandidate(g) && !ignoredReviewGameIds.has(g.id))
        .sort((a, b) => {
          const qa = queueOrderPositions.get(a.id);
          const qb = queueOrderPositions.get(b.id);
          if (qa !== undefined || qb !== undefined) {
            return (qa ?? Number.MAX_SAFE_INTEGER) - (qb ?? Number.MAX_SAFE_INTEGER);
          }
          return getTime(b.importedAt ?? b.updatedAt) - getTime(a.importedAt ?? a.updatedAt);
        })[0] ?? null
    );
  }, [games, ignoredReviewGameIds, reviewQueueOrder]);

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
      .map((g) => new Date(g.lastSteamActivityAt as string).getTime());
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [games]);

  const lastAchievementSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.steamAchievementsLastCheckedAt != null)
      .map((g) => g.steamAchievementsLastCheckedAt as number);
    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }, [games]);

  const lastItadSyncAt = useMemo(() => {
    const times = games
      .filter((g) => g.itadLastSyncedAt)
      .map((g) => g.itadLastSyncedAt as string);
    return times.length > 0 ? times.reduce((a, b) => (a > b ? a : b)) : null;
  }, [games]);

  const isSteamAchievementSyncing = steamAchievementSyncState?.status === 'loading';
  const isSteamPlaytimeSyncing = steamPlaytimeRefreshState?.status === 'loading';
  const isSteamSyncing = isSteamAchievementSyncing || isSteamPlaytimeSyncing;
  const hasSyncActions = (hasSteamGames && (!!onSyncSteamAchievements || !!onSyncSteamPlaytime)) || !!onSyncItadDeals;
  const isAnySyncing = isSteamSyncing || itadDealSyncState?.status === 'loading';

  const greeting = useRef<string | null>(null);
  if (!greeting.current) {
    greeting.current = pickGreeting(queueEntries.length, continuePlayingGames.length, reviewRemainingCount);
  }


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
        if (activeIndex === -1) return;
        event.preventDefault();
        focusableItems[(activeIndex + 1) % focusableItems.length].focus();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (activeIndex === -1) return;
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
    <section ref={shellRef} className="qs-home-shell space-y-4 pb-4 pt-2">
      {/* Compact Hero — full width */}
      <section className="qs-home-hero flex items-center gap-3 rounded-xl border border-skyglass/15 bg-gradient-to-r from-ink-900 to-ink-950 px-4 py-3 shadow-panel">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{appTitle}</div>
          {shelfTitle ? <div className="text-xs font-semibold text-mint">{shelfTitle}</div> : null}
          <div className="mt-0.5 truncate text-xs text-slate-500">{greeting.current}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xl font-bold text-white">{continuePlayingGames.length}</div>
              <div className="text-xs text-slate-400">{t('home.heroActiveGames')}</div>
            </div>
            <div className="h-8 w-px bg-skyglass/20" />
            <button
              aria-label="Open Quest Queue"
              className="cursor-pointer rounded text-right transition hover:opacity-75 focus:outline-none focus:ring-1 focus:ring-mint/40"
              data-home-focus="true"
              onClick={() => onOpenQueue()}
              type="button"
            >
              <div className="text-xl font-bold text-white">{reviewRemainingCount}</div>
              <div className="text-xs text-slate-400">{t('home.heroQueueCount')}</div>
            </button>
            {hasSyncActions ? (
              <>
                <div className="h-8 w-px bg-skyglass/20" />
                <button
                  aria-label={t('home.syncMaintenance')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300 focus:outline-none focus:ring-1 focus:ring-mint/40"
                  data-home-focus="true"
                  onClick={() => setSyncSheetOpen(true)}
                  type="button"
                >
                  <Icon
                    name="refresh-cw"
                    size={15}
                    strokeWidth={2}
                    className={isAnySyncing ? 'animate-spin text-mint' : ''}
                  />
                </button>
              </>
            ) : null}
          </div>
          {featuredGame ? (
            <button
              className="max-w-[160px] truncate rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs font-semibold text-mint transition hover:bg-mint/20"
              data-home-focus="true"
              onClick={() => onOpenDetails(featuredGame)}
              type="button"
            >
              ⭐ {featuredGame.title}
            </button>
          ) : null}
        </div>
      </section>

      {/* Two-column layout on desktop — no overflow on either column, window scroll only */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:items-start lg:gap-4">
        {/* Left: main content */}
        <div className="space-y-4">
          {/* Continue Playing */}
          <HomeSection title={t('home.continuePlaying')} actionLabel={t('collection.library')} onAction={onOpenLibrary}>
            {continuePlayingGames.length > 0 ? (
              <div className={`grid gap-3 ${continuePlayingGames.length === 1 ? '' : continuePlayingGames.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
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

          {/* Next Adventure — top candidate per active Platform Plan */}
          <HomeSection title={t('home.nextAdventure')} actionLabel={t('home.allPlatforms')} onAction={() => onOpenQueue()}>
            {nextAdventureEntries.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {nextAdventureEntries.map(({ entry, game }) => (
                  <NextAdventureCard
                    key={entry.gameId}
                    entry={entry}
                    game={game}
                    queueState={queueState}
                    onPlay={() => setActionSheetGame(game)}
                    onOpenPlan={() => onOpenQueue(entry.targetPlatform)}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t('home.noPlatformPlan')}
                text={t('home.noKeepPlayingText')}
                actionLabel={t('review.title')}
                onAction={() => onOpenReviewMode('backlog')}
              />
            )}
          </HomeSection>

        </div>

        {/* Right sidebar — stacks below main on mobile, sits beside it on desktop */}
        <div className="mt-4 space-y-4 lg:mt-0">
          {/* Wishlist Deals */}
          <HomeSection compact title={t('home.wishlistDeals')} actionLabel={t('wishlist.title')} onAction={onOpenWishlist}>
            {wishlistDeals.length > 0 ? (
              <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2">
                {wishlistDeals.map((game) => (
                  <WishlistDealCard key={game.id} game={game} onClick={() => setDealSheetGame(game)} t={t} />
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

          {/* Quest Queue Remaining */}
          <section className="qs-home-queue-widget rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('home.reviewRemaining')}</div>
            <button
              className="mt-2 cursor-pointer text-left transition hover:opacity-75 focus:outline-none"
              onClick={() => onOpenReviewMode('backlog')}
              type="button"
              aria-label="Open Quest Queue"
            >
              <div className="text-3xl font-semibold text-white">{reviewRemainingCount}</div>
            </button>
            <p className="mt-1 text-sm text-slate-300">
              {reviewRemainingCount === 1 ? t('home.gameReadyReview') : t('home.gamesReadyReview')}
            </p>
            {nextReviewCandidate ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-skyglass/15 bg-ink-950/50 px-3 py-2">
                <span className="qs-home-next-candidate-label shrink-0 text-xs text-slate-500">{t('home.nextCandidate')}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-300">{nextReviewCandidate.title}</span>
              </div>
            ) : null}
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
      </div>

      {/* Deal sheet for wishlist deal cards */}
      {dealSheetGame ? (
        <WishlistDealActionSheet
          game={dealSheetGame}
          onClose={() => setDealSheetGame(null)}
          onOpenDetails={(game) => {
            setDealSheetGame(null);
            onOpenDetails(game);
          }}
        />
      ) : null}

      {/* Sync & Maintenance sheet */}
      {syncSheetOpen ? (
        <SyncMaintenanceSheet
          hasSteamGames={hasSteamGames}
          isSteamAchievementSyncing={isSteamAchievementSyncing}
          isSteamPlaytimeSyncing={isSteamPlaytimeSyncing}
          itadDealSyncState={itadDealSyncState}
          lastAchievementSyncAt={lastAchievementSyncAt}
          lastItadSyncAt={lastItadSyncAt}
          lastPlaytimeSyncAt={lastPlaytimeSyncAt}
          onClose={() => setSyncSheetOpen(false)}
          onSyncItadDeals={onSyncItadDeals}
          onSyncSteamAchievements={onSyncSteamAchievements}
          onSyncSteamPlaytime={onSyncSteamPlaytime}
        />
      ) : null}

      {/* Action sheet for game cards */}
      {actionSheetGame ? (
        <QSActionSheet
          game={actionSheetGame}
          queueState={queueState}
          onClose={() => setActionSheetGame(null)}
          onOpenDetails={(game) => {
            setActionSheetGame(null);
            onOpenDetails(game);
          }}
          onPlayToday={(game) => {
            onPlayToday(game);
            setActionSheetGame(null);
          }}
          onQuickNote={(gameId, note) => {
            onQuickNote(gameId, note);
            setActionSheetGame(null);
          }}
          onStatusChange={(gameId, status) => {
            onStatusChange(gameId, status);
            setActionSheetGame(null);
          }}
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
    <section className={`qs-home-section rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="qs-home-section-title text-lg font-semibold text-white">{title}</h3>
        {actionLabel && onAction ? (
          <button
            className="qs-home-section-action min-h-10 rounded-lg border border-skyglass/15 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
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
      className={`group relative overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950 text-left shadow-panel transition hover:border-mint/40 hover:shadow-glow ${minHeightClass} ${wide ? 'w-full' : ''}`}
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

function NextAdventureCard({
  entry,
  game,
  queueState,
  onPlay,
  onOpenPlan,
  t,
}: {
  entry: PlatformQueueEntry;
  game: Game;
  queueState: PlatformQueueState;
  onPlay: () => void;
  onOpenPlan: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const coverSource = getGameCoverSources(game)[0];

  return (
    <button
      className="qs-home-next-adventure-card relative w-full overflow-hidden rounded-xl border border-skyglass/15 bg-ink-950/70 text-left transition hover:border-mint/35"
      data-home-focus="true"
      onClick={onOpenPlan}
      type="button"
    >
      {coverSource ? (
        <div className="absolute inset-0">
          <img
            alt=""
            className="h-full w-full object-cover opacity-15"
            decoding="async"
            loading="lazy"
            src={coverSource}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 to-transparent" />
        </div>
      ) : null}
      <div className="relative flex h-full flex-col gap-3 p-4">
        <PlatformBadge
          className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold"
          platform={entry.targetPlatform}
          queueState={queueState}
        />
        <div>
          <div className="qs-home-next-candidate-label text-xs text-slate-500">{t('home.nextCandidate')}</div>
          <h3 className="mt-0.5 text-lg font-bold leading-snug text-white">{game.title}</h3>
        </div>
        <div className="mt-auto">
          <button
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            data-home-focus="true"
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            type="button"
          >
            <Icon name="play-circle" size={16} strokeWidth={2.5} />
            {t('home.playToday')}
          </button>
        </div>
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
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4">
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
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4 text-center">
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

function WishlistDealActionSheet({
  game,
  onClose,
  onOpenDetails,
}: {
  game: Game;
  onClose: () => void;
  onOpenDetails: (game: Game) => void;
}) {
  const { t } = useI18n();
  const coverSource = getGameCoverSources(game)[0];
  const discount = typeof game.itadDiscountPercent === 'number' ? `-${game.itadDiscountPercent}%` : null;
  const price =
    typeof game.itadCurrentBestPrice === 'number' && game.itadCurrentBestCurrency
      ? formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency)
      : null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Deal for ${game.title}`}
    >
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))' }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1.5 w-16 rounded-full bg-skyglass/35" />
        </div>
        <div className="px-4 pb-2 pt-1">
          {/* Game header */}
          <div className="mb-5 flex gap-3.5">
            <div className="relative h-[72px] w-[52px] shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-800 shadow-panel">
              {coverSource ? (
                <img alt="" className="h-full w-full object-cover" src={coverSource} />
              ) : (
                <div className="grid h-full place-items-center text-xl font-bold text-mint/50">
                  {game.title.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <h3 className="line-clamp-2 text-base font-bold leading-snug text-white">{game.title}</h3>
              {game.itadCurrentBestShop ? (
                <p className="mt-1 text-sm text-slate-400">{game.itadCurrentBestShop}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {discount ? (
                  <span className="rounded bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">{discount}</span>
                ) : null}
                {price ? <span className="text-sm font-semibold text-mint">{price}</span> : null}
                {game.itadIsHistoricalLow ? (
                  <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                    <Icon name="trophy" size={10} strokeWidth={2.5} />
                    {t('itad.historicalLow')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Primary CTA */}
          {game.itadCurrentBestUrl ? (
            <a
              className="flex min-h-[3.5rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-mint px-4 text-[0.9375rem] font-bold text-ink-950 shadow-glow transition active:scale-[0.97] hover:bg-mint/90"
              href={game.itadCurrentBestUrl}
              rel="noreferrer"
              target="_blank"
              onClick={onClose}
            >
              🛒 {t('itad.openDeal')}
            </a>
          ) : null}

          {/* Secondary actions */}
          <div className="mt-3.5 overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60">
            <button
              className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition hover:bg-mint/[0.07] active:bg-mint/[0.10]"
              onClick={() => { onOpenDetails(game); onClose(); }}
              type="button"
            >
              <Icon name="external-link" size={18} strokeWidth={2} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-200">{t('home.openDetails')}</span>
              <Icon name="chevrons-right" size={14} strokeWidth={2} className="shrink-0 text-slate-500" />
            </button>
          </div>

          {/* Cancel */}
          <button
            className="mt-3 min-h-11 w-full rounded-2xl text-sm text-slate-500 transition hover:text-slate-300"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncMaintenanceSheet({
  hasSteamGames,
  isSteamAchievementSyncing,
  isSteamPlaytimeSyncing,
  itadDealSyncState,
  lastAchievementSyncAt,
  lastItadSyncAt,
  lastPlaytimeSyncAt,
  onClose,
  onSyncItadDeals,
  onSyncSteamAchievements,
  onSyncSteamPlaytime,
}: {
  hasSteamGames: boolean;
  isSteamAchievementSyncing: boolean;
  isSteamPlaytimeSyncing: boolean;
  itadDealSyncState?: ItadDealSyncState;
  lastAchievementSyncAt: Date | null;
  lastItadSyncAt: string | null;
  lastPlaytimeSyncAt: Date | null;
  onClose: () => void;
  onSyncItadDeals?: () => void;
  onSyncSteamAchievements?: () => void;
  onSyncSteamPlaytime?: () => void;
}) {
  const { t } = useI18n();
  const isItadSyncing = itadDealSyncState?.status === 'loading';

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={t('home.syncMaintenance')}>
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl" style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))' }}>
        <div className="flex justify-center pb-2 pt-3"><div className="qs-sheet-handle h-1.5 w-16 rounded-full bg-skyglass/35" /></div>
        <div className="px-4 pb-2 pt-1">
          <h3 className="mb-4 text-base font-bold text-white">{t('home.syncMaintenance')}</h3>
          <div className="overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60 divide-y divide-[var(--border)]">
            {hasSteamGames && onSyncSteamAchievements ? (
              <SyncSheetButton icon="trophy" label="Sync Achievements" syncingLabel="Syncing achievements…" isSyncing={isSteamAchievementSyncing} lastSyncAt={lastAchievementSyncAt} onClick={onSyncSteamAchievements} neverLabel={t('home.neverSynced')} />
            ) : null}
            {hasSteamGames && onSyncSteamPlaytime ? (
              <SyncSheetButton icon="gamepad-2" label="Sync Playtime" syncingLabel="Syncing playtime…" isSyncing={isSteamPlaytimeSyncing} lastSyncAt={lastPlaytimeSyncAt} onClick={onSyncSteamPlaytime} neverLabel={t('home.neverSynced')} />
            ) : null}
            {onSyncItadDeals ? (
              <SyncSheetButton icon="shopping-bag" label="Sync ITAD Deals" syncingLabel="Syncing ITAD deals…" isSyncing={isItadSyncing} lastSyncAt={lastItadSyncAt} onClick={onSyncItadDeals} neverLabel={t('home.neverSynced')} />
            ) : null}
          </div>
          <div className="mt-3 rounded-2xl border border-skyglass/10 bg-ink-900/35 p-4 text-xs text-slate-400">
            <SyncStatusLine label="Achievement Sync" value={lastAchievementSyncAt ? formatRelativeTime(lastAchievementSyncAt, t('home.neverSynced')) : t('home.neverSynced')} />
            <SyncStatusLine label="Playtime Sync" value={lastPlaytimeSyncAt ? formatRelativeTime(lastPlaytimeSyncAt, t('home.neverSynced')) : t('home.neverSynced')} />
            <SyncStatusLine label="ITAD Sync" value={lastItadSyncAt ? formatRelativeTime(lastItadSyncAt, t('home.neverSynced')) : t('home.neverSynced')} />
          </div>
          <button className="mt-3 min-h-11 w-full rounded-2xl text-sm text-slate-500 transition hover:text-slate-300" onClick={onClose} type="button">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SyncSheetButton({ icon, isSyncing, label, lastSyncAt, neverLabel, onClick, syncingLabel }: { icon: Parameters<typeof Icon>[0]['name']; isSyncing: boolean; label: string; lastSyncAt: Date | string | null; neverLabel: string; onClick: () => void; syncingLabel: string }) {
  return (
    <button className="flex min-h-[60px] w-full items-center gap-3.5 px-4 text-left transition hover:bg-mint/[0.07] active:bg-mint/[0.10] disabled:opacity-50" disabled={isSyncing} onClick={onClick} type="button">
      <Icon name={isSyncing ? 'refresh-cw' : icon} size={18} strokeWidth={2} className={`shrink-0 text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-200">{label}</span>
        <span className={`block text-xs ${isSyncing ? 'text-mint' : 'text-slate-500'}`}>{isSyncing ? syncingLabel : lastSyncAt ? formatRelativeTime(lastSyncAt, neverLabel) : neverLabel}</span>
      </div>
      {!isSyncing ? <Icon name="chevrons-right" size={14} strokeWidth={2} className="shrink-0 text-slate-600" /> : null}
    </button>
  );
}

function SyncStatusLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">Last sync: {value}</span></div>;
}

function pickGreeting(queueCount: number, activeCount: number, reviewCount: number): string {
  const s = (n: number) => (n === 1 ? '' : 's');
  const options = [
    queueCount > 0 ? `${queueCount} game${s(queueCount)} in Queue. No pressure.` : null,
    activeCount > 0 ? `${activeCount} active game${s(activeCount)}. Totally under control.` : null,
    reviewCount > 0 ? `${reviewCount} game${s(reviewCount)} waiting for a verdict.` : null,
    'Your backlog called. It misses you.',
    'Pick one. Future you will thank you.',
    'The queue grows. The queue is patient.',
    'Progress is progress. Even at 2%.',
    'One game closer. Probably.',
  ].filter((x): x is string => x !== null);
  return options[Math.floor(Math.random() * options.length)];
}
