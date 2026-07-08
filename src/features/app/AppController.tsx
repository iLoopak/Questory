import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Icon } from '../../components/Icon';
import { BackToTopButton } from '../../components/BackToTopButton';
import { BacklogPlatformPicker } from '../../components/BacklogPlatformPicker';
import { UndoToastStack } from '../../components/UndoToastStack';
import { RawgLinkDialog } from '../../components/RawgLinkDialog';
import { HomePanel } from '../../components/HomePanel';
import { MetadataEnrichmentPanel } from '../../components/MetadataEnrichmentPanel';
import { OnboardingChecklist } from '../../components/OnboardingChecklist';
import { ShelfAvatar } from '../../components/ShelfIdentity';
import { ShelfProfilePopover } from '../shelf-profile/ShelfProfilePopover';
import { PwaStatusBanner } from '../../components/PwaStatusBanner';
import { QueuePanel } from '../../components/QueuePanel';
import { RecommendationPanel } from '../../components/RecommendationPanel';
import { ReviewModePanel } from '../../components/ReviewModePanel';
import { StatsPanel } from '../../components/StatsPanel';
import { QuestRunnerGame } from '../../components/QuestRunnerGame';
import {
  getNavDescription,
  moreNavItems,
  navItemLabelKeys,
  type MoreNavItem,
  type NavItem,
  type TopNavItem,
} from '../../config/navigation';
import type { SettingsCategory } from '../../config/settings';
import {
  initialCollectionFilters,
  type CollectionFilters,
} from '../../config/collection';
import { I18nProvider } from '../../i18n';
import { getActiveQuestShelfAchievement, getQuestShelfAchievements, type QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import { loadAchievementCounters, saveAchievementCounters, type AchievementCounters } from '../../lib/achievementCounters';
import { loadGames } from '../../lib/gameStorage';
import { getRuntimeEnvironment } from '../../lib/capacitorEnvironment';
import type { OnboardingItemId } from '../../lib/onboardingStorage';
import type { ItadDealSyncState } from '../../config/syncStates';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import { formatLocalDate, loadPlayActivity, upsertPlayedTodayActivity, type PlayActivityRecord } from '../../lib/playActivityStorage';
import { loadRawgSettings } from '../../lib/rawgSettingsStorage';
import { getSteamProfileDisplayName, loadSteamSettings } from '../../lib/steamSettingsStorage';
import {
  formatMessageTemplate,
  formatSteamAchievementSyncSummary,
} from '../../utils/summaryFormatters';
import { filterGames, getVisibleCollectionGames } from '../../utils/collectionFilters';
import {
  getMoveQueueToastMessage,
  getOpenQueueAction,
  getRemoveQueueToastMessage,
  getUndoAction,
} from '../../lib/notifications';
import { loadReviewModeState, type ReviewModeState, type ReviewSource } from '../../lib/reviewModeStorage';
import { getAppTemplateClassName, type AccentColorPreference, type AppTemplatePreference, type ResolvedTheme, type ThemePreference } from '../../lib/themePreferences';
import { type UndoActionHistoryEntry } from '../../lib/undoHistoryStorage';
import { addIgnoredSteamGame, loadIgnoredSteamGames, removeIgnoredSteamGame, type IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';
import type { Game, GamePlatform, GameStatus } from '../../types/game';
import type { RawgSearchResult } from '../../types/rawg';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState, SteamWishlistSyncState } from '../../types/steam';
import { useAppPersistence } from './useAppPersistence';
import { useAppSyncActions } from './useAppSyncActions';
import { useNavigationState } from '../navigation/useNavigationState';
import { useCollectionFilters } from '../collection/useCollectionFilters';
import { CollectionPanel } from '../collection/CollectionPanel';
import { useGameSelection } from '../../hooks/useGameSelection';
import { useToastState } from '../toasts/useToastState';
import { useQueueActions } from '../../hooks/useQueueActions';
import { useGameLibraryActions } from '../../hooks/useGameLibraryActions';
import { useReviewModeActions } from '../../hooks/useReviewModeActions';
import { useOnboardingController } from '../onboarding/useOnboardingController';
import { useShelfProfileController } from '../shelf-profile/useShelfProfileController';
import { usePlatformQueueController } from '../queue/usePlatformQueueController';
import { useAppPreferencesController } from '../settings/useAppPreferencesController';
import { useSyncController } from '../integrations/useSyncController';
import { useMetadataController } from '../metadata/useMetadataController';
import { PlayingNowHub } from '../playing-now/PlayingNowHub';
import { AppGameDetailsView } from './AppGameDetailsView';
import { ArtworkBrowserView } from '../artwork/ArtworkBrowserView';
import { SettingsView } from '../settings/SettingsView';
import { trackAnalyticsEvent, type AnalyticsCounts, type AnalyticsImportSource } from '../../lib/analytics';
import { CompletionRatingSheet } from '../../components/CompletionRatingSheet';
import { QueueGhost, type QueueGhostAchievement } from '../../components/QueueGhost';
import { getSeenAchievementGhostIds, setSeenAchievementGhostIds } from '../../lib/achievementGhostStorage';
import { useControllerAction } from '../../lib/controllerActions';
import { QuestShelfLogo } from './components/QuestShelfLogo';
import { AddGameDialog } from './components/AddGameDialog';
import { AppStartupScreen } from './components/AppStartupScreen';
import { PlaceholderPanel } from './components/PlaceholderPanel';
import { touchGameRecord, getRetroDuplicateKey } from '../../lib/gameUtils';


export function AppController() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [playActivity, setPlayActivity] = useState<PlayActivityRecord[]>(() => loadPlayActivity());
  const [activeUtilityView, setActiveUtilityView] = useState<'playing-now' | null>(null);
  const [playingNowReturnContext, setPlayingNowReturnContext] = useState<{ activeNavItem: NavItem; selectedGameId: string | null } | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { filteredLibraryGames, filteredWishlistGames, libraryFilters, platformOptions, setLibraryFilters, setWishlistFilters, tags, wishlistFilters } = useCollectionFilters(games);
  const [steamSettingsSnapshot, setSteamSettingsSnapshot] = useState(() => loadSteamSettings());
  const [isRawgApiKeySet, setIsRawgApiKeySet] = useState(() => Boolean(loadRawgSettings().apiKey.trim()));
  const [steamProfileName, setSteamProfileName] = useState(() => getSteamProfileDisplayName(steamSettingsSnapshot));
  const {
    accentColorPreference,
    accentThemeStyle,
    appTemplatePreference,
    confirmCancelConvention,
    controllerProfileId,
    detectedProfileId,
    isControllerDebugEnabled,
    isLandscapeLockEnabled,
    language,
    gradientOrientationPreference,
    neonButtonGradientBalancePreference,
    neonButtonGradientMidpointPreference,
    neonButtonStylePreference,
    resolvedTheme,
    secondaryAccentColorPreference,
    setAccentColorPreference,
    setGradientOrientationPreference,
    setAppTemplatePreference,
    setControllerProfileId,
    setIsControllerDebugEnabled,
    setIsLandscapeLockEnabled,
    setLanguage,
    setNeonButtonGradientBalancePreference,
    setNeonButtonGradientMidpointPreference,
    setNeonButtonStylePreference,
    setSecondaryAccentColorPreference,
    setThemePreference,
    t,
    themePreference,
  } = useAppPreferencesController();
  const {
    activeNavItem,
    activeSettingsCategory,
    navigationVisibility,
    setActiveNavItem,
    setActiveSettingsCategory,
    setNavigationVisibility,
    visibleNavItems,
  } = useNavigationState({ onSectionChange: () => setSelectedGameId(null) });
  const { isAddGameOpen, selectedGame, selectedGameId, setIsAddGameOpen, setSelectedGameId } = useGameSelection(games);
  const [detailReturnSection, setDetailReturnSection] = useState<NavItem | null>(null);
  const {
    activeQueuePlatforms,
    backlogPickerGame,
    openBacklogPicker,
    platformQueueState,
    queuePlatforms,
    queueSummary,
    setBacklogPickerGame,
    setPlatformQueueState,
    setTargetQueuePlatform,
    targetQueuePlatform,
  } = usePlatformQueueController(games);
  const {
    resolvedFeaturedGame,
    isShelfProfileOpen,
    libraryOwnerNickname,
    personalizedQuestShelfTitle,
    playingNowGame,
    setIsShelfProfileOpen,
    setLibraryOwnerNickname,
    setShelfIdentity,
    shelfIdentity,
    shelfOverview,
    shelfProfileRef,
  } = useShelfProfileController(games, platformQueueState, steamProfileName);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const analyticsCounts = useMemo<AnalyticsCounts>(() => ({
    librarySize: games.filter((game) => game.collectionType === 'library').length,
    wishlistSize: games.filter((game) => game.collectionType === 'wishlist').length,
    platformCount: activeQueuePlatforms.length,
    playingCount: games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length,
    queueCount: queueSummary.queuedCount,
  }), [activeQueuePlatforms.length, games, queueSummary.queuedCount]);
  const trackedSessionEventsRef = useRef(new Set<string>());

  function trackMinimalAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], importSource?: AnalyticsImportSource) {
    trackAnalyticsEvent(eventName, analyticsCounts, importSource ? { importSource } : undefined);
  }

  function trackSessionAnalyticsEvent(eventName: Parameters<typeof trackAnalyticsEvent>[0], importSource?: AnalyticsImportSource) {
    const eventKey = importSource ? `${eventName}:${importSource}` : eventName;
    if (trackedSessionEventsRef.current.has(eventKey)) return;
    trackedSessionEventsRef.current.add(eventKey);
    trackMinimalAnalyticsEvent(eventName, importSource);
  }
  const mainContentRef = useRef<HTMLElement | null>(null);
  const selectedGameScrollRestoreRef = useRef<number | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const isMoreNavActive = moreNavItems.includes(activeNavItem as MoreNavItem);
  const steamAvatarUrl = steamSettingsSnapshot.profile?.avatarUrl ?? '';
  useEffect(() => {
    if (!isMoreMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  const {
    completedOnboardingItemIds,
    onboardingProgress,
    handleOnboardingAction,
    hideOnboarding,
    isOnboardingComplete,
    isOnboardingOpen,
    markOnboardingItemComplete,
    markOnboardingItemsComplete,
    onboardingState,
    openOnboarding,
    restartOnboarding,
    skipOnboardingItem,
    skippedOnboardingItemIds,
  } = useOnboardingController({ setActiveNavItem, setActiveSettingsCategory, setIsAddGameOpen, setSelectedGameId });
  const {
    isHltbSyncing,
    itadDealSyncState,
    setIsHltbSyncing,
    setItadDealSyncState,
    setSteamAchievementSyncState,
    setSteamPlaytimeRefreshState,
    setSteamWishlistSyncState,
    steamAchievementSyncState,
    steamPlaytimeRefreshState,
    steamWishlistSyncState,
  } = useSyncController();

  function handleSteamProfileNameChange(profileName: string) {
    setSteamProfileName(profileName);
    setSteamSettingsSnapshot(loadSteamSettings());
  }

  const [lastRetroImportGameIds, setLastRetroImportGameIds] = useState<string[]>([]);
  const [completionRatingGame, setCompletionRatingGame] = useState<Game | null>(null);
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => loadReviewModeState());
  const [activeReviewSource, setActiveReviewSource] = useState<ReviewSource>(() => loadReviewModeState().lastSource);
  const [rawgRecoveryRequest, setRawgRecoveryRequest] = useState<{ gameId: string; retryMode: 'metadata' | 'artwork' } | null>(null);
  const [pendingAchievementGhost, setPendingAchievementGhost] = useState<QueueGhostAchievement | null>(null);
  const [achievementCounters, setAchievementCounters] = useState<AchievementCounters>(() => loadAchievementCounters());
  const achievementCountersRef = useRef(achievementCounters);
  achievementCountersRef.current = achievementCounters;

  function updateAchievementCounters(updates: Partial<AchievementCounters>) {
    setAchievementCounters((prev) => {
      const next = { ...prev, ...updates };
      saveAchievementCounters(next);
      return next;
    });
  }

  const achievementCtx = useMemo(() => ({
    language,
    counters: achievementCounters,
    onboardingCompleted: isOnboardingComplete,
    reviewStats: reviewModeState.stats,
    reviewedGamesCount: Object.keys(reviewModeState.reviewedGames).length,
  }), [language, achievementCounters, isOnboardingComplete, reviewModeState.stats, reviewModeState.reviewedGames]);

  const questShelfAchievements = useMemo(
    () => getQuestShelfAchievements(games, platformQueueState, achievementCtx),
    [games, platformQueueState, achievementCtx],
  );
  const activeShelfAchievement = useMemo(
    () => getActiveQuestShelfAchievement(games, shelfIdentity.selectedActiveBadgeId, platformQueueState, achievementCtx),
    [games, platformQueueState, shelfIdentity.selectedActiveBadgeId, achievementCtx],
  );
  const computedShelfTitle = activeShelfAchievement ? activeShelfAchievement.title : '';
  const isAppMountedRef = useRef(true);

  // ── Achievement counter tracking ──────────────────────────────────────────

  // Daily active days + night owl / early bird — runs once on mount
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();
    const c = achievementCountersRef.current;
    const updates: Partial<AchievementCounters> = {};

    if (!c.activeDays.includes(today)) {
      updates.activeDays = [...c.activeDays, today];
    }
    if (!c.nightOwlUnlocked && hour >= 0 && hour < 5) {
      updates.nightOwlUnlocked = true;
    }
    if (!c.earlyBirdUnlocked && hour >= 5 && hour < 6) {
      updates.earlyBirdUnlocked = true;
    }
    updates.justBrowsingOpens = c.justBrowsingOpens + 1;

    if (Object.keys(updates).length > 0) {
      updateAchievementCounters(updates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // libraryFirstCreatedAt — set once when games are first loaded
  useEffect(() => {
    const c = achievementCountersRef.current;
    if (c.libraryFirstCreatedAt) return;
    const earliest = games
      .map((g) => g.importedAt ?? g.updatedAt)
      .filter((d): d is string => typeof d === 'string')
      .sort()[0];
    if (earliest) {
      updateAchievementCounters({ libraryFirstCreatedAt: earliest });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.length]);

  // Playing streak — update when the currently-playing game changes
  useEffect(() => {
    const c = achievementCountersRef.current;
    const playing = games.filter((g) => g.collectionType === 'library' && g.status === 'Playing');
    if (playing.length === 0) {
      if (c.playingStreak !== null) {
        updateAchievementCounters({ playingStreak: null });
      }
    } else {
      const main = playing[0];
      if (c.playingStreak?.gameId !== main.id) {
        updateAchievementCounters({ playingStreak: { gameId: main.id, since: new Date().toISOString() } });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  // Unlock notification — fires a toast when a new achievement unlocks
  const prevUnlockedIdsRef = useRef<Set<string> | null>(null);
  const addToastRef = useRef<((n: { category: 'success'; dedupeKey: string; message: string; details?: string }) => void) | null>(null);

  useEffect(() => {
    const currentUnlocked = new Set(questShelfAchievements.filter((a) => a.isUnlocked).map((a) => a.id));

    if (prevUnlockedIdsRef.current === null) {
      prevUnlockedIdsRef.current = currentUnlocked;
      return;
    }

    const notify = addToastRef.current;
    if (!notify) return;

    let firstNewNonMeta: QuestShelfAchievementProgress | undefined;

    for (const a of questShelfAchievements) {
      if (a.isUnlocked && !prevUnlockedIdsRef.current.has(a.id)) {
        notify({ category: 'success', dedupeKey: `achievement-unlock:${a.id}`, message: `Achievement unlocked: ${a.title}`, details: a.description });
        if (!firstNewNonMeta && !a.isMeta) {
          firstNewNonMeta = a;
        }
      }
    }

    if (firstNewNonMeta) {
      const seen = getSeenAchievementGhostIds();
      if (!seen.has(firstNewNonMeta.id)) {
        const allUnlocked = questShelfAchievements.filter((a) => a.isUnlocked && !a.isMeta);
        setSeenAchievementGhostIds(new Set([...seen, ...allUnlocked.map((a) => a.id)]));
        setPendingAchievementGhost({ title: firstNewNonMeta.title, icon: firstNewNonMeta.icon });
      }
    }

    prevUnlockedIdsRef.current = currentUnlocked;
  }, [questShelfAchievements]);

  const { gamesRef } = useAppPersistence({ games, ignoredSteamGames, onboardingState, platformQueueState, playActivity });
  const { addToastNotification, addUndoAction, createUndoSnapshot, dismissToast, pendingUndoActions, undoAction } = useToastState({
    activeNavItem,
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    selectedGameId,
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
    setSelectedGameId,
  });
  addToastRef.current = addToastNotification;

  const {
    addManualGame,
    addManyToWishlist,
    addToWishlist,
    moveToLibrary,
    removeAndIgnoreManyGames,
    removeAndIgnoreSteamGame,
    removeGame,
    removeManyGames,
    updateGameReviewFields,
    updateGameStatus,
    updateGameTracking,
    updateManyGameStatuses,
  } = useGameLibraryActions({
    addUndoAction,
    games,
    setGames,
    setIgnoredSteamGames,
    setSelectedGameId,
    t,
  });

  function triggerCompletionSheet(gameId: string) {
    const game = games.find((g) => g.id === gameId);
    if (game) setCompletionRatingGame(game);
  }

  function updateGameStatusWithCompletion(gameId: string, status: GameStatus) {
    updateGameStatus(gameId, status);
    if (status === 'Finished') triggerCompletionSheet(gameId);
  }

  function updateGameReviewFieldsWithCompletion(gameId: string, changes: Partial<Game>) {
    updateGameReviewFields(gameId, changes);
    if (changes.status === 'Finished') triggerCompletionSheet(gameId);
  }

  const {
    metadataSelectionRequest,
    refreshingMetadataGameIds,
    refreshGameMetadataFromActions,
    startMetadataWorkflow,
    updateGameArtwork,
    updateGameMetadata,
    updateGameMetadataManagement,
  } = useMetadataController({
    addToastNotification,
    games,
    markOnboardingItemComplete,
    setActiveNavItem,
    setGames,
    setSelectedGameId,
    t,
  });

  function openRawgRecoveryDialog(gameId: string, retryMode: 'metadata' | 'artwork' = 'metadata') {
    const game = gamesRef.current.find((currentGame) => currentGame.id === gameId);
    if (!game) {
      addToastNotification({ category: 'error', dedupeKey: `rawg-link-missing:${gameId}`, message: t('app.metadataRefreshGameNotFound') });
      return;
    }

    setRawgRecoveryRequest({ gameId, retryMode });
  }

  function saveRawgRecoveryLink(result: RawgSearchResult) {
    if (!rawgRecoveryRequest) {
      return;
    }

    const game = gamesRef.current.find((currentGame) => currentGame.id === rawgRecoveryRequest.gameId);
    if (!game) {
      setRawgRecoveryRequest(null);
      return;
    }

    const linkedGame: Game = {
      ...game,
      rawgId: result.id,
      rawgSlug: result.slug,
      rawgTitle: result.name,
      metadataSkippedAt: undefined,
      metadataManualManagedAt: undefined,
    };

    updateGameTracking(game.id, {
      notes: game.notes,
      rawgId: result.id,
      rawgSlug: result.slug,
      rawgTitle: result.name,
      status: game.status,
      tags: game.tags,
      metadataSkippedAt: undefined,
      metadataManualManagedAt: undefined,
    });
    setRawgRecoveryRequest(null);
    void refreshGameMetadataFromActions(linkedGame, rawgRecoveryRequest.retryMode);
  }

  useEffect(() => {
    isAppMountedRef.current = true;
    return () => { isAppMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const readyFrame = window.requestAnimationFrame(() => setIsAppReady(true));

    return () => window.cancelAnimationFrame(readyFrame);
  }, []);

  useEffect(() => {
    if (isAppReady) {
      trackSessionAnalyticsEvent('app_open');
    }
  }, [isAppReady, analyticsCounts]);

  useEffect(() => {
    if (isOnboardingComplete) {
      trackSessionAnalyticsEvent('first_run_completed');
    }
  }, [isOnboardingComplete, analyticsCounts]);

  useEffect(() => {
    if (activeNavItem === 'Queue') {
      trackSessionAnalyticsEvent('quest_queue_opened');
    }
  }, [activeNavItem, analyticsCounts]);

  useEffect(() => {
    if (activeUtilityView === 'playing-now') {
      trackSessionAnalyticsEvent('playing_now_opened');
    }
  }, [activeUtilityView, analyticsCounts]);

  useEffect(() => {
    if (activeNavItem === 'Settings' && activeSettingsCategory === 'Platforms') {
      trackSessionAnalyticsEvent('platform_plans_opened');
    }
  }, [activeNavItem, activeSettingsCategory, analyticsCounts]);

  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    function handleScroll() {
      const nextIsScrolled = el!.scrollTop > 15;
      setIsScrolled((currentIsScrolled) => (currentIsScrolled === nextIsScrolled ? currentIsScrolled : nextIsScrolled));
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useLayoutEffect(() => {
    const isCollectionDetailOpen = Boolean(selectedGameId) && (activeNavItem === 'Library' || activeNavItem === 'Wishlist');
    const el = mainContentRef.current;
    if (!isCollectionDetailOpen || !el) return;

    if (selectedGameScrollRestoreRef.current === null) {
      selectedGameScrollRestoreRef.current = el.scrollTop;
    }

    const previousOverflow = el.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    el.scrollTo({ top: 0, behavior: 'auto' });
    el.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      el.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;

      const scrollTop = selectedGameScrollRestoreRef.current;
      if (scrollTop !== null) {
        el.scrollTo({ top: scrollTop, behavior: 'auto' });
        selectedGameScrollRestoreRef.current = null;
      }
    };
  }, [activeNavItem, selectedGameId]);

  useEffect(() => {
    markOnboardingItemsComplete([
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'manual')
        ? 'manual-game'
        : null,
      steamSettingsSnapshot.apiKey.trim() ? 'steam-api-key' : null,
      steamSettingsSnapshot.steamId64.trim() ? 'steam-id64' : null,
      platformQueueState.activePlatforms.length > 0 ? 'platforms' : null,
      platformQueueState.entries.length > 0 || games.some((game) => game.tags.includes('queue')) ? 'queue-game' : null,
      themePreference ? 'visual-preferences' : null,
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'steam')
        ? 'steam-import'
        : null,
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'steam')
        ? 'steam-connect'
        : null,
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'retro-rom')
        ? 'retro-import'
        : null,
      isRawgApiKeySet ? 'rawg-api-key' : null,
      games.some((game) => game.metadataSource === 'rawg') ? 'metadata-enriched' : null,
      games.some((game) => game.collectionType === 'wishlist') ? 'wishlist-item' : null,
    ]);
  }, [games, isRawgApiKeySet, platformQueueState, steamSettingsSnapshot, themePreference]);

  const autoBackupSignal = useMemo(
    () =>
      JSON.stringify({
        games: games.map((game) => [
          game.id,
          game.collectionType,
          game.updatedAt,
          game.importedAt,
          game.metadataUpdatedAt,
          game.wishlistSyncedAt,
          game.status,
        ]),
        ignoredSteamGames: ignoredSteamGames.map((game) => [game.steamAppId, game.ignoredAt]),
      }),
    [games, ignoredSteamGames],
  );
  const reviewIgnoredGameIds = useMemo(() => new Set(reviewModeState.ignoredGameIds), [reviewModeState.ignoredGameIds]);
  const runtimeEnvironment = useMemo(() => getRuntimeEnvironment(), []);
  const lastRetroImportedGames = useMemo(
    () =>
      lastRetroImportGameIds
        .map((gameId) => games.find((game) => game.id === gameId))
        .filter((game): game is Game => Boolean(game)),
    [games, lastRetroImportGameIds],
  );
  const areLastRetroImportsHiddenByFilters = useMemo(() => {
    if (lastRetroImportedGames.length === 0) {
      return false;
    }

    const visibleImportedGameIds = new Set(filterGames(lastRetroImportedGames, libraryFilters).map((game) => game.id));
    return lastRetroImportedGames.some((game) => !visibleImportedGameIds.has(game.id));
  }, [lastRetroImportedGames, libraryFilters]);

  useControllerAction('openMenu', () => {
    setActiveUtilityView(null);
    setPlayingNowReturnContext(null);
    setActiveNavItem('Settings');
    setActiveSettingsCategory(null);
    setSelectedGameId(null);
  });

  useControllerAction('pageUp', () => {
    if (document.documentElement.classList.contains('qs-modal-open')) return;
    setActiveNavItem((currentItem) => {
      const currentIndex = visibleNavItems.includes(currentItem as TopNavItem)
        ? visibleNavItems.indexOf(currentItem as TopNavItem)
        : 0;
      return visibleNavItems[(currentIndex - 1 + visibleNavItems.length) % visibleNavItems.length];
    });
    setSelectedGameId(null);
  });

  useControllerAction('pageDown', () => {
    if (document.documentElement.classList.contains('qs-modal-open')) return;
    setActiveNavItem((currentItem) => {
      const currentIndex = visibleNavItems.includes(currentItem as TopNavItem)
        ? visibleNavItems.indexOf(currentItem as TopNavItem)
        : 0;
      return visibleNavItems[(currentIndex + 1) % visibleNavItems.length];
    });
    setSelectedGameId(null);
  });

  function importGames(importedGames: Game[]) {
    const existingSteamAppIds = new Set(
      games
        .map((game) => game.steamAppId)
        .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
    );
    const existingRetroKeys = new Set(
      games
        .filter((game) => game.externalSource === 'retro-rom')
        .map(getRetroDuplicateKey)
        .filter((key): key is string => Boolean(key)),
    );

    const newGames = importedGames.filter((game) => {
      if (typeof game.steamAppId === 'number' && existingSteamAppIds.has(game.steamAppId)) {
        return false;
      }

      const retroKey = getRetroDuplicateKey(game);
      if (retroKey && existingRetroKeys.has(retroKey)) {
        return false;
      }

      if (retroKey) {
        existingRetroKeys.add(retroKey);
      }

      return true;
    });

    const createdGames = newGames.map((game) =>
      touchGameRecord({
        ...game,
        collectionType: 'library' as const,
      }),
    );

    if (createdGames.length > 0) {
      setGames((currentGames) => [...currentGames, ...createdGames]);
    }

    return createdGames;
  }

  function handleRetroImportGames(importedGames: Game[]) {
    const createdGames = importGames(importedGames);
    if (createdGames.length > 0) {
      markOnboardingItemComplete('retro-import');
      trackMinimalAnalyticsEvent('import_completed', 'retro');
    }
    setLastRetroImportGameIds(createdGames.map((game) => game.id));
    return createdGames;
  }


  function importSteamGames(importedGames: Game[]) {
    const createdGames = importGames(importedGames);
    if (createdGames.length > 0) {
      trackMinimalAnalyticsEvent('import_completed', 'steam');
    }
    return createdGames;
  }

  function importSteamWishlistHtmlItemsWithAnalytics(...args: Parameters<typeof importSteamWishlistHtmlItems>) {
    const summary = importSteamWishlistHtmlItems(...args);
    if (summary.addedCount > 0) {
      trackMinimalAnalyticsEvent('import_completed', 'wishlist_html');
    }
    return summary;
  }

  function handleBackupExported() {
    markOnboardingItemComplete('backup-exported');
    trackMinimalAnalyticsEvent('backup_exported');
    if (!achievementCountersRef.current.backupExportedEver) {
      updateAchievementCounters({ backupExportedEver: true });
    }
  }

  function handleBackupImported() {
    trackMinimalAnalyticsEvent('backup_imported');
    trackMinimalAnalyticsEvent('import_completed', 'backup');
    if (!achievementCountersRef.current.backupImportedEver) {
      updateAchievementCounters({ backupImportedEver: true });
    }
  }

  function viewRetroImportedGames(gameIds: string[]) {
    setLibraryFilters(initialCollectionFilters);
    setSelectedGameId(gameIds[0] ?? null);
    setActiveNavItem('Library');
  }

  function enrichRetroImportedGames(gameIds: string[]) {
    if (gameIds.length > 0) {
      startMetadataWorkflow(gameIds);
    }
  }

  function addRetroImportedGamesToQueue(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);

    setGames((currentGames) =>
      currentGames.map((game) => {
        if (!targetGameIds.has(game.id)) {
          return game;
        }

        const tags = new Set(game.tags);
        tags.add('queue');

        return touchGameRecord({
          ...game,
          status: game.status === 'Want to play' ? 'Playing' : game.status,
          tags: Array.from(tags),
        });
      }),
    );
  }

  const {
    importSteamWishlistHtmlItems,
    importSteamWishlistItems,
    refreshSteamPlaytime,
    syncHltb,
    syncSteamAchievements,
    syncSteamDataForGame,
    syncSteamWishlist,
    syncWishlistDeals,
  } = useAppSyncActions({
    games,
    ignoredSteamGames,
    isAppMountedRef,
    isHltbSyncing,
    itadDealSyncState,
    setGames,
    setIsHltbSyncing,
    setItadDealSyncState,
    setPlayActivity,
    setSteamAchievementSyncState,
    setSteamPlaytimeRefreshState,
    setSteamWishlistSyncState,
    addToastNotification,
    t,
  });


  const homeSteamSyncGameIds = useMemo(() => {
    const relevantIds = new Set<string>();
    games.forEach((game) => {
      if (game.collectionType === 'library' && game.status === 'Playing') {
        relevantIds.add(game.id);
      }
    });
    platformQueueState.entries.forEach((entry) => relevantIds.add(entry.gameId));
    return games
      .filter((game) => relevantIds.has(game.id) && game.collectionType === 'library' && typeof game.steamAppId === 'number')
      .map((game) => game.id);
  }, [games, platformQueueState.entries]);

  const {
    addGameToQueue,
    addQueuePlatform,
    dropGameFromCompactRow,
    finishGameFromCompactRow,
    moveQueueGame,
    moveQueueGameToPlatform,
    playGameFromCompactRow,
    playQueueGameNow,
    removeQueueGame,
    updateCurrentlyPlayingGame,
    updateQueueLimit,
  } = useQueueActions({
    activeQueuePlatforms,
    addUndoAction,
    games,
    markOnboardingItemComplete,
    platformQueueState,
    setGames,
    setPlatformQueueState,
    t,
  });


  const { handleReviewAction, restoreReviewIgnoredGames, setReviewSource, startReviewMode } = useReviewModeActions({
    addGameToQueue,
    addToWishlist,
    addUndoAction,
    refreshGameMetadataFromActions,
    reviewModeState,
    setActiveNavItem,
    setActiveReviewSource,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
    setSelectedGameId,
    startMetadataWorkflow,
    t,
    updateGameReviewFields: updateGameReviewFieldsWithCompletion,
  });

  function openQueueFromToast() {
    setSelectedGameId(null);
    setActiveNavItem('Queue');
  }

  function viewGameFromToast(gameId: string) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    setSelectedGameId(gameId);
    setActiveNavItem(game?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
  }

  function unignoreSteamGame(steamAppId: number) {
    const ignoredGame = ignoredSteamGames.find((game) => game.steamAppId === steamAppId);
    if (ignoredGame) {
      addUndoAction(t('app.restoredFromIgnoreList'), {
        actionType: 'restore-ignored-steam-game',
        affectedGameIds: [String(steamAppId)],
        description: formatMessageTemplate(t('app.reignoreSteamApp'), { game: ignoredGame.title || `Steam app ${steamAppId}` }),
      }, undefined, { dedupeKey: `restore-ignored-steam-game:${steamAppId}` });
    }

    setIgnoredSteamGames((currentIgnoredGames) => removeIgnoredSteamGame(currentIgnoredGames, steamAppId));
  }

  function openArtworkAudit() {
    setSelectedGameId(null);
    setActiveNavItem('Artwork');
  }

  function openGameFromHome(game: Game) {
    setDetailReturnSection('Home');
    setSelectedGameId(game.id);
    setActiveNavItem(game.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
  }

  function openQueue(platform?: GamePlatform) {
    setTargetQueuePlatform(platform);
    setSelectedGameId(null);
    setActiveNavItem('Queue');
  }

  function openPlayingNowHubFromShelfProfile() {
    setPlayingNowReturnContext({ activeNavItem, selectedGameId });
    setSelectedGameId(null);
    setIsShelfProfileOpen(false);
    setActiveUtilityView('playing-now');
  }

  function closePlayingNowHub() {
    setActiveUtilityView(null);
    if (playingNowReturnContext) {
      setActiveNavItem(playingNowReturnContext.activeNavItem);
      setSelectedGameId(playingNowReturnContext.selectedGameId);
      setPlayingNowReturnContext(null);
      return;
    }
    setActiveNavItem('Library');
    setSelectedGameId(null);
  }

  function logPlayedToday(game: Game) {
    const now = new Date();
    setPlayActivity((currentActivity) => upsertPlayedTodayActivity(currentActivity, game.id, now));
    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id
          ? touchGameRecord({
              ...currentGame,
              lastPlayedAt: formatLocalDate(now),
            })
          : currentGame,
      ),
    );
  }

  function openDetailsFromPlayingNow(gameId: string) {
    setActiveUtilityView(null);
    setPlayingNowReturnContext(null);
    setSelectedGameId(gameId);
    setActiveNavItem('Library');
  }

  function openSettingsFromShelfProfile() {
    setActiveUtilityView(null);
    setPlayingNowReturnContext(null);
    setIsShelfProfileOpen(false);
    setSelectedGameId(null);
    setActiveNavItem('Settings');
    setActiveSettingsCategory(null);
  }

  function selectNavigationItem(item: TopNavItem | MoreNavItem) {
    setActiveUtilityView(null);
    setPlayingNowReturnContext(null);
    setDetailReturnSection(null);
    setSelectedGameId(null);
    setActiveNavItem(item);
    setIsMoreMenuOpen(false);
  }

  const handleOpenDetailsFromCollection = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);

  function handleBackFromDetail() {
    setSelectedGameId(null);
    if (detailReturnSection) {
      setActiveNavItem(detailReturnSection);
      setDetailReturnSection(null);
    }
  }

  const handleClearLibraryFilters = useCallback(() => {
    setLibraryFilters(initialCollectionFilters);
  }, []);

  const handleClearWishlistFilters = useCallback(() => {
    setWishlistFilters(initialCollectionFilters);
  }, []);

  const handleLibraryFiltersChange = useCallback((changes: Partial<CollectionFilters>) => {
    setLibraryFilters((currentFilters) => ({ ...currentFilters, ...changes }));
  }, []);

  const handleWishlistFiltersChange = useCallback((changes: Partial<CollectionFilters>) => {
    setWishlistFilters((currentFilters) => ({ ...currentFilters, ...changes }));
  }, []);

  if (!isAppReady) {
    return <AppStartupScreen />;
  }

  return (
    <I18nProvider language={language}>
    <main className={`qs-app-root bg-ink-950 text-slate-100 ${getAppTemplateClassName(appTemplatePreference)}`} style={accentThemeStyle}>
      <div className="qs-handheld-shell mx-auto flex w-full max-w-7xl flex-col px-3 py-2 sm:px-4 lg:px-5">
        <header className={`qs-compact-header qs-glass shrink-0 flex items-center gap-2 rounded-lg border px-2 transition-all duration-300 ${isScrolled ? 'qs-header-stuck py-1' : 'py-1.5'}`}>
          <div className="relative min-w-0 shrink-0" ref={shelfProfileRef}>
            <button
              aria-expanded={isShelfProfileOpen}
              aria-haspopup="menu"
              aria-label={`${personalizedQuestShelfTitle} shelf profile`}
              className="flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition hover:bg-mint/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
              onClick={() => setIsShelfProfileOpen((isOpen) => !isOpen)}
              type="button"
            >
              <QuestShelfLogo className="h-7 w-7 rounded-md" />
              <span className="hidden min-w-0 max-w-[12rem] truncate text-xs font-semibold uppercase tracking-spread text-mint sm:block">{personalizedQuestShelfTitle}</span>
            </button>
            {isShelfProfileOpen ? (
              <ShelfProfilePopover
                activeAchievement={activeShelfAchievement}
                avatar={<ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-12 w-12" />}
                featuredGame={resolvedFeaturedGame}
                onOpenSettings={openSettingsFromShelfProfile}
                onOpenPlayingNow={openPlayingNowHubFromShelfProfile}
                playingNowGame={playingNowGame}
                shelfName={personalizedQuestShelfTitle}
                shelfOverview={shelfOverview}
                t={t}
              />
            ) : null}
          </div>

          <nav className="qs-top-nav flex flex-1 gap-1 overflow-x-auto rounded-md border border-skyglass/15 bg-ink-950/70 p-0.5 shadow-inner">
            {visibleNavItems.map((item) => (
              <button
                key={item}
                className={`h-8 shrink-0 rounded px-2.5 text-xs font-semibold transition sm:h-9 sm:text-sm ${
                  item === activeNavItem
                    ? 'bg-mint text-ink-950 shadow-glow'
                    : 'text-slate-300 hover:bg-mint/10 hover:text-white hover:shadow-glow'
                }`}
                onClick={() => selectNavigationItem(item)}
                title={getNavDescription(item)}
                type="button"
              >
                {t(navItemLabelKeys[item])}
              </button>
            ))}
          </nav>

          <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                aria-expanded={isMoreMenuOpen}
                aria-haspopup="menu"
                className={`flex h-8 items-center gap-1 rounded px-2.5 text-xs font-semibold transition sm:h-9 sm:text-sm ${
                  isMoreNavActive
                    ? 'bg-mint text-ink-950 shadow-glow'
                    : 'text-slate-300 hover:bg-mint/10 hover:text-white hover:shadow-glow'
                }`}
                onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
                type="button"
              >
                <span>{t('action.more')}</span>
                <Icon name="chevrons-right" size={13} className="rotate-90" strokeWidth={2.4} />
              </button>
              {isMoreMenuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-xl border border-mint/25 bg-ink-950/95 p-2 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-4rem)] overflow-y-auto overscroll-contain" role="menu">
                  {moreNavItems.map((item) => (
                    <button
                      key={item}
                      className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70 ${
                        item === activeNavItem ? 'bg-mint/15 text-white' : 'text-slate-200 hover:bg-mint/10 hover:text-white'
                      }`}
                      onClick={() => selectNavigationItem(item)}
                      role="menuitem"
                      type="button"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-mint/25 bg-mint/10 text-mint">
                        <Icon name={item === 'Stats' ? 'panel-top-open' : item === 'Recommendation' ? 'sparkles' : item === 'Quest Runner' ? 'gamepad-2' : 'image-frame'} size={15} strokeWidth={2.2} />
                      </span>
                      <span className="whitespace-nowrap">{t(navItemLabelKeys[item])}</span>
                    </button>
                  ))}
                </div>
              ) : null}
          </div>

          <PwaStatusBanner appTitle={personalizedQuestShelfTitle} />
          <BackToTopButton />
        </header>

        <section ref={mainContentRef} className={`qs-main-scroll py-2 ${activeNavItem === 'Home' ? 'qs-main-scroll--home' : 'bg-ink-950'}`}>
          {activeUtilityView === 'playing-now' ? (
            <div className="qs-playing-now-scroll overflow-y-auto overscroll-contain pb-8 pr-1">
              <PlayingNowHub
                activity={playActivity}
                featuredGame={resolvedFeaturedGame}
                games={games}
                onBack={closePlayingNowHub}
                onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
                onOpenDetails={openDetailsFromPlayingNow}
                onPlayToday={logPlayedToday}
                onRefreshSteamActivity={(gameIds) => { void refreshSteamPlaytime(gameIds, { showToast: false }); }}
                onStatusChange={updateGameStatusWithCompletion}
                queue={platformQueueState}
                queueSummary={queueSummary}
                shelfNickname={shelfIdentity.shelfName}
                t={t}
              />
            </div>
          ) : activeNavItem === 'Review Mode' && selectedGame ? (
            <AppGameDetailsView
              game={selectedGame}
              playActivity={playActivity}
              refreshingMetadataGameIds={refreshingMetadataGameIds}
              steamAchievementSyncState={steamAchievementSyncState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              platformQueueState={platformQueueState}
              onAddToQueue={openBacklogPicker}
              onAddToWishlist={addToWishlist}
              onBack={handleBackFromDetail}
              onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
              onIgnore={removeAndIgnoreSteamGame}
              onSyncSteamData={syncSteamDataForGame}
              onStatusChange={updateGameStatusWithCompletion}
              onTrackingChange={updateGameTracking}
              onGameEdit={(gameId, changes) => updateGameTracking(gameId, { notes: changes.notes ?? '', status: changes.status ?? 'Want to play', tags: changes.tags ?? [], ...changes })}
              onGameEditSaved={(game) => addToastNotification({ category: 'success', dedupeKey: `game-edit:${game.id}`, message: `${game.title} details saved.` })}
            />
          ) : activeNavItem === 'Home' ? (
            <HomePanel
              appTitle={personalizedQuestShelfTitle}
              shelfTitle={computedShelfTitle}
              featuredGame={resolvedFeaturedGame}
              avatar={<ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-14 w-14" />}
              games={games}
              ignoredReviewGameIds={reviewIgnoredGameIds}
              playActivity={playActivity}
              reviewQueueOrder={reviewModeState.queueOrder}
              reviewModeState={reviewModeState}
              queueState={platformQueueState}
              itadDealSyncState={itadDealSyncState}
              steamAchievementSyncState={steamAchievementSyncState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              onOpenDetails={openGameFromHome}
              onOpenLibrary={() => {
                setSelectedGameId(null);
                setActiveNavItem('Library');
              }}
              onOpenQueue={openQueue}
              onOpenReviewMode={startReviewMode}
              onOpenWishlist={() => {
                setSelectedGameId(null);
                setActiveNavItem('Wishlist');
              }}
              onPlayToday={(game) => {
                if (game.status === 'Playing') {
                  logPlayedToday(game);
                  addToastNotification({ category: 'success', dedupeKey: `play-today:${game.id}`, message: `${game.title} is already in Playing Now.` });
                  return;
                }
                const targetPlatform = platformQueueState.entries.find((e) => e.gameId === game.id)?.targetPlatform ?? game.platform;
                playQueueGameNow(game.id, targetPlatform);
                logPlayedToday(game);
              }}
              onQuickNote={(gameId, notes) => {
                const target = games.find((g) => g.id === gameId);
                if (!target) return;
                updateGameTracking(gameId, { notes, status: target.status, tags: target.tags });
                addToastNotification({ category: 'success', dedupeKey: `quick-note:${gameId}`, message: 'Note saved.' });
              }}
              onStatusChange={updateGameStatusWithCompletion}
              onSyncItadDeals={() => {
                const wishlistIds = games.filter((g) => g.collectionType === 'wishlist').map((g) => g.id);
                void syncWishlistDeals(wishlistIds);
              }}
              onSyncSteamAchievements={() => {
                void syncSteamAchievements(homeSteamSyncGameIds, {
                  emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for achievement sync.',
                  showToast: true,
                });
              }}
              onSyncSteamPlaytime={() => {
                void refreshSteamPlaytime(homeSteamSyncGameIds, {
                  emptyToastMessage: 'No Playing Now or Platform Plan Steam games are eligible for playtime sync.',
                  showToast: true,
                });
              }}
            />
          ) : activeNavItem === 'Library' ? (
            <div className="relative h-full">
              {selectedGame && (
                <div className="absolute inset-0 z-10">
                  <AppGameDetailsView
                    game={selectedGame}
                    playActivity={playActivity}
                    refreshingMetadataGameIds={refreshingMetadataGameIds}
                    steamAchievementSyncState={steamAchievementSyncState}
                    steamPlaytimeRefreshState={steamPlaytimeRefreshState}
                    platformQueueState={platformQueueState}
                    onAddToQueue={openBacklogPicker}
                    onAddToWishlist={addToWishlist}
                    onBack={handleBackFromDetail}
                    onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
                    onIgnore={removeAndIgnoreSteamGame}
                    onSyncSteamData={syncSteamDataForGame}
                    onStatusChange={updateGameStatusWithCompletion}
                    onTrackingChange={updateGameTracking}
                    onGameEdit={(gameId, changes) => updateGameTracking(gameId, { notes: changes.notes ?? '', status: changes.status ?? 'Want to play', tags: changes.tags ?? [], ...changes })}
                    onGameEditSaved={(game) => addToastNotification({ category: 'success', dedupeKey: `game-edit:${game.id}`, message: `${game.title} details saved.` })}
                  />
                </div>
              )}
              <div inert={Boolean(selectedGame)} aria-hidden={Boolean(selectedGame)}>
                <CollectionPanel
                  collectionType="library"
                  contentScrollRef={mainContentRef}
                  filters={libraryFilters}
                  steamAchievementSyncState={steamAchievementSyncState}
                  steamPlaytimeRefreshState={steamPlaytimeRefreshState}
                  games={filteredLibraryGames}
                  allGames={games}
                  ignoredReviewGameIds={reviewIgnoredGameIds}
                  reviewModeState={reviewModeState}
                  platformOptions={platformOptions}
                  tags={tags}
                  platformQueueState={platformQueueState}
                  onAddGame={() => setIsAddGameOpen(true)}
                  onAddToWishlist={addToWishlist}
                  onAddManyToWishlist={addManyToWishlist}
                  onAddToQueue={openBacklogPicker}
                  onPlayNow={playGameFromCompactRow}
                  onFinish={finishGameFromCompactRow}
                  onDrop={dropGameFromCompactRow}
                  onBulkEnrich={startMetadataWorkflow}
                  isHltbSyncing={isHltbSyncing}
                  onBulkSyncHltb={syncHltb}
                  onBulkRemove={removeManyGames}
                  onBulkSyncSteamAchievements={(gameIds, options) =>
                    syncSteamAchievements(gameIds, {
                      completionToastMessage: formatSteamAchievementSyncSummary,
                      emptyToastMessage: options?.emptyToastMessage,
                      force: options?.force,
                      showToast: true,
                    })
                  }
                  onBulkRefreshSteamPlaytime={(gameIds, options) =>
                    refreshSteamPlaytime(gameIds, {
                      completionToastMessage: (summary) => formatMessageTemplate(t('app.updatedPlaytimeForGames'), { count: summary.updatedCount }),
                      emptyToastMessage: options?.emptyToastMessage,
                      showToast: true,
                    })
                  }
                  onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
                  onBulkStatusChange={updateManyGameStatuses}
                  onClearFilters={handleClearLibraryFilters}
                  onFiltersChange={handleLibraryFiltersChange}
                  onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
                  onFindMetadata={refreshGameMetadataFromActions}
                  onMoveToLibrary={moveToLibrary}
                  onOpenDetails={handleOpenDetailsFromCollection}
                  onRemove={removeGame}
                  onRemoveAndIgnore={removeAndIgnoreSteamGame}
                  onOpenQueue={() => startReviewMode('backlog')}
                  onStartReview={startReviewMode}
                  onStatusChange={updateGameStatusWithCompletion}
                  onOpenOnboarding={openOnboarding}
                  onOpenRetro={() => {
                    setActiveNavItem('Settings');
                    setActiveSettingsCategory('Retro');
                  }}
                />
              </div>
            </div>
          ) : activeNavItem === 'Wishlist' ? (
            <div className="relative h-full">
              {selectedGame && (
                <div className="absolute inset-0 z-10">
                  <AppGameDetailsView
                    game={selectedGame}
                    playActivity={playActivity}
                    refreshingMetadataGameIds={refreshingMetadataGameIds}
                    steamAchievementSyncState={steamAchievementSyncState}
                    steamPlaytimeRefreshState={steamPlaytimeRefreshState}
                    platformQueueState={platformQueueState}
                    onAddToQueue={openBacklogPicker}
                    onAddToWishlist={addToWishlist}
                    onBack={handleBackFromDetail}
                    onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
                    onIgnore={removeAndIgnoreSteamGame}
                    onSyncSteamData={syncSteamDataForGame}
                    onStatusChange={updateGameStatusWithCompletion}
                    onTrackingChange={updateGameTracking}
                    onGameEdit={(gameId, changes) => updateGameTracking(gameId, { notes: changes.notes ?? '', status: changes.status ?? 'Want to play', tags: changes.tags ?? [], ...changes })}
                    onGameEditSaved={(game) => addToastNotification({ category: 'success', dedupeKey: `game-edit:${game.id}`, message: `${game.title} details saved.` })}
                  />
                </div>
              )}
              <div inert={Boolean(selectedGame)} aria-hidden={Boolean(selectedGame)}>
                <CollectionPanel
                  collectionType="wishlist"
                  contentScrollRef={mainContentRef}
                  filters={wishlistFilters}
                  games={filteredWishlistGames}
                  platformOptions={platformOptions}
                  steamWishlistSyncState={steamWishlistSyncState}
                  itadDealSyncState={itadDealSyncState}
                  tags={tags}
                  platformQueueState={platformQueueState}
                  onAddGame={() => setIsAddGameOpen(true)}
                  onAddToWishlist={addToWishlist}
                  onAddManyToWishlist={addManyToWishlist}
                  onAddToQueue={openBacklogPicker}
                  onPlayNow={playGameFromCompactRow}
                  onFinish={finishGameFromCompactRow}
                  onDrop={dropGameFromCompactRow}
                  onBulkEnrich={startMetadataWorkflow}
                  isHltbSyncing={isHltbSyncing}
                  onBulkSyncHltb={syncHltb}
                  onBulkRemove={removeManyGames}
                  onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
                  onBulkStatusChange={updateManyGameStatuses}
                  onClearFilters={handleClearWishlistFilters}
                  onFiltersChange={handleWishlistFiltersChange}
                  onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
                  onFindMetadata={refreshGameMetadataFromActions}
                  onMoveToLibrary={moveToLibrary}
                  onOpenDetails={handleOpenDetailsFromCollection}
                  onRemove={removeGame}
                  onRemoveAndIgnore={removeAndIgnoreSteamGame}
                  onStartReview={startReviewMode}
                  onStatusChange={updateGameStatusWithCompletion}
                  onSyncSteamWishlist={syncSteamWishlist}
                  onImportSteamWishlistHtml={importSteamWishlistHtmlItemsWithAnalytics}
                  onSyncItadDeals={syncWishlistDeals}
                />
              </div>
            </div>
          ) : activeNavItem === 'Queue' ? (
            <QueuePanel
              games={games}
              contentScrollRef={mainContentRef}
              initialPlatform={targetQueuePlatform}
              queueState={platformQueueState}
              onAddGameToQueue={addGameToQueue}
              onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
              onLimitChange={updateQueueLimit}
              onQueueStateChange={setPlatformQueueState}
              onMoveEntry={moveQueueGame}
              onMoveEntryToPlatform={moveQueueGameToPlatform}
              onPlayNow={playQueueGameNow}
              onPlayingAction={updateCurrentlyPlayingGame}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setDetailReturnSection('Queue');
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
              onRemoveEntry={removeQueueGame}
              onStartReview={() => startReviewMode('backlog')}
            />
          ) : activeNavItem === 'Review Mode' ? (
            <ReviewModePanel
              games={games}
              ignoredGameIds={reviewIgnoredGameIds}
              queuePlatforms={activeQueuePlatforms}
              queueState={platformQueueState}
              refreshingMetadataGameIds={refreshingMetadataGameIds}
              reviewModeState={reviewModeState}
              confirmCancelConvention={confirmCancelConvention}
              source={activeReviewSource}
              onAction={handleReviewAction}
              onAddPlatform={addQueuePlatform}
              onOpenQueue={() => setActiveNavItem('Queue')}
              onRestoreIgnored={restoreReviewIgnoredGames}
              onReturnToLibrary={() => setActiveNavItem('Library')}
              onSourceChange={setReviewSource}
            />
          ) : activeNavItem === 'Metadata' ? (
            <MetadataEnrichmentPanel
              games={games}
              initialSelectedGameIds={metadataSelectionRequest?.ids}
              onMetadataManagementChange={updateGameMetadataManagement}
              onMetadataEnriched={() => markOnboardingItemComplete('metadata-enriched')}
              onMetadataUpdate={updateGameMetadata}
              selectionRequestId={metadataSelectionRequest?.requestId}
            />
          ) : activeNavItem === 'Artwork' ? (
            <ArtworkBrowserView
              games={games}
              onApplyArtworkUpdate={updateGameArtwork}
              onEnrichGames={startMetadataWorkflow}
              onFindArtwork={(game, mode = 'artwork') => refreshGameMetadataFromActions(game, mode as 'metadata' | 'artwork')}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setDetailReturnSection('Artwork');
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
            />
          ) : activeNavItem === 'Recommendation' ? (
            <RecommendationPanel
              games={games}
              contentScrollRef={mainContentRef}
              queueState={platformQueueState}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setDetailReturnSection('Recommendation');
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatusWithCompletion}
              onAddToQueue={openBacklogPicker}
              onAddToWishlist={addToWishlist}
              onMoveToLibrary={moveToLibrary}
              onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
              onFindMetadata={(game) => startMetadataWorkflow([game.id])}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
            />
          ) : activeNavItem === 'Stats' ? (
            <StatsPanel
              games={games}
              queueSummary={queueSummary}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setDetailReturnSection('Stats');
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
            />
          ) : activeNavItem === 'Quest Runner' ? (
            <div className="px-4 py-4">
              <QuestRunnerGame games={games} />
            </div>
          ) : activeNavItem === 'Settings' ? (
            <SettingsView
              activeCategory={activeSettingsCategory}
              autoBackupSignal={autoBackupSignal}
              completedOnboardingItemIds={completedOnboardingItemIds}
              skippedOnboardingItemIds={skippedOnboardingItemIds}
              games={games}
              ignoredSteamGames={ignoredSteamGames}
              libraryOwnerNickname={libraryOwnerNickname}
              personalizedQuestShelfTitle={personalizedQuestShelfTitle}
              shelfIdentity={shelfIdentity}
              questShelfAchievements={questShelfAchievements}
              activeAchievementTitle={computedShelfTitle}
              steamAvatarUrl={steamAvatarUrl}
              steamPersonaName={steamProfileName}
              controllerProfileId={controllerProfileId}
              detectedProfileId={detectedProfileId}
              isControllerDebugEnabled={isControllerDebugEnabled}
              isLandscapeLockEnabled={isLandscapeLockEnabled}
              isOnboardingOpen={isOnboardingOpen}
              isOnboardingComplete={isOnboardingComplete}
              lastRetroImportsHiddenByFilters={areLastRetroImportsHiddenByFilters}
              resolvedTheme={resolvedTheme}
              runtimeEnvironment={runtimeEnvironment}
              themePreference={themePreference}
              appTemplatePreference={appTemplatePreference}
              accentColorPreference={accentColorPreference}
              secondaryAccentColorPreference={secondaryAccentColorPreference}
              gradientOrientationPreference={gradientOrientationPreference}
              neonButtonGradientBalancePreference={neonButtonGradientBalancePreference}
              neonButtonGradientMidpointPreference={neonButtonGradientMidpointPreference}
              neonButtonStylePreference={neonButtonStylePreference}
              language={language}
              navigationVisibility={navigationVisibility}
              platformQueueState={platformQueueState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              steamWishlistSyncState={steamWishlistSyncState}
              onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
              onBackupExported={handleBackupExported}
              onBackupImported={handleBackupImported}
              onCategoryChange={setActiveSettingsCategory}
              onLibraryOwnerNicknameChange={setLibraryOwnerNickname}
              onShelfIdentityChange={setShelfIdentity}
              onSteamAvatarImported={handleSteamProfileNameChange}
              onConnectionTested={() => markOnboardingItemComplete('steam-test')}
              onClearLibraryFilters={() => setLibraryFilters(initialCollectionFilters)}
              onEnrichRetroImportedGames={enrichRetroImportedGames}
              onImportGames={importSteamGames}
              onImportRetroGames={handleRetroImportGames}
              onControllerDebugChange={setIsControllerDebugEnabled}
              onControllerProfileChange={setControllerProfileId}
              onLandscapeLockChange={setIsLandscapeLockEnabled}
              onNavigationVisibilityChange={setNavigationVisibility}
              onOnboardingAction={handleOnboardingAction}
              onOnboardingClose={hideOnboarding}
              onOnboardingComplete={markOnboardingItemComplete}
              onOnboardingSkip={skipOnboardingItem}
              onOpenOnboarding={openOnboarding}
              onRestartOnboarding={restartOnboarding}
              onPlatformQueueStateChange={setPlatformQueueState}
              onRawgApiKeyConfigured={() => {
                markOnboardingItemComplete('rawg-api-key');
                setIsRawgApiKeySet(true);
              }}
              onRefreshSteamPlaytime={() => refreshSteamPlaytime()}
              onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
              onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
              onSteamProfileNameChange={handleSteamProfileNameChange}
              onSteamLibraryImported={() => markOnboardingItemsComplete(['steam-import', 'steam-connect'])}
              onImportSteamWishlistHtml={importSteamWishlistHtmlItemsWithAnalytics}
              onSyncSteamWishlist={syncSteamWishlist}
              onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
              onThemePreferenceChange={setThemePreference}
              onAppTemplatePreferenceChange={setAppTemplatePreference}
              onAccentColorChange={setAccentColorPreference}
              onSecondaryAccentColorChange={setSecondaryAccentColorPreference}
              onGradientOrientationChange={setGradientOrientationPreference}
              onNeonButtonGradientBalanceChange={setNeonButtonGradientBalancePreference}
              onNeonButtonGradientMidpointChange={setNeonButtonGradientMidpointPreference}
              onNeonButtonStyleChange={setNeonButtonStylePreference}
              onLanguageChange={setLanguage}
              onUnignoreSteamGame={unignoreSteamGame}
              onViewRetroImportedGames={viewRetroImportedGames}
            />
          ) : (
            <PlaceholderPanel title={activeNavItem} />
          )}
        </section>
      </div>

      <UndoToastStack
        actions={pendingUndoActions}
        onDismiss={dismissToast}
        onOpenQueue={openQueueFromToast}
        onLinkRawgGame={openRawgRecoveryDialog}
        onOpenSteamSettings={() => {
          setActiveUtilityView(null);
          setPlayingNowReturnContext(null);
          setActiveNavItem('Settings');
          setActiveSettingsCategory('Integrations');
          setSelectedGameId(null);
        }}
        onUndo={undoAction}
        onViewGame={viewGameFromToast}
      />

      {rawgRecoveryRequest && (games.find((game) => game.id === rawgRecoveryRequest.gameId) ?? gamesRef.current.find((game) => game.id === rawgRecoveryRequest.gameId)) ? (
        <RawgLinkDialog
          game={(games.find((game) => game.id === rawgRecoveryRequest.gameId) ?? gamesRef.current.find((game) => game.id === rawgRecoveryRequest.gameId)) as Game}
          onClose={() => setRawgRecoveryRequest(null)}
          onSelect={saveRawgRecoveryLink}
        />
      ) : null}

      {isAddGameOpen ? (
        <AddGameDialog
          existingGameIds={new Set(games.map((game) => game.id))}
          onClose={() => setIsAddGameOpen(false)}
          onSave={(game) => {
            addManualGame(game);
            markOnboardingItemsComplete([game.collectionType === 'wishlist' ? 'wishlist-item' : 'manual-game', 'queue-game']);
            setIsAddGameOpen(false);
            setSelectedGameId(game.id);
            setActiveNavItem(game.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
          }}
        />
      ) : null}


      {backlogPickerGame ? (
        <BacklogPlatformPicker
          game={backlogPickerGame}
          isOpen={Boolean(backlogPickerGame)}
          platforms={activeQueuePlatforms}
          queueState={platformQueueState}
          onAddPlatform={addQueuePlatform}
          onClose={() => setBacklogPickerGame(null)}
          onSelectPlatform={(platform) => addGameToQueue(backlogPickerGame, platform)}
        />
      ) : null}

      {completionRatingGame ? (
        <CompletionRatingSheet
          game={completionRatingGame}
          onRate={(rating) => {
            updateGameReviewFields(completionRatingGame.id, { rating });
            setCompletionRatingGame(null);
          }}
          onSkip={() => setCompletionRatingGame(null)}
        />
      ) : null}

      {isOnboardingOpen ? (
        <OnboardingChecklist
          completedItemIds={completedOnboardingItemIds}
          skippedItemIds={skippedOnboardingItemIds}
          games={games}
          onAction={handleOnboardingAction}
          onClose={hideOnboarding}
          onComplete={markOnboardingItemComplete}
          onImportGames={importGames}
          onOpenLibrary={() => handleOnboardingAction('ready', 'primary')}
          onOpenQueue={() => handleOnboardingAction('ready', 'secondary')}
          onSkip={skipOnboardingItem}
          onSteamLibraryImported={() => markOnboardingItemsComplete(['steam-import', 'steam-connect'])}
          onSteamProfileNameChange={handleSteamProfileNameChange}
          libraryOwnerNickname={libraryOwnerNickname}
          personalizedQuestShelfTitle={personalizedQuestShelfTitle}
          shelfIdentity={shelfIdentity}
          steamAvatarUrl={steamAvatarUrl}
          steamPersonaName={steamProfileName}
          appTemplatePreference={appTemplatePreference}
          accentColorPreference={accentColorPreference}
          onLibraryOwnerNicknameChange={setLibraryOwnerNickname}
          onShelfIdentityChange={setShelfIdentity}
          onAppTemplatePreferenceChange={setAppTemplatePreference}
          onAccentColorChange={setAccentColorPreference}
        />
      ) : null}
      {!isOnboardingComplete ? <button className="qs-setup-launcher" onClick={openOnboarding} type="button" aria-label={formatMessageTemplate(t('app.openSetupChecklist'), { completed: onboardingProgress.completed, total: onboardingProgress.total })}>
        <Icon name="settings" />
        <strong>{formatMessageTemplate(t('app.setupProgress'), { completed: onboardingProgress.completed, total: onboardingProgress.total })}</strong>
      </button> : null}

      {pendingAchievementGhost ? (
        <div className="qs-achievement-ghost-host" aria-hidden="true">
          <QueueGhost
            variant="achievement"
            achievement={pendingAchievementGhost}
            onVanish={() => setPendingAchievementGhost(null)}
          />
        </div>
      ) : null}
    </main>
    </I18nProvider>
  );
}
