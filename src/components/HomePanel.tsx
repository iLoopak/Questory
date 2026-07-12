import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AchievementQuizCard } from '../features/achievementQuiz/AchievementQuizCard';
import { DailyQuestCard } from '../features/dailyQuest/DailyQuestCard';
import { HomeAchievementsShowcase } from './HomeAchievementsShowcase';
import { HomeSteamAchievementsWidget } from './HomeSteamAchievementsWidget';
import { QueueGhost, getQueueGhostVariant, pickQueueGhostSlot, releaseQueueGhostHabitat, shouldShowQueueGhost, type QueueGhostAchievement, type QueueGhostCover, type QueueGhostVariant } from './QueueGhost';
import { formatDealPrice } from './DealCoverBadges';
import { getPreferredArtworkSources, isMissingOrGeneratedCover } from '../lib/gameCoverImages';
import { compareQueueEntries, type PlatformQueueEntry, type PlatformQueueState } from '../lib/platformQueueStorage';
import { getQuestShelfAchievements, type QuestShelfAchievementProgress } from '../lib/questShelfAchievements';
import { loadAchievementCounters } from '../lib/achievementCounters';
import { getSeenAchievementGhostIds, setSeenAchievementGhostIds } from '../lib/achievementGhostStorage';
import type { PlayActivityRecord } from '../lib/playActivityStorage';
import type { ReviewModeState, ReviewSource, ReviewStats } from '../lib/reviewModeStorage';
import type { ItadDealSyncState } from '../config/syncStates';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState } from '../types/steam';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { QSActionSheet } from './QSActionSheet';
import { useBottomSheetDragToClose } from '../hooks/useBottomSheetDragToClose';
import { HomeRecommendationsSection } from './home/HomeRecommendationsSection';
import { GamePosterButton } from './home/GamePosterButton';
import { NextAdventureCard } from './home/NextAdventureCard';
import { WishlistDealCard, WishlistDealActionSheet } from './home/WishlistDealCard';
import { useHomeWidgetPreferences } from '../hooks/useHomeWidgetPreferences';
import { homeWidgetRegistry, orderedWidgetIdsForColumn, type HomeWidgetId } from '../lib/homeWidgetPreferences';
import type { DiscoveryCandidate, DiscoveryGame } from '../lib/discovery';
import { getPlannedGameIds } from '../lib/plannedGames';

type HomePanelProps = {
  appTitle?: string;
  avatar?: ReactNode;
  shelfTitle?: string;
  games: Game[];
  ignoredReviewGameIds: Set<string>;
  playActivity?: PlayActivityRecord[];
  reviewQueueOrder: string[];
  reviewModeState: ReviewModeState;
  queueState: PlatformQueueState;
  itadDealSyncState?: ItadDealSyncState;
  steamAchievementSyncState?: SteamAchievementSyncState;
  steamPlaytimeRefreshState?: SteamPlaytimeRefreshState;
  onOpenDetails: (game: Game) => void;
  onOpenLibrary: () => void;
  onOpenQueue: (platform?: GamePlatform) => void;
  onOpenReviewMode: (source: ReviewSource) => void;
  onOpenSettings?: () => void;
  onOpenIntegrationsSettings?: () => void;
  onOpenTasteProfile?: () => void;
  onOpenWishlist: () => void;
  onPlayToday: (game: Game) => void;
  onQuickNote: (gameId: string, note: string) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onSyncItadDeals?: () => void;
  onImportNewSteamGames?: () => void;
  onOpenAchievementTimeline?: () => void;
  onSyncSteamAchievements?: () => void;
  onSyncSteamPlaytime?: () => void;
  isImportingNewSteamGames?: boolean;
  onSelectDiscoveryGame?: (game: DiscoveryGame) => void;
  onOpenDiscoveryPreview?: (candidate: DiscoveryCandidate) => void;
  discoveryInboxRawgIds?: Set<number>;
};

type NextAdventureEntry = { game: Game; entry: PlatformQueueEntry };
type AchievementGhostCandidate = QueueGhostAchievement & { id: string; seenIds: string[] };

const focusSelector = '[data-home-focus="true"]';

export function HomePanel({
  appTitle = 'Questory',
  avatar,
  shelfTitle = '',
  games,
  ignoredReviewGameIds,
  playActivity = [],
  reviewQueueOrder,
  reviewModeState,
  queueState,
  itadDealSyncState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  onOpenDetails,
  onOpenLibrary,
  onOpenQueue,
  onOpenReviewMode,
  onOpenSettings,
  onOpenIntegrationsSettings,
  onOpenTasteProfile,
  onOpenWishlist,
  onPlayToday,
  onQuickNote,
  onStatusChange,
  onSyncItadDeals,
  onImportNewSteamGames,
  onOpenAchievementTimeline,
  onSyncSteamAchievements,
  onSyncSteamPlaytime,
  isImportingNewSteamGames = false,
  onSelectDiscoveryGame,
  onOpenDiscoveryPreview,
  discoveryInboxRawgIds = new Set(),
}: HomePanelProps) {
  const { t } = useI18n();
  const plannedGameIds = useMemo(() => getPlannedGameIds(queueState, games), [games, queueState]);
  const { preferences: homeWidgets } = useHomeWidgetPreferences();
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
      .sort((a, b) => getActivityTime(b) - getActivityTime(a));
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
        .filter((g) => isBacklogReviewCandidate(g) && !ignoredReviewGameIds.has(g.id) && !reviewModeState.reviewedGames[g.id])
        .sort((a, b) => {
          const qa = queueOrderPositions.get(a.id);
          const qb = queueOrderPositions.get(b.id);
          if (qa !== undefined || qb !== undefined) {
            return (qa ?? Number.MAX_SAFE_INTEGER) - (qb ?? Number.MAX_SAFE_INTEGER);
          }
          return getTime(b.importedAt ?? b.updatedAt) - getTime(a.importedAt ?? a.updatedAt);
        })[0] ?? null
    );
  }, [games, ignoredReviewGameIds, reviewModeState.reviewedGames, reviewQueueOrder]);

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

  const reviewedCount = useMemo(() => Object.keys(reviewModeState.reviewedGames).length, [reviewModeState.reviewedGames]);
  const reviewRemainingCount = useMemo(() => {
    return games.filter((game) => isBacklogReviewCandidate(game) && !ignoredReviewGameIds.has(game.id) && !reviewModeState.reviewedGames[game.id]).length;
  }, [games, ignoredReviewGameIds, reviewModeState.reviewedGames]);
  const finishedCount = useMemo(() => libraryGames.filter((g) => g.status === 'Finished').length, [libraryGames]);
  const droppedCount = useMemo(() => libraryGames.filter((g) => g.status === 'Dropped').length, [libraryGames]);
  const unratedFinishedCount = useMemo(() => libraryGames.filter((g) => g.status === 'Finished' && !g.rating).length, [libraryGames]);

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
  const isSteamSyncing = isSteamAchievementSyncing || isSteamPlaytimeSyncing || isImportingNewSteamGames;
  const hasSyncActions = !!onImportNewSteamGames || (hasSteamGames && (!!onSyncSteamAchievements || !!onSyncSteamPlaytime)) || !!onSyncItadDeals;
  const isAnySyncing = isSteamSyncing || itadDealSyncState?.status === 'loading';

  const wishlistGames = useMemo(() => games.filter((g) => g.collectionType === 'wishlist'), [games]);

  const activePlatformCount = useMemo(
    () => new Set(queueState.entries.map((e) => e.targetPlatform)).size,
    [queueState.entries],
  );
  const startedAdventureCount = continuePlayingGames.length;
  const reviewedMilestones = [1, 10, 50, 100, 250, 500, 1000];
  const nextReviewedMilestone = reviewedMilestones.find((milestone) => reviewedCount < milestone);
  const nextReviewTarget = nextReviewedMilestone ? Math.min(20, nextReviewedMilestone - reviewedCount) : 20;

  const topLibraryPlatforms = useMemo<GamePlatform[]>(() => {
    const counts = new Map<string, number>();
    libraryGames.forEach((g) => counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([p]) => p as GamePlatform);
  }, [libraryGames]);

  const [progressDismissed, setProgressDismissed] = useState(
    () => localStorage.getItem('qs-home-progress-v1') === 'dismissed',
  );
  const [workflowStripDismissed, setWorkflowStripDismissed] = useState(
    () => localStorage.getItem('qs-workflow-strip-v1') === 'dismissed',
  );
  const hasEnoughProgress =
    continuePlayingGames.length > 0 &&
    activePlatformCount > 0 &&
    queueEntries.length + continuePlayingGames.length >= 5;
  const showFirstDayPanel = libraryGames.length > 0 && !progressDismissed && !hasEnoughProgress;

  const yakuzaCount = useMemo(
    () => libraryGames.filter((g) => /yakuza|like a dragon|ryu ga gotoku/i.test(g.title)).length,
    [libraryGames],
  );

  const playStreak = useMemo(() => computePlayStreak(playActivity ?? []), [playActivity]);

  const hasPlayedRecently = useMemo(
    () => (playActivity ?? []).some((r) => r.date >= getNDaysAgoStr(7)),
    [playActivity],
  );

  const questShelfAchievements = useMemo(() => {
    const counters = loadAchievementCounters();
    return getQuestShelfAchievements(games, queueState, {
      counters,
      reviewStats: reviewModeState.stats,
      reviewedGamesCount: Object.keys(reviewModeState.reviewedGames).length,
    });
  }, [games, queueState, reviewModeState]);
  const newlyUnlockedAchievement = useMemo(() => pickNewlyUnlockedAchievement(questShelfAchievements), [questShelfAchievements]);
  const markedAchievementGhostIds = useRef<Set<string>>(new Set());
  const [queueGhostSlot] = useState(() => pickQueueGhostSlot('home'));
  const [showGhost, setShowGhost] = useState(() => Boolean(queueGhostSlot) && (Boolean(newlyUnlockedAchievement) || shouldShowQueueGhost()));
  const [queueGhostVariant, setQueueGhostVariant] = useState<QueueGhostVariant>(() =>
    getQueueGhostVariant({
      achievement: newlyUnlockedAchievement,
      hasNoPlayTodaySessionForSevenDays: !hasPlayedRecently,
      queueSize: queueEntries.length,
      isMidnight: isLocalMidnightWindow(),
      hasCover: true,
    }),
  );
  useEffect(() => {
    if (!newlyUnlockedAchievement || !queueGhostSlot) return;
    setQueueGhostVariant('achievement');
    setShowGhost(true);

    if (markedAchievementGhostIds.current.has(newlyUnlockedAchievement.id)) return;
    markedAchievementGhostIds.current.add(newlyUnlockedAchievement.id);
    setSeenAchievementGhostIds(newlyUnlockedAchievement.seenIds);
  }, [newlyUnlockedAchievement, queueGhostSlot]);

  useEffect(() => () => releaseQueueGhostHabitat('home'), []);

  const queueGhostAchievement = queueGhostVariant === 'achievement' ? newlyUnlockedAchievement : null;
  const queueGhostCover = useMemo<QueueGhostCover | null>(() => {
    if (queueGhostVariant !== 'cover') return null;
    return pickQueueGhostCover({
      nextAdventureEntries,
      nextReviewCandidate,
      continuePlayingGames,
      libraryGames,
    });
  }, [continuePlayingGames, libraryGames, nextAdventureEntries, nextReviewCandidate, queueGhostVariant]);

  const greeting = useRef<string | null>(null);
  if (!greeting.current) {
    const recentEasterEggs = getRecentEasterEggKeys();
    const heroResult = pickHeroMessage(
      {
        activeCount: continuePlayingGames.length,
        droppedCount,
        finishedCount,
        hasAchievements: libraryGames.some((g) => Boolean(g.steamAchievementsTotal)),
        hasRetro: libraryGames.some((g) => g.externalSource === 'retro-rom'),
        hasSteam: libraryGames.some((g) => g.externalSource === 'steam' || g.steamAppId != null),
        librarySize: libraryGames.length,
        queueCount: queueEntries.length,
        reviewedCount,
        reviewRemainingCount,
        yakuzaCount,
        playStreak,
        hasPlayedRecently,
      },
      recentEasterEggs,
    );
    greeting.current = heroResult.message;
    if (heroResult.easterEggKey) {
      recordEasterEggKey(heroResult.easterEggKey);
    }
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

  // Per-widget visibility: user preference AND (existing) data conditions.
  const enabledWidgets = homeWidgets.enabled;
  const widgetVisible: Record<HomeWidgetId, boolean> = {
    continuePlaying: enabledWidgets.continuePlaying,
    nextAdventure: enabledWidgets.nextAdventure,
    questoryAchievements: enabledWidgets.questoryAchievements,
    steamAchievements: enabledWidgets.steamAchievements,
    wishlistDeals: enabledWidgets.wishlistDeals && wishlistGames.length > 0,
    dailyQuest: enabledWidgets.dailyQuest && libraryGames.length > 0,
    achievementQuiz: enabledWidgets.achievementQuiz && libraryGames.length > 0,
    questoryJourney: enabledWidgets.questoryJourney,
    questQueue: enabledWidgets.questQueue && libraryGames.length > 0,
    recommendations: enabledWidgets.recommendations && !!onSelectDiscoveryGame && libraryGames.length > 0,
  };

  const mainWidgetOrder = orderedWidgetIdsForColumn(homeWidgets, 'main');
  const sidebarWidgetOrder = orderedWidgetIdsForColumn(homeWidgets, 'sidebar');
  const leftColumnHasContent = mainWidgetOrder.some((id) => widgetVisible[id]);
  const rightColumnHasContent = sidebarWidgetOrder.some((id) => widgetVisible[id]);
  const useTwoColumn = leftColumnHasContent && rightColumnHasContent;
  // Empty-state fallback is keyed on preferences only, so a brand-new user (who has
  // data-driven empty states but all widgets enabled) never sees it.
  const anyWidgetEnabled = homeWidgetRegistry.some((widget) => enabledWidgets[widget.id]);

  // Renders a single widget by id (in the user's chosen order). Returns null when
  // the widget is disabled or has no data to show, so empty slots never leave gaps.
  function renderWidget(id: HomeWidgetId): ReactNode {
    if (!widgetVisible[id]) return null;

    switch (id) {
      case 'continuePlaying':
        return (
          <HomeSection key={id} title={t('home.continuePlaying')} subtitle={t('home.sectionSourcePlayingNow')} actionLabel={t('collection.library')} onAction={onOpenLibrary}>
            {continuePlayingGames.length > 0 ? (
              <div className="qs-home-continue-playing-grid">
                {continuePlayingGames.map((game) => (
                  <GamePosterButton
                    key={game.id}
                    game={game}
                    hero={continuePlayingGames.length === 1}
                    activitySignal={getGameActivitySignal(game.id, playActivity, game.lastPlayedAt)}
                    onClick={() => setActionSheetGame(game)}
                    queueState={queueState}
                  />
                ))}
              </div>
            ) : libraryGames.length > 0 ? (
              <NoActiveGamesGuide
                libraryGamesCount={libraryGames.length}
                onOpenLibrary={onOpenLibrary}
                onOpenReviewMode={() => onOpenReviewMode('backlog')}
              />
            ) : (
              <OnboardingSteps
                onOpenLibrary={onOpenLibrary}
                onOpenReviewMode={() => onOpenReviewMode('backlog')}
                t={t}
              />
            )}
          </HomeSection>
        );

      case 'nextAdventure':
        return (
          <HomeSection key={id} title={t('home.nextAdventure')} subtitle={t('home.sectionSourcePlatformPlans')} actionLabel={t('home.allPlatforms')} onAction={() => onOpenQueue()}>
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
              <NoNextAdventureGuide
                hasLibraryGames={libraryGames.length > 0}
                hasProcessedGames={queueEntries.length > 0 || continuePlayingGames.length > 0}
                topPlatforms={topLibraryPlatforms}
                onOpenQueue={onOpenQueue}
                onOpenReviewMode={() => onOpenReviewMode('backlog')}
              />
            )}
          </HomeSection>
        );

      case 'questoryAchievements':
        return (
          <HomeWidgetErrorBoundary key={id} title={t('home.qsAchievements')}>
            <HomeAchievementsShowcase
              games={games}
              queueState={queueState}
              reviewModeState={reviewModeState}
            />
          </HomeWidgetErrorBoundary>
        );

      case 'steamAchievements':
        return (
          <HomeWidgetErrorBoundary key={id} title={t('home.steamAchievements')}>
            <HomeSteamAchievementsWidget
              games={games}
              isSteamAchievementSyncing={isSteamAchievementSyncing}
              onOpenTimeline={onOpenAchievementTimeline}
              onSyncSteamAchievements={onSyncSteamAchievements}
            />
          </HomeWidgetErrorBoundary>
        );

      case 'wishlistDeals':
        return (
          <HomeSection key={id} compact title={t('home.wishlistDeals')} actionLabel={t('wishlist.title')} onAction={onOpenWishlist}>
            {wishlistDeals.length > 0 ? (
              <div className="space-y-3">
                <DealAlertCard deals={wishlistDeals} onViewDeals={onOpenWishlist} />
                <div className="border-t border-skyglass/10" />
                <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2">
                  {wishlistDeals.map((game) => (
                    <WishlistDealCard key={game.id} game={game} onClick={() => setDealSheetGame(game)} t={t} />
                  ))}
                </div>
              </div>
            ) : (
              <WishlistNoDealsState
                wishlistCount={wishlistGames.length}
                canSync={!!onSyncItadDeals}
                onOpenWishlist={onOpenWishlist}
                onSyncDeals={onSyncItadDeals}
              />
            )}
          </HomeSection>
        );

      case 'dailyQuest':
        return <DailyQuestCard key={id} games={games} />;

      case 'achievementQuiz':
        return <AchievementQuizCard key={id} games={games} />;

      case 'questoryJourney':
        return (
          <JourneyProgressCard
            key={id}
            importedCount={libraryGames.length}
            platformPlanCount={activePlatformCount}
            reviewedCount={reviewedCount}
            reviewStats={reviewModeState.stats}
            startedAdventureCount={startedAdventureCount}
            unratedFinishedCount={unratedFinishedCount}
            nextReviewTarget={nextReviewTarget}
            onOpenReviewMode={() => onOpenReviewMode('backlog')}
          />
        );

      case 'questQueue':
        return (
          <section key={id} className="qs-home-queue-widget rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-spread text-mint">{t('home.reviewRemaining')}</div>
            <button
              className="mt-2 cursor-pointer text-left transition hover:opacity-75 focus:outline-none"
              onClick={() => onOpenReviewMode('backlog')}
              type="button"
              aria-label="Open Quest Queue"
            >
              <div className="text-3xl font-semibold tabular-nums text-white">{reviewRemainingCount}</div>
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
            {reviewRemainingCount > 10 && (
              <p className="mt-2 text-xs text-slate-600">
                {t('home.reviewMoreHint')}
              </p>
            )}
          </section>
        );

      case 'recommendations':
        return (
          <HomeRecommendationsSection
            key={id}
            games={games}
            libraryGameCount={libraryGames.length}
            inboxRawgIds={discoveryInboxRawgIds}
            plannedGameIds={plannedGameIds}
            onSelectGame={onSelectDiscoveryGame}
            onOpenPreview={onOpenDiscoveryPreview}
            onOpenRawgSettings={onOpenIntegrationsSettings ?? onOpenSettings}
            onOpenTasteProfile={onOpenTasteProfile}
          />
        );

      default:
        return null;
    }
  }

  return (
    <section ref={shellRef} className={`qs-home-shell space-y-4 pb-4 pt-2${homeWidgets.compact ? ' qs-home-compact' : ''}`}>
      {/* Compact Hero — full width */}
      <section className="qs-home-hero relative flex items-center gap-3 rounded-xl border border-skyglass/15 bg-gradient-to-r from-ink-900 to-ink-950 px-4 py-2 shadow-panel">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{appTitle}</div>
          {shelfTitle ? <div className="text-xs font-semibold text-mint">{shelfTitle}</div> : null}
          <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500 whitespace-pre-line">{greeting.current}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xl font-bold tabular-nums text-white">{continuePlayingGames.length}</div>
              <div className="text-xs text-slate-400">{t('home.heroActiveGames')}</div>
            </div>
            <div className="h-8 w-px bg-skyglass/20" />
            <button
              aria-label="Open Quest Queue"
              className="cursor-pointer rounded text-right transition hover:opacity-75 focus:outline-none focus:ring-1 focus:ring-mint/40"
              data-home-focus="true"
              onClick={() => onOpenReviewMode('backlog')}
              type="button"
            >
              <div className="text-xl font-bold tabular-nums text-white">{reviewRemainingCount}</div>
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
        </div>
        {showGhost && queueGhostSlot && (
          <div className={`queue-ghost-wrapper queue-ghost-slot--${queueGhostSlot}`}>
            <QueueGhost achievement={queueGhostAchievement} cover={queueGhostCover} variant={queueGhostVariant} onVanish={() => { releaseQueueGhostHabitat('home'); setShowGhost(false); }} />
          </div>
        )}
      </section>

      {libraryGames.length > 0 && !workflowStripDismissed && (
        <WorkflowOrientationStrip
          onDismiss={() => {
            localStorage.setItem('qs-workflow-strip-v1', 'dismissed');
            setWorkflowStripDismissed(true);
          }}
        />
      )}

      {showFirstDayPanel && (
        <FirstDayProgressPanel
          libraryCount={libraryGames.length}
          queuedCount={queueEntries.length}
          playingCount={continuePlayingGames.length}
          platformCount={activePlatformCount}
          reviewRemainingCount={reviewRemainingCount}
          onOpenLibrary={onOpenLibrary}
          onOpenReviewMode={() => onOpenReviewMode('backlog')}
          onOpenQueue={onOpenQueue}
          onDismiss={() => {
            localStorage.setItem('qs-home-progress-v1', 'dismissed');
            setProgressDismissed(true);
          }}
        />
      )}

      {!anyWidgetEnabled ? (
        <HomeWidgetsEmptyState onOpenSettings={onOpenSettings} t={t} />
      ) : (
      /* Two-column layout on desktop — no overflow on either column, window scroll only */
      <div className={useTwoColumn ? 'lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] lg:items-start lg:gap-4' : ''}>
        {leftColumnHasContent ? (
          <div className="space-y-4">{mainWidgetOrder.map(renderWidget)}</div>
        ) : null}

        {/* Right sidebar — stacks below main on mobile, sits beside it on desktop */}
        {rightColumnHasContent ? (
          <div className={`space-y-4${useTwoColumn ? ' mt-4 lg:mt-0' : ''}`}>{sidebarWidgetOrder.map(renderWidget)}</div>
        ) : null}
      </div>
      )}

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
          isImportingNewSteamGames={isImportingNewSteamGames}
          itadDealSyncState={itadDealSyncState}
          lastAchievementSyncAt={lastAchievementSyncAt}
          lastItadSyncAt={lastItadSyncAt}
          lastPlaytimeSyncAt={lastPlaytimeSyncAt}
          onClose={() => setSyncSheetOpen(false)}
          onSyncItadDeals={onSyncItadDeals}
          onImportNewSteamGames={onImportNewSteamGames}
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

function HomeWidgetsEmptyState({
  onOpenSettings,
  t,
}: {
  onOpenSettings?: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <section className="rounded-2xl border border-dashed border-skyglass/20 bg-ink-900/60 p-5 text-center shadow-panel">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-skyglass/20 bg-ink-950/60 text-slate-400">
        <Icon name="sparkles" size={18} />
      </span>
      <h3 className="mt-3 text-base font-semibold text-white">{t('home.allWidgetsHiddenTitle')}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{t('home.allWidgetsHiddenText')}</p>
      {onOpenSettings ? (
        <button
          className="mt-4 min-h-11 rounded-xl border border-mint/30 bg-mint/10 px-5 text-sm font-semibold text-mint transition hover:bg-mint/20"
          data-home-focus="true"
          onClick={onOpenSettings}
          type="button"
        >
          {t('home.allWidgetsHiddenAction')}
        </button>
      ) : null}
    </section>
  );
}

function JourneyProgressCard({
  importedCount,
  platformPlanCount,
  reviewedCount,
  reviewStats,
  startedAdventureCount,
  unratedFinishedCount,
  nextReviewTarget,
  onOpenReviewMode,
}: {
  importedCount: number;
  platformPlanCount: number;
  reviewedCount: number;
  reviewStats: ReviewStats;
  startedAdventureCount: number;
  unratedFinishedCount: number;
  nextReviewTarget: number;
  onOpenReviewMode: () => void;
}) {
  const statParts: string[] = [];
  if (reviewStats.queueCandidates > 0) statParts.push(`${reviewStats.queueCandidates} to plans`);
  if (reviewStats.playing > 0) statParts.push(`${reviewStats.playing} playing`);
  if (reviewStats.wishlisted > 0) statParts.push(`${reviewStats.wishlisted} wishlisted`);
  if (reviewStats.dropped > 0) statParts.push(`${reviewStats.dropped} dropped`);
  if (reviewStats.ignored > 0) statParts.push(`${reviewStats.ignored} ignored`);

  return (
    <section className="rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-spread text-mint">Your Questory Journey</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <span>✓ Imported <strong className="text-white">{importedCount}</strong> games</span>
            <span>✓ Reviewed <strong className="text-white">{reviewedCount}</strong> games</span>
            <span>✓ Created <strong className="text-white">{platformPlanCount}</strong> Platform Plans</span>
            <span>✓ Started <strong className="text-white">{startedAdventureCount}</strong> adventures</span>
          </div>
          {statParts.length > 0 ? (
            <div className="mt-2.5 text-xs text-slate-500">
              Quest Queue: {statParts.join(' · ')}
            </div>
          ) : null}
          {unratedFinishedCount > 0 ? (
            <div className="mt-1.5 text-xs text-slate-600">
              {unratedFinishedCount} finished {unratedFinishedCount === 1 ? 'game' : 'games'} without a rating
            </div>
          ) : null}
        </div>
        <button
          className="w-full rounded-xl border border-mint/30 bg-mint/10 px-4 py-3 text-left text-sm text-mint transition hover:bg-mint/20"
          data-home-focus="true"
          onClick={onOpenReviewMode}
          type="button"
        >
          <div className="qs-label-caps">Next milestone</div>
          <div className="mt-1 font-semibold text-white">Review {nextReviewTarget} more games</div>
        </button>
      </div>
    </section>
  );
}

type HomeWidgetErrorBoundaryProps = {
  children: ReactNode;
  title: string;
};

type HomeWidgetErrorBoundaryState = {
  hasError: boolean;
};

class HomeWidgetErrorBoundary extends Component<HomeWidgetErrorBoundaryProps, HomeWidgetErrorBoundaryState> {
  state: HomeWidgetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): HomeWidgetErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[HomeWidgetErrorBoundary] Home widget failed to render', { error, info, title: this.props.title });
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="qs-home-section rounded-2xl border border-amber-300/20 bg-ink-900/74 p-4 shadow-panel">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full border border-amber-300/25 bg-amber-300/10 p-2 text-amber-200">
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <h3 className="qs-home-section-title text-base font-semibold text-white">{this.props.title}</h3>
              <p className="mt-1 text-sm text-slate-400">This home widget could not be shown, but the rest of Questory is still ready.</p>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

function HomeSection({
  actionLabel,
  children,
  compact = false,
  subtitle,
  title,
  onAction,
}: {
  actionLabel?: string;
  children: ReactNode;
  compact?: boolean;
  subtitle?: string;
  title: string;
  onAction?: () => void;
}) {
  return (
    <section className={`qs-home-section rounded-2xl border border-skyglass/15 bg-ink-900/74 shadow-panel ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="qs-home-section-title text-lg font-semibold text-white">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actionLabel && onAction ? (
          <button
            className="qs-home-section-action min-h-10 rounded-lg border border-skyglass/15 px-3 qs-label-caps text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
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

function WorkflowOrientationStrip({ onDismiss }: { onDismiss: () => void }) {
  const stages: Array<[string, string]> = [
    ['Library', 'All your games.'],
    ['Quest Queue', 'Decide what to plan, drop, or wishlist.'],
    ['Platform Plans', 'Games you want to play next.'],
    ['Playing Now', 'What you are actively playing.'],
  ];
  return (
    <div className="relative rounded-xl border border-skyglass/15 bg-ink-900/50 px-4 py-3">
      <button
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-slate-600 transition hover:text-slate-300"
        onClick={onDismiss}
        type="button"
      >
        <Icon name="x" size={13} />
      </button>
      <div className="mb-2 text-xs font-semibold uppercase tracking-spread text-slate-500">How Questory Works</div>
      <div className="grid gap-2 pr-4 sm:grid-cols-4">
        {stages.map(([name, desc]) => (
          <div className="text-xs text-slate-400" key={name}>
            <span className="font-semibold text-slate-200">{name}</span> — {desc}
          </div>
        ))}
      </div>
    </div>
  );
}

function DealAlertCard({
  deals,
  onViewDeals,
}: {
  deals: Game[];
  onViewDeals: () => void;
}) {
  const best = deals[0];
  const isHistoricalLow = best.itadIsHistoricalLow === true;
  const discount = typeof best.itadDiscountPercent === 'number' ? `-${best.itadDiscountPercent}%` : null;
  const price =
    typeof best.itadCurrentBestPrice === 'number' && best.itadCurrentBestCurrency
      ? formatDealPrice(best.itadCurrentBestPrice, best.itadCurrentBestCurrency)
      : null;

  return (
    <div className="space-y-3">
      <div>
        <div className="qs-label-caps text-amber-400">
          {isHistoricalLow ? '🔥 Historical Low Found' : `🔥 ${deals.length} ${deals.length === 1 ? 'game' : 'games'} on sale`}
        </div>
        <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-white">{best.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {discount ? (
            <span className="rounded bg-mint/90 px-1.5 py-0.5 text-xs font-bold text-ink-950">{discount}</span>
          ) : null}
          {price ? <span className="text-xs font-semibold text-mint">{price}</span> : null}
          {isHistoricalLow ? <span className="text-xs text-amber-400/80">Lowest price ever</span> : null}
        </div>
        {deals.length > 1 ? (
          <p className="mt-1.5 text-xs text-slate-500">
            {isHistoricalLow
              ? `+${deals.length - 1} more ${deals.length - 1 === 1 ? 'game' : 'games'} on sale`
              : `+${deals.length - 1} more on sale`}
          </p>
        ) : null}
      </div>
      <button
        className="w-full rounded-lg border border-mint/30 bg-mint/10 py-2 text-sm font-semibold text-mint transition hover:bg-mint/20"
        data-home-focus="true"
        onClick={onViewDeals}
        type="button"
      >
        View Deals
      </button>
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
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4">
      <p className="mb-4 text-sm font-semibold text-white">{t('home.getStarted')}</p>
      <p className="mb-4 text-xs text-slate-400">{t('home.getStartedSubtitle')}</p>
      <div className="mb-4 flex flex-wrap items-center gap-1 text-2xs font-semibold text-slate-500">
        <span className="rounded bg-ink-900 px-2 py-0.5 text-slate-300">Library</span>
        <span className="text-slate-600">→</span>
        <span className="rounded bg-ink-900 px-2 py-0.5 text-mint/80">Quest Queue</span>
        <span className="text-slate-600">→</span>
        <span className="rounded bg-ink-900 px-2 py-0.5 text-slate-300">Platform Plans</span>
        <span className="text-slate-600">→</span>
        <span className="rounded bg-ink-900 px-2 py-0.5 text-slate-300">Playing Now</span>
      </div>
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

function NoActiveGamesGuide({
  libraryGamesCount,
  onOpenLibrary,
  onOpenReviewMode,
}: {
  libraryGamesCount: number;
  onOpenLibrary: () => void;
  onOpenReviewMode: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4">
      <h4 className="text-base font-semibold text-white">No active adventures yet</h4>
      <p className="mt-1 text-sm text-slate-400">
        Mark a game as Playing Now to track your current progress.{' '}
        {libraryGamesCount > 0 && (
          <span>You have {libraryGamesCount} {libraryGamesCount === 1 ? 'game' : 'games'} in your library waiting.</span>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="min-h-10 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          data-home-focus="true"
          onClick={onOpenLibrary}
          type="button"
        >
          Open Library
        </button>
        <button
          className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
          data-home-focus="true"
          onClick={onOpenReviewMode}
          type="button"
        >
          Open Quest Queue
        </button>
      </div>
    </div>
  );
}

function NoNextAdventureGuide({
  hasLibraryGames,
  hasProcessedGames,
  topPlatforms,
  onOpenQueue,
  onOpenReviewMode,
}: {
  hasLibraryGames: boolean;
  hasProcessedGames: boolean;
  topPlatforms: GamePlatform[];
  onOpenQueue: () => void;
  onOpenReviewMode: () => void;
}) {
  const platformChips = topPlatforms.length > 0 ? (
    <div className="mt-3">
      <p className="text-xs text-slate-500">Platforms in your library:</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {topPlatforms.map((p) => (
          <span key={p} className="rounded-full border border-skyglass/15 bg-ink-950/60 px-2 py-0.5 text-xs text-slate-300">
            {p}
          </span>
        ))}
      </div>
    </div>
  ) : null;

  if (!hasLibraryGames) {
    return (
      <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4 text-center">
        <h4 className="text-base font-semibold text-white">No Platform Plan Yet</h4>
        <p className="mt-1 text-sm text-slate-400">Import games first, then create Platform Plans to organise your library.</p>
        <button
          className="mt-4 min-h-10 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          data-home-focus="true"
          onClick={onOpenQueue}
          type="button"
        >
          Open Platform Plans
        </button>
      </div>
    );
  }

  if (!hasProcessedGames) {
    return (
      <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4">
        <div className="qs-label-caps text-accent">Next step</div>
        <h4 className="mt-1 text-base font-semibold text-white">Review your library first</h4>
        <p className="mt-1 text-sm text-slate-400">
          Platform Plans organise what you want to play on each system. Use Quest Queue to review your library and send games here.
        </p>
        {platformChips}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="min-h-10 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            data-home-focus="true"
            onClick={onOpenReviewMode}
            type="button"
          >
            Open Quest Queue
          </button>
          <button
            className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
            data-home-focus="true"
            onClick={onOpenQueue}
            type="button"
          >
            Open Platform Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4">
      <div className="qs-label-caps text-accent">Next step</div>
      <h4 className="mt-1 text-base font-semibold text-white">Add games to a Platform Plan</h4>
      <p className="mt-1 text-sm text-slate-400">
        Platform Plans hold the games you have decided to play next, organised by platform. Use Quest Queue to review your library and send games here, or open Platform Plans to add them directly.
      </p>
      {platformChips}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="min-h-10 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
          data-home-focus="true"
          onClick={onOpenReviewMode}
          type="button"
        >
          Open Quest Queue
        </button>
        <button
          className="min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
          data-home-focus="true"
          onClick={onOpenQueue}
          type="button"
        >
          Open Platform Plans
        </button>
      </div>
    </div>
  );
}

function WishlistNoDealsState({
  wishlistCount,
  canSync,
  onOpenWishlist,
  onSyncDeals,
}: {
  wishlistCount: number;
  canSync: boolean;
  onOpenWishlist: () => void;
  onSyncDeals?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4 text-center">
      <h4 className="text-base font-semibold text-white">No active deals</h4>
      <p className="mt-1 text-sm text-slate-400">
        {wishlistCount} wishlisted {wishlistCount === 1 ? 'game' : 'games'} — none are currently on sale.
        {canSync && ' Sync to check current prices.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {canSync && onSyncDeals && (
          <button
            className="min-h-10 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            data-home-focus="true"
            onClick={onSyncDeals}
            type="button"
          >
            Sync Deals
          </button>
        )}
        <button
          className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${canSync ? 'border border-mint/30 bg-mint/10 text-mint hover:bg-mint/20' : 'bg-mint text-ink-950 hover:bg-mint/90'}`}
          data-home-focus="true"
          onClick={onOpenWishlist}
          type="button"
        >
          Open Wishlist
        </button>
      </div>
    </div>
  );
}

function FirstDayProgressPanel({
  libraryCount,
  queuedCount,
  playingCount,
  platformCount,
  reviewRemainingCount,
  onOpenLibrary,
  onOpenReviewMode,
  onOpenQueue,
  onDismiss,
}: {
  libraryCount: number;
  queuedCount: number;
  playingCount: number;
  platformCount: number;
  reviewRemainingCount: number;
  onOpenLibrary: () => void;
  onOpenReviewMode: () => void;
  onOpenQueue: () => void;
  onDismiss: () => void;
}) {
  const milestones: Array<{ done: boolean; text: string; action?: () => void; actionLabel?: string }> = [
    {
      done: libraryCount > 0,
      text: libraryCount > 0
        ? `Imported ${libraryCount} ${libraryCount === 1 ? 'game' : 'games'}`
        : 'Import your games',
      action: libraryCount === 0 ? onOpenLibrary : undefined,
      actionLabel: 'Open Library',
    },
    {
      done: queuedCount > 0 || playingCount > 0,
      text:
        queuedCount > 0
          ? `Organised ${queuedCount} ${queuedCount === 1 ? 'game' : 'games'} into Platform Plans`
          : reviewRemainingCount > 0
          ? `${reviewRemainingCount} ${reviewRemainingCount === 1 ? 'game' : 'games'} ready to review`
          : 'Review games in Quest Queue',
      action: queuedCount === 0 && playingCount === 0 ? onOpenReviewMode : undefined,
      actionLabel: 'Open Quest Queue',
    },
    {
      done: platformCount > 0,
      text:
        platformCount > 0
          ? `${platformCount} Platform ${platformCount === 1 ? 'Plan' : 'Plans'} created`
          : 'Create your first Platform Plan',
      action: platformCount === 0 ? onOpenQueue : undefined,
      actionLabel: 'Open Platform Plans',
    },
    {
      done: playingCount > 0,
      text:
        playingCount > 0
          ? `${playingCount} ${playingCount === 1 ? 'adventure' : 'adventures'} in progress`
          : 'Mark your first Playing Now game',
      action: playingCount === 0 ? onOpenLibrary : undefined,
      actionLabel: 'Open Library',
    },
  ];

  const completedCount = milestones.filter((m) => m.done).length;

  return (
    <div className="relative rounded-2xl border border-skyglass/15 bg-ink-900/74 p-4 shadow-panel">
      <button
        aria-label="Dismiss progress panel"
        className="absolute right-3 top-3 text-slate-600 transition hover:text-slate-300"
        onClick={onDismiss}
        type="button"
      >
        <Icon name="x" size={14} />
      </button>
      <div className="flex items-center gap-2 pr-6">
        <div className="qs-label-caps text-accent">Your Progress</div>
        <span className="rounded-full bg-mint/15 px-2 py-0.5 text-xs font-bold text-mint">
          {completedCount} / {milestones.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {milestones.map((m, i) => (
          <div key={i} className={`flex items-start gap-2.5 rounded-lg p-2.5 ${m.done ? 'bg-mint/5' : 'bg-ink-950/40'}`}>
            <div
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-2xs font-bold ${
                m.done ? 'bg-mint text-ink-950' : 'border border-skyglass/30 text-slate-600'
              }`}
            >
              {m.done ? '✓' : i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${m.done ? 'text-slate-300' : 'text-white'}`}>{m.text}</p>
              {m.action && m.actionLabel && (
                <button
                  className="mt-0.5 text-xs font-semibold text-mint transition hover:opacity-75"
                  data-home-focus="true"
                  onClick={m.action}
                  type="button"
                >
                  {m.actionLabel} →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isBacklogReviewCandidate(game: Game) {
  return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped' && game.status !== 'Playing';
}

// ── Activity signal helpers ───────────────────────────────────────────────────

const SIGNAL_DAY_MS = 24 * 60 * 60 * 1000;

function parseLocalDateStr(dateStr: string): Date {
  const parts = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(parts[0] ?? 2000, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function localDayDiff(from: Date, to: Date): number {
  const fromMs = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toMs = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.floor((toMs - fromMs) / SIGNAL_DAY_MS);
}

function getGameActivitySignal(
  gameId: string,
  activity: PlayActivityRecord[],
  lastPlayedAt: string | null,
  now = new Date(),
): string | null {
  // Collect unique YYYY-MM-DD dates this game has activity on, newest first
  const dates = [...new Set(
    activity.filter((r) => r.gameId === gameId).map((r) => r.date),
  )].sort((a, b) => b.localeCompare(a));

  if (dates.length > 0) {
    const mostRecent = parseLocalDateStr(dates[0]);
    const daysOld = localDayDiff(mostRecent, now);

    // Only surface streaks/signals anchored to today or yesterday
    if (daysOld <= 1) {
      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = parseLocalDateStr(dates[i - 1]);
        const curr = parseLocalDateStr(dates[i]);
        if (localDayDiff(curr, prev) === 1) {
          streak++;
        } else {
          break;
        }
      }

      if (streak >= 7) return '🔥 Playing all week';
      if (streak >= 2) return `🔥 ${streak}-day streak`;

      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (dates[0] === todayStr) return 'Last played today';
      return 'Last played yesterday';
    }
  }

  // Fall back to game.lastPlayedAt for a rough recency label
  if (lastPlayedAt) {
    const parsed = parseLocalDateStr(lastPlayedAt);
    if (isNaN(parsed.getTime())) return null;
    const days = localDayDiff(parsed, now);
    if (days === 0) return 'Last played today';
    if (days === 1) return 'Last played yesterday';
    if (days <= 6) return `Last played ${days} days ago`;
    if (days <= 14) return 'Last played last week';
    if (days <= 30) return 'Last played this month';
  }

  return null;
}

function pickQueueGhostCover({
  nextAdventureEntries,
  nextReviewCandidate,
  continuePlayingGames,
  libraryGames,
}: {
  nextAdventureEntries: NextAdventureEntry[];
  nextReviewCandidate: Game | null;
  continuePlayingGames: Game[];
  libraryGames: Game[];
}): QueueGhostCover | null {
  const randomLibraryGames = [...libraryGames].sort(() => Math.random() - 0.5);
  const priorityGames = [
    nextAdventureEntries[0]?.game,
    nextReviewCandidate,
    continuePlayingGames[0],
    ...randomLibraryGames,
  ].filter((game): game is Game => Boolean(game));

  return (
    findUsableGhostCover(priorityGames)
  );
}

function findUsableGhostCover(games: Game[]): QueueGhostCover | null {
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const imageUrl = getPreferredArtworkSources(game, 'micro').find((url) => isUsableGhostCoverUrl(url));
    if (imageUrl) {
      return { title: game.displayTitleOverride?.trim() || game.title, imageUrl };
    }
  }
  return null;
}

function isUsableGhostCoverUrl(url?: string | null): url is string {
  if (!url || isMissingOrGeneratedCover(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:';
  } catch {
    return false;
  }
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
  onImportNewSteamGames,
  onSyncSteamAchievements,
  onSyncSteamPlaytime,
  isImportingNewSteamGames = false,
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
  onImportNewSteamGames?: () => void;
  onSyncSteamAchievements?: () => void;
  onSyncSteamPlaytime?: () => void;
  isImportingNewSteamGames?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { dragHandleProps, dragStyle } = useBottomSheetDragToClose({ panelRef, onClose });
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
      <div ref={panelRef} className="relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl" style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))', ...dragStyle }}>
        <div className="qs-sheet-drag-region flex justify-center pb-2 pt-3" {...dragHandleProps}><div className="qs-sheet-handle h-1.5 w-16 rounded-full bg-skyglass/35" title="Swipe down to dismiss" /></div>
        <div className="px-4 pb-2 pt-1">
          <h3 className="mb-4 text-base font-bold text-white">{t('home.syncMaintenance')}</h3>
          <div className="overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60 divide-y divide-[var(--border)]">
            {onImportNewSteamGames ? (
              <SyncSheetButton icon="steam" label="Import new Steam games" syncingLabel="Finding newly owned Steam games…" isSyncing={isImportingNewSteamGames} lastSyncAt={null} subtitle="Find newly owned Steam games" onClick={onImportNewSteamGames} neverLabel={t('home.neverSynced')} />
            ) : null}
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

function SyncSheetButton({ icon, isSyncing, label, lastSyncAt, neverLabel, onClick, syncingLabel, subtitle }: { icon: Parameters<typeof Icon>[0]['name']; isSyncing: boolean; label: string; lastSyncAt: Date | string | null; neverLabel: string; onClick: () => void; syncingLabel: string; subtitle?: string }) {
  return (
    <button className="flex min-h-[60px] w-full items-center gap-3.5 px-4 text-left transition hover:bg-mint/[0.07] active:bg-mint/[0.10] disabled:opacity-50" disabled={isSyncing} onClick={onClick} type="button">
      <Icon name={isSyncing ? 'refresh-cw' : icon} size={18} strokeWidth={2} className={`shrink-0 text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-200">{label}</span>
        <span className={`block text-xs ${isSyncing ? 'text-mint' : 'text-slate-500'}`}>{isSyncing ? syncingLabel : subtitle ?? (lastSyncAt ? formatRelativeTime(lastSyncAt, neverLabel) : neverLabel)}</span>
      </div>
      {!isSyncing ? <Icon name="chevrons-right" size={14} strokeWidth={2} className="shrink-0 text-slate-600" /> : null}
    </button>
  );
}

function SyncStatusLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">{label}</span><span className="text-right text-slate-300">Last sync: {value}</span></div>;
}

type HeroMessageCategory = 'normal' | 'motivation' | 'queueGhostLore';

type HeroMessageContext = {
  activeCount: number;
  droppedCount: number;
  finishedCount: number;
  hasAchievements: boolean;
  hasRetro: boolean;
  hasSteam: boolean;
  librarySize: number;
  queueCount: number;
  reviewedCount: number;
  reviewRemainingCount: number;
  yakuzaCount: number;
  playStreak: number;
  hasPlayedRecently: boolean;
};

// ── Easter egg tracking ───────────────────────────────────────────────────────

const RECENT_EGGS_KEY = 'qs-hero-recent-eggs';
const MAX_RECENT_EGGS = 5;

function getRecentEasterEggKeys(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EGGS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function recordEasterEggKey(key: string): void {
  const recent = getRecentEasterEggKeys();
  const updated = [...recent.filter((k) => k !== key), key].slice(-MAX_RECENT_EGGS);
  try {
    localStorage.setItem(RECENT_EGGS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

// ── Activity helpers ──────────────────────────────────────────────────────────

function getNDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computePlayStreak(activity: PlayActivityRecord[]): number {
  if (activity.length === 0) return 0;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterdayStr = getNDaysAgoStr(1);
  const dates = [...new Set(activity.map((r) => r.date))].sort().reverse();
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T12:00:00');
    const curr = new Date(dates[i] + 'T12:00:00');
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// ── Hero message system ───────────────────────────────────────────────────────

type EasterEggCandidate = {
  key: string;
  weight: number;
  condition: boolean;
  messages: string[];
};

function pickHeroMessage(
  ctx: HeroMessageContext,
  recentEasterEggs: string[],
): { message: string; easterEggKey?: string } {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const easterEggs: EasterEggCandidate[] = [
    {
      key: 'ultra-rare',
      weight: 0.005,
      condition: true,
      messages: [
        'The cake is a lie.',
        'Wake up, Samurai. We have a backlog to burn.',
        "Hey, you. You're finally awake.",
        'Would you kindly review another game?',
        'War. War never changes. The backlog does.',
        'Stay awhile and listen.',
        'One does not simply finish the backlog.',
        'Perhaps the real achievement was the games we ignored along the way.',
      ],
    },
    {
      key: 'yakuza',
      weight: 0.02,
      condition: ctx.yakuzaCount >= 3,
      messages: [
        'Majima Everywhere.',
        'Kiryu would probably finish the backlog.',
        'Ichiban believes in you.',
        'The Dragon of Dojima recommends playing today.',
        'Like a Dragon spotted in your plans.',
        'Majima is disappointed in your queue discipline.',
        'Your backlog has entered Kamurocho.',
      ],
    },
    {
      key: 'collector',
      weight: 0.02,
      condition: ctx.librarySize > 500,
      messages: [
        'Buying games and playing games remain separate hobbies.',
        'You own enough games for several lifetimes.',
        'Impressive. Concerning. But impressive.',
        'The collection grows stronger.',
        'Your Steam library can be seen from space.',
        'At this point, Steam is a lifestyle.',
      ],
    },
    {
      key: 'extreme-backlog',
      weight: 0.02,
      condition: ctx.reviewRemainingCount > 1000,
      messages: [
        'The queue has achieved sentience.',
        'The backlog remembers.',
        'Quest Queue has become a permanent residence.',
        'One review at a time.',
        `${ctx.reviewRemainingCount.toLocaleString('en-US')} games remain. No pressure.`,
        'Your future self has questions.',
      ],
    },
    {
      key: 'retro',
      weight: 0.02,
      condition: ctx.hasRetro,
      messages: [
        'Retro never left.',
        'Pixels never truly die.',
        'Some memories deserve a replay.',
        'The backlog spans generations.',
        'Somewhere in your plans is a forgotten masterpiece.',
        'Insert memory card.',
      ],
    },
    {
      key: 'inactivity',
      weight: 0.05,
      condition: !ctx.hasPlayedRecently && ctx.activeCount > 0,
      messages: [
        'Your games are starting to talk about you.',
        'The backlog noticed your absence.',
        'One session is better than no session.',
        'Your adventures miss you.',
        'Even 15 minutes counts.',
      ],
    },
    {
      key: 'streak',
      weight: 0.05,
      condition: ctx.playStreak >= 7,
      messages: [
        'Touch grass achievement temporarily revoked.',
        'Please remember to hydrate.',
        'The streak must continue.',
        'Momentum is a beautiful thing.',
        'One more session?',
      ],
    },
    {
      key: 'queue-ghost-lore',
      weight: 0.015,
      condition: true,
      messages: [
        'Nobody knows where Queue Ghost came from.',
        'Some say Queue Ghost was born from unfinished games.',
        'Nobody remembers adding Queue Ghost to the backlog.',
        'Queue Ghost appeared shortly after the first imported library.',
        'Queue Ghost has been watching your backlog.',
        'Queue Ghost never forgets a dropped game.',
        'Queue Ghost looks worried.',
        'Queue Ghost seems pleased.',
        'Queue Ghost appears unusually calm today.',
        'Queue Ghost is concerned about the queue.',
        'Some games are never truly forgotten.',
        'Even ignored games leave echoes.',
        'Queue Ghost was here before Platform Plans.',
        'Queue Ghost refuses to discuss Steam sales.',
        'Queue Ghost denies all allegations.',
        'Queue Ghost claims this backlog is manageable.',
        'Queue Ghost has seen things.',
        'Queue Ghost believes in second chances.',
        'Queue Ghost is not a bug.',
      ],
    },
    {
      key: 'queue-ghost-lore-ctx',
      weight: 0.025,
      condition: ctx.reviewRemainingCount > 1000 || (ctx.queueCount === 0 && ctx.librarySize > 10) || (!ctx.hasPlayedRecently && ctx.librarySize > 5) || ctx.droppedCount >= 5,
      messages: [
        ...(ctx.reviewRemainingCount > 1000 ? [
          'Queue Ghost looks worried.',
          'The backlog grows stronger.',
          'We may need a bigger queue.',
        ] : []),
        ...(ctx.queueCount === 0 && ctx.librarySize > 10 ? [
          'Queue Ghost seems unusually peaceful.',
          'Silence. At last.',
        ] : []),
        ...(!ctx.hasPlayedRecently && ctx.librarySize > 5 ? [
          'Queue Ghost has been waiting.',
          'The backlog misses you.',
        ] : []),
        ...(ctx.droppedCount >= 5 ? [
          'Queue Ghost remembers every abandoned adventure.',
        ] : []),
      ],
    },
  ];

  for (const egg of easterEggs) {
    if (!egg.condition) continue;
    if (recentEasterEggs.includes(egg.key)) continue;
    if (Math.random() < egg.weight) {
      return { message: pick(egg.messages), easterEggKey: egg.key };
    }
  }

  return { message: pickContextualMessage(ctx) };
}

function pickContextualMessage(ctx: HeroMessageContext): string {
  const { activeCount, finishedCount, hasAchievements, hasRetro, hasSteam, librarySize, queueCount, reviewedCount, reviewRemainingCount } = ctx;
  const s = (n: number) => n === 1 ? '' : 's';
  const n = (v: number) => v.toLocaleString('en-US');
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  // Rare — 5% chance
  const rareMessages = [
    'Go play something.',
    'Stop organising.\nStart playing.',
    'This is your sign.',
    'Pick a game. Any game.',
    'Your next favourite game might already be installed.',
    'Close Questory.\nLaunch a game.',
    'Seriously.',
  ];
  if (Math.random() < 0.05) return pick(rareMessages);

  // Dry Humor — 12% chance
  const dryHumorMessages = [
    "You bought it.\nEventually you'll play it.",
    'The backlog has achieved sentience.',
    "Today's plan:\navoid opening the Steam sale.",
    "You cannot finish them all.\nAnd that's okay.",
    "Questory believes in you.\nThe queue is less certain.",
    'This seemed like a good idea at the time.',
    'Nothing says optimism like another imported library.',
    'The shelf grows. The shelf endures.',
  ];
  if (Math.random() < 0.12) return pick(dryHumorMessages);

  const contextual: string[] = [];

  if (reviewRemainingCount > 0) {
    contextual.push('The queue remembers.');
    contextual.push('One review at a time.');
    contextual.push('Your future self would appreciate some triage.');
    if (reviewRemainingCount > 50) {
      contextual.push(`${n(reviewRemainingCount)} game${s(reviewRemainingCount)} waiting for a verdict.`);
    }
    if (reviewRemainingCount > 200 && librarySize > 200) {
      contextual.push(`Somewhere in those ${n(librarySize)} games is your next favourite.`);
    }
    if (reviewedCount > 5) {
      contextual.push(`You reviewed ${n(reviewedCount)} game${s(reviewedCount)}.\n${n(reviewRemainingCount)} still waiting.`);
    }
  }

  if (activeCount > 0) {
    contextual.push(`${n(activeCount)} adventure${s(activeCount)} already in progress.`);
    contextual.push('You already know what to play.');
    contextual.push('Keep the momentum going.');
    contextual.push(`Your current game${s(activeCount)} ${activeCount === 1 ? 'is' : 'are'} still right there.`);
    contextual.push('One session is better than no session.');
    if (activeCount > 1) contextual.push('The hardest part is choosing.\nYou already did that.');
    contextual.push('You are closer to the credits than yesterday.');
  }

  if (queueCount > 0) {
    contextual.push('Your next adventure is already waiting.');
    contextual.push('You made the plan.\nTrust the plan.');
    contextual.push('Future fun has already been scheduled.');
    contextual.push('Platform Plans are promises to yourself.');
    contextual.push('A good backlog is a curated backlog.');
    if (queueCount > 5) contextual.push(`${n(queueCount)} game${s(queueCount)} queued.\nLet's see who goes first.`);
  }

  if (hasAchievements) {
    contextual.push('There is always one more achievement.');
    contextual.push('Completion is a journey.');
    contextual.push('Some percentages deserve respect.');
    contextual.push('Progress comes in small popups.');
    contextual.push('That rare achievement will not unlock itself.');
  }

  if (hasSteam && librarySize > 300) {
    contextual.push('Your collection is thriving.');
    contextual.push('Every library tells a story.');
    contextual.push('At least the covers look nice.');
    if (librarySize > 500) {
      contextual.push('Buying games and playing games\nremain separate hobbies.');
      contextual.push('Most of your games are still a mystery.');
    }
    if (librarySize > 1000) {
      contextual.push(`${n(librarySize)} games imported.\nAmbitious.`);
      contextual.push('Congratulations.\nYou have enough games until retirement.');
    }
  }

  if (hasRetro) {
    contextual.push('Some classics age better than others.');
    contextual.push('Pixels never truly die.');
    contextual.push('The backlog spans generations.');
    contextual.push('Retro never left.');
    contextual.push('Somewhere in your plans is a forgotten masterpiece.');
    if (librarySize > 100) contextual.push('A memory card would not survive this collection.');
  }

  if (reviewedCount > 10) {
    contextual.push(`${n(reviewedCount)} games reviewed. Not bad.`);
    contextual.push('Progress compounds.');
    contextual.push('Every review improves your recommendations.');
  }
  if (finishedCount > 0) {
    contextual.push(`${n(finishedCount)} game${s(finishedCount)} finished.\nSomething to be proud of.`);
    contextual.push('Another game found its place.');
    contextual.push('A smaller queue is a beautiful thing.');
  }

  const staticMessages = [
    'The list grows. The list is patient.',
    'Pick one. Future you will thank you.',
    'Progress is progress. Even at 2%.',
    'One game closer. Probably.',
    'Quest Queue is a lifestyle.',
    'Your Platform Plans are waiting.',
    'Your backlog is not getting smaller by itself.',
    'The queue has been waiting for you.',
    'Every session counts.',
  ];

  if (contextual.length > 0) return pick(contextual);
  return pick(staticMessages);
}

function pickNewlyUnlockedAchievement(achievements: QuestShelfAchievementProgress[]): AchievementGhostCandidate | null {
  const unlocked = achievements.filter((achievement) => achievement.isUnlocked && !achievement.isMeta);
  if (unlocked.length === 0) return null;
  try {
    const seen = getSeenAchievementGhostIds();
    const fresh = unlocked.find((achievement) => !seen.has(achievement.id));
    return fresh ? { id: fresh.id, title: fresh.title, icon: fresh.icon, seenIds: unlocked.map((achievement) => achievement.id) } : null;
  } catch {
    return null;
  }
}

function isLocalMidnightWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= 0 && hour < 3;
}
