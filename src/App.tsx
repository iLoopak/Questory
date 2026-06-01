import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DataManagementPanel } from './components/DataManagementPanel';
import { GameDetailView } from './components/GameDetailView';
import { GameCard } from './components/GameCard';
import { HomePanel } from './components/HomePanel';
import { MetadataEnrichmentPanel } from './components/MetadataEnrichmentPanel';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { QueuePanel } from './components/QueuePanel';
import { RawgSettingsPanel } from './components/RawgSettingsPanel';
import { RecommendationPanel } from './components/RecommendationPanel';
import { RetroImportPanel } from './components/RetroImportPanel';
import { ReviewModePanel, type ReviewModeAction } from './components/ReviewModePanel';
import { StatsPanel } from './components/StatsPanel';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { getRuntimeEnvironment } from './lib/capacitorEnvironment';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from './lib/androidGamepadShortcuts';
import { getMockGames, isMockGame, loadGames, removeMockGames, saveGames } from './lib/gameStorage';
import { loadLandscapeLockPreference, saveLandscapeLockPreference } from './lib/landscapePreference';
import {
  loadOnboardingState,
  onboardingItemIds,
  saveOnboardingState,
  type OnboardingItemId,
  type OnboardingState,
} from './lib/onboardingStorage';
import {
  addGameToPlatformQueue,
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
import { loadRawgSettings } from './lib/rawgSettingsStorage';
import {
  loadReviewModeState,
  saveReviewModeState,
  type ReviewDecision,
  type ReviewModeState,
  type ReviewSource,
} from './lib/reviewModeStorage';
import { loadSteamSettings } from './lib/steamSettingsStorage';
import {
  addIgnoredSteamGame,
  loadIgnoredSteamGames,
  removeIgnoredSteamGame,
  saveIgnoredSteamGames,
  type IgnoredSteamGame,
} from './lib/steamIgnoredGamesStorage';
import { getSteamWishlist, mapSteamWishlistItemToLocalGame, SteamWishlistError } from './services/steamApi';
import type { Game, GameCollectionType, GamePlatform, GameStatus, WishlistPriority } from './types/game';
import { gamePlatforms, gameStatuses, wishlistPriorities } from './types/game';
import type { RawgMetadata } from './types/rawg';
import type { SteamWishlistItem, SteamWishlistSyncState, SteamWishlistSyncSummary } from './types/steam';

const navItems = ['Home', 'Library', 'Wishlist', 'Queue', 'Review Mode', 'Metadata', 'Recommendation', 'Stats', 'Settings'] as const;
type NavItem = (typeof navItems)[number];
const settingsCategories = [
  'Integrations',
  'Library',
  'Wishlist',
  'Retro',
  'Appearance',
  'Data & Backup',
  'About',
] as const;
type SettingsCategory = (typeof settingsCategories)[number];

const allOption = 'All';
const questShelfIcon = '/icons/questshelf-icon.svg';
const libraryFiltersStorageKey = 'questshelf.libraryFilters.v1';
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
] as const;
const quickFilterOptions = ['Playing', 'Paused', 'Backlog / Want to play', 'Missing info', 'Played > 0h'] as const;

type SourceFilter = (typeof sourceFilterOptions)[number];
type EnrichmentFilter = (typeof enrichmentFilterOptions)[number];
type LibrarySortOption = (typeof librarySortOptions)[number];
type QuickFilter = (typeof quickFilterOptions)[number];

type CollectionFilters = {
  enrichment: EnrichmentFilter;
  platform: GamePlatform | typeof allOption;
  quickFilters: QuickFilter[];
  searchTerm: string;
  sortBy: LibrarySortOption;
  source: SourceFilter;
  status: GameStatus | typeof allOption;
  tag: string;
};

type GameTrackingUpdate = Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'coverImage'>>;

const initialCollectionFilters: CollectionFilters = {
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
  ignoredCount?: number;
  removedCount?: number;
  skippedCount?: number;
  updatedCount?: number;
  wishlistedCount?: number;
};

const initialSteamWishlistSyncState: SteamWishlistSyncState = {
  status: 'idle',
  message: 'Steam wishlist sync runs only when you start it.',
  summary: null,
};

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [isAppReady, setIsAppReady] = useState(false);
  const [libraryFilters, setLibraryFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(libraryFiltersStorageKey),
  );
  const [wishlistFilters, setWishlistFilters] = useState<CollectionFilters>(() =>
    loadCollectionFilters(wishlistFiltersStorageKey),
  );
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Home');
  const [activeSettingsCategory, setActiveSettingsCategory] = useState<SettingsCategory>(() => loadSettingsCategory());
  const [isLandscapeLockEnabled, setIsLandscapeLockEnabled] = useState(() => loadLandscapeLockPreference());
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [lastRetroImportGameIds, setLastRetroImportGameIds] = useState<string[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => loadOnboardingState());
  const [reviewModeState, setReviewModeState] = useState<ReviewModeState>(() => loadReviewModeState());
  const [activeReviewSource, setActiveReviewSource] = useState<ReviewSource>(() => loadReviewModeState().lastSource);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() => loadPlatformQueueState());
  const [targetQueuePlatform, setTargetQueuePlatform] = useState<GamePlatform | undefined>(undefined);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    const initialState = loadOnboardingState();
    return !initialState.hasSeenChecklist && !initialState.skipped;
  });
  const [metadataSelectionRequest, setMetadataSelectionRequest] = useState<MetadataSelectionRequest | null>(null);
  const [steamWishlistSyncState, setSteamWishlistSyncState] = useState<SteamWishlistSyncState>(
    initialSteamWishlistSyncState,
  );

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    saveOnboardingState(onboardingState);
  }, [onboardingState]);

  useEffect(() => {
    saveReviewModeState(reviewModeState);
  }, [reviewModeState]);

  useEffect(() => {
    savePlatformQueueState(platformQueueState);
  }, [platformQueueState]);

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

      if (activeNavItem === 'Review Mode' || (event.key !== 'PageUp' && event.key !== 'PageDown')) {
        return;
      }

      event.preventDefault();
      setActiveNavItem((currentItem) => {
        const currentIndex = navItems.indexOf(currentItem);
        const direction = event.key === 'PageDown' ? 1 : -1;
        return navItems[(currentIndex + direction + navItems.length) % navItems.length];
      });
      setSelectedGameId(null);
    }

    window.addEventListener('keydown', handleControllerNavigation);

    return () => window.removeEventListener('keydown', handleControllerNavigation);
  }, [activeNavItem]);


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
    setGames((currentGames) => [...currentGames, touchGameRecord(game)]);
  }

  function addToWishlist(game: Game) {
    const wishlistId = createCollectionCopyId(game, 'wishlist', new Set(games.map((currentGame) => currentGame.id)));

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
    setGames((currentGames) => currentGames.filter((game) => game.id !== gameId));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === gameId ? null : currentSelectedGameId));
  }

  function removeAndIgnoreSteamGame(game: Game) {
    if (typeof game.steamAppId !== 'number') {
      return;
    }

    setIgnoredSteamGames((currentIgnoredGames) =>
      addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title),
    );
    removeGame(game.id);
  }

  function removeManyGames(gameIds: string[]) {
    const targetGameIds = new Set(gameIds);
    setGames((currentGames) => currentGames.filter((game) => !targetGameIds.has(game.id)));
    setSelectedGameId((currentSelectedGameId) =>
      currentSelectedGameId && targetGameIds.has(currentSelectedGameId) ? null : currentSelectedGameId,
    );
  }

  function removeAndIgnoreManyGames(targetGames: Game[]) {
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

  function addGameToQueue(game: Game, platform: GamePlatform) {
    setPlatformQueueState((currentState) => addGameToPlatformQueue(currentState, game, platform));
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

    if (action === 'wishlist') {
      addToWishlist(game);
      recordReviewDecision('wishlisted');
      recordReviewDecision('reviewed');
      return;
    }

    if (action === 'ignore') {
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
      addGameToQueue(game, targetPlatform ?? game.platform);
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
    setPlatformQueueState((currentState) => moveQueueEntryToPlatform(currentState, gameId, platform));
  }

  function removeQueueGame(gameId: string) {
    setPlatformQueueState((currentState) => removeGameFromPlatformQueue(currentState, gameId));
  }

  function updateQueueLimit(platform: GamePlatform, maxActiveGames: number) {
    setPlatformQueueState((currentState) => updatePlatformQueueSetting(currentState, platform, maxActiveGames));
  }

  function unignoreSteamGame(steamAppId: number) {
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
      currentGames.map((game) =>
        game.id === gameId
          ? touchGameRecord({
              ...game,
              ...metadata,
              metadataSkippedAt: undefined,
              metadataManualManagedAt: undefined,
            })
          : game,
      ),
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
    <main className="min-h-screen bg-ink-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-5 lg:px-6">
        <header className="qs-glass flex flex-col gap-4 rounded-lg border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-mint/30 bg-ink-950 shadow-glow">
              <img className="qs-logo-glow h-full w-full object-cover" src={questShelfIcon} alt="" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">QuestShelf</div>
              <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">Gaming backlog</h1>
            </div>
          </div>

          <nav className="qs-top-nav flex gap-2 overflow-x-auto rounded-lg border border-skyglass/15 bg-ink-950/70 p-1 shadow-inner">
            {navItems.map((item) => (
              <button
                key={item}
                className={`h-10 shrink-0 rounded-md px-3 text-sm font-medium transition ${
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
                {item}
              </button>
            ))}
          </nav>
        </header>

        <div className="pt-4">
          <PwaStatusBanner />
        </div>

        <section className="flex-1 py-4">
          {(activeNavItem === 'Library' || activeNavItem === 'Wishlist') && selectedGame ? (
            <GameDetailView
              game={selectedGame}
              onBack={() => setSelectedGameId(null)}
              onTrackingChange={updateGameTracking}
            />
          ) : activeNavItem === 'Home' ? (
            <HomePanel
              games={games}
              ignoredReviewGameIds={reviewIgnoredGameIds}
              queueEntries={platformQueueState.entries}
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
              games={filteredLibraryGames}
              platformOptions={platformOptions}
              tags={tags}
              totalCount={libraryGames.length}
              onAddGame={() => setIsAddGameOpen(true)}
              onAddToWishlist={addToWishlist}
              onAddManyToWishlist={addManyToWishlist}
              onBulkEnrich={startMetadataWorkflow}
              onBulkRemove={removeManyGames}
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
              totalCount={wishlistGames.length}
              onAddGame={() => setIsAddGameOpen(true)}
              onAddToWishlist={addToWishlist}
              onAddManyToWishlist={addManyToWishlist}
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
              onMoveEntry={moveQueueGame}
              onMoveEntryToPlatform={moveQueueGameToPlatform}
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
              queuePlatforms={queuePlatforms}
              source={activeReviewSource}
              onAction={handleReviewAction}
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
          ) : activeNavItem === 'Recommendation' ? (
            <RecommendationPanel
              games={games}
              queueEntries={platformQueueState.entries}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
              onStartReview={startReviewMode}
              onStatusChange={updateGameStatus}
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
              isControllerDebugEnabled={isControllerDebugEnabled}
              isLandscapeLockEnabled={isLandscapeLockEnabled}
              isOnboardingOpen={isOnboardingOpen}
              isOnboardingComplete={isOnboardingComplete}
              lastRetroImportsHiddenByFilters={areLastRetroImportsHiddenByFilters}
              runtimeEnvironment={runtimeEnvironment}
              onAddRetroImportedToQueue={addRetroImportedGamesToQueue}
              onBackupExported={() => markOnboardingItemComplete('backup-exported')}
              onCategoryChange={setActiveSettingsCategory}
              onConnectionTested={() => markOnboardingItemComplete('steam-test')}
              onClearLibraryFilters={() => setLibraryFilters(initialCollectionFilters)}
              onEnrichRetroImportedGames={enrichRetroImportedGames}
              onImportGames={importGames}
              onImportRetroGames={handleRetroImportGames}
              onControllerDebugChange={setIsControllerDebugEnabled}
              onLandscapeLockChange={setIsLandscapeLockEnabled}
              onLoadDemoData={loadDemoData}
              onOnboardingAction={handleOnboardingAction}
              onOnboardingClose={hideOnboarding}
              onOpenOnboarding={openOnboarding}
              onRawgApiKeyConfigured={() => markOnboardingItemComplete('rawg-api-key')}
              onRemoveDemoGames={removeDemoGames}
              onSteamApiKeyConfigured={() => markOnboardingItemComplete('steam-api-key')}
              onSteamIdConfigured={() => markOnboardingItemComplete('steam-id64')}
              onSteamLibraryImported={() => markOnboardingItemComplete('steam-import')}
              onReviewRetroImportedGames={() => startReviewMode('recent-imports')}
              onUnignoreSteamGame={unignoreSteamGame}
              onViewRetroImportedGames={viewRetroImportedGames}
            />
          ) : (
            <PlaceholderPanel title={activeNavItem} />
          )}
        </section>
      </div>

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
          <button className="qs-setup-launcher" onClick={openOnboarding} type="button">
            <span>Setup</span>
            <strong>
              {completedOnboardingItemIds.size}/{onboardingItemIds.length}
            </strong>
          </button>
        )
      ) : null}
    </main>
  );
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
  steamWishlistSyncState?: SteamWishlistSyncState;
  tags: string[];
  totalCount: number;
  onAddGame: () => void;
  onAddToWishlist: (game: Game) => void;
  onAddManyToWishlist: (games: Game[]) => void;
  onBulkEnrich: (gameIds: string[]) => void;
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
  steamWishlistSyncState,
  tags,
  totalCount,
  onAddGame,
  onAddToWishlist,
  onAddManyToWishlist,
  onBulkEnrich,
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
  const title = collectionType === 'wishlist' ? 'Wishlist' : 'Library';
  const emptyTitle = collectionType === 'wishlist' ? 'Wishlist is empty' : 'No games found';
  const emptyText =
    collectionType === 'wishlist'
      ? 'Add manual wishlist entries or save library games here for later.'
      : 'Adjust the search or filters to bring titles back into view.';
  const selectedGames = games.filter((game) => selectedGameIds.has(game.id));
  const selectedCount = selectedGames.length;
  const selectedSteamCount = selectedGames.filter((game) => typeof game.steamAppId === 'number').length;
  const hasActiveFilters = isCollectionFiltered(filters);

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

  return (
    <section className="qs-glass min-w-0 rounded-lg border p-3 sm:p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {hasActiveFilters || isMultiSelectMode ? (
            <p className="mt-1 text-sm text-slate-400">
              {hasActiveFilters ? `${games.length} shown` : null}{isMultiSelectMode ? `${hasActiveFilters ? ' - ' : ''}${selectedCount} selected` : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow"
            onClick={() => onStartReview(collectionType === 'wishlist' ? 'wishlist' : 'backlog')}
            type="button"
          >
            Review {collectionType === 'wishlist' ? 'wishlist' : 'backlog'}
          </button>
          <button
            className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
            onClick={onAddGame}
            type="button"
          >
            Add game
          </button>
          {collectionType === 'wishlist' && onSyncSteamWishlist ? (
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600"
              disabled={steamWishlistSyncState?.status === 'loading'}
              onClick={onSyncSteamWishlist}
              type="button"
            >
              {steamWishlistSyncState?.status === 'loading' ? 'Syncing...' : 'Sync Steam'}
            </button>
          ) : null}
          <button
            className={`h-10 rounded-md border px-3 text-sm font-semibold transition ${
              isMultiSelectMode
                ? 'border-mint/40 bg-mint/10 text-mint shadow-glow'
                : 'border-skyglass/15 text-slate-200 hover:bg-mint/10 hover:text-white'
            }`}
            onClick={toggleMultiSelectMode}
            type="button"
          >
            {isMultiSelectMode ? 'Exit select' : 'Select'}
          </button>
        </div>
      </div>

      {collectionType === 'wishlist' && steamWishlistSyncState ? (
        <SteamWishlistSyncNotice syncState={steamWishlistSyncState} />
      ) : null}

      <div className="mb-4 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.25fr)_repeat(3,minmax(8.5rem,1fr))]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:shadow-glow"
              onChange={(event) => onFiltersChange({ searchTerm: event.target.value })}
              placeholder="Find by title"
              type="search"
              value={filters.searchTerm}
            />
          </label>

          <FilterSelect
            label="Platform"
            value={filters.platform}
            options={[allOption, ...platformOptions]}
            onChange={(value) => onFiltersChange({ platform: value as GamePlatform | typeof allOption })}
          />

          <FilterSelect
            label="Status"
            value={filters.status}
            options={[allOption, ...gameStatuses]}
            onChange={(value) => onFiltersChange({ status: value as GameStatus | typeof allOption })}
          />

          <FilterSelect
            label="Sort"
            value={filters.sortBy}
            options={[...librarySortOptions]}
            onChange={(value) => onFiltersChange({ sortBy: value as LibrarySortOption })}
          />
        </div>

        <details className="mt-3 rounded-md border border-skyglass/10 bg-ink-900/50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">More filters</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <FilterSelect
              label="Source"
              value={filters.source}
              options={[...sourceFilterOptions]}
              onChange={(value) => onFiltersChange({ source: value as SourceFilter })}
            />

            <FilterSelect
              label="Info"
              value={filters.enrichment}
              options={[...enrichmentFilterOptions]}
              onChange={(value) => onFiltersChange({ enrichment: value as EnrichmentFilter })}
            />

            <FilterSelect
              label="Tag"
              value={filters.tag}
              options={[allOption, ...tags]}
              onChange={(value) => onFiltersChange({ tag: value })}
            />
          </div>
        </details>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <details className="min-w-0">
            <summary className="cursor-pointer text-sm font-semibold text-slate-300">Quick filters</summary>
            <div className="mt-2 flex flex-wrap gap-2">
            {quickFilterOptions.map((quickFilter) => {
              const isActive = filters.quickFilters.includes(quickFilter);

              return (
                <button
                  key={quickFilter}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                    isActive
                      ? 'border-mint/40 bg-mint/15 text-mint shadow-glow'
                      : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
                  }`}
                  onClick={() => toggleQuickFilter(quickFilter)}
                  type="button"
                >
                  {quickFilter}
                </button>
              );
            })}
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button
              className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
              disabled={!hasActiveFilters}
              onClick={onClearFilters}
              type="button"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      {isMultiSelectMode ? (
        <div className="mb-4 rounded-lg border border-mint/20 bg-ink-950/80 p-3 shadow-glow">
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
              <select
                aria-label="Change selected status"
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
                <option value="">Change status</option>
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
        <div className="mb-4 rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          {formatBulkSummary(bulkSummary)}
        </div>
      ) : null}

      {games.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3 2xl:grid-cols-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isMultiSelectMode={isMultiSelectMode}
              isSelected={selectedGameIds.has(game.id)}
              onAddToWishlist={onAddToWishlist}
              onFindMetadata={onFindMetadata}
              onMoveToLibrary={onMoveToLibrary}
              onOpenDetails={() => onOpenDetails(game.id)}
              onRemove={onRemove}
              onRemoveAndIgnore={onRemoveAndIgnore}
              onStatusChange={onStatusChange}
              onToggleSelected={() => toggleSelectedGame(game.id)}
            />
          ))}
        </div>
      ) : (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-skyglass/20 bg-ink-950/60 p-4 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">{emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{emptyText}</p>
          </div>
        </div>
      )}
    </section>
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
            <h2 className="text-xl font-semibold text-white">Add game</h2>
            <p className="mt-1 text-sm text-slate-400">Manual entries stay local and can start in Library or Wishlist.</p>
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
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add to</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setCollectionType(event.target.value as GameCollectionType)}
                value={collectionType}
              >
                <option value="library">Library</option>
                <option value="wishlist">Wishlist</option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Title</span>
              <input
                autoFocus
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Game title"
                value={title}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</span>
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
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Custom platform</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => setCustomPlatform(event.target.value)}
                  placeholder="Dreamcast, 3DS, Arcade"
                  value={customPlatform}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
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
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Playtime hours</span>
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
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cover image URL</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setCoverImage(event.target.value)}
                placeholder="https://..."
                type="url"
                value={coverImage}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tags</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTagText(event.target.value)}
                placeholder="physical, handheld, retro"
                value={tagText}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
              <textarea
                className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Physical copy, save file notes, platform details..."
                value={notes}
              />
            </label>

            {collectionType === 'wishlist' ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Priority</span>
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
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Expected playtime</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    min="0"
                    onChange={(event) => setExpectedPlaytime(event.target.value)}
                    placeholder="Hours"
                    step="0.1"
                    type="number"
                    value={expectedPlaytime}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Price target</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    onChange={(event) => setPriceTarget(event.target.value)}
                    placeholder="$20, 50%, Game Pass"
                    value={priceTarget}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Release date</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    onChange={(event) => setReleaseDate(event.target.value)}
                    type="date"
                    value={releaseDate}
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Store URL</span>
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
              className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
            className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
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
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  isOnboardingComplete: boolean;
  isOnboardingOpen: boolean;
  lastRetroImportsHiddenByFilters: boolean;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  onAddRetroImportedToQueue: (gameIds: string[]) => void;
  onBackupExported: () => void;
  onCategoryChange: (category: SettingsCategory) => void;
  onClearLibraryFilters: () => void;
  onConnectionTested: () => void;
  onEnrichRetroImportedGames: (gameIds: string[]) => void;
  onImportGames: (games: Game[]) => void;
  onImportRetroGames: (games: Game[]) => Game[];
  onControllerDebugChange: (isEnabled: boolean) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
  onLoadDemoData: () => void;
  onOnboardingAction: (itemId: OnboardingItemId) => void;
  onOnboardingClose: () => void;
  onOpenOnboarding: () => void;
  onRawgApiKeyConfigured: () => void;
  onRemoveDemoGames: () => void;
  onReviewRetroImportedGames: () => void;
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
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  isOnboardingComplete,
  isOnboardingOpen,
  lastRetroImportsHiddenByFilters,
  runtimeEnvironment,
  onAddRetroImportedToQueue,
  onBackupExported,
  onCategoryChange,
  onClearLibraryFilters,
  onConnectionTested,
  onEnrichRetroImportedGames,
  onImportGames,
  onImportRetroGames,
  onControllerDebugChange,
  onLandscapeLockChange,
  onLoadDemoData,
  onOnboardingAction,
  onOnboardingClose,
  onOpenOnboarding,
  onRawgApiKeyConfigured,
  onRemoveDemoGames,
  onReviewRetroImportedGames,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  onUnignoreSteamGame,
  onViewRetroImportedGames,
}: SettingsPanelProps) {
  const [isCategoryListOpen, setIsCategoryListOpen] = useState(false);
  const activeCategoryMeta = getSettingsCategoryMeta(activeCategory);

  function selectCategory(category: SettingsCategory) {
    onCategoryChange(category);
    setIsCategoryListOpen(false);
  }

  return (
    <section className="qs-settings-shell min-w-0 overflow-hidden rounded-lg border border-skyglass/15 bg-ink-900/45 lg:h-[calc(100vh-116px)]">
      <div className="border-b border-skyglass/15 bg-ink-950/80 px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Settings</div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-400">
              <span>Settings</span>
              <span className="text-slate-600">/</span>
              <span className="truncate font-semibold text-white">{activeCategoryMeta.label}</span>
            </div>
          </div>
          <button
            className="qs-settings-back h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white lg:hidden"
            onClick={() => setIsCategoryListOpen((currentValue) => !currentValue)}
            type="button"
          >
            {isCategoryListOpen ? 'Show detail' : 'Back to categories'}
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
                <h2 className="text-xl font-semibold text-white">{activeCategoryMeta.label}</h2>
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
            <AppearanceSettingsPanel
              isControllerDebugEnabled={isControllerDebugEnabled}
              isLandscapeLockEnabled={isLandscapeLockEnabled}
              runtimeEnvironment={runtimeEnvironment}
              onControllerDebugChange={onControllerDebugChange}
              onLandscapeLockChange={onLandscapeLockChange}
            />
          ) : null}

          {activeCategory === 'About' ? (
            <div className="space-y-4">
              <AboutSettingsPanel runtimeEnvironment={runtimeEnvironment} />
              <OnboardingSettingsPanel
                completedCount={completedOnboardingItemIds.size}
                isComplete={isOnboardingComplete}
                onOpenOnboarding={onOpenOnboarding}
                totalCount={onboardingItemIds.length}
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
        <span className="block truncate text-sm font-semibold">{meta.label}</span>
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
  return (
    <section className="qs-glass rounded-lg border p-4">
      <h2 className="text-xl font-semibold text-white">Wishlist settings</h2>
      <p className="mt-1 text-sm text-slate-400">Wishlist sync lives on the Wishlist screen.</p>
    </section>
  );
}

function RetroSettingsPlaceholders() {
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
  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Library data</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {import.meta.env.DEV ? (
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={onLoadDemoData}
              type="button"
            >
              Load demo data
            </button>
          ) : null}
          <button
            className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
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

function AppearanceSettingsPanel({
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  runtimeEnvironment,
  onControllerDebugChange,
  onLandscapeLockChange,
}: {
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  onControllerDebugChange: (isEnabled: boolean) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
}) {
  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Appearance</h2>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <input
          checked={isLandscapeLockEnabled}
          className="mt-1 h-5 w-5 accent-mint"
          onChange={(event) => onLandscapeLockChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-white">Prefer landscape orientation</span>
        </span>
      </label>

      <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <input
          checked={isControllerDebugEnabled}
          className="mt-1 h-5 w-5 accent-mint"
          onChange={(event) => onControllerDebugChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-white">Developer controller debug overlay</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">Shows detected buttons, axes, and the currently focused element while a controller is connected.</span>
        </span>
      </label>
    </section>
  );
}

function AboutSettingsPanel({ runtimeEnvironment }: { runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment> }) {
  return (
    <section className="qs-glass rounded-lg border p-4">
      <h2 className="text-xl font-semibold text-white">About QuestShelf</h2>
      <p className="mt-2 text-sm text-slate-400">
        Version 0.1.0 · {runtimeEnvironment.isNative ? 'Native' : 'Web'} · {runtimeEnvironment.platform}
      </p>
    </section>
  );
}

function OnboardingSettingsPanel({
  completedCount,
  isComplete,
  onOpenOnboarding,
  totalCount,
}: {
  completedCount: number;
  isComplete: boolean;
  onOpenOnboarding: () => void;
  totalCount: number;
}) {
  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{isComplete ? 'Setup complete' : 'Setup assistant'}</h2>
        </div>

        <button
          className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
          onClick={onOpenOnboarding}
          type="button"
        >
          Reopen setup
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
          <img className="qs-logo-glow h-12 w-12 rounded-lg border border-mint/30" src={questShelfIcon} alt="" />
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">QuestShelf</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Loading library</h1>
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
    return 'Queue is the focused plan for what to play next by platform.';
  }

  if (activeNavItem === 'Review Mode') {
    return 'Process one game at a time with fast queue, wishlist, status, and ignore actions.';
  }

  if (activeNavItem === 'Stats') {
    return 'Local overview of backlog, progress, and playtime.';
  }

  return 'Local library and wishlist data stays on this device.';
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
  const reviewNote = `[Review ${timestamp}] ${note}`;

  return existingNotes.trim() ? `${existingNotes.trim()}\n\n${reviewNote}` : reviewNote;
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
      const matchesQuickFilters = filters.quickFilters.every((quickFilter) => matchesQuickFilter(game, quickFilter));

      return (
        matchesTitle &&
        matchesPlatform &&
        matchesStatus &&
        matchesTag &&
        matchesSource &&
        matchesEnrichment &&
        matchesQuickFilters
      );
    })
    .sort((firstGame, secondGame) => compareGames(firstGame, secondGame, filters.sortBy));
}

function formatBulkSummary(summary: BulkActionSummary) {
  const parts = [
    summary.updatedCount ? `${summary.updatedCount} updated` : null,
    summary.removedCount ? `${summary.removedCount} removed` : null,
    summary.ignoredCount ? `${summary.ignoredCount} ignored` : null,
    summary.wishlistedCount ? `${summary.wishlistedCount} sent to Wishlist` : null,
    typeof summary.skippedCount === 'number' ? `${summary.skippedCount} skipped` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' - ') : 'Bulk action complete';
}

function mergeSteamWishlistSync(existingGame: Game, syncedGame: Game, syncedAt: string): Game {
  return {
    ...existingGame,
    title: existingGame.title || syncedGame.title,
    platform: existingGame.platform || syncedGame.platform,
    coverImage: existingGame.coverImage || syncedGame.coverImage,
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

function matchesQuickFilter(game: Game, quickFilter: QuickFilter) {
  if (quickFilter === 'Playing') {
    return game.status === 'Playing';
  }

  if (quickFilter === 'Paused') {
    return game.status === 'Paused';
  }

  if (quickFilter === 'Backlog / Want to play') {
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

  return compareTitle(firstGame, secondGame);
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
  return (
    filters.enrichment !== allOption ||
    filters.platform !== allOption ||
    filters.quickFilters.length > 0 ||
    filters.searchTerm.trim().length > 0 ||
    filters.source !== allOption ||
    filters.status !== allOption ||
    filters.tag !== allOption ||
    filters.sortBy !== initialCollectionFilters.sortBy
  );
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

function loadSettingsCategory(): SettingsCategory {
  if (typeof window === 'undefined') {
    return 'Integrations';
  }

  try {
    const storedCategory = window.localStorage.getItem(settingsCategoryStorageKey);

    if (storedCategory === 'Data') {
      return 'Data & Backup';
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
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          This section is intentionally waiting for a later foundation pass.
        </p>
      </div>
    </section>
  );
}

export default App;
