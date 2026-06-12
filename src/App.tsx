import { Icon } from './components/Icon';
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
import { HltbSettingsPanel } from './components/HltbSettingsPanel';
import { HomePanel } from './components/HomePanel';
import { MetadataEnrichmentPanel } from './components/MetadataEnrichmentPanel';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { QueuePanel, type PlayingGameAction } from './components/QueuePanel';
import { IsThereAnyDealSettingsPanel } from './components/IsThereAnyDealSettingsPanel';
import { RawgSettingsPanel } from './components/RawgSettingsPanel';
import { RecommendationPanel } from './components/RecommendationPanel';
import { RetroImportPanel } from './components/RetroImportPanel';
import { ReviewModePanel, type ReviewModeAction } from './components/ReviewModePanel';
import { StatsPanel } from './components/StatsPanel';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { AboutSettingsPanel } from './components/settings/AboutSettingsPanel';
import { AppearanceSettingsPanel } from './components/settings/AppearanceSettingsPanel';
import { DemoDataPanel } from './components/settings/LibrarySettingsPanel';
import { NavigationVisibilitySettingsPanel } from './components/settings/NavigationVisibilitySettingsPanel';
import { QueuePlatformsSettingsPanel } from './components/settings/PlatformsSettingsPanel';
import { SteamWishlistHtmlImportModal, SteamWishlistSyncNotice, WishlistSettingsPanel } from './components/settings/WishlistSettingsPanel';
import {
  getNavDescription,
  getVisibleNavItems,
  isNavigationItemVisible,
  isTopNavItem,
  navItemLabelKeys,
  type NavItem,
  type TopNavItem,
} from './config/navigation';
import { getSettingsCategoryMeta, settingsCategories, settingsCategoryStorageKey, type SettingsCategory } from './config/settings';
import {
  achievementFilterOptions,
  allOption,
  collectionInitialRenderCount,
  collectionLoadAheadMargin,
  collectionRenderBatchSize,
  collectionViewModeStorageKey,
  collectionViewModes,
  enrichmentFilterOptions,
  initialCollectionFilters,
  libraryFiltersStorageKey,
  librarySortOptions,
  quickFilterOptions,
  sourceFilterOptions,
  wishlistFiltersStorageKey,
  type AchievementFilter,
  type CollectionFilters,
  type CollectionViewMode,
  type EnrichmentFilter,
  type LibrarySortOption,
  type QuickFilter,
  type SourceFilter,
} from './config/collection';
import {
  initialItadDealSyncState,
  initialSteamAchievementSyncState,
  initialSteamPlaytimeRefreshState,
  initialSteamWishlistSyncState,
  type ItadDealSyncState,
} from './config/syncStates';
import {
  didSteamAchievementSyncSucceed,
  didSteamPlaytimeSyncSucceed,
  formatBulkSummary,
  formatHltbSyncSummary,
  formatSteamAchievementSyncSummary,
  formatSteamDataPartialDetails,
  formatSteamWishlistHtmlImportSummary,
  formatSteamWishlistSyncSummary,
  type BulkActionSummary,
  type SteamWishlistHtmlImportSummary,
} from './utils/summaryFormatters';
import {
  filterGames,
  getActiveAdvancedFilterCount,
  getActiveFilterCount,
  isCollectionFiltered,
  isOption,
  normalizeCollectionFilters,
  parseTagInput,
} from './utils/gameFilters';
import { getRuntimeEnvironment } from './lib/capacitorEnvironment';
import { I18nProvider, createTranslator, useI18n, translateOption, translateSettingsCategory, type AppLanguage } from './i18n';
import { loadLanguagePreference, saveLanguagePreference } from './lib/languagePreference';
import {
  formatPersonalizedQuestShelfTitle,
  getPersonalizedQuestShelfTitle,
  loadAppPersonalizationSettings,
  sanitizeLibraryOwnerNickname,
  saveAppPersonalizationSettings,
} from './lib/appPersonalization';
import {
  loadNavigationVisibilityPreferences,
  saveNavigationVisibilityPreferences,
  type NavigationVisibilityPreferences,
} from './lib/navigationVisibilityPreferences';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from './lib/androidGamepadShortcuts';
import { getMockGames, isMockGame, loadGames, removeMockGames, saveGames } from './lib/gameStorage';
import { isMissingOrGeneratedCover } from './lib/gameCoverImages';
import { mergeRawgMetadataIntoGame } from './lib/metadataMerge';
import { refreshRawgMetadataForGame } from './lib/rawgMetadataEnrichment';
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
  getPlatformTag,
  getActiveQueuePlatforms,
  getQueuePlatforms,
  getQueueSummary,
  loadPlatformQueueState,
  moveQueueEntry,
  moveQueueEntryToPlatform,
  removeGameFromPlatformQueue,
  savePlatformQueueState,
  updatePlatformQueueSetting,
  type PlatformQueueState,
} from './lib/platformQueueStorage';
import { loadIsThereAnyDealSettings } from './lib/isThereAnyDealSettingsStorage';
import { loadRawgSettings } from './lib/rawgSettingsStorage';
import { getSteamProfileDisplayName, loadSteamSettings } from './lib/steamSettingsStorage';
import { IsThereAnyDealError, syncItadDealsForWishlistGames } from './lib/isThereAnyDeal';
import { syncHltbForGames, type HltbSyncSummary } from './lib/hltb';
import { isSteamAchievementSyncableGame, syncSteamAchievementsForGames } from './lib/steamAchievementsSync';
import { isRefreshableSteamGame, refreshSteamPlaytimeForGames } from './lib/steamPlaytimeRefresh';
import type { ParsedSteamWishlistImportItem } from './lib/steamWishlistHtmlImport';
import {
  formatGameToastMessage,
  getBulkWishlistToastMessage,
  getDismissAction,
  getMoveQueueToastMessage,
  getOpenQueueAction,
  getOpenSteamSettingsAction,
  getRemoveQueueToastMessage,
  getToastDedupeKey,
  getUndoAction,
  getViewGameAction,
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
import {
  applyAccentColorPreference,
  applyAppTemplatePreference,
  applyThemePreference,
  getAccentColorThemeVariables,
  getAppTemplateClassName,
  loadAccentColorPreference,
  loadAppTemplatePreference,
  loadSecondaryAccentColorPreference,
  loadThemePreference,
  normalizeThemePreferenceForTemplate,
  saveAccentColorPreference,
  saveAppTemplatePreference,
  saveSecondaryAccentColorPreference,
  saveThemePreference,
  watchSystemTheme,
  type AccentColorPreference,
  type AppTemplatePreference,
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
import { RawgApiError } from './services/rawgApi';
import type { Game, GameCollectionType, GamePlatform, GameStatus, WishlistPriority } from './types/game';
import { gamePlatforms, gameStatuses, wishlistPriorities } from './types/game';
import type { RawgMetadata } from './types/rawg';
import type { SteamAchievementSyncState, SteamAchievementSyncSummary, SteamPlaytimeRefreshState, SteamPlaytimeRefreshSummary, SteamWishlistItem, SteamWishlistSyncState, SteamWishlistSyncSummary } from './types/steam';

const questShelfIcon = '/icons/questshelf-icon.png';

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

type MetadataSelectionRequest = {
  ids: string[];
  requestId: number;
};

type MetadataRefreshMode = 'metadata' | 'artwork';

type MetadataRefreshResult = 'updated' | 'no-match' | 'error';

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
  const [appTemplatePreference, setAppTemplatePreferenceState] = useState<AppTemplatePreference>(() => loadAppTemplatePreference());
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
    normalizeThemePreferenceForTemplate(loadThemePreference(), appTemplatePreference),
  );
  const [accentColorPreference, setAccentColorPreference] = useState<AccentColorPreference>(() => loadAccentColorPreference());
  const [secondaryAccentColorPreference, setSecondaryAccentColorPreference] = useState<AccentColorPreference>(() => loadSecondaryAccentColorPreference());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguagePreference());
  const [libraryOwnerNickname, setLibraryOwnerNicknameState] = useState(() => loadAppPersonalizationSettings().libraryOwnerNickname);
  const [steamProfileName, setSteamProfileName] = useState(() => getSteamProfileDisplayName(loadSteamSettings()));
  const [navigationVisibility, setNavigationVisibility] = useState<NavigationVisibilityPreferences>(() =>
    loadNavigationVisibilityPreferences(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyThemePreference(themePreference, appTemplatePreference),
  );
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [controllerLayoutPreference, setControllerLayoutPreference] = useState<ControllerLayoutPreference>(() => loadControllerLayoutPreference());
  const personalizedQuestShelfTitle = useMemo(
    () => getPersonalizedQuestShelfTitle(libraryOwnerNickname, steamProfileName),
    [libraryOwnerNickname, steamProfileName],
  );
  const accentThemeStyle = useMemo(
    () => getAccentColorThemeVariables(accentColorPreference, secondaryAccentColorPreference) as CSSProperties,
    [accentColorPreference, secondaryAccentColorPreference],
  );
  function setThemePreference(preference: ThemePreference) {
    setThemePreferenceState(normalizeThemePreferenceForTemplate(preference, appTemplatePreference));
  }

  function setAppTemplatePreference(preference: AppTemplatePreference) {
    setAppTemplatePreferenceState(preference);
    setThemePreferenceState((currentThemePreference) => normalizeThemePreferenceForTemplate(currentThemePreference, preference));
  }

  useEffect(() => {
    document.title = personalizedQuestShelfTitle;
  }, [personalizedQuestShelfTitle]);

  function setLibraryOwnerNickname(value: string) {
    const libraryOwnerNickname = sanitizeLibraryOwnerNickname(value);
    setLibraryOwnerNicknameState(libraryOwnerNickname);
    saveAppPersonalizationSettings({ libraryOwnerNickname });
  }

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
  const [itadDealSyncState, setItadDealSyncState] = useState<ItadDealSyncState>(initialItadDealSyncState);
  const [isHltbSyncing, setIsHltbSyncing] = useState(false);
  const [refreshingMetadataGameIds, setRefreshingMetadataGameIds] = useState<Set<string>>(new Set());
  const [pendingUndoActions, setPendingUndoActions] = useState<PendingUndoAction[]>(() => loadPendingUndoActions());
  const pendingUndoActionsRef = useRef<PendingUndoAction[]>(pendingUndoActions);
  const isAppMountedRef = useRef(true);
  const t = useMemo(() => createTranslator(language), [language]);
  const visibleNavItems = useMemo(() => getVisibleNavItems(navigationVisibility), [navigationVisibility]);

  useEffect(() => {
    isAppMountedRef.current = true;

    return () => {
      isAppMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    debugAchievementSyncDiagnostic('render updated', {
      status: steamAchievementSyncState.status,
      syncedAchievementGameCount: games.filter(hasSteamAchievementSummary).length,
    });
  }, [games, steamAchievementSyncState]);

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
    const normalizedThemePreference = normalizeThemePreferenceForTemplate(themePreference, appTemplatePreference);

    if (normalizedThemePreference !== themePreference) {
      setThemePreferenceState(normalizedThemePreference);
    }

    setResolvedTheme(applyThemePreference(normalizedThemePreference, appTemplatePreference));
    saveThemePreference(normalizedThemePreference);

    if (normalizedThemePreference !== 'system') {
      return undefined;
    }

    return watchSystemTheme(() => {
      setResolvedTheme(applyThemePreference('system', appTemplatePreference));
    });
  }, [appTemplatePreference, themePreference]);


  useEffect(() => {
    applyAppTemplatePreference(appTemplatePreference);
    saveAppTemplatePreference(appTemplatePreference);
  }, [appTemplatePreference]);

  useEffect(() => {
    applyAccentColorPreference(accentColorPreference, secondaryAccentColorPreference);
    saveAccentColorPreference(accentColorPreference);
    saveSecondaryAccentColorPreference(secondaryAccentColorPreference);
  }, [accentColorPreference, secondaryAccentColorPreference]);

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
      details: notification.details,
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
      details: notification.details,
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


  function getLocalizedStatusToastMessage(game: Game, status: GameStatus) {
    if (status === 'Playing') {
      return formatGameToastMessage(t('toast.markedPlayingNow'), game);
    }

    if (status === 'Finished') {
      return formatGameToastMessage(t('toast.markedFinished'), game);
    }

    if (status === 'Dropped') {
      return formatGameToastMessage(t('toast.dropped'), game);
    }

    return `${formatGameToastMessage('{game}', game)} marked as ${status}`;
  }

  function updateGameStatus(gameId: string, status: GameStatus) {
    const game = games.find((currentGame) => currentGame.id === gameId);
    if (game && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(getLocalizedStatusToastMessage(game, status), {
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
    if (updatedGames.length > 0 && (status === 'Playing' || status === 'Finished' || status === 'Dropped')) {
      addUndoAction(updatedGames.length === 1 ? getLocalizedStatusToastMessage(updatedGames[0], status) : `${updatedGames.length} games marked as ${status}`, {
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
    setSteamWishlistSyncState({
      status: 'loading',
      message: t('collection.syncingSteamWishlist'),
      summary: null,
    });

    try {
      const settings = loadSteamSettings();
      const wishlistItems = await getSteamWishlist(settings);
      const summary = importSteamWishlistItems(wishlistItems);
      const message = formatSteamWishlistSyncSummary(summary, t);

      setSteamWishlistSyncState({
        status: 'success',
        message,
        summary,
      });
      addToastNotification({
        actions: [getDismissAction()],
        category: summary.failedCount > 0 ? 'warning' : 'success',
        dedupeKey: 'steam-wishlist-sync:complete',
        message,
      });
    } catch (error) {
      const isCredentialError = error instanceof SteamWishlistError && ['missing-profile', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamWishlistError
          ? error.message
          : 'Steam wishlist sync failed. Check profile privacy, Steam profile settings, and connection.';

      setSteamWishlistSyncState({
        status: 'error',
        message,
        summary: null,
      });
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-wishlist-sync:settings' : 'steam-wishlist-sync:error',
        message,
      });
    }
  }

  async function syncSteamAchievements(
    gameIds?: string[],
    options: { completionToastMessage?: (summary: SteamAchievementSyncSummary) => string; emptyToastMessage?: string; force?: boolean; showToast?: boolean } = {},
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
        progress: { completed: 0, total },
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

    setSteamAchievementSyncState({
      status: 'loading',
      message: total > 50 ? t('collection.syncingSteamAchievementsLong') : t('collection.syncingSteamAchievements'),
      progress: { completed: 0, total },
      summary: null,
    });

    let terminalState: SteamAchievementSyncState | null = null;
    let summaryToReturn: SteamAchievementSyncSummary | null = null;

    try {
      const settings = loadSteamSettings();
      const syncedAt = new Date().toISOString();
      const targetGameIds = new Set(targetGames.map((game) => game.id));
      const result = await withSteamAchievementSyncWatchdog(
        syncSteamAchievementsForGames(
          games,
          targetGameIds,
          settings,
          syncedAt,
          (progress) => {
            if (!isAppMountedRef.current) {
              return;
            }

            setSteamAchievementSyncState((currentState) =>
              currentState.status === 'loading'
                ? {
                    ...currentState,
                    progress,
                    summary: null,
                  }
                : currentState,
            );
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
            setSteamAchievementSyncState((currentState) =>
              currentState.status === 'loading'
                ? {
                    ...currentState,
                    progress: batchResult.progress,
                    summary: null,
                  }
                : currentState,
            );
          },
          options.force,
        ),
        total,
      );

      summaryToReturn = result.summary;

      debugAchievementSyncDiagnostic('helper resolved', { summary: result.summary });
      debugAchievementSyncDiagnostic('updated games count', {
        updatedGamesCount: result.games.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length,
      });

      if (!isAppMountedRef.current) {
        return summaryToReturn;
      }

      setGames((currentGames) => {
        const mergedGames = mergeSteamAchievementUpdates(currentGames, result.games, targetGameIds);
        debugAchievementSyncDiagnostic('state update dispatched', {
          updatedGamesCount: mergedGames.filter((game) => targetGameIds.has(game.id) && hasSteamAchievementSummary(game)).length,
        });
        return mergedGames;
      });
      terminalState = {
        status: 'success',
        message: formatSteamAchievementSyncSummary(result.summary),
        progress: { completed: total, total },
        summary: result.summary,
      };

      if (options.showToast) {
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({
          actions: syncableGames[0] ? [getViewGameAction(syncableGames[0].id)] : [getDismissAction()],
          category: hasPartialFailures ? 'warning' : 'success',
          dedupeKey: `steam-achievements:${syncableGames.map((game) => game.id).join(',')}`,
          details: options.completionToastMessage?.(result.summary) ?? formatSteamAchievementSyncSummary(result.summary),
          message: syncableGames.length === 1
            ? formatGameToastMessage(hasPartialFailures ? t('toast.steamAchievementsPartiallySynced') : t('toast.steamAchievementsSynced'), syncableGames[0])
            : hasPartialFailures ? 'Steam achievements partially synced' : 'Steam achievements synced',
        });
      }

      return summaryToReturn;
    } catch (error) {
      const isCredentialError = error instanceof SteamApiError && ['missing-api-key', 'missing-steamid64', 'invalid-steamid64'].includes(error.code);
      const message =
        error instanceof SteamApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Steam achievement sync failed. Check your Steam credentials, profile privacy, and connection.';
      const failedSummary: SteamAchievementSyncSummary = {
        failedCount: total,
        noAchievementDataCount: 0,
        skippedNonSteamCount: targetGames.length - total,
        unchangedCount: 0,
        updatedCount: 0,
      };

      summaryToReturn = failedSummary;

      if (!isAppMountedRef.current) {
        return summaryToReturn;
      }

      terminalState = {
        status: 'error',
        message,
        progress: { completed: total, total },
        summary: failedSummary,
      };
      addToastNotification({
        actions: isCredentialError ? [getOpenSteamSettingsAction()] : [getDismissAction()],
        category: isCredentialError ? 'warning' : 'error',
        dedupeKey: isCredentialError ? 'steam-achievements:credentials' : 'steam-achievements:error',
        details: isCredentialError
          ? 'Add your Steam API key and SteamID64 so QuestShelf can sync achievements. Your Steam profile may also need public game details.'
          : message,
        message: isCredentialError ? 'Steam credentials needed' : 'Steam achievement sync failed',
      });

      return summaryToReturn;
    } finally {
      debugSteamAchievementSyncFinalization('finally reached', {
        total,
        hasTerminalState: terminalState !== null,
        hasSummary: summaryToReturn !== null,
      });

      if (isAppMountedRef.current) {
        debugAchievementSyncDiagnostic('sync state success', {
          status: terminalState?.status ?? 'error',
          hasSummary: summaryToReturn !== null,
        });
        setSteamAchievementSyncState(
          terminalState ?? {
            status: 'error',
            message: 'Steam achievement sync stopped before it could finish. Try again.',
            progress: { completed: total, total },
            summary: summaryToReturn,
          },
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
        progress: { completed: 0, total },
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
        const hasPartialFailures = result.summary.failedCount > 0;
        addToastNotification({
          actions: [getViewGameAction(refreshableGames[0].id)],
          category: hasPartialFailures ? 'warning' : 'success',
          dedupeKey: `steam-playtime-refresh:${refreshableGames[0].id}`,
          details: options.completionToastMessage?.(result.summary) ?? `Updated playtime for ${result.summary.updatedCount} game${result.summary.updatedCount === 1 ? '' : 's'}`,
          message: refreshableGames.length === 1
            ? formatGameToastMessage(hasPartialFailures ? t('toast.steamPlaytimePartiallyRefreshed') : t('toast.steamPlaytimeRefreshed'), refreshableGames[0])
            : hasPartialFailures ? 'Steam playtime partially refreshed' : 'Steam playtime refreshed',
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
        details: isCredentialError
          ? 'Add your Steam API key and SteamID64 so QuestShelf can refresh playtime. Your Steam profile may also need public game details.'
          : message,
        message: isCredentialError ? 'Steam credentials needed' : 'Steam playtime refresh failed',
      });

      return null;
    }
  }


  async function syncSteamDataForGame(game: Game) {
    const playtimeSummary = await refreshSteamPlaytime([game.id], { showToast: false });
    const achievementSummary = await syncSteamAchievements([game.id], { force: true, showToast: false });
    const isFullyUpdated = didSteamPlaytimeSyncSucceed(playtimeSummary) && didSteamAchievementSyncSucceed(achievementSummary);
    const message = formatGameToastMessage(isFullyUpdated ? t('toast.steamDataUpdated') : t('toast.steamDataPartiallyUpdated'), game);
    const details = isFullyUpdated ? undefined : formatSteamDataPartialDetails(playtimeSummary, achievementSummary);

    addToastNotification({
      actions: [getViewGameAction(game.id)],
      category: isFullyUpdated ? 'success' : 'warning',
      dedupeKey: `steam-data:${game.id}`,
      details,
      message,
    });

    return { achievementSummary, playtimeSummary };
  }


  async function syncHltb(gameIds: string[]): Promise<HltbSyncSummary | null> {
    if (isHltbSyncing) {
      return null;
    }

    const targetGames = games.filter((game) => gameIds.includes(game.id));

    if (targetGames.length === 0) {
      const message = t('hltb.noGamesForSync');
      addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-empty', message });
      return null;
    }

    const runningMessage = targetGames.length > 12 ? t('hltb.syncingLong') : t('hltb.syncing');
    setIsHltbSyncing(true);
    addToastNotification({ category: 'info', dedupeKey: 'hltb-sync-start', message: runningMessage });

    try {
      const result = await syncHltbForGames(targetGames, undefined, { force: true });
      const updatedGamesById = new Map(result.games.map((game) => [game.id, game]));

      setGames((currentGames) => currentGames.map((game) => updatedGamesById.get(game.id) ?? game));

      const message = result.summary.unavailableCount > 0 && result.summary.updatedCount === 0 && result.summary.noMatchCount === 0
        ? `${t('hltb.unavailable')} ${formatHltbSyncSummary(result.summary, t)}`
        : formatHltbSyncSummary(result.summary, t);
      addToastNotification({
        category: result.summary.failedCount > 0 ? 'warning' : 'success',
        dedupeKey: 'hltb-sync-complete',
        message,
      });
      return result.summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : t('hltb.syncFailed');
      addToastNotification({ category: 'error', dedupeKey: 'hltb-sync-error', message });
      return null;
    } finally {
      setIsHltbSyncing(false);
    }
  }


  async function syncWishlistDeals(gameIds: string[]) {
    if (itadDealSyncState.status === 'loading') {
      return null;
    }

    const settings = loadIsThereAnyDealSettings();
    const targetGames = games.filter((game) => game.collectionType === 'wishlist' && gameIds.includes(game.id));

    if (targetGames.length === 0) {
      const message = t('itad.noWishlistGamesForSync');
      setItadDealSyncState({ status: 'error', message, summary: null });
      addToastNotification({ category: 'info', dedupeKey: 'itad-deal-sync-empty', message });
      return null;
    }

    const runningMessage = targetGames.length > 12 ? t('itad.syncingDealsLong') : t('itad.syncingDeals');
    setItadDealSyncState({ status: 'loading', message: runningMessage, summary: null });

    try {
      const results = await syncItadDealsForWishlistGames(targetGames, settings.apiKey);
      const syncedAt = new Date().toISOString();
      const summary = results.reduce(
        (currentSummary, result) => ({
          updatedCount: currentSummary.updatedCount + (result.status === 'updated' ? 1 : 0),
          noMatchCount: currentSummary.noMatchCount + (result.status === 'no-match' ? 1 : 0),
          failedCount: currentSummary.failedCount + (result.status === 'failed' ? 1 : 0),
        }),
        { updatedCount: 0, noMatchCount: 0, failedCount: 0 },
      );
      const resultByGameId = new Map(results.map((result) => [result.gameId, result]));

      setGames((currentGames) => currentGames.map((game) => {
        const result = resultByGameId.get(game.id);

        if (!result) {
          return game;
        }

        if (result.status === 'no-match') {
          return {
            ...game,
            itadCurrentBestCurrency: undefined,
            itadCurrentBestPrice: undefined,
            itadCurrentBestShop: undefined,
            itadCurrentBestUrl: undefined,
            itadDiscountPercent: undefined,
            itadHistoricalLowCurrency: undefined,
            itadHistoricalLowPrice: undefined,
            itadIsHistoricalLow: undefined,
            itadLastSyncedAt: syncedAt,
          };
        }

        if (result.status !== 'updated' || !result.match || !result.deal) {
          return { ...game, itadLastSyncedAt: syncedAt };
        }

        return {
          ...game,
          itadId: result.match.id,
          itadPlain: result.match.slug,
          itadSlug: result.match.slug,
          itadMatchConfidence: result.match.confidence,
          itadCurrentBestPrice: result.deal.currentBestPrice,
          itadCurrentBestCurrency: result.deal.currentBestCurrency,
          itadCurrentBestShop: result.deal.currentBestShop,
          itadCurrentBestUrl: result.deal.currentBestUrl,
          itadDiscountPercent: result.deal.discountPercent,
          itadHistoricalLowPrice: result.deal.historicalLowPrice,
          itadHistoricalLowCurrency: result.deal.historicalLowCurrency,
          itadIsHistoricalLow: result.deal.isHistoricalLow,
          itadLastSyncedAt: syncedAt,
        };
      }));

      const message = `${t('itad.syncComplete')}. ${summary.updatedCount} updated · ${summary.noMatchCount} no match · ${summary.failedCount} failed.`;
      setItadDealSyncState({ status: summary.failedCount > 0 ? 'error' : 'success', message, summary });
      addToastNotification({ category: summary.failedCount > 0 ? 'warning' : 'success', dedupeKey: 'itad-deal-sync-complete', message });
      return summary;
    } catch (error) {
      const message = error instanceof IsThereAnyDealError && error.code === 'missing-api-key'
        ? t('itad.missingApiKey')
        : error instanceof Error
          ? error.message
          : 'Deal sync failed.';
      setItadDealSyncState({ status: 'error', message, summary: null });
      addToastNotification({ category: 'error', dedupeKey: 'itad-deal-sync-error', message });
      return null;
    }
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
    const wishlistIndexByTitle = new Map<string, number>();
    const summary: SteamWishlistSyncSummary = {
      addedCount: 0,
      failedCount: 0,
      fetchedCount: wishlistItems.length,
      skippedAlreadyInLibraryCount: 0,
      skippedIgnoredCount: 0,
      unchangedCount: 0,
      updatedCount: 0,
    };

    games.forEach((game, index) => {
      if (game.collectionType !== 'wishlist') {
        return;
      }

      if (typeof game.steamAppId === 'number') {
        wishlistIndexBySteamAppId.set(game.steamAppId, index);
      }

      const normalizedTitle = normalizeGameTitleForWishlistMatch(game.title);

      if (normalizedTitle && !wishlistIndexByTitle.has(normalizedTitle)) {
        wishlistIndexByTitle.set(normalizedTitle, index);
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

      const normalizedTitle = normalizeGameTitleForWishlistMatch(item.name);
      const existingWishlistIndex = wishlistIndexBySteamAppId.get(item.appid) ?? (normalizedTitle ? wishlistIndexByTitle.get(normalizedTitle) : undefined);
      const mappedGame = mapSteamWishlistItemToLocalGame(item, syncedAt);

      if (typeof existingWishlistIndex === 'number') {
        const existingGame = nextGames[existingWishlistIndex];
        const mergedGame = touchGameRecord(mergeSteamWishlistSync(existingGame, mappedGame, syncedAt));
        nextGames[existingWishlistIndex] = mergedGame;
        wishlistIndexBySteamAppId.set(item.appid, existingWishlistIndex);

        if (normalizedTitle) {
          wishlistIndexByTitle.set(normalizedTitle, existingWishlistIndex);
        }

        if (areSteamWishlistSyncedFieldsEqual(existingGame, mergedGame)) {
          summary.unchangedCount += 1;
        } else {
          summary.updatedCount += 1;
        }

        return;
      }

      nextGames.push(touchGameRecord(mappedGame));
      wishlistIndexBySteamAppId.set(item.appid, nextGames.length - 1);

      if (normalizedTitle) {
        wishlistIndexByTitle.set(normalizedTitle, nextGames.length - 1);
      }

      summary.addedCount += 1;
    });

    setGames(nextGames);
    saveGames(nextGames);
    return summary;
  }

  function importSteamWishlistHtmlItems(items: ParsedSteamWishlistImportItem[], inputSkippedCount = 0): SteamWishlistHtmlImportSummary {
    const importedAt = new Date().toISOString();
    const existingWishlistIndexBySteamAppId = new Map<number, number>();

    games.forEach((game, index) => {
      if (game.collectionType === 'wishlist' && typeof game.steamAppId === 'number') {
        existingWishlistIndexBySteamAppId.set(game.steamAppId, index);
      }
    });

    const existingGameIds = new Set(games.map((game) => game.id));
    const nextGames = [...games];
    const summary: SteamWishlistHtmlImportSummary = {
      addedCount: 0,
      existingCount: 0,
      skippedCount: inputSkippedCount,
    };

    items.forEach((item) => {
      if (!item.appid) {
        summary.existingCount += 1;
        console.warn('[Steam Wishlist HTML Import] Skipped parsed item without a Steam app id.', { item });
        return;
      }

      const mappedGame = mapSteamWishlistItemToLocalGame(item, importedAt);
      const existingWishlistIndex = existingWishlistIndexBySteamAppId.get(item.appid);

      if (typeof existingWishlistIndex === 'number') {
        const existingGame = nextGames[existingWishlistIndex];

        if (shouldReplaceSteamWishlistPlaceholderTitle(existingGame, mappedGame)) {
          nextGames[existingWishlistIndex] = touchGameRecord({
            ...existingGame,
            title: mappedGame.title,
            steamAppId: existingGame.steamAppId ?? mappedGame.steamAppId,
            externalSource: existingGame.externalSource ?? mappedGame.externalSource,
            externalUrl: mappedGame.externalUrl,
            storeUrl: mappedGame.storeUrl,
            wishlistImportedAt: existingGame.wishlistImportedAt ?? importedAt,
            wishlistSyncedAt: importedAt,
          });
          console.info('[Steam Wishlist HTML Import] Repaired existing placeholder wishlist title.', {
            appid: item.appid,
            previousTitle: existingGame.title,
            repairedTitle: mappedGame.title,
          });
        } else {
          console.debug('[Steam Wishlist HTML Import] Existing wishlist item kept unchanged.', {
            appid: item.appid,
            existingTitle: existingGame.title,
            importedTitle: mappedGame.title,
          });
        }

        summary.existingCount += 1;
        return;
      }

      let wishlistId = mappedGame.id;
      let suffix = 2;

      while (existingGameIds.has(wishlistId)) {
        wishlistId = `${mappedGame.id}-${suffix}`;
        suffix += 1;
      }

      existingGameIds.add(wishlistId);
      existingWishlistIndexBySteamAppId.set(item.appid, nextGames.length);
      nextGames.push(touchGameRecord({
        ...mappedGame,
        id: wishlistId,
        wishlistSyncedAt: undefined,
      }));
      console.debug('[Steam Wishlist HTML Import] Added wishlist item.', {
        appid: item.appid,
        title: mappedGame.title,
        id: wishlistId,
      });
      summary.addedCount += 1;
    });

    setGames(nextGames);
    saveGames(nextGames);

    const message = formatSteamWishlistHtmlImportSummary(summary, t);
    addToastNotification({
      category: summary.addedCount > 0 ? 'success' : 'info',
      dedupeKey: 'steam-wishlist-html-import',
      message,
    });

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
      addUndoAction(formatGameToastMessage(t('toast.addedToWishlist'), game), {
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
      addUndoAction(targetGames.length === 1 ? formatGameToastMessage(t('toast.addedToWishlist'), targetGames[0]) : getBulkWishlistToastMessage(targetGames.length), {
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

  async function refreshGameMetadataFromActions(game: Game, mode: MetadataRefreshMode = 'metadata'): Promise<MetadataRefreshResult> {
    const targetGame = games.find((currentGame) => currentGame.id === game.id)
      ?? (typeof game.steamAppId === 'number'
        ? games.find((currentGame) => currentGame.steamAppId === game.steamAppId && currentGame.collectionType === game.collectionType)
        : undefined);
    const toastKey = `${mode}-refresh:${game.id}`;
    const isArtworkRefresh = mode === 'artwork';

    if (!targetGame) {
      addToastNotification({
        category: 'error',
        dedupeKey: toastKey,
        message: isArtworkRefresh ? t('artwork.notFoundGame') : 'Could not find that game to refresh metadata.',
      });
      return 'error';
    }

    if (refreshingMetadataGameIds.has(targetGame.id)) {
      return 'error';
    }

    setRefreshingMetadataGameIds((currentGameIds) => new Set(currentGameIds).add(targetGame.id));
    addToastNotification({
      category: 'info',
      dedupeKey: toastKey,
      message: formatGameToastMessage(isArtworkRefresh ? t('toast.searchingArtwork') : t('toast.refreshingMetadata'), targetGame),
    });

    try {
      const result = await refreshRawgMetadataForGame(targetGame);

      if (result.status === 'no-match') {
        addToastNotification({
          category: 'info',
          dedupeKey: toastKey,
          message: formatGameToastMessage(isArtworkRefresh ? t('toast.noArtworkFound') : t('toast.noMetadataFound'), targetGame),
        });
        return 'no-match';
      }

      updateGameMetadata(targetGame.id, result.metadata);
      markOnboardingItemComplete('metadata-enriched');

      const foundArtwork = Boolean(result.metadata.coverImage?.trim() || result.metadata.backgroundImage?.trim());
      addToastNotification({
        category: foundArtwork || !isArtworkRefresh ? 'success' : 'info',
        dedupeKey: toastKey,
        message: formatGameToastMessage(
          isArtworkRefresh
            ? (foundArtwork ? t('toast.artworkUpdated') : t('toast.noArtworkFound'))
            : t('toast.metadataUpdated'),
          targetGame,
        ),
      });

      return foundArtwork || !isArtworkRefresh ? 'updated' : 'no-match';
    } catch (error) {
      const message = error instanceof RawgApiError
        ? error.message
        : 'Metadata refresh failed. Please check your connection and try again.';
      addToastNotification({
        category: error instanceof RawgApiError && error.code === 'missing-api-key' ? 'warning' : 'error',
        dedupeKey: toastKey,
        message,
      });
      return 'error';
    } finally {
      setRefreshingMetadataGameIds((currentGameIds) => {
        const nextGameIds = new Set(currentGameIds);
        nextGameIds.delete(targetGame.id);
        return nextGameIds;
      });
    }
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
    addUndoAction(formatGameToastMessage(t('toast.addedToPlatforms'), game), {
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

    addUndoAction(formatGameToastMessage(t('toast.markedPlayingNow'), game), {
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
      'move-to-backlog': formatGameToastMessage(t('toast.addedToPlatforms'), game),
      finished: formatGameToastMessage(t('toast.markedFinished'), game),
      drop: formatGameToastMessage(t('toast.dropped'), game),
      'remove-from-playing': `${formatGameToastMessage(t('toast.removedFromPlayingNow'), game)} on ${platform}`,
    };

    addUndoAction(actionLabels[action], {
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
      addToastNotification({
        actions: [getDismissAction(), getViewGameAction(game.id)],
        category: 'info',
        dedupeKey: `review-skip:${game.id}`,
        message: formatGameToastMessage(t('toast.skipped'), game),
      });
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
      addUndoAction(formatGameToastMessage(t('toast.ignored'), game), {
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
    if (game && (changes.status === 'Playing' || changes.status === 'Finished' || changes.status === 'Dropped')) {
      addUndoAction(getLocalizedStatusToastMessage(game, changes.status), {
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
    if (!activeQueuePlatforms.includes(platform)) {
      return;
    }

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

        return touchGameRecord({
          ...mergeRawgMetadataIntoGame(game, metadata),
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
    <main className={`qs-app-root min-h-screen bg-ink-950 text-slate-100 ${getAppTemplateClassName(appTemplatePreference)}`} style={accentThemeStyle}>
      <div className="qs-handheld-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 py-2 sm:px-4 lg:px-5">
        <header className={`qs-compact-header qs-glass flex items-center gap-2 rounded-lg border px-2 transition-all duration-300 ${isScrolled ? 'qs-header-stuck py-1' : 'py-1.5'}`}>
          <div className="flex min-w-0 shrink-0 items-center gap-2" aria-label={personalizedQuestShelfTitle}>
            <QuestShelfLogo className="h-7 w-7 rounded-md border border-mint/30" fallbackClassName="text-[9px]" />
            <div className="hidden min-w-0 truncate text-xs font-semibold uppercase tracking-[0.16em] text-mint sm:block">{personalizedQuestShelfTitle}</div>
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
          <PwaStatusBanner appTitle={personalizedQuestShelfTitle} />
        </div>

        <section className="flex-1 py-2">
          {(activeNavItem === 'Library' || activeNavItem === 'Wishlist') && selectedGame ? (
            <GameDetailView
              game={selectedGame}
              onAddToQueue={openBacklogPicker}
              onAddToWishlist={addToWishlist}
              onBack={() => setSelectedGameId(null)}
              onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
              isFindingArtwork={refreshingMetadataGameIds.has(selectedGame.id)}
              onIgnore={removeAndIgnoreSteamGame}
              onSyncSteamData={syncSteamDataForGame}
              isSteamDataSyncing={steamAchievementSyncState.status === 'loading' || steamPlaytimeRefreshState.status === 'loading'}
              onStatusChange={updateGameStatus}
              onTrackingChange={updateGameTracking}
              platformQueueState={platformQueueState}
            />
          ) : activeNavItem === 'Home' ? (
            <HomePanel
              appTitle={personalizedQuestShelfTitle}
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
                  completionToastMessage: (summary) => `Updated playtime for ${summary.updatedCount} game${summary.updatedCount === 1 ? '' : 's'}`,
                  emptyToastMessage: options?.emptyToastMessage,
                  showToast: true,
                })
              }
              onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
              onBulkStatusChange={updateManyGameStatuses}
              onClearFilters={() => setLibraryFilters(initialCollectionFilters)}
              onFiltersChange={(changes) => setLibraryFilters((currentFilters) => ({ ...currentFilters, ...changes }))}
              onFindMetadata={refreshGameMetadataFromActions}
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
              onClearFilters={() => setWishlistFilters(initialCollectionFilters)}
              onFiltersChange={(changes) => setWishlistFilters((currentFilters) => ({ ...currentFilters, ...changes }))}
              onFindMetadata={refreshGameMetadataFromActions}
              onMoveToLibrary={moveToLibrary}
              onOpenDetails={(gameId) => setSelectedGameId(gameId)}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatus}
              onSyncSteamWishlist={syncSteamWishlist}
              onImportSteamWishlistHtml={importSteamWishlistHtmlItems}
              onSyncItadDeals={syncWishlistDeals}
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
              onFindArtwork={(game) => refreshGameMetadataFromActions(game, 'artwork')}
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
              libraryOwnerNickname={libraryOwnerNickname}
              personalizedQuestShelfTitle={personalizedQuestShelfTitle}
              controllerLayoutPreference={controllerLayoutPreference}
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
              language={language}
              navigationVisibility={navigationVisibility}
              platformQueueState={platformQueueState}
              steamPlaytimeRefreshState={steamPlaytimeRefreshState}
              steamWishlistSyncState={steamWishlistSyncState}
              onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
              onBackupExported={() => markOnboardingItemComplete('backup-exported')}
              onCategoryChange={setActiveSettingsCategory}
              onLibraryOwnerNicknameChange={setLibraryOwnerNickname}
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
              onSteamProfileNameChange={setSteamProfileName}
              onSteamLibraryImported={() => markOnboardingItemComplete('steam-import')}
              onImportSteamWishlistHtml={importSteamWishlistHtmlItems}
              onSyncSteamWishlist={syncSteamWishlist}
              onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
              onThemePreferenceChange={setThemePreference}
              onAppTemplatePreferenceChange={setAppTemplatePreference}
              onAccentColorChange={setAccentColorPreference}
              onSecondaryAccentColorChange={setSecondaryAccentColorPreference}
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
            <Icon name="settings" />
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
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeActionIds = new Set(actions.map((action) => action.id));
    setExpandedDetailIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((actionId) => activeActionIds.has(actionId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, [actions]);

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

  function toggleToastDetails(actionId: string) {
    setExpandedDetailIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(actionId)) {
        nextIds.delete(actionId);
      } else {
        nextIds.add(actionId);
      }

      return nextIds;
    });
  }

  return (
    <aside
      aria-label="QuestShelf notifications"
      aria-live="polite"
      className="qs-toast-stack pointer-events-none fixed top-[calc(3.25rem+max(0px,var(--qs-safe-top)))] z-[1300] grid justify-items-stretch gap-2 overflow-visible sm:top-[calc(3.75rem+max(0px,var(--qs-safe-top)))] sm:justify-items-end"
      role="status"
    >
      {visibleActions.map((action) => {
        const category = action.category ?? 'success';
        const categoryStyles = getToastCategoryStyles(category);
        const toastActions = action.actions?.length ? action.actions : [getDismissAction()];
        const hasDetails = Boolean(action.details?.trim());
        const isDetailsExpanded = expandedDetailIds.has(action.id);

        return (
          <div
            key={action.id}
            className={`qs-toast pointer-events-auto flex w-full max-w-full translate-x-0 flex-col gap-2 overflow-hidden rounded-2xl border px-3 py-2 shadow-glow ${categoryStyles.container}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="qs-toast-message min-w-0 flex-1 text-sm font-semibold leading-5 text-white sm:text-[0.95rem]">
                {action.message}
              </span>
              {action.repeatCount && action.repeatCount > 1 ? (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300">
                  ×{action.repeatCount}
                </span>
              ) : null}
            </div>
            {hasDetails ? (
              <div className="min-w-0">
                <button
                  aria-expanded={isDetailsExpanded}
                  className="max-w-full rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
                  onClick={() => toggleToastDetails(action.id)}
                  type="button"
                >
                  {isDetailsExpanded ? 'Hide details' : 'Show details'}
                </button>
                {isDetailsExpanded ? (
                  <div className="qs-toast-details mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-2 text-xs leading-5 text-slate-100">
                    {action.details}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {toastActions.map((toastAction) => (
                <button
                  key={`${action.id}-${toastAction.kind}-${toastAction.gameId ?? toastAction.label}`}
                  className={getToastButtonClass(toastAction.kind)}
                  onClick={() => runToastAction(action.id, toastAction)}
                  type="button"
                >
                  {toastAction.label}
                </button>
              ))}
            </div>
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
  const baseClass = 'min-h-0 max-w-full whitespace-normal break-words rounded-full px-3 py-1 text-xs font-bold leading-tight transition focus-visible:translate-y-0 sm:text-sm';

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
  isHltbSyncing?: boolean;
  tags: string[];
  onAddGame: () => void;
  onAddToWishlist: (game: Game) => void;
  onAddManyToWishlist: (games: Game[]) => void;
  onAddToQueue: (game: Game) => void;
  onPlayNow: (game: Game) => void;
  onFinish: (game: Game) => void;
  onDrop: (game: Game) => void;
  onBulkEnrich: (gameIds: string[]) => void;
  onBulkSyncHltb: (gameIds: string[]) => Promise<HltbSyncSummary | null>;
  onBulkRefreshSteamPlaytime?: (gameIds: string[], options?: { emptyToastMessage?: string }) => Promise<SteamPlaytimeRefreshSummary | null>;
  onBulkSyncSteamAchievements?: (gameIds: string[], options?: { emptyToastMessage?: string; force?: boolean }) => Promise<SteamAchievementSyncSummary | null>;
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
  onImportSteamWishlistHtml?: (items: ParsedSteamWishlistImportItem[], skippedCount?: number) => SteamWishlistHtmlImportSummary;
  itadDealSyncState?: ItadDealSyncState;
  onSyncItadDeals?: (gameIds: string[]) => Promise<{ updatedCount: number; noMatchCount: number; failedCount: number } | null>;
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
  onBulkSyncHltb,
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
  onImportSteamWishlistHtml,
  itadDealSyncState,
  onSyncItadDeals,
  isHltbSyncing = false,
}: CollectionPanelProps) {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [bulkSummary, setBulkSummary] = useState<BulkActionSummary | null>(null);
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => loadCollectionViewMode(collectionType));
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isSteamWishlistHtmlImportOpen, setIsSteamWishlistHtmlImportOpen] = useState(false);
  const [renderedGameCount, setRenderedGameCount] = useState(collectionInitialRenderCount);
  const activeViewModeCollectionRef = useRef(collectionType);
  const advancedFiltersButtonRef = useRef<HTMLButtonElement | null>(null);
  const advancedFiltersCloseRef = useRef<HTMLButtonElement | null>(null);
  const steamWishlistHtmlImportButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const isItadDealSyncing = itadDealSyncState?.status === 'loading';
  const hasWishlistDealSyncAction = collectionType === 'wishlist' && Boolean(onSyncItadDeals);
  const isWishlistDealSyncDisabled = isItadDealSyncing || games.length === 0;
  const wishlistDealSyncTitle = games.length === 0 ? t('itad.noWishlistGamesForSync') : undefined;
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
      setBulkSummary({ ...summary, message: formatSteamAchievementSyncSummary(summary) });
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


  async function syncVisibleOrSelectedHltb() {
    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;

    setBulkSummary(null);
    const summary = await onBulkSyncHltb(targetGames.map((game) => game.id));

    if (summary) {
      setBulkSummary({ ...summary, message: formatHltbSyncSummary(summary, t) });
    }
  }


  async function syncVisibleOrSelectedWishlistDeals() {
    if (collectionType !== 'wishlist' || !onSyncItadDeals || isItadDealSyncing) {
      return;
    }

    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;
    setBulkSummary(null);
    const summary = await onSyncItadDeals(targetGames.map((game) => game.id));

    if (summary) {
      setBulkSummary({ ...summary, message: `${t('itad.syncComplete')}. ${summary.updatedCount} updated · ${summary.noMatchCount} no match · ${summary.failedCount} failed.` });
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
            {collectionType === 'wishlist' && onImportSteamWishlistHtml ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
                onClick={() => setIsSteamWishlistHtmlImportOpen(true)}
                ref={steamWishlistHtmlImportButtonRef}
                type="button"
              >
                {t('wishlist.importSteamHtml')}
              </button>
            ) : null}

            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
              disabled={isHltbSyncing}
              onClick={syncVisibleOrSelectedHltb}
              type="button"
            >
              {isHltbSyncing ? t('hltb.syncing') : t('hltb.sync')}
            </button>
            {hasWishlistDealSyncAction ? (
              <button
                className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
                disabled={isWishlistDealSyncDisabled}
                onClick={syncVisibleOrSelectedWishlistDeals}
                title={wishlistDealSyncTitle}
                type="button"
              >
                {isItadDealSyncing ? t('itad.syncingDeals') : t('itad.syncDeals')}
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

      {collectionType === 'library' && steamAchievementSyncState && steamAchievementSyncState.status === 'loading' ? (
        <SteamAchievementSyncNotice syncState={steamAchievementSyncState} />
      ) : null}

      {collectionType === 'library' && steamPlaytimeRefreshState && steamPlaytimeRefreshState.status !== 'idle' ? (
        <SteamPlaytimeRefreshNotice refreshState={steamPlaytimeRefreshState} />
      ) : null}

      {collectionType === 'wishlist' && steamWishlistSyncState && steamWishlistSyncState.status !== 'idle' ? (
        <SteamWishlistSyncNotice syncState={steamWishlistSyncState} />
      ) : null}

      {isSteamWishlistHtmlImportOpen && onImportSteamWishlistHtml ? (
        <SteamWishlistHtmlImportModal
          existingSteamAppIds={games
            .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId === 'number')
            .map((game) => game.steamAppId as number)}
          isExperimentalSyncLoading={steamWishlistSyncState?.status === 'loading'}
          onClose={() => setIsSteamWishlistHtmlImportOpen(false)}
          onExperimentalSync={onSyncSteamWishlist}
          onImport={onImportSteamWishlistHtml}
          restoreFocusRef={steamWishlistHtmlImportButtonRef}
        />
      ) : null}

      {collectionType === 'wishlist' && itadDealSyncState && itadDealSyncState.status !== 'idle' ? (
        <ItadDealSyncNotice syncState={itadDealSyncState} />
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

            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
              disabled={isHltbSyncing}
              onClick={syncVisibleOrSelectedHltb}
              type="button"
            >
              {isHltbSyncing ? t('hltb.syncing') : t('hltb.sync')}
            </button>
            {hasWishlistDealSyncAction ? (
                <button className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500" disabled={isWishlistDealSyncDisabled} onClick={syncVisibleOrSelectedWishlistDeals} title={wishlistDealSyncTitle} type="button">
                  {isItadDealSyncing ? t('itad.syncingDeals') : t('itad.syncDeals')}
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

      {isHltbSyncing ? (
        <div className="mb-2 rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          {games.length > 12 ? t('hltb.syncingLong') : t('hltb.syncing')}
        </div>
      ) : null}

      {bulkSummary && !isSteamAchievementSyncing && !isSteamPlaytimeSyncing && !isHltbSyncing ? (
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
          <NoticeStat label={t('collection.steamAchievementsUpdated')} value={syncState.summary.updatedCount.toString()} />
          <NoticeStat label="Unchanged" value={syncState.summary.unchangedCount.toString()} />
          <NoticeStat label={t('collection.steamAchievementsNoAchievements')} value={syncState.summary.noAchievementDataCount.toString()} />
          <NoticeStat label={t('collection.steamAchievementsFailed')} value={syncState.summary.failedCount.toString()} />
          <NoticeStat label={t('collection.steamAchievementsNonSteamSkipped')} value={syncState.summary.skippedNonSteamCount.toString()} />
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

function ItadDealSyncNotice({ syncState }: { syncState: ItadDealSyncState }) {
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
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
          <SyncStat label="Updated" value={syncState.summary.updatedCount} />
          <SyncStat label="No match" value={syncState.summary.noMatchCount} />
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

type SettingsPanelProps = {
  activeCategory: SettingsCategory;
  autoBackupSignal: string;
  completedOnboardingItemIds: Set<OnboardingItemId>;
  demoGameCount: number;
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  libraryOwnerNickname: string;
  personalizedQuestShelfTitle: string;
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  isOnboardingComplete: boolean;
  isOnboardingOpen: boolean;
  lastRetroImportsHiddenByFilters: boolean;
  resolvedTheme: ResolvedTheme;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  themePreference: ThemePreference;
  appTemplatePreference: AppTemplatePreference;
  accentColorPreference: AccentColorPreference;
  secondaryAccentColorPreference: AccentColorPreference;
  language: AppLanguage;
  navigationVisibility: NavigationVisibilityPreferences;
  platformQueueState: PlatformQueueState;
  steamPlaytimeRefreshState: SteamPlaytimeRefreshState;
  steamWishlistSyncState: SteamWishlistSyncState;
  onAddRetroImportedToQueue: (gameIds: string[]) => void;
  onBackupExported: () => void;
  onCategoryChange: (category: SettingsCategory) => void;
  onLibraryOwnerNicknameChange: (nickname: string) => void;
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
  onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onSecondaryAccentColorChange: (color: AccentColorPreference) => void;
  onLanguageChange: (language: AppLanguage) => void;
  onSteamApiKeyConfigured: () => void;
  onSteamIdConfigured: () => void;
  onSteamLibraryImported: () => void;
  onImportSteamWishlistHtml: (items: ParsedSteamWishlistImportItem[], skippedCount?: number) => SteamWishlistHtmlImportSummary;
  onSyncSteamWishlist: () => void;
  onSteamProfileNameChange: (profileName: string) => void;
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
  libraryOwnerNickname,
  personalizedQuestShelfTitle,
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  isOnboardingComplete,
  isOnboardingOpen,
  lastRetroImportsHiddenByFilters,
  resolvedTheme,
  runtimeEnvironment,
  themePreference,
  appTemplatePreference,
  accentColorPreference,
  secondaryAccentColorPreference,
  language,
  navigationVisibility,
  platformQueueState,
  steamPlaytimeRefreshState,
  steamWishlistSyncState,
  onAddRetroImportedToQueue,
  onBackupExported,
  onCategoryChange,
  onLibraryOwnerNicknameChange,
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
  onAppTemplatePreferenceChange,
  onAccentColorChange,
  onSecondaryAccentColorChange,
  onLanguageChange,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  onImportSteamWishlistHtml,
  onSyncSteamWishlist,
  onSteamProfileNameChange,
  onUnignoreSteamGame,
  onViewRetroImportedGames,
}: SettingsPanelProps) {
  const [isCategoryListOpen, setIsCategoryListOpen] = useState(false);
  const [isSteamWishlistHtmlImportOpen, setIsSteamWishlistHtmlImportOpen] = useState(false);
  const steamWishlistImportButtonRef = useRef<HTMLButtonElement | null>(null);
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
              <IsThereAnyDealSettingsPanel />
              <HltbSettingsPanel />
              <SteamSettingsPanel
                games={games}
                ignoredSteamGames={ignoredSteamGames}
                onConnectionTested={onConnectionTested}
                onImportGames={onImportGames}
                onSteamApiKeyConfigured={onSteamApiKeyConfigured}
                onSteamIdConfigured={onSteamIdConfigured}
                onSteamLibraryImported={onSteamLibraryImported}
                onSteamProfileNameChange={onSteamProfileNameChange}
                playtimeRefreshState={steamPlaytimeRefreshState}
                onRefreshSteamPlaytime={onRefreshSteamPlaytime}
                onUnignoreSteamGame={onUnignoreSteamGame}
                onOpenManualWishlistImport={() => setIsSteamWishlistHtmlImportOpen(true)}
                manualWishlistImportButtonRef={steamWishlistImportButtonRef}
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

          {activeCategory === 'Wishlist' ? (
            <WishlistSettingsPanel
              existingSteamAppIds={games
                .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId === 'number')
                .map((game) => game.steamAppId as number)}
              steamWishlistSyncState={steamWishlistSyncState}
              onImportSteamWishlistHtml={onImportSteamWishlistHtml}
              onSyncSteamWishlist={onSyncSteamWishlist}
            />
          ) : null}

          {isSteamWishlistHtmlImportOpen ? (
            <SteamWishlistHtmlImportModal
              existingSteamAppIds={games
                .filter((game) => game.collectionType === 'wishlist' && typeof game.steamAppId === 'number')
                .map((game) => game.steamAppId as number)}
              isExperimentalSyncLoading={steamWishlistSyncState.status === 'loading'}
              onClose={() => setIsSteamWishlistHtmlImportOpen(false)}
              onExperimentalSync={onSyncSteamWishlist}
              onImport={onImportSteamWishlistHtml}
              restoreFocusRef={steamWishlistImportButtonRef}
            />
          ) : null}

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
                appTemplatePreference={appTemplatePreference}
                accentColorPreference={accentColorPreference}
                secondaryAccentColorPreference={secondaryAccentColorPreference}
                language={language}
                libraryOwnerNickname={libraryOwnerNickname}
                personalizedQuestShelfTitle={personalizedQuestShelfTitle}
                onLibraryOwnerNicknameChange={onLibraryOwnerNicknameChange}
                onControllerDebugChange={onControllerDebugChange}
                onControllerLayoutChange={onControllerLayoutChange}
                onLandscapeLockChange={onLandscapeLockChange}
                onThemePreferenceChange={onThemePreferenceChange}
                onAppTemplatePreferenceChange={onAppTemplatePreferenceChange}
                onAccentColorChange={onAccentColorChange}
                onSecondaryAccentColorChange={onSecondaryAccentColorChange}
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

function withSteamAchievementSyncWatchdog<T>(promise: Promise<T>, total: number) {
  const timeoutMs = getSteamAchievementSyncWatchdogTimeoutMs(total);
  let timeoutId: number | undefined;

  const watchdog = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Steam achievement sync timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });

  return Promise.race([promise, watchdog]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function getSteamAchievementSyncWatchdogTimeoutMs(total: number) {
  if (total <= 2) {
    return 60_000;
  }

  return Math.min(Math.max(60_000, total * 20_000), 10 * 60_000);
}

function debugSteamAchievementSyncFinalization(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[SteamAchievementSync] ${message}`, data ?? {});
}

function debugAchievementSyncDiagnostic(message: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[ach-sync] ${message}`, data ?? {});
}

function mergeSteamAchievementUpdates(currentGames: Game[], syncedGames: Game[], targetGameIds: Set<string>) {
  const syncedGamesById = new Map(syncedGames.map((game) => [game.id, game]));

  return currentGames.map((game) => {
    if (!targetGameIds.has(game.id)) {
      return game;
    }

    const syncedGame = syncedGamesById.get(game.id);

    if (!syncedGame) {
      return game;
    }

    const hasAchievementSummary = typeof syncedGame.steamAchievementsTotal === 'number' && syncedGame.steamAchievementsTotal > 0;
    const hasCurrentAchievementSummary = typeof game.steamAchievementsTotal === 'number' && game.steamAchievementsTotal > 0;

    if (!hasAchievementSummary) {
      if (syncedGame.steamAchievementsUnsupported === true && !hasCurrentAchievementSummary) {
        return {
          ...game,
          steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported,
          steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt,
          updatedAt: syncedGame.updatedAt,
        };
      }

      return game;
    }

    return {
      ...game,
      ...(hasAchievementSummary
        ? {
            steamAchievementsTotal: syncedGame.steamAchievementsTotal,
            steamAchievementsUnlocked: syncedGame.steamAchievementsUnlocked,
            steamAchievementsPercent: syncedGame.steamAchievementsPercent,
            steamLastAchievementUnlockTime: syncedGame.steamLastAchievementUnlockTime,
          }
        : {}),
      steamAchievementsUnsupported: syncedGame.steamAchievementsUnsupported,
      steamAchievementsLastCheckedAt: syncedGame.steamAchievementsLastCheckedAt,
      updatedAt: syncedGame.updatedAt,
    };
  });
}

function normalizeGameTitleForWishlistMatch(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function areSteamWishlistSyncedFieldsEqual(previousGame: Game, nextGame: Game) {
  return (
    previousGame.title === nextGame.title &&
    previousGame.coverImage === nextGame.coverImage &&
    previousGame.steamAppId === nextGame.steamAppId &&
    previousGame.externalSource === nextGame.externalSource &&
    previousGame.externalUrl === nextGame.externalUrl &&
    previousGame.storeUrl === nextGame.storeUrl &&
    previousGame.releaseDate === nextGame.releaseDate &&
    previousGame.steamPriceInfo === nextGame.steamPriceInfo &&
    previousGame.steamDiscountInfo === nextGame.steamDiscountInfo &&
    previousGame.steamReviewInfo === nextGame.steamReviewInfo
  );
}

function mergeSteamWishlistSync(existingGame: Game, syncedGame: Game, syncedAt: string): Game {
  const shouldUseSyncedArtwork = isMissingOrGeneratedCover(existingGame.coverImage) && syncedGame.coverImage;
  const shouldUseSyncedTitle = shouldReplaceSteamWishlistPlaceholderTitle(existingGame, syncedGame);

  if (shouldUseSyncedTitle) {
    console.info('[Steam Wishlist Sync] Repaired placeholder wishlist title.', {
      appid: syncedGame.steamAppId,
      previousTitle: existingGame.title,
      repairedTitle: syncedGame.title,
    });
  }

  return {
    ...existingGame,
    title: shouldUseSyncedTitle ? syncedGame.title : existingGame.title || syncedGame.title,
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


function shouldReplaceSteamWishlistPlaceholderTitle(existingGame: Game, syncedGame: Game) {
  const appid = existingGame.steamAppId ?? syncedGame.steamAppId;

  if (typeof appid !== 'number') {
    return false;
  }

  return isPlaceholderSteamWishlistTitle(existingGame.title, appid) && !isPlaceholderSteamWishlistTitle(syncedGame.title, appid);
}

function isPlaceholderSteamWishlistTitle(title: string, appid: number) {
  return title.trim().toLowerCase() === `steam app ${appid}`.toLowerCase();
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
