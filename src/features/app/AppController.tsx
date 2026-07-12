import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { BackToTopButton } from '../../components/BackToTopButton';
import { BacklogPlatformPicker } from '../../components/BacklogPlatformPicker';
import { UndoToastStack } from '../../components/UndoToastStack';
import { RawgLinkDialog } from '../../components/RawgLinkDialog';
import { OnboardingChecklist } from '../../components/OnboardingChecklist';
import { ShelfAvatar } from '../../components/ShelfIdentity';
import { ShelfProfilePopover } from '../shelf-profile/ShelfProfilePopover';
import { PwaStatusBanner } from '../../components/PwaStatusBanner';
import { DiscoveryPreviewPanel } from '../../components/discovery/DiscoveryPreviewPanel';

import { AppSectionRouter } from './AppSectionRouter';
import {
  getNavDescription,
  moreNavItems,
  navItemLabelKeys,
  type MoreNavItem,
  type TopNavItem,
} from '../../config/navigation';
import type { SettingsCategory } from '../../config/settings';
import {
  initialCollectionFilters,
  type CollectionFilters,
} from '../../config/collection';
import { I18nProvider } from '../../i18n';
import { loadGames } from '../../lib/gameStorage';
import { getRuntimeEnvironment } from '../../lib/capacitorEnvironment';
import type { OnboardingItemId } from '../../lib/onboardingStorage';
import type { ItadDealSyncState } from '../../config/syncStates';
import { addGameToPlatformQueue, type PlatformQueueState } from '../../lib/platformQueueStorage';
import { loadRawgSettings } from '../../lib/rawgSettingsStorage';
import { getSteamProfileDisplayName, loadSteamSettings } from '../../lib/steamSettingsStorage';
import { formatMessageTemplate } from '../../utils/summaryFormatters';
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
import type { Game, GamePlatform } from '../../types/game';
import type { RawgSearchResult } from '../../types/rawg';
import type { SteamAchievementSyncState, SteamPlaytimeRefreshState, SteamWishlistSyncState } from '../../types/steam';
import { useAppPersistence } from './useAppPersistence';
import { useCanonicalCollectionOwner } from './useCanonicalCollectionOwner';
import { useAppSyncActions } from './useAppSyncActions';
import { useNavigationState } from '../navigation/useNavigationState';
import { useCollectionFilters } from '../collection/useCollectionFilters';
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
import { AppGameDetailsView } from './AppGameDetailsView';
import type { DiscoveryInboxItem } from '../../lib/discoveryInboxStorage';
import { AchievementTimelineView } from '../achievement-timeline/AchievementTimelineView';
import { buildSetupTasks } from '../../lib/setupTasks';
import { CompletionRatingSheet } from '../../components/CompletionRatingSheet';
import { QueueGhost } from '../../components/QueueGhost';
import { useControllerAction } from '../../lib/controllerActions';
import { getOwnedGames, getRecentlyPlayedGames, mapSteamGamesToLocalGames, SteamApiError } from '../../services/steamApi';
import { useDiscoveryController } from './useDiscoveryController';
import { QuestShelfLogo } from './components/QuestShelfLogo';
import { AddGameDialog } from './components/AddGameDialog';
import { AppStartupScreen } from './components/AppStartupScreen';
import { touchGameRecord, getRetroDuplicateKey } from '../../lib/gameUtils';
import { useMainScrollBehavior } from './useMainScrollBehavior';
import { usePlayActivity } from './usePlayActivity';
import { useCompletionRating } from './useCompletionRating';
import { useAnalytics } from './useAnalytics';
import { recordRecommendationOutcome } from '../../lib/recommendationFeedback';
import { useAchievementSystem } from './useAchievementSystem';
import { getSafeWishlistTitleMatches, normalizeImportMatchTitle } from '../../domain/imports/titleMatching';

export function AppController() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [isAppReady, setIsAppReady] = useState(false);
  const [isImportingNewSteamGames, setIsImportingNewSteamGames] = useState(false);
  const { logPlayedToday, playActivity, setPlayActivity } = usePlayActivity({ setGames });
  const { isScrolled, mainContentRef } = useMainScrollBehavior();
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
    isShelfProfileOpen,
    libraryOwnerNickname,
    personalizedQuestShelfTitle,
    setIsShelfProfileOpen,
    setLibraryOwnerNickname,
    setShelfIdentity,
    shelfIdentity,
    shelfOverview,
    shelfProfileRef,
  } = useShelfProfileController(games, platformQueueState, steamProfileName);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
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
  const { trackMinimalAnalyticsEvent, counts, bucketItemCount } = useAnalytics({
    activeNavItem,
    activeQueuePlatforms,
    activeSettingsCategory,
    games,
    isAppReady,
    isOnboardingComplete,
    queuedCount: queueSummary.queuedCount,
  });
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
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => loadReviewModeState());
  const [activeReviewSource, setActiveReviewSource] = useState<ReviewSource>(() => loadReviewModeState().lastSource);
  const [rawgRecoveryRequest, setRawgRecoveryRequest] = useState<{ gameId: string; retryMode: 'metadata' | 'artwork' } | null>(null);
  const {
    activeShelfAchievement,
    addToastRef,
    computedShelfTitle,
    isAchievementTimelineOpen,
    onBackupExported,
    onBackupImported,
    pendingAchievementGhost,
    questShelfAchievements,
    setIsAchievementTimelineOpen,
    setPendingAchievementGhost,
  } = useAchievementSystem({
    games,
    isOnboardingComplete,
    language,
    platformQueueState,
    reviewModeState,
    selectedActiveBadgeId: shelfIdentity.selectedActiveBadgeId,
  });

  const setupTasks = useMemo(
    () => buildSetupTasks({
      accentColorPreference,
      games,
      isRawgApiKeySet,
      platformQueueState,
      steamSettings: steamSettingsSnapshot,
      themePreference,
    }),
    [accentColorPreference, games, isRawgApiKeySet, platformQueueState, steamSettingsSnapshot, themePreference],
  );
  const hasIncompleteSetupTasks = setupTasks.some((t) => t.status !== 'completed');

  const isAppMountedRef = useRef(true);

  const { gamesRef } = useAppPersistence({ games, ignoredSteamGames, onboardingState, platformQueueState, playActivity });

  // AS-03: lets Data Management's recovery/repair tools hand a recovered snapshot back to this
  // owner, instead of the owner's next save silently overwriting it. Exposes exactly two
  // replacement commands — no raw setGames is threaded through the component tree.
  useCanonicalCollectionOwner({ games, playActivity, setGames, setPlayActivity });
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
    inboxItems: discoveryInboxItems,
    inboxRawgIds: discoveryInboxRawgIds,
    previewCandidate,
    addToInbox: addToDiscoveryInbox,
    closePreview: closeDiscoveryPreview,
    openPreview: openDiscoveryPreview,
    removeFromInbox: removeFromDiscoveryInbox,
    requestInboxRecommendations: requestDiscoveryInboxRecommendations,
    isRequestingInboxRecommendations: isRequestingDiscoveryInboxRecommendations,
    skipInboxItem: skipDiscoveryInboxItem,
    startInboxRun: startDiscoveryInboxRun,
  } = useDiscoveryController({ games, t, addToastNotification });

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

  const { completionRatingGame, setCompletionRatingGame, updateGameReviewFieldsWithCompletion, updateGameStatusWithCompletion } = useCompletionRating({
    games,
    updateGameReviewFields,
    updateGameStatus,
  });

  const {
    metadataSelectionRequest,
    refreshingMetadataGameIds,
    ensureRawgMetadataForGame,
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
    // Duplicate guard for manual/discovery imports only â€” Steam and retro
    // imports keep their own dedup keys, and a wishlist copy must not block
    // a Steam library import of the same game.
    const existingLibraryRawgIds = new Set(
      games
        .filter((game) => game.collectionType === 'library' && typeof game.rawgId === 'number')
        .map((game) => game.rawgId as number),
    );

    const newGames = importedGames.filter((game) => {
      if (typeof game.steamAppId === 'number' && existingSteamAppIds.has(game.steamAppId)) {
        return false;
      }

      if (
        game.externalSource === 'manual' &&
        typeof game.rawgId === 'number' &&
        existingLibraryRawgIds.has(game.rawgId)
      ) {
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
      trackMinimalAnalyticsEvent('library_import_completed', { source: 'retro_file', outcome: 'success', imported_count_bucket: bucketItemCount(createdGames.length), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
    }
    setLastRetroImportGameIds(createdGames.map((game) => game.id));
    return createdGames;
  }


  function importSteamGames(importedGames: Game[]) {
    const createdGames = importGames(importedGames);
    if (createdGames.length > 0) {
      trackMinimalAnalyticsEvent('library_import_completed', { source: 'steam', outcome: 'success', imported_count_bucket: bucketItemCount(createdGames.length), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
    }
    return createdGames;
  }

  async function importNewSteamGames() {
    if (isImportingNewSteamGames) return;

    setIsImportingNewSteamGames(true);

    try {
      const settings = loadSteamSettings();
      const [ownedGames, recentlyPlayedGames] = await Promise.all([
        getOwnedGames(settings),
        getRecentlyPlayedGames(settings).catch(() => []),
      ]);
      const importedAt = new Date().toISOString();
      const librarySteamAppIds = new Set(
        games
          .filter((game) => game.collectionType === 'library')
          .map((game) => game.steamAppId)
          .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
      );
      const wishlistSteamAppIds = new Set(
        games
          .filter((game) => game.collectionType === 'wishlist')
          .map((game) => game.steamAppId)
          .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
      );
      const existingTitleMatches = getSafeWishlistTitleMatches(games);
      const ignoredSteamAppIds = new Set(ignoredSteamGames.map((game) => game.steamAppId));
      const newOwnedGames = ownedGames.filter(
        (game) => !librarySteamAppIds.has(game.appid) && !ignoredSteamAppIds.has(game.appid),
      );
      const mappedGames = mapSteamGamesToLocalGames(newOwnedGames, recentlyPlayedGames, importedAt).map((game) =>
        touchGameRecord({
          ...game,
          collectionType: 'library' as const,
          notes: game.notes.replace('Imported from Steam API test results. Not saved to local library yet.', 'Imported from Steam owned games. Queued for triage.'),
        }),
      );
      const mappedGamesByAppId = new Map(mappedGames.map((game) => [game.steamAppId, game]));
      const mappedGameTitles = new Set(mappedGames.map((game) => normalizeImportMatchTitle(game.title)).filter(Boolean));
      const removedWishlistIds = new Set(
        games
          .filter((game) => {
            if (game.collectionType !== 'wishlist') return false;
            if (typeof game.steamAppId === 'number') return newOwnedGames.some((ownedGame) => ownedGame.appid === game.steamAppId);
            const normalizedTitle = normalizeImportMatchTitle(game.title);
            return mappedGameTitles.has(normalizedTitle) && existingTitleMatches.get(normalizedTitle) === game.id;
          })
          .map((game) => game.id),
      );
      const createdGames = mappedGames;

      setGames((currentGames) => {
        const currentLibrarySteamAppIds = new Set(
          currentGames
            .filter((game) => game.collectionType === 'library')
            .map((game) => game.steamAppId)
            .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
        );

        const nextLibraryGames: Game[] = [];

        for (const ownedGame of newOwnedGames) {
          if (currentLibrarySteamAppIds.has(ownedGame.appid)) continue;
          const mappedGame = mappedGamesByAppId.get(ownedGame.appid);
          if (!mappedGame) continue;
          nextLibraryGames.push(mappedGame);
          currentLibrarySteamAppIds.add(ownedGame.appid);
        }

        const nextGames = currentGames.filter((game) => {
          if (game.collectionType !== 'wishlist') return true;
          if (typeof game.steamAppId === 'number' && nextLibraryGames.some((newGame) => newGame.steamAppId === game.steamAppId)) {
            return false;
          }

          const matchingNewGame = nextLibraryGames.find((newGame) => normalizeImportMatchTitle(newGame.title) === normalizeImportMatchTitle(game.title));
          if (!game.steamAppId && matchingNewGame && existingTitleMatches.get(normalizeImportMatchTitle(game.title)) === game.id) {
            return false;
          }

          return true;
        });

        return [...nextGames, ...nextLibraryGames];
      });

      if (createdGames.length > 0) {
        setPlatformQueueState((currentState) =>
          createdGames.reduce((nextState, game) => addGameToPlatformQueue(nextState, game, game.platform), currentState),
        );
        trackMinimalAnalyticsEvent('library_import_completed', { source: 'steam', outcome: 'success', imported_count_bucket: bucketItemCount(ownedGames.length), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
      }

      const duplicateCount = ownedGames.filter((game) => librarySteamAppIds.has(game.appid)).length;
      const wishlistRemovedByAppIdCount = newOwnedGames.filter((game) => wishlistSteamAppIds.has(game.appid)).length;
      const removedWishlistCount = Math.max(removedWishlistIds.size, wishlistRemovedByAppIdCount);
      const message = [
        `${createdGames.length} new Steam games imported`,
        `${duplicateCount} already in library`,
        `${removedWishlistCount} removed from Wishlist / marked owned`,
        `${createdGames.length} added to Quest Queue`,
      ].join(' Â· ');

      addToastNotification({
        actions: createdGames.length > 0 ? [getOpenQueueAction()] : undefined,
        category: createdGames.length > 0 ? 'success' : 'info',
        dedupeKey: 'steam-import-new-games',
        message,
      });
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      addToastNotification({
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: 'steam-import-new-games:error',
        message: error instanceof Error ? error.message : 'Steam owned games import failed. Check Steam credentials, profile privacy, and connection.',
      });
    } finally {
      setIsImportingNewSteamGames(false);
    }
  }

  function importMultiGameItemsWithAnalytics(...args: Parameters<typeof importMultiGameItems>) {
    const summary = importMultiGameItems(...args);
    if (summary.importedCount > 0 || summary.updatedExisting > 0) {
      trackMinimalAnalyticsEvent('library_import_completed', { source: summary.source === 'playstation-library' ? 'playstation_bookmarklet' : 'manual', outcome: 'success', imported_count_bucket: bucketItemCount(summary.importedCount + summary.updatedExisting), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
    }
    return summary;
  }

  function importSteamWishlistHtmlItemsWithAnalytics(...args: Parameters<typeof importSteamWishlistHtmlItems>) {
    const summary = importSteamWishlistHtmlItems(...args);
    if (summary.addedCount > 0) {
      trackMinimalAnalyticsEvent('library_import_completed', { source: 'other', outcome: 'success', imported_count_bucket: bucketItemCount(summary.addedCount), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
    }
    return summary;
  }

  function handleBackupExported() {
    markOnboardingItemComplete('backup-exported');
    trackMinimalAnalyticsEvent('backup_export_completed', { outcome: 'success', library_size_bucket: counts.librarySize <= 0 ? 'empty' : counts.librarySize <= 25 ? '1_25' : counts.librarySize <= 100 ? '26_100' : counts.librarySize <= 300 ? '101_300' : counts.librarySize <= 1000 ? '301_1000' : '1000_plus', duration_bucket: 'under_2s' });
    onBackupExported();
  }

  function handleBackupImported() {
    trackMinimalAnalyticsEvent('backup_restore_completed', { outcome: 'success', restored_count_bucket: bucketItemCount(counts.librarySize), duration_bucket: 'under_2s', migration_required: false });
    trackMinimalAnalyticsEvent('library_import_completed', { source: 'backup_restore', outcome: 'success', imported_count_bucket: bucketItemCount(counts.librarySize), duplicate_count_bucket: 'zero', duration_bucket: 'under_2s' });
    onBackupImported();
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
    importMultiGameItems,
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

  // The Game Hub opens as a fullscreen overlay, so the originating screen
  // stays mounted behind it and back restores scroll/focus for free.
  function openGameFromHome(game: Game) {
    setSelectedGameId(game.id);
  }

  function handleSelectDiscoveryGame(discoveryGame: import('../../lib/discovery').DiscoveryGame) {
    const found = games.find((g) => g.rawgId === discoveryGame.rawgId);
    if (found) setSelectedGameId(found.id);
  }


  function promoteDiscoveryToWishlist(discoveryGame: import('../../lib/discovery').DiscoveryGame) {
    const existingIds = new Set(games.map((g) => g.id));
    const base = createGameFromDiscovery(discoveryGame, existingIds);
    addToWishlist({ ...base, collectionType: 'wishlist' });
    recordRecommendationOutcome(discoveryGame.rawgId, discoveryGame.title, 'wishlist');
    closeDiscoveryPreview();
    addToastNotification({ category: 'success', dedupeKey: `wishlist-add:${discoveryGame.rawgId}`, message: formatMessageTemplate(t('toast.discoveryAddedToWishlist'), { game: discoveryGame.title }) });
  }

  function promoteDiscoveryToLibrary(discoveryGame: import('../../lib/discovery').DiscoveryGame) {
    // If the game already exists in the collection, never create a second
    // record: move the wishlist copy in place, or just open the library copy.
    const existing = games.find((g) => g.rawgId === discoveryGame.rawgId);
    if (existing) {
      if (existing.collectionType === 'wishlist') {
        moveToLibrary(existing);
      }
      closeDiscoveryPreview();
      setSelectedGameId(existing.id);
      setActiveNavItem('Library');
      return;
    }

    const existingIds = new Set(games.map((g) => g.id));
    const base = createGameFromDiscovery(discoveryGame, existingIds);
    importGames([base]);
    recordRecommendationOutcome(discoveryGame.rawgId, discoveryGame.title, 'library');
    closeDiscoveryPreview();
    // Evolve the Preview into the Game Hub for the newly owned game so the
    // transition reads as "this game is now mine", not a navigation.
    setSelectedGameId(base.id);
    setActiveNavItem('Library');
    addToastNotification({ category: 'success', dedupeKey: `library-add:${discoveryGame.rawgId}`, message: formatMessageTemplate(t('toast.discoveryAddedToLibrary'), { game: discoveryGame.title }) });
  }


  function promoteDiscoveryToPlans(discoveryGame: import('../../lib/discovery').DiscoveryGame) {
    const existing = games.find((g) => g.rawgId === discoveryGame.rawgId);
    const target = existing ?? createGameFromDiscovery(discoveryGame, new Set(games.map((g) => g.id)));
    if (!existing) {
      importGames([target]);
    }
    recordRecommendationOutcome(discoveryGame.rawgId, discoveryGame.title, 'plans');
    closeDiscoveryPreview();
    openBacklogPicker(target);
  }

  function handlePreviewOpenLibraryGame(discoveryGame: import('../../lib/discovery').DiscoveryGame) {
    const found = games.find((g) => g.rawgId === discoveryGame.rawgId);
    if (!found) return;
    closeDiscoveryPreview();
    setSelectedGameId(found.id);
    setActiveNavItem(found.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
  }

  function promoteInboxDiscoveryToLibrary(item: DiscoveryInboxItem) {
    const existingIds = new Set(games.map((g) => g.id));
    const base = createGameFromDiscovery(item.game, existingIds);
    importGames([base]);
    recordRecommendationOutcome(item.game.rawgId, item.game.title, 'library');
    removeFromDiscoveryInbox(item.id);
  }

  function promoteInboxDiscoveryToWishlist(item: DiscoveryInboxItem) {
    const existingIds = new Set(games.map((g) => g.id));
    const base = createGameFromDiscovery(item.game, existingIds);
    addToWishlist({ ...base, collectionType: 'wishlist' });
    recordRecommendationOutcome(item.game.rawgId, item.game.title, 'wishlist');
    removeFromDiscoveryInbox(item.id);
  }

  function promoteInboxDiscoveryToPlans(item: DiscoveryInboxItem) {
    const existingIds = new Set(games.map((g) => g.id));
    const base = createGameFromDiscovery(item.game, existingIds);
    importGames([base]);
    recordRecommendationOutcome(item.game.rawgId, item.game.title, 'plans');
    removeFromDiscoveryInbox(item.id);
    openBacklogPicker(base);
  }

  function handleInboxIgnore(item: DiscoveryInboxItem) {
    removeFromDiscoveryInbox(item.id);
  }

  function handleInboxSkip(item: DiscoveryInboxItem) {
    skipDiscoveryInboxItem(item.id);
  }

  function openQueue(platform?: GamePlatform) {
    setTargetQueuePlatform(platform);
    setSelectedGameId(null);
    setActiveNavItem('Queue');
  }

  function openSettingsFromShelfProfile() {
    setIsShelfProfileOpen(false);
    setSelectedGameId(null);
    setActiveNavItem('Settings');
    setActiveSettingsCategory(null);
  }

  function selectNavigationItem(item: TopNavItem | MoreNavItem) {
    setSelectedGameId(null);
    setActiveNavItem(item);
    setIsMoreMenuOpen(false);
  }

  const handleOpenDetailsFromCollection = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);

  function handleBackFromDetail() {
    const returningGameId = selectedGameId;
    setSelectedGameId(null);
    // Controller/keyboard flow: put focus back on the originating card.
    // Scroll position is already preserved because the previous screen
    // stays mounted behind the fullscreen Game Hub; scroll-mt on the card
    // handles the edge case where it sits just outside the viewport.
    if (returningGameId) {
      window.setTimeout(() => {
        const card = mainContentRef.current?.querySelector<HTMLElement>(
          `[data-game-id="${CSS.escape(returningGameId)}"]`,
        );
        card?.focus();
      }, 0);
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

  // Single source for the Game Hub detail route â€” rendered once as a
  // fullscreen overlay whenever a game is selected, from any screen.
  const renderGameDetailRoute = (game: Game) => (
    <AppGameDetailsView
      game={game}
      allGames={games}
      playActivity={playActivity}
      refreshingMetadataGameIds={refreshingMetadataGameIds}
      steamAchievementSyncState={steamAchievementSyncState}
      steamPlaytimeRefreshState={steamPlaytimeRefreshState}
      platformQueueState={platformQueueState}
      onAddToQueue={openBacklogPicker}
      onAddToWishlist={addToWishlist}
      onBack={handleBackFromDetail}
      onFindArtwork={(targetGame, mode = 'artwork') => refreshGameMetadataFromActions(targetGame, mode as 'metadata' | 'artwork')}
      onIgnore={removeAndIgnoreSteamGame}
      onSyncSteamData={syncSteamDataForGame}
      onStatusChange={updateGameStatusWithCompletion}
      onTrackingChange={updateGameTracking}
      onGameEdit={(gameId, changes) => updateGameTracking(gameId, changes)}
      onGameEditSaved={(savedGame) => addToastNotification({ category: 'success', dedupeKey: `game-edit:${savedGame.id}`, message: `${savedGame.title} details saved.` })}
      onSelectDiscoveryGame={handleSelectDiscoveryGame}
      onAddDiscoveryGameToInbox={addToDiscoveryInbox}
      discoveryInboxRawgIds={discoveryInboxRawgIds}
      onOpenDiscoveryPreview={openDiscoveryPreview}
    />
  );

  return (
    <I18nProvider language={language}>
    <main className={`qs-app-root bg-ink-950 text-slate-100 ${getAppTemplateClassName(appTemplatePreference)}`} style={accentThemeStyle}>
      <div className="qs-handheld-shell mx-auto flex w-full max-w-7xl flex-col px-3 py-2 sm:px-4 lg:px-5">
        <header className={`qs-compact-header qs-glass shrink-0 flex items-center gap-2 rounded-lg border px-2 transition-all duration-300 ${isScrolled ? 'qs-header-stuck py-1' : 'py-1.5'}`}>
          <div className="relative min-w-0 shrink-0" ref={shelfProfileRef}>
            {hasIncompleteSetupTasks ? (
              <span
                className="pointer-events-none absolute right-0.5 top-0.5 z-10 h-2 w-2 rounded-full bg-mint ring-2 ring-ink-950"
                aria-label="Setup incomplete"
              />
            ) : null}
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
                onOpenSettings={openSettingsFromShelfProfile}
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
                {item === 'Discovery Inbox' && discoveryInboxItems.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    {t(navItemLabelKeys[item])}
                    <span className="inline-flex min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-none text-ink-950">
                      {discoveryInboxItems.length > 99 ? '99+' : discoveryInboxItems.length}
                    </span>
                  </span>
                ) : (
                  t(navItemLabelKeys[item])
                )}
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
                        <Icon name={item === 'Stats' ? 'panel-top-open' : item === 'Discover' ? 'sparkles' : item === 'Quest Runner' ? 'gamepad-2' : item === 'Settings' ? 'settings' : 'image-frame'} size={15} strokeWidth={2.2} />
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

        <AppSectionRouter
          core={{ activeNavItem, mainContentRef, t, addToastNotification, setActiveNavItem, setActiveSettingsCategory, setSelectedGameId, setIsAddGameOpen, openOnboarding, setIsAchievementTimelineOpen, openGameFromHome }}
          games={{ games, filteredLibraryGames, filteredWishlistGames, playActivity, reviewIgnoredGameIds, ignoredSteamGames, addToWishlist, addManyToWishlist, moveToLibrary, removeGame, removeAndIgnoreSteamGame, removeManyGames, removeAndIgnoreManyGames, updateGameStatusWithCompletion, updateManyGameStatuses, updateGameTracking, updateGameReviewFieldsWithCompletion, logPlayedToday, handleOpenDetailsFromCollection }}
          collections={{ libraryFilters, wishlistFilters, platformOptions, tags, areLastRetroImportsHiddenByFilters, handleClearLibraryFilters, handleClearWishlistFilters, handleLibraryFiltersChange, handleWishlistFiltersChange, setLibraryFilters }}
          queue={{ platformQueueState, queueSummary, activeQueuePlatforms, targetQueuePlatform, homeSteamSyncGameIds, openQueue, openBacklogPicker, addGameToQueue, addQueuePlatform, updateQueueLimit, setPlatformQueueState, moveQueueGame, moveQueueGameToPlatform, playQueueGameNow, updateCurrentlyPlayingGame, removeQueueGame, playGameFromCompactRow, finishGameFromCompactRow, dropGameFromCompactRow }}
          review={{ reviewModeState, activeReviewSource, confirmCancelConvention, handleReviewAction, startReviewMode, setReviewSource, restoreReviewIgnoredGames }}
          sync={{ itadDealSyncState, steamAchievementSyncState, steamPlaytimeRefreshState, steamWishlistSyncState, isImportingNewSteamGames, isHltbSyncing, syncSteamAchievements, refreshSteamPlaytime, syncWishlistDeals, syncSteamWishlist, syncHltb, importNewSteamGames }}
          shelf={{ personalizedQuestShelfTitle, computedShelfTitle, shelfIdentity, steamAvatarUrl, libraryOwnerNickname, questShelfAchievements, setLibraryOwnerNickname, setShelfIdentity }}
          discovery={{ discoveryInboxItems, discoveryInboxRawgIds, requestDiscoveryInboxRecommendations, isRequestingDiscoveryInboxRecommendations, handleSelectDiscoveryGame, openDiscoveryPreview, addToDiscoveryInbox, promoteDiscoveryToWishlist, promoteDiscoveryToPlans, promoteInboxDiscoveryToLibrary, promoteInboxDiscoveryToWishlist, promoteInboxDiscoveryToPlans, handleInboxIgnore, handleInboxSkip, startDiscoveryInboxRun }}
          onboarding={{ completedOnboardingItemIds, skippedOnboardingItemIds, isOnboardingOpen, isOnboardingComplete, markOnboardingItemComplete, markOnboardingItemsComplete, hideOnboarding, skipOnboardingItem, handleOnboardingAction, restartOnboarding }}
          settings={{ activeSettingsCategory, autoBackupSignal, setupTasks, runtimeEnvironment, resolvedTheme, themePreference, appTemplatePreference, accentColorPreference, secondaryAccentColorPreference, gradientOrientationPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, neonButtonStylePreference, language, navigationVisibility, controllerProfileId, detectedProfileId, isControllerDebugEnabled, isLandscapeLockEnabled, steamPersonaName: steamProfileName, setIsRawgApiKeySet, handleSteamProfileNameChange, setNavigationVisibility, setThemePreference, setAppTemplatePreference, setAccentColorPreference, setSecondaryAccentColorPreference, setGradientOrientationPreference, setNeonButtonGradientBalancePreference, setNeonButtonGradientMidpointPreference, setNeonButtonStylePreference, setLanguage, setControllerProfileId, setIsControllerDebugEnabled, setIsLandscapeLockEnabled, handleBackupExported, handleBackupImported, unignoreSteamGame }}
          metadata={{ metadataSelectionRequest, refreshingMetadataGameIds, updateGameArtwork, updateGameMetadata, updateGameMetadataManagement, refreshGameMetadataFromActions, startMetadataWorkflow, ensureRawgMetadataForGame }}
          imports={{ importMultiGameItemsWithAnalytics, importSteamWishlistHtmlItemsWithAnalytics, importSteamGames, handleRetroImportGames, addRetroImportedGamesToQueue, enrichRetroImportedGames, viewRetroImportedGames }}
        />
      </div>

      <UndoToastStack
        actions={pendingUndoActions}
        onDismiss={dismissToast}
        onOpenQueue={openQueueFromToast}
        onLinkRawgGame={openRawgRecoveryDialog}
        onOpenSteamSettings={() => {
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

      {/* Game Hub â€” fullscreen overlay over the app shell, sharing the
          FullscreenGameShell presentation with Discovery Preview. The
          originating screen stays mounted behind it, so back restores
          scroll/focus. Rendered before the preview so a preview opened
          from the hub's recommendations stacks on top. */}
      {selectedGame ? renderGameDetailRoute(selectedGame) : null}

      {previewCandidate ? (
        <DiscoveryPreviewPanel
          candidate={previewCandidate}
          userGames={games}
          discoveryInboxRawgIds={discoveryInboxRawgIds}
          onClose={() => closeDiscoveryPreview()}
          onAddToInbox={addToDiscoveryInbox}
          onAddToWishlist={promoteDiscoveryToWishlist}
          onAddToLibrary={promoteDiscoveryToLibrary}
          onOpenPreview={openDiscoveryPreview}
          onOpenLibraryGame={handlePreviewOpenLibraryGame}
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

      {isAchievementTimelineOpen ? (
        <AchievementTimelineView
          games={games}
          onClose={() => setIsAchievementTimelineOpen(false)}
          steamAchievementSyncState={steamAchievementSyncState}
          onSyncFullHistory={() => {
            const allSteamGameIds = games
              .filter((g) => g.collectionType === 'library' && typeof g.steamAppId === 'number')
              .map((g) => g.id);
            void syncSteamAchievements(allSteamGameIds, { showToast: true });
          }}
        />
      ) : null}
    </main>
    </I18nProvider>
  );
}

function createGameFromDiscovery(
  dg: import('../../lib/discovery').DiscoveryGame,
  existingIds: Set<string>,
): import('../../types/game').Game {
  const base =
    dg.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  let id = `rawg-${base}`;
  let n = 2;
  while (existingIds.has(id)) { id = `rawg-${base}-${n++}`; }
  const now = new Date().toISOString();
  return {
    id,
    title: dg.title,
    platform: dg.hasSteamVersion ? 'Steam' : 'PC',
    status: 'Want to play',
    coverImage: dg.coverUrl ?? '',
    artworkSource: dg.coverUrl ? 'rawg' : undefined,
    artworkUpdatedAt: dg.coverUrl ? now : undefined,
    backgroundImage: dg.coverUrl,
    playtimeHours: 0,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    externalSource: 'manual',
    importedAt: now,
    rawgId: dg.rawgId,
    rawgSlug: dg.slug ?? undefined,
    rawgTitle: dg.title,
    metacritic: dg.metacritic,
    metacriticScore: dg.metacritic ?? undefined,
    rawgRating: dg.rawgRating,
    rawgRatingsCount: dg.rawgRatingsCount,
    released: dg.released,
    genres: dg.genres.length > 0 ? dg.genres : undefined,
    metadataSource: 'rawg',
    metadataUpdatedAt: now,
  };
}
