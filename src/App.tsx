import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { ArtworkAuditPanel } from './components/ArtworkAuditPanel';
import { BackToTopButton } from './components/BackToTopButton';
import { BacklogPlatformPicker } from './components/BacklogPlatformPicker';
import { DataManagementPanel } from './components/DataManagementPanel';
import { GameDetailView } from './components/GameDetailView';
import { CollectionToolbar } from './components/CollectionToolbar';
import { ViewportModal } from './components/ViewportModal';
import { CollectionGrid, CollectionList, CollectionShelf } from './components/CollectionViews';
import { HomePanel } from './components/HomePanel';
import { MetadataEnrichmentPanel } from './components/MetadataEnrichmentPanel';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { QueuePanel, type PlayingGameAction } from './components/QueuePanel';
import { RawgSettingsPanel } from './components/RawgSettingsPanel';
import { RecommendationPanel } from './components/RecommendationPanel';
import { RetroImportPanel } from './components/RetroImportPanel';
import { ReviewModePanel, type ReviewModeAction } from './components/ReviewModePanel';
import { StatsPanel } from './components/StatsPanel';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { getRuntimeEnvironment } from './lib/capacitorEnvironment';
import { I18nProvider, createTranslator, languageOptions, useI18n, translateOption, translateSettingsCategory, type AppLanguage } from './i18n';
import { loadLanguagePreference, saveLanguagePreference } from './lib/languagePreference';
import {
  configurableNavigationItems,
  loadNavigationVisibilityPreferences,
  saveNavigationVisibilityPreferences,
  type ConfigurableNavigationItem,
  type NavigationVisibilityPreferences,
} from './lib/navigationVisibilityPreferences';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from './lib/androidGamepadShortcuts';
import { getMockGames, isMockGame, loadGames, removeMockGames, saveGames } from './lib/gameStorage';
import { hasProtectedArtwork, isMissingOrGeneratedCover } from './lib/gameCoverImages';
import { hasSteamAchievementSummary } from './lib/steamAchievementSummary';
import { loadControllerLayoutPreference, saveControllerLayoutPreference, type ControllerLayoutPreference } from './lib/controllerLayoutPreferences';
import { loadLandscapeLockPreference, saveLandscapeLockPreference } from './lib/landscapePreference';
import {
  loadOnboardingState,
  onboardingItemIds,
  saveOnboardingState,
  type OnboardingItemId,
  type OnboardingState,
} from './lib/onboardingStorage';
import {
  addActiveQueuePlatform,
  addGameToPlatformQueue,
  addGameToPlatformQueueTop,
  createPlatformArtworkPreset,
  getPlatformAccentColor,
  getPlatformTag,
  getActiveQueuePlatforms,
  getQueuePlatforms,
  hideQueuePlatform,
  moveQueuePlatform,
  removeQueuePlatform,
  renameQueuePlatform,
  getQueueSummary,
  setActiveQueuePlatforms,
  loadPlatformQueueState,
  moveQueueEntry,
  moveQueueEntryToPlatform,
  removeGameFromPlatformQueue,
  savePlatformQueueState,
  updatePlatformQueueSetting,
  updatePlatformQueueVisualSettings,
  platformAccentPalette,
  platformArtworkPresetOptions,
  type PlatformQueueState,
} from './lib/platformQueueStorage';
import { loadRawgSettings } from './lib/rawgSettingsStorage';
import { isSteamAchievementSyncableGame, syncSteamAchievementsForGames } from './lib/steamAchievementsSync';
import { isRefreshableSteamGame, refreshSteamPlaytimeForGames } from './lib/steamPlaytimeRefresh';
import {
  getBulkWishlistToastMessage,
  getDismissAction,
  getMoveQueueToastMessage,
  getOpenQueueAction,
  getOpenSteamSettingsAction,
  getQueueToastMessage,
  getRemoveQueueToastMessage,
  getStatusToastMessage,
  getToastDedupeKey,
  getUndoAction,
  getViewGameAction,
  getWishlistToastMessage,
  maxVisibleToastCount,
  mergeToastNotifications,
  type NotificationDraft,
  type ToastAction,
  type ToastCategory,
} from './lib/notifications';
import {
  loadReviewModeState,
  saveReviewModeState,
  type ReviewDecision,
  type ReviewModeState,
  type ReviewSource,
} from './lib/reviewModeStorage';
import { loadSteamSettings } from './lib/steamSettingsStorage';
import {
  applyAccentColorPreference,
  applyThemePreference,
  defaultAccentColor,
  loadAccentColorPreference,
  loadThemePreference,
  normalizeAccentColor,
  saveAccentColorPreference,
  saveThemePreference,
  watchSystemTheme,
  type AccentColorPreference,
  type ResolvedTheme,
  type ThemePreference,
} from './lib/themePreferences';
import {
  createUndoActionId,
  loadPendingUndoActions,
  savePendingUndoActions,
  undoActionTimeoutMs,
  type PendingUndoAction,
  type UndoActionHistoryEntry,
} from './lib/undoHistoryStorage';
import {
  addIgnoredSteamGame,
  loadIgnoredSteamGames,
  removeIgnoredSteamGame,
  saveIgnoredSteamGames,
  type IgnoredSteamGame,
} from './lib/steamIgnoredGamesStorage';
import { getOwnedGames, getSteamWishlist, mapSteamWishlistItemToLocalGame, SteamApiError, SteamWishlistError } from './services/steamApi';
import type { Game, GameCollectionType, GamePlatform, GameStatus, WishlistPriority } from './types/game';
import { gamePlatforms, gameStatuses, wishlistPriorities } from './types/game';
import type { RawgMetadata } from './types/rawg';
import type { SteamAchievementSyncState, SteamAchievementSyncSummary, SteamPlaytimeRefreshState, SteamPlaytimeRefreshSummary, SteamWishlistItem, SteamWishlistSyncState, SteamWishlistSyncSummary } from './types/steam';

const navItems = ['Library', 'Wishlist', 'Queue', 'Review Mode', 'Artwork', 'Recommendation', 'Stats', 'Settings'] as const;
const alwaysVisibleNavItems = ['Library', 'Settings'] as const;
const navItemLabelKeys: Record<(typeof navItems)[number], Parameters<ReturnType<typeof createTranslator>>[0]> = {
  Artwork: 'nav.artwork',
  Library: 'nav.library',
  Queue: 'nav.queue',
  Recommendation: 'nav.recommendations',
  'Review Mode': 'nav.reviewMode',
  Settings: 'nav.settings',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};

const navigationVisibilityLabelKeys: Record<ConfigurableNavigationItem, Parameters<ReturnType<typeof createTranslator>>[0]> = {
  Artwork: 'nav.artwork',
  Queue: 'settings.navigation.platformsQueue',
  Recommendation: 'nav.recommendations',
  'Review Mode': 'settings.navigation.questQueueReviewMode',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};
const allNavItems = ['Home', ...navItems, 'Metadata'] as const;
type TopNavItem = (typeof navItems)[number];
type NavItem = (typeof allNavItems)[number];
const settingsCategories = [
  'Integrations',
  'Library',
  'Wishlist',
  'Platforms',
  'Retro',
  'Appearance',
  'Data & Backup',
  'About',
] as const;
type SettingsCategory = (typeof settingsCategories)[number];

const allOption = 'All';
const questShelfIcon = '/icons/questshelf-icon.png';
const libraryFiltersStorageKey = 'questshelf.libraryFilters.v1';
const collectionViewModeStorageKey = 'questshelf.collectionViewMode.v1';
const settingsCategoryStorageKey = 'questshelf.settingsCategory.v1';
const wishlistFiltersStorageKey = 'questshelf.wishlistFilters.v1';
const sourceFilterOptions = ['All', 'Steam', 'Manual', 'Wishlist', 'Retro / future-ready'] as const;
const enrichmentFilterOptions = ['All', 'Enriched', 'Missing info', 'Manual metadata'] as const;
const librarySortOptions = [
  'Title A-Z',
  'Recently played',
  'Most playtime',
  'Least playtime',
  'Recently imported',
  'Missing info first',
  'Status',
  'Achievement completion %',
] as const;
const quickFilterOptions = ['Playing Now', 'Paused', 'Queue / Want to play', 'Missing info', 'Played > 0h'] as const;
const achievementFilterOptions = ['All', 'Has achievements', 'No achievements synced', 'Nearly completed', 'Completed', 'Started'] as const;
const collectionViewModes = ['Grid View', 'Shelf View', 'Compact View'] as const;
const collectionInitialRenderCount = 56;
const collectionRenderBatchSize = 40;
const collectionLoadAheadMargin = '720px 0px';

type SourceFilter = (typeof sourceFilterOptions)[number];
type EnrichmentFilter = (typeof enrichmentFilterOptions)[number];
type LibrarySortOption = (typeof librarySortOptions)[number];
type AchievementFilter = (typeof achievementFilterOptions)[number];
type QuickFilter = (typeof quickFilterOptions)[number];
type CollectionViewMode = (typeof collectionViewModes)[number];

type CollectionFilters = {
  achievement: AchievementFilter;
  enrichment: EnrichmentFilter;
  platform: GamePlatform | typeof allOption;
  quickFilters: QuickFilter[];
  searchTerm: string;
  sortBy: LibrarySortOption;
  source: SourceFilter;
  status: GameStatus | typeof allOption;
  tag: string;
};

type GameTrackingUpdate = Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>;

function QuestShelfLogo({ className, fallbackClassName = 'text-[10px]' }: { className: string; fallbackClassName?: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden bg-ink-950 text-mint shadow-glow ${className}`} aria-hidden="true">
      {hasImageError ? (
        <span className={`font-semibold leading-none ${fallbackClassName}`}>QS</span>
      ) : (
        <img className="qs-logo-glow h-full w-full object-cover" src={questShelfIcon} alt="" onError={() => setHasImageError(true)} />
      )}
    </div>
  );
}

const initialCollectionFilters: CollectionFilters = {
  achievement: allOption,
  enrichment: allOption,
  platform: allOption,
  quickFilters: [],
  searchTerm: '',
  sortBy: 'Title A-Z',
  source: allOption,
  status: allOption,
  tag: allOption,
};

type MetadataSelectionRequest = {
  ids: string[];
  requestId: number;
};

type BulkActionSummary = {
  failedCount?: number;
  ignoredCount?: number;
  removedCount?: number;
  skippedCount?: number;
  noAchievementDataCount?: number;
  skippedNonSteamCount?: number;
  unchangedCount?: number;
  updatedCount?: number;
  wishlistedCount?: number;
};

const initialSteamWishlistSyncState: SteamWishlistSyncState = {
  status: 'idle',
  message: 'Steam wishlist sync runs only when you start it.',
  summary: null,
};

const initialSteamAchievementSyncState: SteamAchievementSyncState = {
  status: 'idle',
  message: 'Steam achievement sync runs only when you start it.',
  progress: { completed: 0, total: 0 },
  summary: null,
};

const initialSteamPlaytimeRefreshState: SteamPlaytimeRefreshState = {
  status: 'idle',
  message: 'Steam playtime refresh runs only when you start it.',
  progress: { completed: 0, total: 0 },
  summary: null,
};

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [isAppReady, setIsAppReady] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [libraryFilters, setLibraryFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(libraryFiltersStorageKey),
  );
  const [wishlistFilters, setWishlistFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(wishlistFiltersStorageKey),
  );
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Library');
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<SettingsCategory>(() => loadSettingsCategory());
  const [isLandscapeLockEnabled, setIsLandscapeLockEnabled] = useState(() => loadLandscapeLockPreference());
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => loadThemePreference());
  const [accentColorPreference, setAccentColorPreference] = useState<AccentColorPreference>(() => loadAccentColorPreference());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguagePreference());
  const [navigationVisibility, setNavigationVisibility] = useState<NavigationVisibilityPreferences>(() =>
    loadNavigationVisibilityPreferences(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => applyThemePreference(loadThemePreference()));
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [controllerLayoutPreference, setControllerLayoutPreference] = useState<ControllerLayoutPreference>(() => loadControllerLayoutPreference());
  const [lastRetroImportGameIds, setLastRetroImportGameIds] = useState<string[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => loadOnboardingState());
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => loadReviewModeState());
  const [activeReviewSource, setActiveReviewSource] = useState<ReviewSource>(() => loadReviewModeState().lastSource);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  const [backlogPickerGame, setBacklogPickerGame] = useState<Game | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    const initialState = loadOnboardingState();
    return !initialState.hasSeenChecklist && !initialState.skipped;
  });
  const [metadataSelectionRequest, setMetadataSelectionRequest] = useState<MetadataSelectionRequest | null>(null);
  const [steamWishlistSyncState, setSteamWishlistSyncState] = useState<SteamWishlistSyncState>(
    initialSteamWishlistSyncState,
  );
  const [steamAchievementSyncState, setSteamAchievementSyncState] = useState<SteamAchievementSyncState>(
    initialSteamAchievementSyncState,
  );
  const [steamPlaytimeRefreshState, setSteamPlaytimeRefreshState] = useState<SteamPlaytimeRefreshState>(
    initialSteamPlaytimeRefreshState,
  );
  const [pendingUndoActions, setPendingUndoActions] = useState<PendingUndoAction[]>(() => loadPendingUndoActions());
  const pendingUndoActionsRef = useRef<PendingUndoAction[]>(pendingUndoActions);
  const isAppMountedRef = useRef(true);
  const t = useMemo(() => createTranslator(language), [language]);
  const visibleNavItems = useMemo(() => getVisibleNavItems(navigationVisibility), [navigationVisibility]);

  useEffect(() => () => {
    isAppMountedRef.current = false;
  }, []);

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    saveLanguagePreference(language);
  }, [language]);

  useEffect(() => {
    saveOnboardingState(onboardingState);
  }, [onboardingState]);

  useEffect(() => {
    saveNavigationVisibilityPreferences(navigationVisibility);
  }, [navigationVisibility]);

  useEffect(() => {
    saveReviewModeState(reviewModeState);
  }, [reviewModeState]);

  useEffect(() => {
    savePlatformQueueState(platformQueueState);
  }, [platformQueueState]);

  useEffect(() => {
    setResolvedTheme(applyThemePreference(themePreference));
    saveThemePreference(themePreference);

    if (themePreference !== 'system') {
      return undefined;
    }

    return watchSystemTheme(() => {
      setResolvedTheme(applyThemePreference('system'));
    });
  }, [themePreference]);


  useEffect(() => {
    applyAccentColorPreference(accentColorPreference);
    saveAccentColorPreference(accentColorPreference);
  }, [accentColorPreference]);

  useEffect(() => {
    pendingUndoActionsRef.current = pendingUndoActions;
    savePendingUndoActions(pendingUndoActions);
  }, [pendingUndoActions]);

  useEffect(() => {
    if (pendingUndoActions.length === 0) {
      return;
    }

    const now = Date.now();
    const nextExpiry = Math.max(0, Math.min(...pendingUndoActions.map((action) => action.expiresAt)) - now);
    const expiryTimer = window.setTimeout(() => {
      const currentTime = Date.now();
      setPendingUndoActions((currentActions) => currentActions.filter((action) => action.expiresAt > currentTime));
    }, nextExpiry + 50);

    return () => window.clearTimeout(expiryTimer);
  }, [pendingUndoActions]);

  useEffect(() => {
    saveCollectionFilters(libraryFiltersStorageKey, libraryFilters);
  }, [libraryFilters]);

  useEffect(() => {
    saveCollectionFilters(wishlistFiltersStorageKey, wishlistFilters);
  }, [wishlistFilters]);

  useEffect(() => {
    const readyFrame = window.requestAnimationFrame(() => setIsAppReady(true));

    return () => window.cancelAnimationFrame(readyFrame);
  }, []);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 15);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const steamSettings = loadSteamSettings();
    const rawgSettings = loadRawgSettings();

    markOnboardingItemsComplete([
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'manual')
        ? 'manual-game'
        : null,
      steamSettings.apiKey.trim() ? 'steam-api-key' : null,
      steamSettings.steamId64.trim() ? 'steam-id64' : null,
      games.some((game) => game.collectionType === 'library' && game.externalSource === 'steam')
        ? 'steam-import'
        : null,
      rawgSettings.apiKey.trim() ? 'rawg-api-key' : null,
      games.some((game) => game.metadataSource === 'rawg') ? 'metadata-enriched' : null,
      games.some((game) => game.collectionType === 'wishlist') ? 'wishlist-item' : null,
    ]);
  }, [games]);

  const tags = useMemo(() => {
    return Array.from(new Set(games.flatMap((game) => game.tags))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const libraryGames = useMemo(() => games.filter((game) => game.collectionType === 'library'), [games]);
  const wishlistGames = useMemo(() => games.filter((game) => game.collectionType === 'wishlist'), [games]);

  const platformOptions = useMemo(() => {
    return Array.from(new Set([...gamePlatforms, ...games.map((game) => game.platform)])).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const filteredLibraryGames = useMemo(() => {
    return filterGames(libraryGames, libraryFilters);
  }, [libraryFilters, libraryGames]);

  const filteredWishlistGames = useMemo(() => {
    return filterGames(wishlistGames, wishlistFilters);
  }, [wishlistFilters, wishlistGames]);

  const selectedGame = selectedGameId ? games.find((game) => game.id === selectedGameId) : null;
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
  const completedOnboardingItemIds = useMemo(() => {
    return new Set(onboardingItemIds.filter((itemId) => Boolean(onboardingState.completedAt[itemId])));
  }, [onboardingState.completedAt]);
  const isOnboardingComplete = completedOnboardingItemIds.size === onboardingItemIds.length;
  const reviewIgnoredGameIds = useMemo(() => new Set(reviewModeState.ignoredGameIds), [reviewModeState.ignoredGameIds]);
  const queueSummary = useMemo(() => getQueueSummary(platformQueueState, games), [games, platformQueueState]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, platformQueueState), [games, platformQueueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(platformQueueState), [platformQueueState]);
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

  useEffect(() => {
    saveControllerDebugEnabled(isControllerDebugEnabled);
  }, [isControllerDebugEnabled]);

  useEffect(() => {
    saveControllerLayoutPreference(controllerLayoutPreference);
  }, [controllerLayoutPreference]);

  useEffect(() => {
    saveLandscapeLockPreference(isLandscapeLockEnabled);
    window.dispatchEvent(new CustomEvent('questshelf:landscape-lock-change', { detail: isLandscapeLockEnabled }));
  }, [isLandscapeLockEnabled]);

  useEffect(() => {
    saveSettingsCategory(activeSettingsCategory);
  }, [activeSettingsCategory]);

  useEffect(() => {
    function handleControllerNavigation(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === 'm') {
        event.preventDefault();
        setActiveNavItem('Settings');
        setSelectedGameId(null);
        return;
      }

      if (event.key !== 'PageUp' && event.key !== 'PageDown') {
        return;
      }

      if (document.documentElement.classList.contains('qs-modal-open')) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      setActiveNavItem((currentItem) => {
        const currentIndex = visibleNavItems.includes(currentItem as TopNavItem)
          ? visibleNavItems.indexOf(currentItem as TopNavItem)
          : 0;
        const direction = event.key === 'PageDown' ? 1 : -1;
        return visibleNavItems[(currentIndex + direction + visibleNavItems.length) % visibleNavItems.length];
      });
      setSelectedGameId(null);
    }

    window.addEventListener('keydown', handleControllerNavigation);

    return () => window.removeEventListener('keydown', handleControllerNavigation);
  }, [visibleNavItems]);

  useEffect(() => {
    if (!isTopNavItem(activeNavItem) || isNavigationItemVisible(activeNavItem, navigationVisibility)) {
      return;
    }

    setActiveNavItem('Library');
    setSelectedGameId(null);
  }, [activeNavItem, navigationVisibility]);

  function updateOnboardingState(updater: (currentState: OnboardingState) => OnboardingState) {
    setOnboardingState((currentState) => updater(currentState));
  }

  function markOnboardingItemComplete(itemId: OnboardingItemId) {
    markOnboardingItemsComplete([itemId]);
  }

  function markOnboardingItemsComplete(itemIds: Array<OnboardingItemId | null>) {
    const nextItemIds = itemIds.filter((itemId): itemId is OnboardingItemId => Boolean(itemId));

    if (nextItemIds.length === 0) {
      return;
    }

    updateOnboardingState((currentState) => {
      const nextCompletedAt = { ...currentState.completedAt };
      let changed = false;

      nextItemIds.forEach((itemId) => {
        if (!nextCompletedAt[itemId]) {
          nextCompletedAt[itemId] = new Date().toISOString();
          changed = true;
        }
      });

      return changed ? { ...currentState, completedAt: nextCompletedAt } : currentState;
    });
  }

  function openOnboarding() {
    updateOnboardingState((currentState) => ({
      ...currentState,
      hasSeenChecklist: true,
      skipped: false,
    }));
    setIsOnboardingOpen(true);
  }

  function hideOnboarding() {
    updateOnboardingState((currentState) => ({
      ...currentState,
      hasSeenChecklist: true,
    }));
    setIsOnboardingOpen(false);
  }

  function skipOnboarding() {
    updateOnboardingState((currentState) => ({
      ...currentState,
      hasSeenChecklist: true,
      skipped: true,
    }));
    setIsOnboardingOpen(false);
  }

  function createUndoSnapshot() {
    return {
      games,
      ignoredSteamGames,
      platformQueueState,
      reviewModeState,
      selectedGameId,
    };
  }

  function addUndoAction(
    message: string,
    historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
    snapshot = createUndoSnapshot(),
    notification: Partial<NotificationDraft> = {},
  ) {
    const createdAt = Date.now();
    const action: PendingUndoAction = {
      actions: notification.actions ?? [getUndoAction()],
      category: notification.category ?? 'success',
      createdAt,
      dedupeKey: notification.dedupeKey ?? (activeNavItem === 'Review Mode' ? 'quest-queue-action' : getToastDedupeKey(historyEntry.actionType, historyEntry.affectedGameIds)),
      expiresAt: createdAt + undoActionTimeoutMs,
      historyEntry: {
        ...historyEntry,
        createdAt: new Date(createdAt).toISOString(),
      },
      id: createUndoActionId(),
      message: notification.message ?? message,
      snapshot,
    };

    setPendingUndoActions((currentActions) => {
      const scopedActions = activeNavItem === 'Review Mode' ? currentActions.filter((currentAction) => currentAction.dedupeKey !== 'quest-queue-action') : currentActions;
      const nextActions = mergeToastNotifications(scopedActions, action);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function addToastNotification(notification: NotificationDraft) {
    const createdAt = Date.now();
    const action: PendingUndoAction = {
      actions: notification.actions ?? [getDismissAction()],
      category: notification.category,
      createdAt,
      dedupeKey: notification.dedupeKey,
      expiresAt: createdAt + undoActionTimeoutMs,
      historyEntry: {
        actionType: 'notification',
        affectedGameIds: [],
        description: notification.message,
        createdAt: new Date(createdAt).toISOString(),
      },
      id: createUndoActionId(),
      message: notification.message,
      snapshot: createUndoSnapshot(),
    };

    setPendingUndoActions((currentActions) => {
      const nextActions = mergeToastNotifications(currentActions, action);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function undoAction(actionId: string) {
    const action = pendingUndoActionsRef.current.find((currentAction) => currentAction.id === actionId);
    if (!action) {
      return;
    }

    setGames(action.snapshot.games);
    setIgnoredSteamGames(action.snapshot.ignoredSteamGames);
    setPlatformQueueState(action.snapshot.platformQueueState);
    setReviewModeState(action.snapshot.reviewModeState);
    setSelectedGameId(action.snapshot.selectedGameId);
    setPendingUndoActions((currentActions) => {
      const nextActions = currentActions.filter((currentAction) => currentAction.id !== actionId);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function dismissUndoAction(actionId: string) {
    setPendingUndoActions((currentActions) => {
      const nextActions = currentActions.filter((currentAction) => currentAction.id !== actionId);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function handleOnboardingAction(itemId: OnboardingItemId) {
    if (itemId === 'manual-game' || itemId === 'wishlist-item') {
      setActiveNavItem(itemId === 'wishlist-item' ? 'Wishlist' : 'Library');
      setSelectedGameId(null);
      setIsAddGameOpen(true);
      return;
    }

    if (itemId === 'metadata-enriched') {
      setActiveNavItem('Metadata');
      setSelectedGameId(null);
      return;
    }

    setActiveNavItem('Settings');
    setSelectedGameId(null);
    if (itemId === 'backup-exported') {
      setActiveSettingsCategory('Data & Backup');
      return;
    }

    setActiveSettingsCategory('Integrations');
  }

  function updateGameStatus(gameId: string, status: GameStatus) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game && (status === 'Finished' || status === 'Dropped')) {
      addUndoAction(getStatusToastMessage(game, status), {
        actionType: `mark-${status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: `Restore ${game.title} to ${game.status}`,
      }, undefined, { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              status,
              lastPlayedAt: status === 'Playing' ? new Date().toISOString().slice(0, 10) : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function updateManyGameStatuses(gameIds: string[], status: GameStatus) {
    const targetGameIds = new Set(gameIds);
    const updatedGames = games.filter((game) => targetGameIds.has(game.id));
    if (updatedGames.length > 0 && (status === 'Finished' || status === 'Dropped')) {
      addUndoAction(`${updatedGames.length} games marked as ${status}`, {
        actionType: `bulk-mark-${status.toLowerCase()}`,
        affectedGameIds: updatedGames.map((game) => game.id),
        description: `Restore statuses for ${updatedGames.length} games`,
      });
    }
    const today = new Date().toISOString().slice(0, 10);

    setGames((currentGames) =>
      currentGames.map((game) =>
        targetGameIds.has(game.id)
          ? touchGameRecord({
              ...game,
              status,
              lastPlayedAt: status === 'Playing' && game.status !== 'Playing' ? today : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function importGames(importedGames: Game[]) {
    let createdGames: Game[] = [];

    setGames((currentGames) => {
      const existingSteamAppIds = new Set(
        currentGames
          .map((game) => game.steamAppId)
          .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
      );
      const existingRetroKeys = new Set(
        currentGames
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

      createdGames = newGames.map((game) =>
        touchGameRecord({
          ...game,
          collectionType: 'library' as const,
        }),
      );

      return createdGames.length > 0 ? [...currentGames, ...createdGames] : currentGames;
    });

    return createdGames;
  }

  function handleRetroImportGames(importedGames: Game[]) {
    const createdGames = importGames(importedGames);
    setLastRetroImportGameIds(createdGames.map((game) => game.id));
    return createdGames;
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

  async function syncSteamWishlist() {
    setSteamWishlistSyncState((currentState) => ({
      status: 'loading',
      message: 'Syncing Steam wishlist...',
      summary: currentState.summary,
    }));

    let didSetTerminalAchievementState = false;

    try {
      const settings = loadSteamSettings();
      const wishlistItems = await getSteamWishlist(settings);
      const summary = importSteamWishlistItems(wishlistItems);

      setSteamWishlistSyncState({
        status: 'success',
        message: `Steam sync complete. Added ${summary.addedCount}, updated ${summary.updatedCount}, skipped ${summary.skippedAlreadyInLibraryCount + summary.skippedIgnoredCount}.`,
        summary,
      });
    } catch (error) {
      const message =
        error instanceof SteamWishlistError
          ? error.message
          : 'Steam wishlist sync failed. Check profile privacy, SteamID64, and connection.';

      setSteamWishlistSyncState((currentState) => ({
        status: 'error',
        message,
        summary: currentState.summary,
      }));
    }
  }

  async function syncSteamAchievements(
    gameIds?: string[],
    options: { completionToastMessage?: (summary: SteamAchievementSyncSummary) => string; emptyToastMessage?: string; showToast?: boolean } = {},
  ) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter(
      (game) => game.collectionType === 'library',
    );
    const syncableGames = targetGames.filter(isSteamAchievementSyncableGame);
    const total = syncableGames.length;

    if (total === 0) {
      const summary: SteamAchievementSyncSummary = {
        failedCount: 0,
        noAchievementDataCount: 0,
        skippedNonSteamCount: targetGames.length,
        unchangedCount: 0,
        updatedCount: 0,
      };
      const message = options.emptyToastMessage ?? t('collection.noEligibleSteamGames');

      setSteamAchievementSyncState({
        status: 'success',
        message,
        progress: { completed: 0, total: 0 },
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: 'warning',
        dedupeKey: 'steam-achievements:no-steam-games',
        message,
      });
      return summary;
    }

    setSteamAchievementSyncState((currentState) => ({
      status: 'loading',
      message: `Syncing Steam achievements 0/${total}...`,
      progress: { completed: 0, total },
      summary: currentState.summary,
    }));

    let didSetTerminalAchievementState = false;

    try {
      const settings = loadSteamSettings();
      const syncedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = await syncSteamAchievementsForGames(
        games,
        targetGameIds,
        settings,
        syncedAt,
        (progress) => {
          if (!isAppMountedRef.current) {
            return;
          }

          setSteamAchievementSyncState((currentState) => ({
            ...currentState,
            message: `Syncing Steam achievements ${progress.completed}/${progress.total}...`,
            progress,
          }));
        },
        (batchResult) => {
          if (!isAppMountedRef.current) {
            saveGames(batchResult.games);
            return;
          }

          setGames((currentGames) => {
            const mergedGames = mergeSteamAchievementUpdates(currentGames, batchResult.games, targetGameIds);
            saveGames(mergedGames);
            return mergedGames;
          });
          setSteamAchievementSyncState((currentState) => ({
            ...currentState,
            message: `Syncing Steam achievements ${batchResult.progress.completed}/${batchResult.progress.total}...`,
            progress: batchResult.progress,
            summary: batchResult.summary,
          }));
        },
      );
      const completed = total;

      if (!isAppMountedRef.current) {
        return result.summary;
      }

      setGames((currentGames) => mergeSteamAchievementUpdates(currentGames, result.games, targetGameIds));
      didSetTerminalAchievementState = true;
      setSteamAchievementSyncState({
        status: 'success',
        message: formatSteamAchievementSyncSummary(result.summary),
        progress: { completed, total },
        summary: result.summary,
      });

      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0 || result.summary.noAchievementDataCount > 0;
        addToastNotification({
          actions: syncableGames[0] ? [getViewGameAction(syncableGames[0].id)] : [getDismissAction()],
          category: hasPartialFailures ? 'warning' : 'success',
          dedupeKey: `steam-achievements:${syncableGames.map((game) => game.id).join(',')}`,
          message: options.completionToastMessage?.(result.summary) ?? formatSteamAchievementSyncSummary(result.summary),
        });
      }

      return result.summary;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamApiError
          ? error.message
          : 'Steam achievement sync failed. Check your Steam credentials, profile privacy, and connection.';

      if (!isAppMountedRef.current) {
        return null;
      }

      didSetTerminalAchievementState = true;
      setSteamAchievementSyncState((currentState) => ({
        status: 'error',
        message,
        progress: { completed: currentState.progress.completed, total },
        summary: currentState.summary,
      }));
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-achievements:credentials' : 'steam-achievements:error',
        message: isCredentialError ? 'Add Steam credentials to sync achievements.' : 'Steam achievement sync failed.',
      });

      return null;
    } finally {
      if (isAppMountedRef.current && !didSetTerminalAchievementState) {
        setSteamAchievementSyncState((currentState) =>
          currentState.status === 'loading'
            ? {
                status: 'error',
                message: 'Steam achievement sync stopped before it could finish. Try again.',
                progress: currentState.progress,
                summary: currentState.summary,
              }
            : currentState,
        );
      }
    }
  }

  async function refreshSteamPlaytime(
    gameIds?: string[],
    options: { completionToastMessage?: (summary: SteamPlaytimeRefreshSummary) => string; emptyToastMessage?: string; showToast?: boolean } = {},
  ) {
    const targetGames = (gameIds ? games.filter((game) => gameIds.includes(game.id)) : games).filter(
      (game) => game.collectionType === 'library',
    );
    const refreshableGames = targetGames.filter(isRefreshableSteamGame);
    const total = refreshableGames.length;

    if (total === 0) {
      const summary: SteamPlaytimeRefreshSummary = {
        failedCount: 0,
        skippedNonSteamCount: targetGames.length,
        unchangedCount: 0,
        updatedCount: 0,
      };
      setSteamPlaytimeRefreshState({
        status: 'success',
        message: options.emptyToastMessage ?? 'No Steam library games were selected for playtime refresh.',
        progress: { completed: 0, total: 0 },
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: 'warning',
        dedupeKey: 'steam-playtime-refresh:no-steam-games',
        message: options.emptyToastMessage ?? 'Select Steam library games to refresh playtime.',
      });
      return summary;
    }

    setSteamPlaytimeRefreshState((currentState) => ({
      status: 'loading',
      message: `Fetching Steam playtime for ${total} game${total === 1 ? '' : 's'}...`,
      progress: { completed: 0, total },
      summary: currentState.summary,
    }));

    try {
      const settings = loadSteamSettings();
      const ownedGames = await getOwnedGames(settings);
      const refreshedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = refreshSteamPlaytimeForGames(games, targetGameIds, ownedGames, refreshedAt);
      const completed = result.summary.updatedCount + result.summary.unchangedCount + result.summary.failedCount;

      setGames(result.games);
      setSteamPlaytimeRefreshState({
        status: 'success',
        message: `Steam playtime refresh complete. Updated ${result.summary.updatedCount}, unchanged ${result.summary.unchangedCount}, failed ${result.summary.failedCount}.`,
        progress: { completed, total },
        summary: result.summary,
      });

      if (options.showToast) {
        addToastNotification({
          actions: [getViewGameAction(refreshableGames[0].id)],
          category: result.summary.failedCount > 0 ? 'warning' : 'success',
          dedupeKey: `steam-playtime-refresh:${refreshableGames[0].id}`,
          message: options.completionToastMessage?.(result.summary) ?? `Updated playtime for ${result.summary.updatedCount} game${result.summary.updatedCount === 1 ? '' : 's'}`,
        });
      }

      return result.summary;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamApiError
          ? error.message
          : 'Steam playtime refresh failed. Check your Steam credentials, profile privacy, and connection.';

      setSteamPlaytimeRefreshState((currentState) => ({
        status: 'error',
        message,
        progress: { completed: 0, total },
        summary: currentState.summary,
      }));
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-playtime-refresh:credentials' : 'steam-playtime-refresh:error',
        message: isCredentialError ? 'Add Steam credentials to refresh playtime.' : 'Steam playtime refresh failed.',
      });

      return null;
    }
  }


  async function syncSteamDataForGame(game: Game) {
    await refreshSteamPlaytime([game.id], { showToast: true });
    return syncSteamAchievements([game.id], { showToast: true });
  }

  function importSteamWishlistItems(wishlistItems: SteamWishlistItem[]): SteamWishlistSyncSummary {
    const syncedAt = new Date().toISOString();
    const ignoredSteamAppIds = new Set(ignoredSteamGames.map((game) => game.steamAppId));
    const nextGames = [...games];
    const librarySteamAppIds = new Set(
      games
        .filter((game) => game.collectionType === 'library')
        .map((game) => game.steamAppId)
        .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
    );
    const wishlistIndexBySteamAppId = new Map<number, number>();
    const summary: SteamWishlistSyncSummary = {
      addedCount: 0,
      failedCount: 0,
      fetchedCount: wishlistItems.length,
      skippedAlreadyInLibraryCount: 0,
      skippedIgnoredCount: 0,
      updatedCount: 0,
    };

    games.forEach((game, index) => {
      if (game.collectionType === 'wishlist' && typeof game.steamAppId === 'number') {
        wishlistIndexBySteamAppId.set(game.steamAppId, index);
      }
    });

    wishlistItems.forEach((item) => {
      if (!item.appid || !item.name) {
        summary.failedCount += 1;
        return;
      }

      if (ignoredSteamAppIds.has(item.appid)) {
        summary.skippedIgnoredCount += 1;
        return;
      }

      if (librarySteamAppIds.has(item.appid)) {
        summary.skippedAlreadyInLibraryCount += 1;
        return;
      }

      const existingWishlistIndex = wishlistIndexBySteamAppId.get(item.appid);
      const mappedGame = mapSteamWishlistItemToLocalGame(item, syncedAt);

      if (typeof existingWishlistIndex === 'number') {
        const existingGame = nextGames[existingWishlistIndex];
        nextGames[existingWishlistIndex] = touchGameRecord(mergeSteamWishlistSync(existingGame, mappedGame, syncedAt));
        summary.updatedCount += 1;
        return;
      }

      nextGames.push(touchGameRecord(mappedGame));
      wishlistIndexBySteamAppId.set(item.appid, nextGames.length - 1);
      summary.addedCount += 1;
    });

    setGames(nextGames);
    return summary;
  }

  function addManualGame(game: Game) {
    const collectionName = game.collectionType === 'wishlist' ? 'Wishlist' : 'Library';
    addUndoAction(`${game.title} added to ${collectionName}`, {
      actionType: 'add-manual-game',
      affectedGameIds: [game.id],
      description: `Remove ${game.title} from ${collectionName}`,
    }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });
    setGames((currentGames) => [...currentGames, touchGameRecord(game)]);
  }

  function addToWishlist(game: Game) {
    const wishlistId = createCollectionCopyId(game, 'wishlist', new Set(games.map((currentGame) => currentGame.id)));
    const alreadyWishlisted = games.some((currentGame) => {
      if (currentGame.collectionType !== 'wishlist') {
        return false;
      }

      if (typeof game.steamAppId === 'number') {
        return currentGame.steamAppId === game.steamAppId;
      }

      return currentGame.title.toLowerCase() === game.title.toLowerCase() && currentGame.platform === game.platform;
    });

    if (!alreadyWishlisted) {
      addUndoAction(getWishlistToastMessage(game), {
        actionType: 'add-to-wishlist',
        affectedGameIds: [game.id],
      description: `Remove ${game.title} from Wishlist`,
      }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });
    }

    setGames((currentGames) => {
      const alreadyWishlisted = currentGames.some((currentGame) => {
        if (currentGame.collectionType !== 'wishlist') {
          return false;
        }

        if (typeof game.steamAppId === 'number') {
          return currentGame.steamAppId === game.steamAppId;
        }

        return currentGame.title.toLowerCase() === game.title.toLowerCase() && currentGame.platform === game.platform;
      });

      if (alreadyWishlisted) {
        return currentGames;
      }

      return [
        ...currentGames,
        {
          ...touchGameRecord(game),
          id: wishlistId,
          collectionType: 'wishlist',
          status: 'Want to play',
          playtimeHours: 0,
          lastPlayedAt: null,
          priority: game.priority ?? 'medium',
          importedAt: new Date().toISOString(),
        },
      ];
    });
  }

  function addManyToWishlist(targetGames: Game[]) {
    if (targetGames.length > 0) {
      addUndoAction(getBulkWishlistToastMessage(targetGames.length), {
        actionType: 'bulk-add-to-wishlist',
        affectedGameIds: targetGames.map((game) => game.id),
        description: `Remove ${targetGames.length} wishlist copies`,
      });
    }

    setGames((currentGames) => {
      const existingGameIds = new Set(currentGames.map((game) => game.id));
      const nextGames = [...currentGames];
      let addedCount = 0;

      targetGames.forEach((game) => {
        const alreadyWishlisted = nextGames.some((currentGame) => {
          if (currentGame.collectionType !== 'wishlist') {
            return false;
          }

          if (typeof game.steamAppId === 'number') {
            return currentGame.steamAppId === game.steamAppId;
          }

          return currentGame.title.toLowerCase() === game.title.toLowerCase() && currentGame.platform === game.platform;
        });

        if (alreadyWishlisted) {
          return;
        }

        const wishlistId = createCollectionCopyId(game, 'wishlist', existingGameIds);
        existingGameIds.add(wishlistId);
        addedCount += 1;
        nextGames.push(touchGameRecord({
          ...game,
          id: wishlistId,
          collectionType: 'wishlist',
          status: 'Want to play',
          playtimeHours: 0,
          lastPlayedAt: null,
          priority: game.priority ?? 'medium',
          importedAt: new Date().toISOString(),
        }));
      });

      return addedCount > 0 ? nextGames : currentGames;
    });
  }

  function moveToLibrary(game: Game) {
    addUndoAction(`${game.title} moved to Library`, {
      actionType: 'move-to-library',
      affectedGameIds: [game.id],
      description: `Restore ${game.title} to Wishlist`,
    }, undefined, { actions: [getUndoAction(), getViewGameAction(game.id)] });

    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id
          ? touchGameRecord({
              ...currentGame,
              collectionType: 'library',
              priority: undefined,
              expectedPlaytime: undefined,
              priceTarget: undefined,
              status: 'Want to play',
            })
          : currentGame,
      ),
    );
  }

  function removeGame(gameId: string) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game) {
      addUndoAction(`${game.title} removed from ${game.collectionType === 'wishlist' ? 'Wishlist' : 'Library'}`, {
        actionType: game.collectionType === 'wishlist' ? 'remove-wishlist-item' : 'delete-game',
        affectedGameIds: [gameId],
        description: `Restore ${game.title}`,
      });
    }

    setGames((currentGames) => currentGames.filter((game) => game.id !== gameId));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === gameId ? null : currentSelectedGameId));
  }

  function removeAndIgnoreSteamGame(game: Game) {
    if (typeof game.steamAppId !== 'number') {
      return;
    }

    addUndoAction(`${game.title} hidden from Steam imports`, {
      actionType: 'ignore-game',
      affectedGameIds: [game.id],
      description: `Restore ${game.title} and remove it from ignored Steam imports`,
    });

    setIgnoredSteamGames((currentIgnoredGames) =>
      addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title),
    );
    setGames((currentGames) => currentGames.filter((currentGame) => currentGame.id !== game.id));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === game.id ? null : currentSelectedGameId));
  }

  function removeManyGames(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);
    const removedGames = games.filter((game) => targetGameIds.has(game.id));
    if (removedGames.length > 0) {
      addUndoAction(`${removedGames.length} games removed from Library`, {
        actionType: 'bulk-remove-games',
        affectedGameIds: removedGames.map((game) => game.id),
        description: `Restore ${removedGames.length} removed games`,
      });
    }
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function removeAndIgnoreManyGames(targetGames: Game[]) {
    if (targetGames.length > 0) {
      addUndoAction(`${targetGames.length} games hidden from Steam imports`, {
        actionType: 'bulk-remove-and-ignore-games',
        affectedGameIds: targetGames.map((game) => game.id),
        description: `Restore ${targetGames.length} removed games and ignored imports`,
      });
    }

    const targetGameIds = new Set(targetGames.map((game) => game.id));
    const steamGames = targetGames.filter((game) => typeof game.steamAppId === 'number');

    setIgnoredSteamGames((currentIgnoredGames) =>
      steamGames.reduce(
        (nextIgnoredGames, game) => addIgnoredSteamGame(nextIgnoredGames, game.steamAppId as number, game.title),
        currentIgnoredGames,
      ),
    );
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function startMetadataWorkflow(gameIds: string[]) {
    setMetadataSelectionRequest({
      ids: gameIds,
      requestId: Date.now(),
    });
    setSelectedGameId(null);
    setActiveNavItem('Metadata');
  }

  function startReviewMode(source: ReviewSource) {
    setActiveReviewSource(source);
    setReviewModeState((currentState) => ({
      ...currentState,
      lastSource: source,
    }));
    setSelectedGameId(null);
    setActiveNavItem('Review Mode');
  }

  function setReviewSource(source: ReviewSource) {
    setActiveReviewSource(source);
    setReviewModeState((currentState) => ({
      ...currentState,
      lastSource: source,
    }));
  }

  function recordReviewDecision(decision: ReviewDecision) {
    setReviewModeState((currentState) => ({
      ...currentState,
      stats: {
        ...currentState.stats,
        [decision]: currentState.stats[decision] + 1,
      },
    }));
  }

  function addQueuePlatform(platform: GamePlatform) {
    setPlatformQueueState((currentState) => addActiveQueuePlatform(currentState, platform));
  }

  function openBacklogPicker(game: Game) {
    setBacklogPickerGame(game);
  }

  function addGameToQueue(game: Game, platform: GamePlatform) {
    addUndoAction(getQueueToastMessage(game, platform), {
      actionType: 'add-to-queue',
      affectedGameIds: [game.id],
      description: `Remove ${game.title} from ${platform} backlog and restore positions`,
    }, undefined, { actions: [getUndoAction()] });

    const platformTag = getPlatformTag(platformQueueState, platform);
    if (platformTag && !game.tags.includes(platformTag)) {
      setGames((currentGames) =>
        currentGames.map((currentGame) =>
          currentGame.id === game.id
            ? touchGameRecord({
                ...currentGame,
                tags: Array.from(new Set([...currentGame.tags, platformTag])),
              })
            : currentGame,
        ),
      );
    }

    setPlatformQueueState((currentState) => addGameToPlatformQueue(currentState, game, platform));
  }

  function playQueueGameNow(gameId: string, platform: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) {
      return;
    }

    addUndoAction(`Added to Playing Now on ${platform}`, {
      actionType: 'play-now',
      affectedGameIds: [game.id],
      description: `Restore ${game.title} to ${platform} backlog`,
    }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    const today = new Date().toISOString().slice(0, 10);
    const platformTag = getPlatformTag(platformQueueState, platform);
    setGames((currentGames) =>
      currentGames.map((currentGame) => {
        if (currentGame.id !== gameId) {
          return currentGame;
        }

        return touchGameRecord({
          ...currentGame,
          platform,
          status: 'Playing',
          tags: platformTag ? Array.from(new Set([...currentGame.tags, platformTag])) : currentGame.tags,
          lastPlayedAt: today,
        });
      }),
    );

    setPlatformQueueState((currentState) => removeGameFromPlatformQueue(currentState, gameId));
  }

  function updateCurrentlyPlayingGame(gameId: string, platform: GamePlatform, action: PlayingGameAction) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (!game) {
      return;
    }

    const now = new Date().toISOString();
    const nextStatus: GameStatus = action === 'finished' ? 'Finished' : action === 'drop' ? 'Dropped' : 'Want to play';
    const actionLabels: Record<PlayingGameAction, string> = {
      'move-to-backlog': 'Moved to Platforms',
      finished: 'Marked Finished',
      drop: 'Dropped',
      'remove-from-playing': 'Removed from Playing Now',
    };

    addUndoAction(`${actionLabels[action]} on ${platform}`, {
      actionType: 'playing-action',
      affectedGameIds: [game.id],
      description: `Restore ${game.title} to Playing Now`,
    }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });

    setGames((currentGames) =>
      currentGames.map((currentGame) => {
        if (currentGame.id !== gameId) {
          return currentGame;
        }

        return touchGameRecord({
          ...currentGame,
          status: nextStatus,
          finishedAt: action === 'finished' ? now : currentGame.finishedAt,
          droppedAt: action === 'drop' ? now : currentGame.droppedAt,
        });
      }),
    );

    setPlatformQueueState((currentState) =>
      action === 'move-to-backlog' ? addGameToPlatformQueueTop(currentState, { ...game, status: 'Want to play' }, platform) : removeGameFromPlatformQueue(currentState, gameId),
    );
  }

  function playGameFromCompactRow(game: Game) {
    playQueueGameNow(game.id, game.platform);
  }

  function finishGameFromCompactRow(game: Game) {
    updateCurrentlyPlayingGame(game.id, game.platform, 'finished');
  }

  function dropGameFromCompactRow(game: Game) {
    updateCurrentlyPlayingGame(game.id, game.platform, 'drop');
  }

  function handleReviewAction(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) {
    if (action === 'skip') {
      recordReviewDecision('skipped');
      return;
    }

    if (action === 'open-details') {
      setSelectedGameId(game.id);
      setActiveNavItem(game.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
      return;
    }

    if (action === 'enrich') {
      recordReviewDecision('enriched');
      startMetadataWorkflow([game.id]);
      return;
    }

    if (action === 'find-artwork') {
      openArtworkAudit();
      return;
    }

    if (action === 'wishlist') {
      addToWishlist(game);
      recordReviewDecision('wishlisted');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'ignore') {
      addUndoAction('🚫 Ignored', {
        actionType: 'ignore-game',
        affectedGameIds: [game.id],
      description: `Restore ${game.title} to Quest Queue`,
      });

      setReviewModeState((currentState) => ({
        ...currentState,
        ignoredGameIds: Array.from(new Set([...currentState.ignoredGameIds, game.id])),
      }));

      if (typeof game.steamAppId === 'number') {
        setIgnoredSteamGames((currentIgnoredGames) => addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title));
      }

      recordReviewDecision('ignored');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'note' && note) {
      updateGameReviewFields(game.id, {
        notes: appendReviewNote(game.notes, note),
      });
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'queue') {
      if (targetPlatform) {
        addGameToQueue(game, targetPlatform);
      }
      recordReviewDecision('queueCandidates');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'playing') {
      updateGameReviewFields(game.id, {
        status: 'Playing',
      });
      recordReviewDecision('playing');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'finished') {
      updateGameReviewFields(game.id, {
        finishedAt: new Date().toISOString(),
        status: 'Finished',
      });
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'dropped') {
      updateGameReviewFields(game.id, {
        droppedAt: new Date().toISOString(),
        status: 'Dropped',
      });
      recordReviewDecision('dropped');
      recordReviewDecision('reviewed');
    }
  }

  function updateGameReviewFields(gameId: string, changes: Partial<Game>) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game && (changes.status === 'Finished' || changes.status === 'Dropped')) {
      addUndoAction(getStatusToastMessage(game, changes.status), {
        actionType: `mark-${changes.status.toLowerCase()}`,
        affectedGameIds: [gameId],
        description: `Restore ${game.title} to ${game.status}`,
      }, undefined, { actions: [getUndoAction(), getViewGameAction(gameId)] });
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
              lastPlayedAt:
                changes.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function restoreReviewIgnoredGames() {
    setReviewModeState((currentState) => ({
      ...currentState,
      ignoredGameIds: [],
    }));
  }

  function moveQueueGame(gameId: string, direction: 'top' | 'up' | 'down') {
    setPlatformQueueState((currentState) => moveQueueEntry(currentState, gameId, direction));
  }

  function moveQueueGameToPlatform(gameId: string, platform: GamePlatform) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    const currentEntry = platformQueueState.entries.find((entry) => entry.gameId === gameId);
    if (game && currentEntry && currentEntry.targetPlatform !== platform) {
      addUndoAction(getMoveQueueToastMessage(game, platform), {
        actionType: 'move-between-collections',
        affectedGameIds: [gameId],
        description: `Restore ${game.title} to ${currentEntry.targetPlatform} backlog`,
      }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }

    setPlatformQueueState((currentState) => moveQueueEntryToPlatform(currentState, gameId, platform));
  }

  function removeQueueGame(gameId: string) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    const entry = platformQueueState.entries.find((queueEntry) => queueEntry.gameId === gameId);
    if (game && entry) {
      addUndoAction(getRemoveQueueToastMessage(game, entry.targetPlatform), {
        actionType: 'remove-from-queue',
        affectedGameIds: [gameId],
        description: `Restore ${game.title} to plan position ${entry.queuePosition}`,
      }, undefined, { actions: [getUndoAction(), getOpenQueueAction(), getViewGameAction(gameId)] });
    }

    setPlatformQueueState((currentState) => removeGameFromPlatformQueue(currentState, gameId));
  }

  function updateQueueLimit(platform: GamePlatform, maxActiveGames: number) {
    setPlatformQueueState((currentState) => updatePlatformQueueSetting(currentState, platform, maxActiveGames));
  }

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
      addUndoAction('Restored from ignore list', {
        actionType: 'restore-ignored-steam-game',
        affectedGameIds: [String(steamAppId)],
        description: `Re-ignore ${ignoredGame.title || `Steam app ${steamAppId}`}`,
      }, undefined, { dedupeKey: `restore-ignored-steam-game:${steamAppId}` });
    }

    setIgnoredSteamGames((currentIgnoredGames) => removeIgnoredSteamGame(currentIgnoredGames, steamAppId));
  }

  function loadDemoData() {
    setGames((currentGames) => {
      const existingIds = new Set(currentGames.map((game) => game.id));
      const newMockGames = getMockGames().filter((game) => !existingIds.has(game.id));

      return [...currentGames, ...newMockGames];
    });
  }

  function removeDemoGames() {
    setGames((currentGames) => removeMockGames(currentGames));
  }

  function updateGameMetadata(gameId: string, metadata: RawgMetadata) {
    setGames((currentGames) =>
      currentGames.map((game) => {
        if (game.id !== gameId) {
          return game;
        }

        const shouldKeepExistingArtwork = Boolean(
          metadata.coverImage && (hasProtectedArtwork(game) || !isMissingOrGeneratedCover(game.coverImage)),
        );
        const safeMetadata = shouldKeepExistingArtwork
          ? {
              ...metadata,
              artworkSource: game.artworkSource,
              artworkUpdatedAt: game.artworkUpdatedAt,
              coverImage: game.coverImage,
            }
          : metadata;

        return touchGameRecord({
          ...game,
          ...safeMetadata,
          metadataSkippedAt: undefined,
          metadataManualManagedAt: undefined,
        });
      }),
    );
  }

  function updateGameMetadataManagement(
    gameId: string,
    changes: Pick<Game, 'metadataManualManagedAt' | 'metadataSkippedAt'>,
  ) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
            })
          : game,
      ),
    );
  }

  function updateGameTracking(gameId: string, tracking: GameTrackingUpdate) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...tracking,
              lastPlayedAt:
                tracking.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            })
          : game,
      ),
    );
  }

  function updateGameArtwork(gameId: string, changes: Partial<Pick<Game, 'artworkSource' | 'artworkUpdatedAt' | 'coverImage'>>) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...changes,
            })
          : game,
      ),
    );
  }

  function openArtworkAudit() {
    setSelectedGameId(null);
    setActiveNavItem('Artwork');
  }

  function openGameFromHome(game: Game) {
    setSelectedGameId(game.id);
    setActiveNavItem(game.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
  }

  function openQueue(platform?: GamePlatform) {
    setTargetQueuePlatform(platform);
    setSelectedGameId(null);
    setActiveNavItem('Queue');
  }

  if (!isAppReady) {
    return <AppStartupScreen />;
  }

  return (
    <I18nProvider language={language}>
    <main className="min-h-screen bg-ink-950 text-slate-100">
      <div className="qs-handheld-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 py-2 sm:px-4 lg:px-5">
        <header className={`qs-compact-header qs-glass flex items-center gap-2 rounded-lg border px-2 transition-all duration-300 ${isScrolled ? 'qs-header-stuck py-1' : 'py-1.5'}`}>
          <div className="flex min-w-0 shrink-0 items-center gap-2" aria-label="QuestShelf">
            <QuestShelfLogo className="h-7 w-7 rounded-md border border-mint/30" fallbackClassName="text-[9px]" />
            <div className="hidden min-w-0 text-xs font-semibold uppercase tracking-[0.16em] text-mint sm:block">QuestShelf</div>
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
                onClick={() => {
                  setActiveNavItem(item);
                  if (item !== 'Library' && item !== 'Wishlist') {
                    setSelectedGameId(null);
                  }
                }}
                type="button"
              >
                {t(navItemLabelKeys[item])}
              </button>
            ))}
          </nav>

          <BackToTopButton />
        </header>

        <div className="pt-2">
          <PwaStatusBanner />
        </div>

        <section className="flex-1 py-2">
          {(activeNavItem === 'Library' || activeNavItem === 'Wishlist') && selectedGame ? (
            <GameDetailView
              game={selectedGame}
              onAddToQueue={openBacklogPicker}
              onAddToWishlist={addToWishlist}
              onBack={() => setSelectedGameId(null)}
              onIgnore={removeAndIgnoreSteamGame}
              onRefreshSteamPlaytime={(game) => refreshSteamPlaytime([game.id], { showToast: true })}
              onSyncSteamAchievements={syncSteamDataForGame}
              isSteamAchievementSyncing={steamAchievementSyncState.status === 'loading' || steamPlaytimeRefreshState.status === 'loading'}
              onStatusChange={updateGameStatus}
              onTrackingChange={updateGameTracking}
              platformQueueState={platformQueueState}
            />
          ) : activeNavItem === 'Home' ? (
            <HomePanel
              games={games}
              ignoredReviewGameIds={reviewIgnoredGameIds}
              queueState={platformQueueState}
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
            />
          ) : activeNavItem === 'Library' ? (
            <CollectionPanel
              collectionType="library"
              filters={libraryFilters}
              steamAchievementSyncState={steamAchievementSyncState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              games={filteredLibraryGames}
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
              onBulkRemove={removeManyGames}
              onBulkSyncSteamAchievements={(gameIds, options) =>
                syncSteamAchievements(gameIds, {
                  completionToastMessage: formatSteamAchievementSyncSummary,
                  emptyToastMessage: options?.emptyToastMessage,
                  showToast: true,
                })
              }
              onBulkRefreshSteamPlaytime={(gameIds, options) =>
                refreshSteamPlaytime(gameIds, {
                  completionToastMessage: (summary) => `Updated playtime for ${summary.updatedCount} game${summary.updatedCount === 1 ? '' : 's'}`,
                  emptyToastMessage: options?.emptyToastMessage,
                  showToast: true,
                })
              }
              onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
              onBulkStatusChange={updateManyGameStatuses}
              onClearFilters={() => setLibraryFilters(initialCollectionFilters)}
              onFiltersChange={(changes) => setLibraryFilters((currentFilters) => ({ ...currentFilters, ...changes }))}
              onFindMetadata={(game) => startMetadataWorkflow([game.id])}
              onMoveToLibrary={moveToLibrary}
              onOpenDetails={(gameId) => setSelectedGameId(gameId)}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatus}
            />
          ) : activeNavItem === 'Wishlist' ? (
            <CollectionPanel
              collectionType="wishlist"
              filters={wishlistFilters}
              games={filteredWishlistGames}
              platformOptions={platformOptions}
              steamWishlistSyncState={steamWishlistSyncState}
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
              onBulkRemove={removeManyGames}
              onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
              onBulkStatusChange={updateManyGameStatuses}
              onClearFilters={() => setWishlistFilters(initialCollectionFilters)}
              onFiltersChange={(changes) => setWishlistFilters((currentFilters) => ({ ...currentFilters, ...changes }))}
              onFindMetadata={(game) => startMetadataWorkflow([game.id])}
              onMoveToLibrary={moveToLibrary}
              onOpenDetails={(gameId) => setSelectedGameId(gameId)}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatus}
              onSyncSteamWishlist={syncSteamWishlist}
            />
          ) : activeNavItem === 'Queue' ? (
            <QueuePanel
              games={games}
              initialPlatform={targetQueuePlatform}
              queueState={platformQueueState}
              onAddGameToQueue={addGameToQueue}
              onLimitChange={updateQueueLimit}
              onQueueStateChange={setPlatformQueueState}
              onMoveEntry={moveQueueGame}
              onMoveEntryToPlatform={moveQueueGameToPlatform}
              onPlayNow={playQueueGameNow}
              onPlayingAction={updateCurrentlyPlayingGame}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
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
              controllerLayout={controllerLayoutPreference}
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
            <ArtworkAuditPanel
              games={games}
              onApplyArtworkUpdate={updateGameArtwork}
              onEnrichGames={startMetadataWorkflow}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
            />
          ) : activeNavItem === 'Recommendation' ? (
            <RecommendationPanel
              games={games}
              queueState={platformQueueState}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatus}
              onAddToQueue={openBacklogPicker}
              onAddToWishlist={addToWishlist}
              onMoveToLibrary={moveToLibrary}
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
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
            />
          ) : activeNavItem === 'Settings' ? (
            <SettingsPanel
              activeCategory={activeSettingsCategory}
              autoBackupSignal={autoBackupSignal}
              completedOnboardingItemIds={completedOnboardingItemIds}
              demoGameCount={games.filter(isMockGame).length}
              games={games}
              ignoredSteamGames={ignoredSteamGames}
              controllerLayoutPreference={controllerLayoutPreference}
              isControllerDebugEnabled={isControllerDebugEnabled}
              isLandscapeLockEnabled={isLandscapeLockEnabled}
              isOnboardingOpen={isOnboardingOpen}
              isOnboardingComplete={isOnboardingComplete}
              lastRetroImportsHiddenByFilters={areLastRetroImportsHiddenByFilters}
              resolvedTheme={resolvedTheme}
              runtimeEnvironment={runtimeEnvironment}
              themePreference={themePreference}
              accentColorPreference={accentColorPreference}
              language={language}
              navigationVisibility={navigationVisibility}
              platformQueueState={platformQueueState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
              onBackupExported={() => markOnboardingItemComplete('backup-exported')}
              onCategoryChange={setActiveSettingsCategory}
              onConnectionTested={() => markOnboardingItemComplete('steam-test')}
              onClearLibraryFilters={() => setLibraryFilters(initialCollectionFilters)}
              onEnrichRetroImportedGames={enrichRetroImportedGames}
              onImportGames={importGames}
              onImportRetroGames={handleRetroImportGames}
              onControllerDebugChange={setIsControllerDebugEnabled}
              onControllerLayoutChange={setControllerLayoutPreference}
              onLandscapeLockChange={setIsLandscapeLockEnabled}
              onNavigationVisibilityChange={setNavigationVisibility}
              onLoadDemoData={loadDemoData}
              onOnboardingAction={handleOnboardingAction}
              onOnboardingClose={hideOnboarding}
              onOpenOnboarding={openOnboarding}
              onPlatformQueueStateChange={setPlatformQueueState}
              onRawgApiKeyConfigured={() => markOnboardingItemComplete('rawg-api-key')}
              onRemoveDemoGames={removeDemoGames}
              onRefreshSteamPlaytime={() => refreshSteamPlaytime()}
              onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
              onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
              onSteamLibraryImported={() => markOnboardingItemComplete('steam-import')}
              onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
              onThemePreferenceChange={setThemePreferenceState}
              onAccentColorChange={setAccentColorPreference}
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
        onDismiss={dismissUndoAction}
        onOpenQueue={openQueueFromToast}
        onOpenSteamSettings={() => {
          setActiveNavItem('Settings');
          setActiveSettingsCategory('Integrations');
          setSelectedGameId(null);
        }}
        onUndo={undoAction}
        onViewGame={viewGameFromToast}
      />

      {isAddGameOpen ? (
        <AddGameDialog
          existingGameIds={new Set(games.map((game) => game.id))}
          onClose={() => setIsAddGameOpen(false)}
          onSave={(game) => {
            addManualGame(game);
            markOnboardingItemComplete(game.collectionType === 'wishlist' ? 'wishlist-item' : 'manual-game');
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

      {!isOnboardingComplete ? (
        isOnboardingOpen ? (
          <div className="qs-setup-widget">
            <OnboardingChecklist
              completedItemIds={completedOnboardingItemIds}
              onAction={handleOnboardingAction}
              onClose={hideOnboarding}
              onConnectionTested={() => markOnboardingItemComplete('steam-test')}
              onRawgApiKeyConfigured={() => markOnboardingItemComplete('rawg-api-key')}
              onSkip={skipOnboarding}
              onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
              onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
            />
          </div>
        ) : (
          <button className="qs-setup-launcher" onClick={openOnboarding} type="button" aria-label={`Open setup checklist, ${completedOnboardingItemIds.size} of ${onboardingItemIds.length} complete`}>
            <span aria-hidden="true">⚙</span>
            <strong>Setup {completedOnboardingItemIds.size}/{onboardingItemIds.length}</strong>
          </button>
        )
      ) : null}
    </main>
    </I18nProvider>
  );
}

type UndoToastStackProps = {
  actions: PendingUndoAction[];
  onDismiss: (actionId: string) => void;
  onOpenQueue: () => void;
  onOpenSteamSettings: () => void;
  onUndo: (actionId: string) => void;
  onViewGame: (gameId: string) => void;
};

function UndoToastStack({ actions, onDismiss, onOpenQueue, onOpenSteamSettings, onUndo, onViewGame }: UndoToastStackProps) {
  if (actions.length === 0) {
    return null;
  }

  const visibleActions = actions.slice(-maxVisibleToastCount).reverse();

  function runToastAction(actionId: string, toastAction: ToastAction) {
    if (toastAction.kind === 'dismiss') {
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'undo') {
      onUndo(actionId);
      return;
    }

    if (toastAction.kind === 'open-queue') {
      onOpenQueue();
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'open-steam-settings') {
      onOpenSteamSettings();
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'view-game' && toastAction.gameId) {
      onViewGame(toastAction.gameId);
      onDismiss(actionId);
    }
  }

  return (
    <aside
      aria-label="QuestShelf notifications"
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-[calc(3.25rem+max(0px,var(--qs-safe-top)))] z-[1100] grid w-[min(calc(100vw-1.5rem),20rem)] justify-items-end gap-2 overflow-visible sm:right-5 sm:top-[calc(3.75rem+max(0px,var(--qs-safe-top)))]"
      role="status"
    >
      {visibleActions.map((action) => {
        const category = action.category ?? 'success';
        const categoryStyles = getToastCategoryStyles(category);
        const undoAction = action.actions?.[0] ?? getDismissAction();

        return (
          <div
            key={action.id}
            className={`qs-toast pointer-events-auto flex max-w-full translate-x-0 items-center gap-3 rounded-full border px-3 py-2 shadow-glow ${categoryStyles.container}`}
          >
            <span className="min-w-0 truncate text-sm font-semibold leading-5 text-white sm:text-[0.95rem]">
              {action.message}
            </span>
            {action.repeatCount && action.repeatCount > 1 ? (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300">
                ×{action.repeatCount}
              </span>
            ) : null}
            <button
              className={getToastButtonClass(undoAction.kind)}
              onClick={() => runToastAction(action.id, undoAction)}
              type="button"
            >
              {undoAction.label}
            </button>
          </div>
        );
      })}
    </aside>
  );
}

function getToastCategoryStyles(category: ToastCategory) {
  if (category === 'warning') {
    return {
      container: 'border-amber-300/35 bg-amber-950/90 text-amber-50 ring-1 ring-amber-300/15',
    };
  }

  if (category === 'error') {
    return {
      container: 'border-red-400/40 bg-red-950/90 text-red-50 ring-1 ring-red-400/15',
    };
  }

  if (category === 'info') {
    return {
      container: 'border-skyglass/35 bg-ink-900/92 text-sky-50 ring-1 ring-skyglass/10',
    };
  }

  return {
    container: 'border-mint/35 bg-ink-950/92 text-mint ring-1 ring-mint/15',
  };
}

function getToastButtonClass(kind: ToastAction['kind']) {
  const baseClass = 'min-h-0 rounded-full px-3 py-1 text-xs font-bold transition focus-visible:translate-y-0 sm:text-sm';

  if (kind === 'undo') {
    return `${baseClass} bg-mint text-ink-950 shadow-glow hover:bg-mint/90`;
  }

  return `${baseClass} border border-skyglass/20 bg-white/5 text-slate-100 hover:border-mint/40 hover:bg-mint/10 hover:text-white`;
}

type AddGameDialogProps = {
  existingGameIds: Set<string>;
  onClose: () => void;
  onSave: (game: Game) => void;
};

type CollectionPanelProps = {
  collectionType: GameCollectionType;
  filters: CollectionFilters;
  games: Game[];
  platformOptions: GamePlatform[];
  platformQueueState?: PlatformQueueState;
  steamAchievementSyncState?: SteamAchievementSyncState;
  steamPlaytimeRefreshState?: SteamPlaytimeRefreshState;
  steamWishlistSyncState?: SteamWishlistSyncState;
  tags: string[];
  onAddGame: () => void;
  onAddToWishlist: (game: Game) => void;
  onAddManyToWishlist: (games: Game[]) => void;
  onAddToQueue: (game: Game) => void;
  onPlayNow: (game: Game) => void;
  onFinish: (game: Game) => void;
  onDrop: (game: Game) => void;
  onBulkEnrich: (gameIds: string[]) => void;
  onBulkRefreshSteamPlaytime?: (gameIds: string[], options?: { emptyToastMessage?: string }) => Promise<SteamPlaytimeRefreshSummary | null>;
  onBulkSyncSteamAchievements?: (gameIds: string[], options?: { emptyToastMessage?: string }) => Promise<SteamAchievementSyncSummary | null>;
  onBulkRemove: (gameIds: string[]) => void;
  onBulkRemoveAndIgnore: (games: Game[]) => void;
  onBulkStatusChange: (gameIds: string[], status: GameStatus) => void;
  onClearFilters: () => void;
  onFiltersChange: (changes: Partial<CollectionFilters>) => void;
  onFindMetadata: (game: Game) => void;
  onMoveToLibrary: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStartReview: (source: ReviewSource) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onSyncSteamWishlist?: () => void;
};

function CollectionPanel({
  collectionType,
  filters,
  games,
  platformOptions,
  platformQueueState,
  steamAchievementSyncState,
  steamPlaytimeRefreshState,
  steamWishlistSyncState,
  tags,
  onAddGame,
  onAddToWishlist,
  onAddManyToWishlist,
  onAddToQueue,
  onPlayNow,
  onFinish,
  onDrop,
  onBulkEnrich,
  onBulkRefreshSteamPlaytime,
  onBulkSyncSteamAchievements,
  onBulkRemove,
  onBulkRemoveAndIgnore,
  onBulkStatusChange,
  onClearFilters,
  onFiltersChange,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStartReview,
  onStatusChange,
  onSyncSteamWishlist,
}: CollectionPanelProps) {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [bulkSummary, setBulkSummary] = useState<BulkActionSummary | null>(null);
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => loadCollectionViewMode(collectionType));
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [renderedGameCount, setRenderedGameCount] = useState(collectionInitialRenderCount);
  const activeViewModeCollectionRef = useRef(collectionType);
  const advancedFiltersButtonRef = useRef<HTMLButtonElement | null>(null);
  const advancedFiltersCloseRef = useRef<HTMLButtonElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const { t } = useI18n();
  const title = collectionType === 'wishlist' ? t('collection.wishlist') : t('collection.library');
  const emptyTitle = collectionType === 'wishlist' ? t('collection.emptyWishlistTitle') : t('collection.emptyLibraryTitle');
  const emptyText =
    collectionType === 'wishlist'
      ? t('collection.emptyWishlistText')
      : t('collection.emptyLibraryText');
  const progressiveResetKey = useMemo(
    () =>
      JSON.stringify({
        collectionType,
        filters,
        gameIds: games.map((game) => game.id),
        viewMode,
      }),
    [collectionType, filters, games, viewMode],
  );
  const canLoadProgressively = viewMode !== 'Shelf View';
  const visibleGames = canLoadProgressively ? games.slice(0, renderedGameCount) : games;
  const renderedCount = visibleGames.length;
  const hasMoreGames = canLoadProgressively && renderedCount < games.length;
  const selectedGames = games.filter((game) => selectedGameIds.has(game.id));
  const selectedCount = selectedGames.length;
  const selectedSteamCount = selectedGames.filter((game) => typeof game.steamAppId === 'number').length;
  const selectedAchievementSteamCount = selectedGames.filter(isSteamAchievementSyncableGame).length;
  const selectedRefreshableSteamCount = selectedGames.filter(isRefreshableSteamGame).length;
  const visibleRefreshableSteamCount = games.filter(isRefreshableSteamGame).length;
  const visibleAchievementSteamCount = games.filter(isSteamAchievementSyncableGame).length;
  const isSteamAchievementSyncing = steamAchievementSyncState?.status === 'loading';
  const isSteamPlaytimeSyncing = steamPlaytimeRefreshState?.status === 'loading';
  const hasActiveFilters = isCollectionFiltered(filters);
  const activeFilterCount = getActiveFilterCount(filters);
  const activeAdvancedFilterCount = getActiveAdvancedFilterCount(filters);

  useEffect(() => {
    saveCollectionViewMode(activeViewModeCollectionRef.current, viewMode);
  }, [viewMode]);

  useEffect(() => {
    activeViewModeCollectionRef.current = collectionType;
    setViewMode(loadCollectionViewMode(collectionType));
  }, [collectionType]);

  useEffect(() => {
    setRenderedGameCount(collectionInitialRenderCount);
  }, [progressiveResetKey]);

  useEffect(() => {
    if (!hasMoreGames) {
      return undefined;
    }

    const sentinel = loadMoreSentinelRef.current;

    if (!sentinel || typeof window.IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreGames();
        }
      },
      { root: null, rootMargin: collectionLoadAheadMargin, threshold: 0 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreGames, renderedCount, games.length]);

  useEffect(() => {
    setSelectedGameIds((currentSelection) => {
      const visibleGameIds = new Set(games.map((game) => game.id));
      const nextSelection = new Set(Array.from(currentSelection).filter((gameId) => visibleGameIds.has(gameId)));

      return nextSelection.size === currentSelection.size ? currentSelection : nextSelection;
    });
  }, [games]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !isMultiSelectMode) {
        return;
      }

      if (selectedGameIds.size > 0) {
        setSelectedGameIds(new Set());
      } else {
        setIsMultiSelectMode(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMultiSelectMode, selectedGameIds.size]);

  function toggleMultiSelectMode() {
    setIsMultiSelectMode((currentMode) => {
      const nextMode = !currentMode;

      if (!nextMode) {
        setSelectedGameIds(new Set());
      }

      setBulkSummary(null);
      return nextMode;
    });
  }

  function toggleSelectedGame(gameId: string) {
    setSelectedGameIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(gameId)) {
        nextSelection.delete(gameId);
      } else {
        nextSelection.add(gameId);
      }

      return nextSelection;
    });
  }

  function clearSelection() {
    setSelectedGameIds(new Set());
  }

  function selectAllVisible() {
    setSelectedGameIds(new Set(games.map((game) => game.id)));
  }

  function loadMoreGames() {
    setRenderedGameCount((currentCount) => Math.min(games.length, currentCount + collectionRenderBatchSize));
  }

  function toggleQuickFilter(quickFilter: QuickFilter) {
    const nextQuickFilters = filters.quickFilters.includes(quickFilter)
      ? filters.quickFilters.filter((currentFilter) => currentFilter !== quickFilter)
      : [...filters.quickFilters, quickFilter];

    onFiltersChange({ quickFilters: nextQuickFilters });
  }

  function removeSelectedGames() {
    if (selectedCount === 0 || !window.confirm(`Remove ${selectedCount} selected games from QuestShelf?`)) {
      return;
    }

    onBulkRemove(selectedGames.map((game) => game.id));
    setBulkSummary({ removedCount: selectedCount, skippedCount: 0 });
    clearSelection();
  }

  function removeAndIgnoreSelectedGames() {
    if (
      selectedCount === 0 ||
      !window.confirm(
        `Remove ${selectedCount} selected games? ${selectedSteamCount} Steam games will also be ignored for future Steam imports.`,
      )
    ) {
      return;
    }

    onBulkRemoveAndIgnore(selectedGames);
    setBulkSummary({
      ignoredCount: selectedSteamCount,
      removedCount: selectedCount,
      skippedCount: selectedCount - selectedSteamCount,
    });
    clearSelection();
  }

  function addSelectedToWishlist() {
    if (selectedCount === 0) {
      return;
    }

    onAddManyToWishlist(selectedGames);
    setBulkSummary({ skippedCount: 0, wishlistedCount: selectedCount });
    clearSelection();
  }

  function changeSelectedStatus(status: GameStatus) {
    if (selectedCount === 0) {
      return;
    }

    onBulkStatusChange(
      selectedGames.map((game) => game.id),
      status,
    );
    setBulkSummary({ updatedCount: selectedCount, skippedCount: 0 });
  }

  function enrichSelectedGames() {
    if (selectedCount === 0) {
      return;
    }

    onBulkEnrich(selectedGames.map((game) => game.id));
  }

  async function refreshSelectedSteamPlaytime() {
    if (selectedCount === 0 || !onBulkRefreshSteamPlaytime || isSteamPlaytimeSyncing) {
      return;
    }

    setBulkSummary(null);
    const summary = await onBulkRefreshSteamPlaytime(selectedGames.map((game) => game.id), {
      emptyToastMessage: 'No selected Steam games are eligible for playtime sync.',
    });

    if (summary) {
      setBulkSummary(summary);
    }
  }

  async function syncLibrarySteamAchievements() {
    if (collectionType !== 'library' || !onBulkSyncSteamAchievements || isSteamAchievementSyncing) {
      return;
    }

    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;

    setBulkSummary(null);
    const summary = await onBulkSyncSteamAchievements(targetGames.map((game) => game.id), {
      emptyToastMessage: hasSelection
        ? 'No selected Steam games are eligible for achievement sync.'
        : t('collection.noEligibleSteamGames'),
    });

    if (summary) {
      setBulkSummary(summary);
    }
  }

  async function syncLibrarySteamPlaytime() {
    if (collectionType !== 'library' || !onBulkRefreshSteamPlaytime || isSteamPlaytimeSyncing) {
      return;
    }

    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;

    setBulkSummary(null);
    const summary = await onBulkRefreshSteamPlaytime(targetGames.map((game) => game.id), {
      emptyToastMessage: hasSelection
        ? 'No selected Steam games are eligible for playtime sync.'
        : 'No visible Steam games are eligible for playtime sync.',
    });

    if (summary) {
      setBulkSummary(summary);
    }
  }

  return (
    <section className="qs-content-panel qs-glass min-w-0 rounded-lg border p-2 sm:p-3 lg:h-[calc(100vh-74px)] lg:overflow-y-auto">
      <CollectionToolbar
        title={title}
        searchValue={filters.searchTerm}
        searchPlaceholder={t('toolbar.findTitle')}
        onSearchChange={(value) => onFiltersChange({ searchTerm: value })}
        selects={[
          {
            label: t('toolbar.status'),
            value: filters.status,
            options: [allOption, ...gameStatuses],
            onChange: (value) => onFiltersChange({ status: value as GameStatus | typeof allOption }),
          },
          {
            label: t('toolbar.platform'),
            value: filters.platform,
            options: [allOption, ...platformOptions],
            onChange: (value) => onFiltersChange({ platform: value as GamePlatform | typeof allOption }),
          },
        ]}
        moreFiltersActiveCount={activeAdvancedFilterCount}
        moreFiltersOpen={isAdvancedFiltersOpen}
        moreFiltersButtonRef={advancedFiltersButtonRef}
        onMoreFiltersClick={() => setIsAdvancedFiltersOpen(true)}
        onClearFilters={hasActiveFilters ? onClearFilters : undefined}
        viewMode={{
          label: `${title} ${t('toolbar.viewMode')}`,
          options: collectionViewModes,
          value: viewMode,
          onChange: (mode) => setViewMode(mode as CollectionViewMode),
        }}
        primaryAction={
          <button
            className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
            onClick={onAddGame}
            type="button"
          >
            {t('toolbar.add')}
          </button>
        }
        actionMenu={
          <>
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={() => onStartReview(collectionType === 'wishlist' ? 'wishlist' : 'backlog')}
              type="button"
            >
              {collectionType === 'wishlist' ? t('collection.reviewWishlist') : t('collection.reviewQueue')}
            </button>
            {collectionType === 'wishlist' && onSyncSteamWishlist ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600"
                disabled={steamWishlistSyncState?.status === 'loading'}
                onClick={onSyncSteamWishlist}
                type="button"
              >
                {steamWishlistSyncState?.status === 'loading' ? t('collection.syncingSteam') : t('collection.syncSteamWishlist')}
              </button>
            ) : null}
            {collectionType === 'library' && onBulkSyncSteamAchievements ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
                disabled={isSteamAchievementSyncing}
                onClick={syncLibrarySteamAchievements}
                title={
                  selectedCount > 0
                    ? `Sync selected Steam games (${selectedAchievementSteamCount} eligible)`
                    : `Sync visible Steam games (${visibleAchievementSteamCount} eligible)`
                }
                type="button"
              >
                {isSteamAchievementSyncing ? t('collection.syncingSteamAchievements') : t('collection.syncSteamAchievements')}
              </button>
            ) : null}
            {collectionType === 'library' && onBulkRefreshSteamPlaytime ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
                disabled={isSteamPlaytimeSyncing}
                onClick={syncLibrarySteamPlaytime}
                title={
                  selectedCount > 0
                    ? `Sync selected Steam games (${selectedRefreshableSteamCount} eligible)`
                    : `Sync visible Steam games (${visibleRefreshableSteamCount} eligible)`
                }
                type="button"
              >
                {isSteamPlaytimeSyncing ? t('collection.syncingSteamPlaytime') : t('collection.syncSteamPlaytime')}
              </button>
            ) : null}
            <button
              className={`h-9 rounded-md border px-3 text-left text-sm font-semibold transition ${
                isMultiSelectMode
                  ? 'border-mint/40 bg-mint/10 text-mint shadow-glow'
                  : 'border-skyglass/15 text-slate-200 hover:bg-mint/10 hover:text-white'
              }`}
              onClick={toggleMultiSelectMode}
              type="button"
            >
              {isMultiSelectMode ? t('collection.cancelSelection') : t('collection.select')}
            </button>
          </>
        }
      />

      {collectionType === 'library' && steamAchievementSyncState && steamAchievementSyncState.status !== 'idle' ? (
        <SteamAchievementSyncNotice syncState={steamAchievementSyncState} />
      ) : null}

      {collectionType === 'library' && steamPlaytimeRefreshState && steamPlaytimeRefreshState.status !== 'idle' ? (
        <SteamPlaytimeRefreshNotice refreshState={steamPlaytimeRefreshState} />
      ) : null}

      {collectionType === 'wishlist' && steamWishlistSyncState && steamWishlistSyncState.status !== 'idle' ? (
        <SteamWishlistSyncNotice syncState={steamWishlistSyncState} />
      ) : null}

      {isAdvancedFiltersOpen ? (
        <ViewportModal
          ariaLabel={`${title} advanced filters`}
          initialFocusRef={advancedFiltersCloseRef}
          restoreFocusRef={advancedFiltersButtonRef}
          onClose={() => setIsAdvancedFiltersOpen(false)}
        >
          <div className="flex items-center justify-between gap-3 border-b border-skyglass/15 bg-ink-950/90 p-3">
              <div>
                <h3 className="text-base font-semibold text-white">{t('app.advancedFilters')}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{t('app.advancedFiltersHelp')}</p>
              </div>
              <button
                ref={advancedFiltersCloseRef}
                className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                onClick={() => setIsAdvancedFiltersOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="max-h-[min(72dvh,28rem)] overflow-y-auto p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterSelect
                  label={t('sort.status')}
                  value={filters.sortBy}
                  options={[...librarySortOptions]}
                  onChange={(value) => onFiltersChange({ sortBy: value as LibrarySortOption })}
                />

                <FilterSelect
                  label={t('toolbar.source')}
                  value={filters.source}
                  options={[...sourceFilterOptions]}
                  onChange={(value) => onFiltersChange({ source: value as SourceFilter })}
                />

                <FilterSelect
                  label={t('toolbar.enrichment')}
                  value={filters.enrichment}
                  options={[...enrichmentFilterOptions]}
                  onChange={(value) => onFiltersChange({ enrichment: value as EnrichmentFilter })}
                />

                <FilterSelect
                  label={t('collection.achievements')}
                  value={filters.achievement}
                  options={[...achievementFilterOptions]}
                  onChange={(value) => onFiltersChange({ achievement: value as AchievementFilter })}
                />

                <FilterSelect
                  label={t('addGame.tags')}
                  value={filters.tag}
                  options={[allOption, ...tags]}
                  onChange={(value) => onFiltersChange({ tag: value })}
                />
              </div>

              <div className="mt-4 rounded-md border border-skyglass/10 bg-ink-950/60 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{t('app.quickFilters')}</h4>
                    <p className="text-xs text-slate-500">{t('app.quickFiltersHelp')}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('app.touchDpadFriendly')}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {quickFilterOptions.map((quickFilter) => {
                    const isActive = filters.quickFilters.includes(quickFilter);

                    return (
                      <button
                        key={translateOption(quickFilter, t)}
                        aria-pressed={isActive}
                        className={`min-h-10 rounded-full border px-3 text-xs font-semibold transition ${
                          isActive
                            ? 'border-mint/40 bg-mint/15 text-mint shadow-glow'
                            : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
                        }`}
                        onClick={() => toggleQuickFilter(quickFilter)}
                        type="button"
                      >
                        {translateOption(quickFilter, t)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  {hasActiveFilters ? `${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} active - ${games.length} shown` : 'No filters active'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {hasActiveFilters ? (
                    <button
                      className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                      onClick={onClearFilters}
                      type="button"
                    >
                      Clear filters
                    </button>
                  ) : null}
                  <button
                    className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
                    onClick={() => setIsAdvancedFiltersOpen(false)}
                    type="button"
                  >
                    Show games
                  </button>
                </div>
              </div>
          </div>
        </ViewportModal>
      ) : null}

      {games.length > 0 && canLoadProgressively ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-skyglass/10 bg-ink-950/50 px-3 py-2 text-xs text-slate-500">
          <span>
            Rendered {renderedCount} of {games.length} {games.length === 1 ? 'game' : 'games'}
          </span>
          {hasMoreGames ? <span>{t('app.moreLoadAutomatically')}</span> : null}
        </div>
      ) : null}

      {isMultiSelectMode ? (
        <div className="mb-2 rounded-md border border-mint/20 bg-ink-950/80 p-2 shadow-glow">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-sm font-semibold text-white">{selectedCount} selected</div>
            <div className="flex flex-wrap gap-2">
              <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={selectAllVisible} type="button">
                Select all visible
              </button>
              <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={clearSelection} type="button">
                Clear selection
              </button>
              <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500" disabled={selectedCount === 0} onClick={enrichSelectedGames} type="button">
                Enrich selected
              </button>
              {collectionType === 'library' ? (
                <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500" disabled={selectedCount === 0} onClick={addSelectedToWishlist} type="button">
                  Add to Wishlist
                </button>
              ) : null}
{collectionType === 'library' && onBulkRefreshSteamPlaytime ? (
                <button className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500" disabled={selectedRefreshableSteamCount === 0 || isSteamPlaytimeSyncing} onClick={refreshSelectedSteamPlaytime} type="button">
                  Refresh Steam Playtime
                </button>
              ) : null}
              <select
                aria-label={t('app.changeSelectedStatus')}
                className="h-9 rounded-md border border-skyglass/15 bg-ink-900 px-3 text-sm text-slate-100 outline-none transition focus:border-mint disabled:cursor-not-allowed disabled:text-slate-500"
                disabled={selectedCount === 0}
                onChange={(event) => {
                  if (event.target.value) {
                    changeSelectedStatus(event.target.value as GameStatus);
                    event.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">{t('app.changeStatus')}</option>
                {gameStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button className="h-9 rounded-md border border-red-400/30 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600" disabled={selectedCount === 0} onClick={removeSelectedGames} type="button">
                Remove selected
              </button>
              {collectionType === 'library' ? (
                <button className="h-9 rounded-md border border-red-400/30 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600" disabled={selectedCount === 0} onClick={removeAndIgnoreSelectedGames} type="button">
                  Remove + Ignore selected
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {bulkSummary ? (
        <div className="mb-2 rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          {formatBulkSummary(bulkSummary)}
        </div>
      ) : null}

      {games.length > 0 ? (
        viewMode === 'Shelf View' ? (
          <CollectionShelf
            games={games}
            isMultiSelectMode={isMultiSelectMode}
            selectedGameIds={selectedGameIds}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            onToggleSelected={toggleSelectedGame}
            platformQueueState={platformQueueState}
          />
        ) : viewMode === 'Compact View' ? (
          <CollectionList
            games={visibleGames}
            isMultiSelectMode={isMultiSelectMode}
            selectedGameIds={selectedGameIds}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onPlayNow={onPlayNow}
            onFinish={onFinish}
            onDrop={onDrop}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            onToggleSelected={toggleSelectedGame}
            platformQueueState={platformQueueState}
          />
        ) : (
          <CollectionGrid
            games={visibleGames}
            isMultiSelectMode={isMultiSelectMode}
            selectedGameIds={selectedGameIds}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            onToggleSelected={toggleSelectedGame}
            platformQueueState={platformQueueState}
          />
        )
      ) : (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-skyglass/20 bg-ink-950/60 p-4 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">{emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{emptyText}</p>
          </div>
        </div>
      )}

      {hasMoreGames ? (
        <div className="mt-3 grid place-items-center gap-2 rounded-md border border-dashed border-skyglass/15 bg-ink-950/40 px-3 py-4 text-center">
          <div ref={loadMoreSentinelRef} aria-hidden="true" className="h-1 w-full" />
          <p className="text-xs font-medium text-slate-500">Loading more… {games.length - renderedCount} remaining.</p>
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/30 hover:bg-mint/10 hover:text-white"
            onClick={loadMoreGames}
            type="button"
          >
            Load more
          </button>
        </div>
      ) : null}
    </section>
  );
}

function NoticeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-current/20 bg-black/15 px-2 py-2">
      <div className="text-base font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] opacity-75">{label}</div>
    </div>
  );
}

function SteamAchievementSyncNotice({ syncState }: { syncState: SteamAchievementSyncState }) {
  const { t } = useI18n();
  const statusStyles = {
    idle: 'border-skyglass/15 bg-ink-950/70 text-slate-400',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[syncState.status];
  const progressPercent = syncState.progress.total > 0
    ? Math.round((syncState.progress.completed / syncState.progress.total) * 100)
    : 0;

  return (
    <div className={`mb-4 rounded-lg border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
      <div>{syncState.message}</div>
      {syncState.status === 'loading' ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-[0.12em]">
            <span>{t('app.progress')}</span>
            <span>{syncState.progress.completed}/{syncState.progress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}
      {syncState.summary ? (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
          <NoticeStat label="Updated" value={syncState.summary.updatedCount.toString()} />
          <NoticeStat label="Unchanged" value={syncState.summary.unchangedCount.toString()} />
          <NoticeStat label="Unavailable" value={syncState.summary.noAchievementDataCount.toString()} />
          <NoticeStat label="Failed" value={syncState.summary.failedCount.toString()} />
          <NoticeStat label="Non-Steam skipped" value={syncState.summary.skippedNonSteamCount.toString()} />
        </div>
      ) : null}
    </div>
  );
}

function SteamPlaytimeRefreshNotice({ refreshState }: { refreshState: SteamPlaytimeRefreshState }) {
  const { t } = useI18n();
  const statusStyles = {
    idle: 'border-skyglass/15 bg-ink-950/70 text-slate-400',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[refreshState.status];
  const progressPercent = refreshState.progress.total > 0
    ? Math.round((refreshState.progress.completed / refreshState.progress.total) * 100)
    : 0;

  return (
    <div className={`mb-4 rounded-lg border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
      <div>{refreshState.message}</div>
      {refreshState.status === 'loading' ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-[0.12em]">
            <span>{t('app.progress')}</span>
            <span>{refreshState.progress.completed}/{refreshState.progress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}
      {refreshState.summary ? (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-4">
          <NoticeStat label="Updated" value={refreshState.summary.updatedCount.toString()} />
          <NoticeStat label="Unchanged" value={refreshState.summary.unchangedCount.toString()} />
          <NoticeStat label="Failed" value={refreshState.summary.failedCount.toString()} />
          <NoticeStat label="Non-Steam skipped" value={refreshState.summary.skippedNonSteamCount.toString()} />
        </div>
      ) : null}
    </div>
  );
}

function SteamWishlistSyncNotice({ syncState }: { syncState: SteamWishlistSyncState }) {
  const statusStyles = {
    idle: 'border-skyglass/15 bg-ink-950/70 text-slate-400',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[syncState.status];

  return (
    <div className={`mb-4 rounded-lg border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
      <div>{syncState.message}</div>
      {syncState.summary ? (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
          <SyncStat label="Fetched" value={syncState.summary.fetchedCount} />
          <SyncStat label="Added" value={syncState.summary.addedCount} />
          <SyncStat label="Updated" value={syncState.summary.updatedCount} />
          <SyncStat label="In library" value={syncState.summary.skippedAlreadyInLibraryCount} />
          <SyncStat label="Ignored" value={syncState.summary.skippedIgnoredCount} />
          <SyncStat label="Failed" value={syncState.summary.failedCount} />
        </div>
      ) : null}
    </div>
  );
}

function SyncStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-2 py-2">
      <div className="text-base font-semibold text-white">{value}</div>
      <div className="mt-0.5 uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

function AddGameDialog({ existingGameIds, onClose, onSave }: AddGameDialogProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [collectionType, setCollectionType] = useState<GameCollectionType>('library');
  const [platform, setPlatform] = useState<GamePlatform>('Steam');
  const [customPlatform, setCustomPlatform] = useState('');
  const [status, setStatus] = useState<GameStatus>('Want to play');
  const [playtimeHours, setPlaytimeHours] = useState('0');
  const [coverImage, setCoverImage] = useState('');
  const [tagText, setTagText] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<WishlistPriority>('medium');
  const [expectedPlaytime, setExpectedPlaytime] = useState('');
  const [priceTarget, setPriceTarget] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const parsedPlaytime = Number(playtimeHours);
    const parsedExpectedPlaytime = expectedPlaytime ? Number(expectedPlaytime) : null;
    const resolvedPlatform = platform === 'Other' ? customPlatform.trim() : platform;

    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }

    if (!resolvedPlatform) {
      setError('Custom platform is required when Other is selected.');
      return;
    }

    if (!Number.isFinite(parsedPlaytime) || parsedPlaytime < 0) {
      setError('Playtime must be zero or positive.');
      return;
    }

    if (parsedExpectedPlaytime !== null && (!Number.isFinite(parsedExpectedPlaytime) || parsedExpectedPlaytime < 0)) {
      setError('Expected playtime must be zero or positive.');
      return;
    }

    const importedAt = new Date().toISOString();
    const id = createManualGameId(trimmedTitle, existingGameIds);

    onSave({
      id,
      title: trimmedTitle,
      platform: resolvedPlatform as GamePlatform,
      status,
      coverImage: coverImage.trim(),
      artworkSource: coverImage.trim() ? 'user' : undefined,
      artworkUpdatedAt: coverImage.trim() ? importedAt : undefined,
      playtimeHours: parsedPlaytime,
      tags: parseTagInput(tagText),
      lastPlayedAt: status === 'Playing' ? importedAt.slice(0, 10) : null,
      notes: notes.trim(),
      collectionType,
      externalSource: 'manual',
      importedAt,
      priority: collectionType === 'wishlist' ? priority : undefined,
      expectedPlaytime: collectionType === 'wishlist' ? parsedExpectedPlaytime : undefined,
      priceTarget: collectionType === 'wishlist' ? priceTarget.trim() : undefined,
      releaseDate: collectionType === 'wishlist' ? releaseDate : undefined,
      storeUrl: collectionType === 'wishlist' ? storeUrl.trim() : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/80 p-3 backdrop-blur-sm">
      <section aria-modal="true" className="qs-modal-panel qs-glass max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-lg border shadow-panel" role="dialog">
        <div className="flex items-center justify-between gap-3 border-b border-skyglass/15 bg-ink-950/80 p-4">
          <div>
            <h2 className="text-xl font-semibold text-white">{t('addGame.title')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('addGame.help')}</p>
          </div>
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <form className="max-h-[calc(92dvh-73px)] overflow-y-auto p-4" onSubmit={submitForm}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.addTo')}</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setCollectionType(event.target.value as GameCollectionType)}
                value={collectionType}
              >
                <option value="library">{t('collection.library')}</option>
                <option value="wishlist">{t('wishlist.title')}</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.titleLabel')}</span>
              <input
                autoFocus
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('addGame.titlePlaceholder')}
                value={title}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.platform')}</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setPlatform(event.target.value as GamePlatform)}
                value={platform}
              >
                {gamePlatforms.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {platform === 'Other' ? (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.customPlatform')}</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => setCustomPlatform(event.target.value)}
                  placeholder={t('addGame.customPlatformPlaceholder')}
                  value={customPlatform}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.status')}</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setStatus(event.target.value as GameStatus)}
                value={status}
              >
                {gameStatuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.playtimeHours')}</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                min="0"
                onChange={(event) => setPlaytimeHours(event.target.value)}
                step="0.1"
                type="number"
                value={playtimeHours}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.coverUrl')}</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setCoverImage(event.target.value)}
                placeholder="https://..."
                type="url"
                value={coverImage}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.tags')}</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTagText(event.target.value)}
                placeholder="physical, handheld, retro"
                value={tagText}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.notes')}</span>
              <textarea
                className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('addGame.notesPlaceholder')}
                value={notes}
              />
            </label>

            {collectionType === 'wishlist' ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.priority')}</span>
                  <select
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                    onChange={(event) => setPriority(event.target.value as WishlistPriority)}
                    value={priority}
                  >
                    {wishlistPriorities.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.expectedPlaytime')}</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    min="0"
                    onChange={(event) => setExpectedPlaytime(event.target.value)}
                    placeholder={t('addGame.hours')}
                    step="0.1"
                    type="number"
                    value={expectedPlaytime}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.priceTarget')}</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    onChange={(event) => setPriceTarget(event.target.value)}
                    placeholder="$20, 50%, Game Pass"
                    value={priceTarget}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.releaseDate')}</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    onChange={(event) => setReleaseDate(event.target.value)}
                    type="date"
                    value={releaseDate}
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('addGame.storeUrl')}</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    onChange={(event) => setStoreUrl(event.target.value)}
                    placeholder="https://..."
                    type="url"
                    value={storeUrl}
                  />
                </label>
              </>
            ) : null}
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <button
              className="h-9 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
            className="h-9 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
              type="submit"
            >
              Save game
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type DemoDataPanelProps = {
  demoGameCount: number;
  onLoadDemoData: () => void;
  onRemoveDemoGames: () => void;
};

type SettingsPanelProps = {
  activeCategory: SettingsCategory;
  autoBackupSignal: string;
  completedOnboardingItemIds: Set<OnboardingItemId>;
  demoGameCount: number;
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  isOnboardingComplete: boolean;
  isOnboardingOpen: boolean;
  lastRetroImportsHiddenByFilters: boolean;
  resolvedTheme: ResolvedTheme;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  themePreference: ThemePreference;
  accentColorPreference: AccentColorPreference;
  language: AppLanguage;
  navigationVisibility: NavigationVisibilityPreferences;
  platformQueueState: PlatformQueueState;
  steamPlaytimeRefreshState: SteamPlaytimeRefreshState;
  onAddRetroImportedToQueue: (gameIds: string[]) => void;
  onBackupExported: () => void;
  onCategoryChange: (category: SettingsCategory) => void;
  onClearLibraryFilters: () => void;
  onConnectionTested: () => void;
  onEnrichRetroImportedGames: (gameIds: string[]) => void;
  onImportGames: (games: Game[]) => void;
  onImportRetroGames: (games: Game[]) => Game[];
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerLayoutChange: (preference: ControllerLayoutPreference) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
  onNavigationVisibilityChange: (preferences: NavigationVisibilityPreferences) => void;
  onLoadDemoData: () => void;
  onOnboardingAction: (itemId: OnboardingItemId) => void;
  onOnboardingClose: () => void;
  onOpenOnboarding: () => void;
  onPlatformQueueStateChange: (state: PlatformQueueState) => void;
  onRawgApiKeyConfigured: () => void;
  onRemoveDemoGames: () => void;
  onRefreshSteamPlaytime: () => Promise<SteamPlaytimeRefreshSummary | null>;
  onReviewRetroImportedGames: () => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onSteamApiKeyConfigured: () => void;
  onSteamIdConfigured: () => void;
  onSteamLibraryImported: () => void;
  onUnignoreSteamGame: (steamAppId: number) => void;
  onViewRetroImportedGames: (gameIds: string[]) => void;
};

function SettingsPanel({
  activeCategory,
  autoBackupSignal,
  completedOnboardingItemIds,
  demoGameCount,
  games,
  ignoredSteamGames,
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  isOnboardingComplete,
  isOnboardingOpen,
  lastRetroImportsHiddenByFilters,
  resolvedTheme,
  runtimeEnvironment,
  themePreference,
  accentColorPreference,
  language,
  navigationVisibility,
  platformQueueState,
  steamPlaytimeRefreshState,
  onAddRetroImportedToQueue,
  onBackupExported,
  onCategoryChange,
  onClearLibraryFilters,
  onConnectionTested,
  onEnrichRetroImportedGames,
  onImportGames,
  onImportRetroGames,
  onControllerDebugChange,
  onControllerLayoutChange,
  onLandscapeLockChange,
  onNavigationVisibilityChange,
  onLoadDemoData,
  onOnboardingAction,
  onOnboardingClose,
  onOpenOnboarding,
  onPlatformQueueStateChange,
  onRawgApiKeyConfigured,
  onRemoveDemoGames,
  onRefreshSteamPlaytime,
  onReviewRetroImportedGames,
  onThemePreferenceChange,
  onAccentColorChange,
  onLanguageChange,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  onUnignoreSteamGame,
  onViewRetroImportedGames,
}: SettingsPanelProps) {
  const [isCategoryListOpen, setIsCategoryListOpen] = useState(false);
  const activeCategoryMeta = getSettingsCategoryMeta(activeCategory);
  const t = useMemo(() => createTranslator(language), [language]);

  function selectCategory(category: SettingsCategory) {
    onCategoryChange(category);
    setIsCategoryListOpen(false);
  }

  return (
    <section className="qs-settings-shell min-w-0 overflow-hidden rounded-lg border border-skyglass/15 bg-ink-900/45 lg:h-[calc(100vh-116px)]">
      <div className="border-b border-skyglass/15 bg-ink-950/80 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{t('settings.title')}</div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-400">
              <span>{t('settings.title')}</span>
              <span className="text-slate-600">/</span>
              <span className="truncate font-semibold text-white">{translateSettingsCategory(activeCategoryMeta.label, t)}</span>
            </div>
          </div>
          <button
            className="qs-settings-back h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white lg:hidden"
            onClick={() => setIsCategoryListOpen((currentValue) => !currentValue)}
            type="button"
          >
            {isCategoryListOpen ? t('settings.showDetail') : t('settings.backToCategories')}
          </button>
        </div>
      </div>

      <div className="grid h-full min-h-0 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className={`qs-settings-list border-b border-skyglass/15 bg-ink-950/70 p-3 lg:block lg:border-b-0 lg:border-r ${
            isCategoryListOpen ? 'block' : 'hidden'
          }`}
        >
          <nav className="qs-settings-tabs grid gap-2">
            {settingsCategories.map((category) => (
              <SettingsCategoryButton
                key={category}
                category={category}
                isActive={category === activeCategory}
                onSelect={selectCategory}
              />
            ))}
          </nav>
        </aside>

        <div className={`qs-settings-detail min-h-0 overflow-y-auto p-3 sm:p-4 ${isCategoryListOpen ? 'hidden lg:block' : 'block'}`}>
          <header className="mb-4 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-mint/25 bg-mint/10 text-mint">
                <SettingsCategoryIcon category={activeCategory} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-white">{translateSettingsCategory(activeCategoryMeta.label, t)}</h2>
              </div>
            </div>
          </header>

          {activeCategory === 'Integrations' ? (
            <div className="space-y-4">
              <RawgSettingsPanel onRawgApiKeyConfigured={onRawgApiKeyConfigured} />
              <SteamSettingsPanel
                games={games}
                ignoredSteamGames={ignoredSteamGames}
                onConnectionTested={onConnectionTested}
                onImportGames={onImportGames}
                onSteamApiKeyConfigured={onSteamApiKeyConfigured}
                onSteamIdConfigured={onSteamIdConfigured}
                onSteamLibraryImported={onSteamLibraryImported}
                playtimeRefreshState={steamPlaytimeRefreshState}
                onRefreshSteamPlaytime={onRefreshSteamPlaytime}
                onUnignoreSteamGame={onUnignoreSteamGame}
              />
            </div>
          ) : null}

          {activeCategory === 'Library' ? (
            <div className="space-y-4">
              <DemoDataPanel
                demoGameCount={demoGameCount}
                onLoadDemoData={onLoadDemoData}
                onRemoveDemoGames={onRemoveDemoGames}
              />
            </div>
          ) : null}

          {activeCategory === 'Wishlist' ? <WishlistSettingsPanel /> : null}

          {activeCategory === 'Platforms' ? (
            <QueuePlatformsSettingsPanel games={games} queueState={platformQueueState} onQueueStateChange={onPlatformQueueStateChange} />
          ) : null}

          {activeCategory === 'Retro' ? (
            <div className="space-y-4">
              <RetroImportPanel
                games={games}
                importedGamesHiddenByFilters={lastRetroImportsHiddenByFilters}
                onAddImportedToQueue={onAddRetroImportedToQueue}
                onClearLibraryFilters={onClearLibraryFilters}
                onEnrichImportedGames={onEnrichRetroImportedGames}
                onImportGames={onImportRetroGames}
                onReviewImportedGames={onReviewRetroImportedGames}
                onViewImportedGames={onViewRetroImportedGames}
              />
            </div>
          ) : null}

          {activeCategory === 'Data & Backup' ? (
            <DataManagementPanel autoBackupSignal={autoBackupSignal} onBackupExported={onBackupExported} />
          ) : null}

          {activeCategory === 'Appearance' ? (
            <div className="space-y-4">
              <NavigationVisibilitySettingsPanel
                navigationVisibility={navigationVisibility}
                onNavigationVisibilityChange={onNavigationVisibilityChange}
                t={t}
              />
              <AppearanceSettingsPanel
                controllerLayoutPreference={controllerLayoutPreference}
                isControllerDebugEnabled={isControllerDebugEnabled}
                isLandscapeLockEnabled={isLandscapeLockEnabled}
                resolvedTheme={resolvedTheme}
                runtimeEnvironment={runtimeEnvironment}
                themePreference={themePreference}
                accentColorPreference={accentColorPreference}
                language={language}
                onControllerDebugChange={onControllerDebugChange}
                onControllerLayoutChange={onControllerLayoutChange}
                onLandscapeLockChange={onLandscapeLockChange}
                onThemePreferenceChange={onThemePreferenceChange}
                onAccentColorChange={onAccentColorChange}
                onLanguageChange={onLanguageChange}
              />
            </div>
          ) : null}

          {activeCategory === 'About' ? (
            <div className="space-y-4">
              <AboutSettingsPanel runtimeEnvironment={runtimeEnvironment} />
              <OnboardingSettingsPanel
                completedCount={completedOnboardingItemIds.size}
                isComplete={isOnboardingComplete}
                onOpenOnboarding={onOpenOnboarding}
              />
              {isOnboardingOpen ? (
                <OnboardingChecklist
                  completedItemIds={completedOnboardingItemIds}
                  isSettingsPanel
                  onAction={onOnboardingAction}
                  onClose={onOnboardingClose}
                  onConnectionTested={onConnectionTested}
                  onRawgApiKeyConfigured={onRawgApiKeyConfigured}
                  onSteamApiKeyConfigured={onSteamApiKeyConfigured}
                  onSteamIdConfigured={onSteamIdConfigured}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsCategoryButton({
  category,
  isActive,
  onSelect,
}: {
  category: SettingsCategory;
  isActive: boolean;
  onSelect: (category: SettingsCategory) => void;
}) {
  const meta = getSettingsCategoryMeta(category);
  const { t } = useI18n();

  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      className={`grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
        isActive
          ? 'border-mint/50 bg-mint/15 text-white shadow-glow'
          : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
      }`}
      onClick={() => onSelect(category)}
      type="button"
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-md border ${
          isActive ? 'border-mint/40 bg-mint text-ink-950' : 'border-skyglass/15 bg-ink-950 text-mint'
        }`}
      >
        <SettingsCategoryIcon category={category} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{translateSettingsCategory(meta.label, t)}</span>
      </span>
    </button>
  );
}

function SettingsCategoryIcon({ category }: { category: SettingsCategory }) {
  const commonProps = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
  };

  if (category === 'Integrations') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M7 7h4v4H7z" />
        <path d="M13 13h4v4h-4z" />
        <path d="M11 9h4a2 2 0 0 1 2 2v2" />
        <path d="M13 15H9a2 2 0 0 1-2-2v-2" />
      </svg>
    );
  }

  if (category === 'Library') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M5 4h4v16H5z" />
        <path d="M10 4h4v16h-4z" />
        <path d="M15 5l4 1v14l-4-1z" />
      </svg>
    );
  }

  if (category === 'Wishlist') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      </svg>
    );
  }

  if (category === 'Retro') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M7 9h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14 15h-4l-1.6 1.8A3 3 0 0 1 3 15v-2a4 4 0 0 1 4-4z" />
        <path d="M8 12v3" />
        <path d="M6.5 13.5h3" />
        <path d="M16.5 13h.01" />
        <path d="M18.5 15h.01" />
      </svg>
    );
  }

  if (category === 'Appearance') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 9 9 4.5 4.5 0 0 1-9-9z" />
      </svg>
    );
  }

  if (category === 'Data & Backup') {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 17v-5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function getSettingsCategoryMeta(category: SettingsCategory) {
  const meta: Record<
    SettingsCategory,
    {
      description: string;
      label: string;
      shortDescription: string;
    }
  > = {
    Integrations: {
      description: 'Connect local credentials and import helpers for Steam, RAWG, and future providers.',
      label: 'Integrations',
      shortDescription: 'Steam, RAWG, providers',
    },
    Library: {
      description: 'Manage local library data, demo content, and library-specific defaults.',
      label: 'Library',
      shortDescription: 'Owned games and demos',
    },
    Wishlist: {
      description: 'Tune wishlist behavior, planning defaults, and future wishlist integrations.',
      label: 'Wishlist',
      shortDescription: 'Planning and priorities',
    },
    Platforms: {
      description: 'Choose, hide, remove, rename, and reorder the active gaming platforms that appear in Platforms.',
      label: 'Platforms',
      shortDescription: 'Active platform plans',
    },
    Retro: {
      description: 'Import ROM entries, review platform preferences, and prepare emulator settings.',
      label: 'Retro',
      shortDescription: 'ROM import and platforms',
    },
    Appearance: {
      description: 'Adjust handheld presentation, landscape preference, theme, language, and UI behavior.',
      label: 'Appearance',
      shortDescription: 'Theme and UI feel',
    },
    'Data & Backup': {
      description: 'Export, restore, import, reset, and sync QuestShelf data without a backend.',
      label: 'Data & Backup',
      shortDescription: 'Backup, restore, sync',
    },
    About: {
      description: 'View version, credits, debug information, and onboarding controls.',
      label: 'About',
      shortDescription: 'Version and debug',
    },
  };

  return meta[category];
}

function FutureProvidersPanel() {
  return null;
}

function LibrarySettingsSummary() {
  return null;
}

function WishlistSettingsPanel() {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <h2 className="text-xl font-semibold text-white">{t('settings.wishlistTitle')}</h2>
      <p className="mt-1 text-sm text-slate-400">{t('settings.wishlistHelp')}</p>
    </section>
  );
}

function QueuePlatformsSettingsPanel({
  games,
  queueState,
  onQueueStateChange,
}: {
  games: Game[];
  queueState: PlatformQueueState;
  onQueueStateChange: (state: PlatformQueueState) => void;
}) {
  const { t } = useI18n();
  const [customPlatformName, setCustomPlatformName] = useState('');
  const allQueuePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(queueState), [queueState]);
  const hiddenQueuePlatforms = allQueuePlatforms.filter((platform) => !activeQueuePlatforms.includes(platform));

  function addPlatform(platform: GamePlatform) {
    onQueueStateChange(addActiveQueuePlatform(queueState, platform));
    setCustomPlatformName('');
  }

  function addCustomPlatform() {
    const platform = customPlatformName.trim() as GamePlatform;
    if (!platform) {
      return;
    }

    addPlatform(platform);
  }

  function togglePlatform(platform: GamePlatform, isEnabled: boolean) {
    onQueueStateChange(isEnabled ? addActiveQueuePlatform(queueState, platform) : hideQueuePlatform(queueState, platform));
  }

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t('settings.platformsTitle')}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Supported platforms remain available for imports and metadata. Active platforms are the only ones shown in Platforms.
          </p>
        </div>
        <div className="rounded-md border border-mint/20 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint">
          {activeQueuePlatforms.length} active
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="h-10 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
          placeholder="Custom Platform, Retroid, Steam Deck..."
          value={customPlatformName}
          onChange={(event) => setCustomPlatformName(event.target.value)}
        />
        <button
          className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 hover:bg-mint/90 disabled:bg-slate-600 disabled:text-slate-300"
          disabled={!customPlatformName.trim()}
          onClick={addCustomPlatform}
          type="button"
        >
          Add Platform
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
          <h3 className="font-semibold text-white">{t('settings.activePlatforms')}</h3>
          <div className="mt-3 grid gap-2">
            {activeQueuePlatforms.length > 0 ? (
              activeQueuePlatforms.map((platform) => (
                <QueuePlatformManagementRow
                  key={platform}
                  isActive
                  accentColor={getPlatformAccentColor(queueState, platform)}
                  artworkUrl={queueState.settings.find((setting) => setting.platform === platform)?.artworkUrl ?? ''}
                  platform={platform}
                  platformTag={getPlatformTag(queueState, platform)}
                  onAccentColorChange={(accentColor) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { accentColor }))}
                  onArtworkUrlChange={(artworkUrl) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { artworkUrl }))}
                  onPlatformTagChange={(platformTag) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { platformTag }))}
                  onPresetArtwork={(preset) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { artworkUrl: createPlatformArtworkPreset(platform, getPlatformAccentColor(queueState, platform), preset) }))}
                  onHide={() => onQueueStateChange(hideQueuePlatform(queueState, platform))}
                  onMoveDown={() => onQueueStateChange(moveQueuePlatform(queueState, platform, 'down'))}
                  onMoveUp={() => onQueueStateChange(moveQueuePlatform(queueState, platform, 'up'))}
                  onRemove={() => onQueueStateChange(removeQueuePlatform(queueState, platform))}
                  onRename={(nextPlatform) => onQueueStateChange(renameQueuePlatform(queueState, platform, nextPlatform))}
                  onToggle={(isEnabled) => togglePlatform(platform, isEnabled)}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-white/10 p-3 text-sm text-slate-500">
                New users start with no active platforms. Enable only the platforms you want to plan around.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
          <h3 className="font-semibold text-white">{t('settings.availableHidden')}</h3>
          <div className="mt-3 grid gap-2">
            {hiddenQueuePlatforms.map((platform) => (
              <QueuePlatformManagementRow
                key={platform}
                isActive={false}
                accentColor={getPlatformAccentColor(queueState, platform)}
                artworkUrl={queueState.settings.find((setting) => setting.platform === platform)?.artworkUrl ?? ''}
                platform={platform}
                platformTag={getPlatformTag(queueState, platform)}
                onAccentColorChange={(accentColor) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { accentColor }))}
                onArtworkUrlChange={(artworkUrl) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { artworkUrl }))}
                onPlatformTagChange={(platformTag) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { platformTag }))}
                onPresetArtwork={(preset) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, { artworkUrl: createPlatformArtworkPreset(platform, getPlatformAccentColor(queueState, platform), preset) }))}
                onHide={() => onQueueStateChange(hideQueuePlatform(queueState, platform))}
                onMoveDown={() => undefined}
                onMoveUp={() => undefined}
                onRemove={() => onQueueStateChange(removeQueuePlatform(queueState, platform))}
                onRename={(nextPlatform) => onQueueStateChange(renameQueuePlatform(queueState, platform, nextPlatform))}
                onToggle={(isEnabled) => togglePlatform(platform, isEnabled)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
        <h3 className="font-semibold text-white">{t('settings.bulkManagement')}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={() => onQueueStateChange(setActiveQueuePlatforms(queueState, allQueuePlatforms))} type="button">
            Enable multiple
          </button>
          <button className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={() => onQueueStateChange(setActiveQueuePlatforms(queueState, []))} type="button">
            Disable multiple
          </button>
          <button className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={() => onQueueStateChange(setActiveQueuePlatforms(queueState, [...activeQueuePlatforms].sort((first, second) => first.localeCompare(second))))} type="button">
            Reorder multiple A-Z
          </button>
        </div>
      </div>
    </section>
  );
}

function QueuePlatformManagementRow({
  accentColor,
  artworkUrl,
  isActive,
  platform,
  platformTag,
  onAccentColorChange,
  onArtworkUrlChange,
  onHide,
  onMoveDown,
  onMoveUp,
  onPlatformTagChange,
  onPresetArtwork,
  onRemove,
  onRename,
  onToggle,
}: {
  accentColor: string;
  artworkUrl: string;
  isActive: boolean;
  platform: GamePlatform;
  platformTag: string;
  onAccentColorChange: (accentColor: string) => void;
  onArtworkUrlChange: (artworkUrl: string) => void;
  onHide: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPlatformTagChange: (platformTag: string) => void;
  onPresetArtwork: (preset: (typeof platformArtworkPresetOptions)[number]) => void;
  onRemove: () => void;
  onRename: (platform: GamePlatform) => void;
  onToggle: (isEnabled: boolean) => void;
}) {
  const { t } = useI18n();
  const accentStyle = { '--platform-accent': accentColor, borderColor: accentColor } as CSSProperties;

  function renamePlatform() {
    const nextPlatform = window.prompt(t('settings.rename'), platform);
    if (nextPlatform?.trim()) {
      onRename(nextPlatform.trim() as GamePlatform);
    }
  }

  function uploadArtwork(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        onArtworkUrlChange(reader.result);
      }
    });
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid gap-2 rounded-md border bg-ink-900/70 p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start" style={accentStyle}>
      <input checked={isActive} className="mt-1 h-4 w-4" style={{ accentColor }} onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
          <div className="truncate text-sm font-semibold text-white">{platform}</div>
        </div>
        <div className="text-xs text-slate-500">{isActive ? 'Shown in Platforms' : 'Hidden from Platforms but available for imports/metadata'}</div>
        {artworkUrl ? (
          <div className="mt-2 h-12 overflow-hidden rounded border border-white/10">
            <img alt="" className="h-full w-full object-cover" src={artworkUrl} />
          </div>
        ) : null}
        <details className="mt-2 rounded-md border border-white/10 bg-ink-950/60 p-2">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('settings.identity')}</summary>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-400">{t('settings.accentColor')}</span>
              <div className="flex flex-wrap items-center gap-2">
                <input className="h-9 w-12 rounded border border-white/10 bg-transparent" type="color" value={accentColor} onChange={(event) => onAccentColorChange(event.target.value)} />
                {platformAccentPalette.map((color) => (
                  <button key={color} aria-label={`Use ${color}`} className="h-7 w-7 rounded-full border border-white/20" style={{ backgroundColor: color }} onClick={() => onAccentColorChange(color)} type="button" />
                ))}
              </div>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-400">{t('settings.platformArtworkUrl')}</span>
              <input className="h-9 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint" placeholder="https://..." value={artworkUrl} onChange={(event) => onArtworkUrlChange(event.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-400">{t('settings.uploadImage')}</span>
              <input className="text-xs text-slate-300 file:mr-2 file:h-8 file:rounded file:border-0 file:bg-mint file:px-2 file:text-xs file:font-semibold file:text-ink-950" accept="image/*" type="file" onChange={(event) => uploadArtwork(event.target.files?.[0] ?? null)} />
            </label>
            <div>
              <span className="text-xs font-semibold text-slate-400">{t('settings.presetImage')}</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {platformArtworkPresetOptions.map((preset) => (
                  <button key={preset} className="min-h-9 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/10" onClick={() => onPresetArtwork(preset)} type="button">{preset}</button>
                ))}
                <button className="min-h-9 rounded-md border border-red-300/30 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/10" onClick={() => onArtworkUrlChange('')} type="button">{t('toolbar.clear')}</button>
              </div>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-400">{t('settings.platformTag')}</span>
              <input className="h-9 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint" placeholder="handheld, pc, retro..." value={platformTag} onChange={(event) => onPlatformTagChange(event.target.value)} />
              <span className="text-xs text-slate-500">Games added to this backlog inherit this existing custom tag. History is preserved by each game’s own tag list.</span>
            </label>
          </div>
        </details>
      </div>
      <div className="flex flex-wrap gap-1">
        <button className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" disabled={!isActive} onClick={onMoveUp} type="button">{t('settings.up')}</button>
        <button className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" disabled={!isActive} onClick={onMoveDown} type="button">{t('settings.down')}</button>
        <button className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={renamePlatform} type="button">{t('settings.rename')}</button>
        <button className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" disabled={!isActive} onClick={onHide} type="button">{t('settings.hide')}</button>
        <button className="h-8 rounded-md border border-red-400/30 px-2 text-xs text-red-100 hover:bg-red-500/10" onClick={onRemove} type="button">{t('action.remove')}</button>
      </div>
    </div>
  );
}

function RetroSettingsPlaceholders() {
  const { t } = useI18n();
  return null;
}

function SettingsMiniCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-skyglass/15 bg-ink-950/80 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</div>
      <div className="mt-1 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function DemoDataPanel({ demoGameCount, onLoadDemoData, onRemoveDemoGames }: DemoDataPanelProps) {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t('settings.libraryData')}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {import.meta.env.DEV ? (
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={onLoadDemoData}
              type="button"
            >
              Load demo data
            </button>
          ) : null}
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
            disabled={demoGameCount === 0}
            onClick={onRemoveDemoGames}
            type="button"
          >
            Remove demo games
          </button>
        </div>
      </div>
    </section>
  );
}


type NavigationVisibilitySettingsPanelProps = {
  navigationVisibility: NavigationVisibilityPreferences;
  onNavigationVisibilityChange: (preferences: NavigationVisibilityPreferences) => void;
  t: ReturnType<typeof createTranslator>;
};

function NavigationVisibilitySettingsPanel({
  navigationVisibility,
  onNavigationVisibilityChange,
  t,
}: NavigationVisibilitySettingsPanelProps) {
  function updateNavigationItemVisibility(item: ConfigurableNavigationItem, isVisible: boolean) {
    onNavigationVisibilityChange({
      ...navigationVisibility,
      [item]: isVisible,
    });
  }

  return (
    <section className="rounded-xl border border-skyglass/15 bg-ink-950/70 p-4 shadow-inner">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{t('settings.navigation.title')}</h3>
        <p className="mt-1 text-sm text-slate-400">{t('settings.navigation.help')}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {configurableNavigationItems.map((item) => (
          <label
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-skyglass/15 bg-ink-900/70 px-3 py-2 text-sm text-slate-200 transition hover:border-mint/30 hover:bg-mint/10"
            key={item}
          >
            <span className="font-medium">{t(navigationVisibilityLabelKeys[item])}</span>
            <input
              checked={navigationVisibility[item]}
              className="h-5 w-5 rounded border-skyglass/30 bg-ink-950 text-mint accent-mint"
              onChange={(event) => updateNavigationItemVisibility(item, event.target.checked)}
              type="checkbox"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t('settings.navigation.alwaysVisible')}</p>
    </section>
  );
}

function AppearanceSettingsPanel({
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  resolvedTheme,
  runtimeEnvironment,
  themePreference,
  accentColorPreference,
  language,
  onControllerDebugChange,
  onControllerLayoutChange,
  onLandscapeLockChange,
  onThemePreferenceChange,
  onAccentColorChange,
  onLanguageChange,
}: {
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  resolvedTheme: ResolvedTheme;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  themePreference: ThemePreference;
  accentColorPreference: AccentColorPreference;
  language: AppLanguage;
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerLayoutChange: (preference: ControllerLayoutPreference) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onLanguageChange: (language: AppLanguage) => void;
}) {
  const t = useMemo(() => createTranslator(language), [language]);
  const themeOptions: Array<{ description: string; label: string; value: ThemePreference }> = [
    {
      description: 'Bright cards and dark text tuned for outdoor handheld sessions.',
      label: t('settings.light'),
      value: 'light',
    },
    {
      description: 'The classic QuestShelf brand glow on dark gaming panels.',
      label: t('settings.dark'),
      value: 'dark',
    },
    {
      description: 'Automatically follows Android, PWA, browser, and desktop OS theme changes.',
      label: t('settings.followDevice'),
      value: 'system',
    },
  ];
  const selectedAccentColor = accentColorPreference ?? defaultAccentColor;
  const isDefaultAccentColor = accentColorPreference === null;
  const accentColorPresets = [
    { color: defaultAccentColor, label: t('settings.defaultAccentColor') },
    { color: '#1b75d0', label: 'Steam blue' },
    { color: '#006fdb', label: 'PlayStation blue' },
    { color: '#107c10', label: 'Xbox green' },
    { color: '#e60012', label: 'Nintendo red' },
    { color: '#8b5cf6', label: 'Purple' },
    { color: '#14b8a6', label: 'Teal' },
  ];
  const selectAccentColor = (color: string) => {
    const normalizedColor = normalizeAccentColor(color);
    if (normalizedColor) {
      onAccentColorChange(normalizedColor === defaultAccentColor ? null : normalizedColor);
    }
  };

  const themeCoverageChecklist = [
    'Light, Dark, and Follow Device all resolve through the same CSS theme tokens.',
    'Theme switching updates the active screen, browser theme-color, and native color-scheme without a page reload.',
    'App shell, top navigation, home, library, wishlist, metadata, artwork, recommendations, stats, and settings panels use tokenized backgrounds, borders, shadows, and text.',
    'Cards, detail dialogs, modal overlays, toasts, tooltips, dropdown menus, forms, buttons, badges, and disabled states inherit theme tokens.',
    'Quest Queue panels, Platforms panels, setup/onboarding widgets, controller focus rings, and scrollbars avoid fixed dark surfaces in Light Theme.',
  ];

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t('settings.appearanceTitle')}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {t('settings.appearanceHelp')}
          </p>
        </div>
        <span className="rounded-md border border-mint/25 bg-mint/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-mint">
          {resolvedTheme} {t('settings.active')}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('settings.theme')}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label={t('settings.theme')}>
          {themeOptions.map((option) => {
            const isSelected = themePreference === option.value;

            return (
              <button
                aria-checked={isSelected}
                className={`min-h-28 rounded-md border p-3 text-left transition ${
                  isSelected
                    ? 'border-mint/60 bg-mint/15 text-white shadow-glow'
                    : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35 hover:bg-mint/10 hover:text-white'
                }`}
                key={option.value}
                onClick={() => onThemePreferenceChange(option.value)}
                role="radio"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${isSelected ? 'border-mint bg-mint text-ink-950' : 'border-skyglass/30'}`}>
                    {isSelected ? <span className="h-2 w-2 rounded-full bg-ink-950" /> : null}
                  </span>
                  <span className="font-semibold">{option.label}</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Native Android status-bar color, browser theme-color, and CSS color-scheme update immediately without reloading the current screen.
        </p>
      </div>


      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('settings.accentColor')}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t('settings.accentColorHelp')}</p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-mint/30 bg-mint/10 px-3 py-2">
            <span
              aria-hidden="true"
              className="h-8 w-8 rounded-full border border-white/20 shadow-glow"
              style={{ backgroundColor: selectedAccentColor }}
            />
            <span className="text-xs font-semibold text-mint">{t('settings.currentAccentColor')} · {selectedAccentColor}</span>
          </div>
        </div>

        <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="font-semibold text-white">{t('settings.customAccentColor')}</span>
          <input
            aria-label={t('settings.customAccentColor')}
            className="qs-accent-color-input h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1"
            onChange={(event) => selectAccentColor(event.target.value)}
            type="color"
            value={selectedAccentColor}
          />
        </label>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('settings.recommendedAccents')}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {accentColorPresets.map((preset) => {
              const isSelected = selectedAccentColor === preset.color && (preset.color !== defaultAccentColor || isDefaultAccentColor);

              return (
                <button
                  aria-pressed={isSelected}
                  className={`qs-accent-swatch grid min-h-11 min-w-11 place-items-center rounded-md border p-1 transition ${
                    isSelected ? 'border-mint/60 shadow-glow' : 'border-skyglass/20 hover:border-mint/45 hover:shadow-glow'
                  }`}
                  key={preset.color}
                  onClick={() => selectAccentColor(preset.color)}
                  title={preset.label}
                  type="button"
                >
                  <span className="sr-only">{preset.label}</span>
                  <span className="h-8 w-8 rounded-full border border-white/25" style={{ backgroundColor: preset.color }} />
                </button>
              );
            })}
            <button
              className="min-h-11 rounded-md border border-skyglass/20 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/45 hover:bg-mint/10 hover:text-white"
              onClick={() => onAccentColorChange(null)}
              type="button"
            >
              {t('settings.resetAccentColor')}
            </button>
          </div>
        </div>
      </div>


      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('settings.language')}</span>
          <select
            className="mt-3 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
            value={language}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs leading-5 text-slate-500">{t('settings.languageHelp')}</span>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('settings.themeChecklist')}</div>
        <ul className="mt-3 grid gap-2 text-sm text-slate-300">
          {themeCoverageChecklist.map((item) => (
            <li className="flex gap-2" key={item}>
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-mint/30 bg-mint/10 text-xs font-bold text-mint">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {runtimeEnvironment.isAndroid ? (
        <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <span className="block font-semibold text-white">{t('settings.androidIntegration')}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            QuestShelf respects Android light/dark mode when Follow Device is selected and refreshes system chrome after resume.
          </span>
        </div>
      ) : null}

      <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <input
          checked={isLandscapeLockEnabled}
          className="mt-1 h-5 w-5 accent-mint"
          onChange={(event) => onLandscapeLockChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-white">{t('settings.preferLandscape')}</span>
        </span>
      </label>

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <label className="block">
          <span className="block font-semibold text-white">{t('settings.controllerLayout')}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{t('settings.controllerLayoutHelp')}</span>
          <select
            className="mt-3 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            value={controllerLayoutPreference}
            onChange={(event) => onControllerLayoutChange(event.target.value as ControllerLayoutPreference)}
          >
            <option value="auto">{t('settings.controllerAuto')}</option>
            <option value="xbox">Xbox</option>
            <option value="nintendo">{t('settings.controllerNintendo')}</option>
          </select>
        </label>
      </div>

      <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <input
          checked={isControllerDebugEnabled}
          className="mt-1 h-5 w-5 accent-mint"
          onChange={(event) => onControllerDebugChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-white">{t('settings.controllerDebug')}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">{t('settings.controllerDebugHelp')}</span>
        </span>
      </label>
    </section>
  );
}

function AboutSettingsPanel({ runtimeEnvironment }: { runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment> }) {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <h2 className="text-xl font-semibold text-white">{t('settings.about')}</h2>
      <p className="mt-2 text-sm text-slate-400">
        Version 0.1.0 · {runtimeEnvironment.isNative ? 'Native' : 'Web'} · {runtimeEnvironment.platform}
      </p>
      <a
        className="mt-4 inline-flex h-10 items-center rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
        href="https://github.com/Loopak/QuestShelf"
        target="_blank"
        rel="noreferrer"
      >
        GitHub Repository
      </a>
    </section>
  );
}

function OnboardingSettingsPanel({
  completedCount,
  isComplete,
  onOpenOnboarding,
}: {
  completedCount: number;
  isComplete: boolean;
  onOpenOnboarding: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{isComplete ? t('settings.setupComplete') : t('settings.setupAssistant')}</h2>
        </div>

        <button
          className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
          onClick={onOpenOnboarding}
          type="button"
        >
          {t('settings.reopenSetup')}
        </button>
      </div>
    </section>
  );
}

function AppStartupScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-4 text-slate-100">
      <div className="qs-glass w-full max-w-md rounded-lg border p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <QuestShelfLogo className="h-12 w-12 rounded-lg border border-mint/30" fallbackClassName="text-sm" />
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">QuestShelf</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">{createTranslator(loadLanguagePreference())('common.loadingLibrary')}</h1>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-full animate-pulse rounded bg-white/10" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </main>
  );
}

function getNavDescription(activeNavItem: NavItem) {
  if (activeNavItem === 'Settings') {
    return 'Settings are grouped for handheld use.';
  }

  if (activeNavItem === 'Metadata') {
    return 'Metadata runs only when you start it.';
  }

  if (activeNavItem === 'Wishlist') {
    return 'Wishlist items are separate from owned library games.';
  }

  if (activeNavItem === 'Recommendation') {
    return 'Local picks based on your library.';
  }

  if (activeNavItem === 'Queue') {
    return 'Platforms is the focused plan for active systems, currently playing games, and platform backlogs.';
  }

  if (activeNavItem === 'Review Mode') {
    return 'Quest Queue helps quickly process imported games into Platforms plans, wishlist picks, status updates, or ignores.';
  }

  if (activeNavItem === 'Stats') {
    return 'Local overview of backlog, progress, and playtime.';
  }

  return 'Local library and wishlist data stays on this device.';
}

function getVisibleNavItems(navigationVisibility: NavigationVisibilityPreferences): TopNavItem[] {
  return navItems.filter((item) => isNavigationItemVisible(item, navigationVisibility));
}

function isNavigationItemVisible(item: TopNavItem, navigationVisibility: NavigationVisibilityPreferences) {
  if (alwaysVisibleNavItems.includes(item as (typeof alwaysVisibleNavItems)[number])) {
    return true;
  }

  return navigationVisibility[item as ConfigurableNavigationItem] ?? true;
}

function isTopNavItem(item: NavItem): item is TopNavItem {
  return navItems.includes(item as TopNavItem);
}

function touchGameRecord(game: Game): Game {
  return {
    ...game,
    updatedAt: new Date().toISOString(),
  };
}

function getRetroDuplicateKey(game: Game) {
  if (game.externalSource !== 'retro-rom') {
    return null;
  }

  const path = (game.romPath ?? game.romUri ?? '').trim().toLowerCase();
  if (path) {
    return `path:${path}`;
  }

  const extension = game.romExtension?.trim().toLowerCase();
  if (!extension) {
    return null;
  }

  return `fallback:${game.platform}:${game.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${extension}`;
}

function appendReviewNote(existingNotes: string, note: string) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const reviewNote = `[Quest Queue ${timestamp}] ${note}`;

  return existingNotes.trim() ? `${existingNotes.trim()}\n\n${reviewNote}` : reviewNote;
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const { t } = useI18n();

  return (
    <label className="block">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {translateOption(option, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function filterGames(games: Game[], filters: CollectionFilters) {
  const normalizedSearch = filters.searchTerm.trim().toLowerCase();

  return games
    .filter((game) => {
      const matchesTitle = game.title.toLowerCase().includes(normalizedSearch);
      const matchesPlatform = filters.platform === allOption || game.platform === filters.platform;
      const matchesStatus = filters.status === allOption || game.status === filters.status;
      const matchesTag = filters.tag === allOption || game.tags.includes(filters.tag);
      const matchesSource = matchesSourceFilter(game, filters.source);
      const matchesEnrichment = matchesEnrichmentFilter(game, filters.enrichment);
      const matchesAchievement = matchesAchievementFilter(game, filters.achievement);
      const matchesQuickFilters = filters.quickFilters.every((quickFilter) => matchesQuickFilter(game, quickFilter));

      return (
        matchesTitle &&
        matchesPlatform &&
        matchesStatus &&
        matchesTag &&
        matchesSource &&
        matchesEnrichment &&
        matchesAchievement &&
        matchesQuickFilters
      );
    })
    .sort((firstGame, secondGame) => compareGames(firstGame, secondGame, filters.sortBy));
}


function mergeSteamAchievementUpdates(currentGames: Game[], syncedGames: Game[], targetGameIds: Set<string>) {
  const syncedGamesById = new Map(syncedGames.map((game) => [game.id, game]));

  return currentGames.map((game) => {
    if (!targetGameIds.has(game.id)) {
      return game;
    }

    const syncedGame = syncedGamesById.get(game.id);

    if (!syncedGame || typeof syncedGame.steamAchievementsTotal !== 'number' || syncedGame.steamAchievementsTotal <= 0) {
      return game;
    }

    return {
      ...game,
      steamAchievementsTotal: syncedGame.steamAchievementsTotal,
      steamAchievementsUnlocked: syncedGame.steamAchievementsUnlocked,
      steamAchievementsPercent: syncedGame.steamAchievementsPercent,
      steamLastAchievementUnlockTime: syncedGame.steamLastAchievementUnlockTime,
      updatedAt: syncedGame.updatedAt,
    };
  });
}

function formatSteamAchievementSyncSummary(summary: SteamAchievementSyncSummary) {
  const parts = [
    `${summary.updatedCount} updated`,
    `${summary.unchangedCount} unchanged`,
    `${summary.noAchievementDataCount} no achievements`,
    `${summary.failedCount} failed`,
    `${summary.skippedNonSteamCount} non-Steam skipped`,
  ];

  return `Steam achievement sync complete: ${parts.join(' · ')}`;
}

function formatBulkSummary(summary: BulkActionSummary) {
  const parts = [
    summary.updatedCount ? `${summary.updatedCount} updated` : null,
    summary.removedCount ? `${summary.removedCount} removed` : null,
    summary.ignoredCount ? `${summary.ignoredCount} ignored` : null,
    summary.failedCount ? `${summary.failedCount} failed` : null,
    summary.noAchievementDataCount ? `${summary.noAchievementDataCount} no achievements` : null,
    summary.skippedNonSteamCount ? `${summary.skippedNonSteamCount} non-Steam skipped` : null,
    summary.wishlistedCount ? `${summary.wishlistedCount} sent to Wishlist` : null,
    typeof summary.skippedCount === 'number' ? `${summary.skippedCount} skipped` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' - ') : 'Bulk action complete';
}

function mergeSteamWishlistSync(existingGame: Game, syncedGame: Game, syncedAt: string): Game {
  const shouldUseSyncedArtwork = isMissingOrGeneratedCover(existingGame.coverImage) && syncedGame.coverImage;

  return {
    ...existingGame,
    title: existingGame.title || syncedGame.title,
    platform: existingGame.platform || syncedGame.platform,
    artworkSource: shouldUseSyncedArtwork ? syncedGame.artworkSource : existingGame.artworkSource,
    artworkUpdatedAt: shouldUseSyncedArtwork ? syncedAt : existingGame.artworkUpdatedAt,
    coverImage: shouldUseSyncedArtwork ? syncedGame.coverImage : existingGame.coverImage,
    steamAppId: existingGame.steamAppId ?? syncedGame.steamAppId,
    externalSource: existingGame.externalSource ?? syncedGame.externalSource,
    externalUrl: syncedGame.externalUrl,
    storeUrl: syncedGame.storeUrl,
    releaseDate: syncedGame.releaseDate ?? existingGame.releaseDate,
    steamPriceInfo: syncedGame.steamPriceInfo,
    steamDiscountInfo: syncedGame.steamDiscountInfo,
    steamReviewInfo: syncedGame.steamReviewInfo,
    wishlistImportedAt: existingGame.wishlistImportedAt ?? syncedAt,
    wishlistSyncedAt: syncedAt,
  };
}

function matchesSourceFilter(game: Game, source: SourceFilter) {
  if (source === 'All') {
    return true;
  }

  if (source === 'Steam') {
    return game.externalSource === 'steam' || game.externalSource === 'steam-wishlist' || typeof game.steamAppId === 'number';
  }

  if (source === 'Manual') {
    return game.externalSource === 'manual';
  }

  if (source === 'Wishlist') {
    return game.collectionType === 'wishlist';
  }

  return isRetroOrFutureReady(game);
}

function matchesEnrichmentFilter(game: Game, enrichment: EnrichmentFilter) {
  if (enrichment === 'All') {
    return true;
  }

  if (enrichment === 'Enriched') {
    return game.metadataSource === 'rawg';
  }

  if (enrichment === 'Manual metadata') {
    return Boolean(game.metadataManualManagedAt);
  }

  return isMissingRawgMetadata(game);
}


function matchesAchievementFilter(game: Game, achievement: AchievementFilter) {
  if (achievement === 'All') {
    return true;
  }

  const hasSummary = hasSteamAchievementSummary(game);
  const percent = hasSummary ? game.steamAchievementsPercent ?? 0 : 0;

  if (achievement === 'Has achievements') {
    return hasSummary;
  }

  if (achievement === 'No achievements synced') {
    return !hasSummary;
  }

  if (achievement === 'Nearly completed') {
    return hasSummary && percent >= 80 && percent < 100;
  }

  if (achievement === 'Completed') {
    return hasSummary && percent >= 100;
  }

  return hasSummary && percent > 0 && percent < 100;
}

function matchesQuickFilter(game: Game, quickFilter: QuickFilter) {
  if (quickFilter === 'Playing Now') {
    return game.status === 'Playing';
  }

  if (quickFilter === 'Paused') {
    return game.status === 'Paused';
  }

  if (quickFilter === 'Queue / Want to play') {
    return game.status === 'Want to play';
  }

  if (quickFilter === 'Missing info') {
    return isMissingRawgMetadata(game);
  }

  return game.playtimeHours > 0;
}

function compareGames(firstGame: Game, secondGame: Game, sortBy: LibrarySortOption) {
  if (sortBy === 'Recently played') {
    return compareDateDesc(firstGame.lastPlayedAt, secondGame.lastPlayedAt) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Most playtime') {
    return secondGame.playtimeHours - firstGame.playtimeHours || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Least playtime') {
    return firstGame.playtimeHours - secondGame.playtimeHours || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Recently imported') {
    return compareDateDesc(firstGame.importedAt, secondGame.importedAt) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Missing info first') {
    return Number(isMissingRawgMetadata(secondGame)) - Number(isMissingRawgMetadata(firstGame)) || compareTitle(firstGame, secondGame);
  }

  if (sortBy === 'Status') {
    return (
      gameStatuses.indexOf(firstGame.status) - gameStatuses.indexOf(secondGame.status) ||
      compareTitle(firstGame, secondGame)
    );
  }

  if (sortBy === 'Achievement completion %') {
    return getAchievementSortValue(secondGame) - getAchievementSortValue(firstGame) || compareTitle(firstGame, secondGame);
  }

  return compareTitle(firstGame, secondGame);
}

function getAchievementSortValue(game: Game) {
  return hasSteamAchievementSummary(game) ? game.steamAchievementsPercent ?? 0 : -1;
}

function compareTitle(firstGame: Game, secondGame: Game) {
  return firstGame.title.localeCompare(secondGame.title, undefined, { sensitivity: 'base' });
}

function compareDateDesc(firstDate: string | null | undefined, secondDate: string | null | undefined) {
  return getDateTime(secondDate) - getDateTime(firstDate);
}

function getDateTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isMissingRawgMetadata(game: Game) {
  return game.metadataSource !== 'rawg' && !game.metadataManualManagedAt;
}

function isRetroOrFutureReady(game: Game) {
  const retroPlatforms = new Set(['PSP', 'PS2', 'GBA', 'SNES', 'Other']);
  const planningTags = new Set(['retro', 'emulated', 'emulation', 'physical', 'future', 'future-ready']);

  return retroPlatforms.has(game.platform) || game.tags.some((tag) => planningTags.has(tag.toLowerCase()));
}

function isCollectionFiltered(filters: CollectionFilters) {
  return getActiveFilterCount(filters) > 0;
}

function getActiveFilterCount(filters: CollectionFilters) {
  return [
    filters.achievement !== allOption,
    filters.enrichment !== allOption,
    filters.platform !== allOption,
    filters.quickFilters.length > 0,
    filters.searchTerm.trim().length > 0,
    filters.source !== allOption,
    filters.status !== allOption,
    filters.tag !== allOption,
    filters.sortBy !== initialCollectionFilters.sortBy,
  ].filter(Boolean).length;
}

function getActiveAdvancedFilterCount(filters: CollectionFilters) {
  return [
    filters.achievement !== allOption,
    filters.enrichment !== allOption,
    filters.quickFilters.length > 0,
    filters.source !== allOption,
    filters.tag !== allOption,
    filters.sortBy !== initialCollectionFilters.sortBy,
  ].filter(Boolean).length;
}

function loadCollectionFilters(storageKey: string): CollectionFilters {
  if (typeof window === 'undefined') {
    return initialCollectionFilters;
  }

  try {
    const storedFilters = window.localStorage.getItem(storageKey);

    if (!storedFilters) {
      return initialCollectionFilters;
    }

    return normalizeCollectionFilters(JSON.parse(storedFilters));
  } catch {
    return initialCollectionFilters;
  }
}

function saveCollectionFilters(storageKey: string, filters: CollectionFilters) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // Filter persistence is nice to have; the library itself still works without it.
  }
}

function getCollectionViewModeKey(collectionType: GameCollectionType) {
  return `${collectionViewModeStorageKey}.${collectionType}`;
}

function loadCollectionViewMode(collectionType: GameCollectionType): CollectionViewMode {
  if (typeof window === 'undefined') {
    return 'Grid View';
  }

  try {
    const storedViewMode = window.localStorage.getItem(getCollectionViewModeKey(collectionType));

    return isCollectionViewMode(storedViewMode) ? storedViewMode : 'Grid View';
  } catch {
    return 'Grid View';
  }
}

function saveCollectionViewMode(collectionType: GameCollectionType, viewMode: CollectionViewMode) {
  try {
    window.localStorage.setItem(getCollectionViewModeKey(collectionType), viewMode);
  } catch {
    // View mode persistence is optional; browsing still works without it.
  }
}

function isCollectionViewMode(value: unknown): value is CollectionViewMode {
  return collectionViewModes.some((viewMode) => viewMode === value);
}

function loadSettingsCategory(): SettingsCategory {
  if (typeof window === 'undefined') {
    return 'Integrations';
  }

  try {
    const storedCategory = window.localStorage.getItem(settingsCategoryStorageKey);

    if (storedCategory === 'Data') {
      return 'Data & Backup';
    }

    if (storedCategory === 'Queue Platforms') {
      return 'Platforms';
    }

    return isOption(storedCategory, settingsCategories) ? storedCategory : 'Integrations';
  } catch {
    return 'Integrations';
  }
}

function saveSettingsCategory(category: SettingsCategory) {
  try {
    window.localStorage.setItem(settingsCategoryStorageKey, category);
  } catch {
    // Settings navigation should stay usable even when preference persistence is unavailable.
  }
}

function normalizeCollectionFilters(value: unknown): CollectionFilters {
  if (!value || typeof value !== 'object') {
    return initialCollectionFilters;
  }

  const filters = value as Partial<CollectionFilters>;

  return {
    achievement: isOption(filters.achievement, achievementFilterOptions) ? filters.achievement : allOption,
    enrichment: isOption(filters.enrichment, enrichmentFilterOptions) ? filters.enrichment : allOption,
    platform: typeof filters.platform === 'string' ? filters.platform : allOption,
    quickFilters: Array.isArray(filters.quickFilters)
      ? filters.quickFilters.filter((quickFilter): quickFilter is QuickFilter =>
          isOption(quickFilter, quickFilterOptions),
        )
      : [],
    searchTerm: typeof filters.searchTerm === 'string' ? filters.searchTerm : '',
    sortBy: isOption(filters.sortBy, librarySortOptions) ? filters.sortBy : 'Title A-Z',
    source: isOption(filters.source, sourceFilterOptions) ? filters.source : allOption,
    status: isOption(filters.status, [allOption, ...gameStatuses] as const) ? filters.status : allOption,
    tag: typeof filters.tag === 'string' ? filters.tag : allOption,
  };
}

function isOption<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

function createManualGameId(title: string, existingGameIds: Set<string>) {
  const baseId =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'manual-game';
  let id = `manual-${baseId}`;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `manual-${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function createCollectionCopyId(game: Game, collectionType: GameCollectionType, existingGameIds: Set<string>) {
  const baseId = `${collectionType}-${game.id.replace(/^(library|wishlist)-/, '')}`;
  let id = baseId;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

type PlaceholderPanelProps = {
  title: string;
};

function PlaceholderPanel({ title }: PlaceholderPanelProps) {
  return (
    <section className="qs-glass grid min-w-0 place-items-center rounded-lg border p-8 text-center lg:h-[calc(100vh-116px)]">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          This section is intentionally waiting for a later foundation pass.
        </p>
      </div>
    </section>
  );
}

export default App;
