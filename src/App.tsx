import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { GameDetailView } from './components/GameDetailView';
import { GameCard } from './components/GameCard';
import { MetadataEnrichmentPanel } from './components/MetadataEnrichmentPanel';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { RawgSettingsPanel } from './components/RawgSettingsPanel';
import { RecommendationPanel } from './components/RecommendationPanel';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { getMockGames, isMockGame, loadGames, removeMockGames, saveGames } from './lib/gameStorage';
import {
  addIgnoredSteamGame,
  loadIgnoredSteamGames,
  removeIgnoredSteamGame,
  saveIgnoredSteamGames,
  type IgnoredSteamGame,
} from './lib/steamIgnoredGamesStorage';
import type { Game, GameCollectionType, GamePlatform, GameStatus, WishlistPriority } from './types/game';
import { gamePlatforms, gameStatuses, wishlistPriorities } from './types/game';
import type { RawgMetadata } from './types/rawg';

const navItems = ['Library', 'Wishlist', 'Metadata', 'Recommendation', 'Stats', 'Settings'] as const;
type NavItem = (typeof navItems)[number];

const allOption = 'All';
const questShelfIcon = '/icons/questshelf-icon.svg';

type CollectionFilters = {
  platform: GamePlatform | typeof allOption;
  searchTerm: string;
  status: GameStatus | typeof allOption;
  tag: string;
};

type GameTrackingUpdate = Pick<Game, 'notes' | 'status' | 'tags'> & Partial<Pick<Game, 'coverImage'>>;

const initialCollectionFilters: CollectionFilters = {
  platform: allOption,
  searchTerm: '',
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

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [isAppReady, setIsAppReady] = useState(false);
  const [libraryFilters, setLibraryFilters] = useState<CollectionFilters>(initialCollectionFilters);
  const [wishlistFilters, setWishlistFilters] = useState<CollectionFilters>(initialCollectionFilters);
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Library');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [metadataSelectionRequest, setMetadataSelectionRequest] = useState<MetadataSelectionRequest | null>(null);

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    const readyFrame = window.requestAnimationFrame(() => setIsAppReady(true));

    return () => window.cancelAnimationFrame(readyFrame);
  }, []);

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

  const activeGames = libraryGames.filter((game) => game.status === 'Playing').length;
  const totalHours = libraryGames.reduce((sum, game) => sum + game.playtimeHours, 0);
  const selectedGame = selectedGameId ? games.find((game) => game.id === selectedGameId) : null;

  function updateGameStatus(gameId: string, status: GameStatus) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              status,
              lastPlayedAt: status === 'Playing' ? new Date().toISOString().slice(0, 10) : game.lastPlayedAt,
            }
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
          ? {
              ...game,
              status,
              lastPlayedAt: status === 'Playing' && game.status !== 'Playing' ? today : game.lastPlayedAt,
            }
          : game,
      ),
    );
  }

  function importGames(importedGames: Game[]) {
    setGames((currentGames) => {
      const existingSteamAppIds = new Set(
        currentGames
          .map((game) => game.steamAppId)
          .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
      );

      const newGames = importedGames.filter((game) => {
        return typeof game.steamAppId !== 'number' || !existingSteamAppIds.has(game.steamAppId);
      });

      return [...currentGames, ...newGames.map((game) => ({ ...game, collectionType: 'library' as const }))];
    });
  }

  function addManualGame(game: Game) {
    setGames((currentGames) => [...currentGames, game]);
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
          ...game,
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
        nextGames.push({
          ...game,
          id: wishlistId,
          collectionType: 'wishlist',
          status: 'Want to play',
          playtimeHours: 0,
          lastPlayedAt: null,
          priority: game.priority ?? 'medium',
          importedAt: new Date().toISOString(),
        });
      });

      return addedCount > 0 ? nextGames : currentGames;
    });
  }

  function moveToLibrary(game: Game) {
    setGames((currentGames) =>
      currentGames.map((currentGame) =>
        currentGame.id === game.id
          ? {
              ...currentGame,
              collectionType: 'library',
              priority: undefined,
              expectedPlaytime: undefined,
              priceTarget: undefined,
              releaseDate: undefined,
              storeUrl: undefined,
            }
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
          ? {
              ...game,
              ...metadata,
              metadataSkippedAt: undefined,
              metadataManualManagedAt: undefined,
            }
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
          ? {
              ...game,
              ...changes,
            }
          : game,
      ),
    );
  }

  function updateGameTracking(gameId: string, tracking: GameTrackingUpdate) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              ...tracking,
              lastPlayedAt:
                tracking.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            }
          : game,
      ),
    );
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
              <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">Gaming backlog shelf</h1>
              <p className="mt-1 text-sm text-slate-400">Your personal gaming backlog shelf</p>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-skyglass/15 bg-ink-950/70 p-1 shadow-inner">
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

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="qs-glass rounded-lg border p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Stat label="Library" value={libraryGames.length.toString()} />
              <Stat label="Wishlist" value={wishlistGames.length.toString()} />
              <Stat label="Playing" value={activeGames.toString()} />
              <Stat label="Hours" value={totalHours.toString()} />
            </div>

            {activeNavItem === 'Library' || activeNavItem === 'Wishlist' ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    value={getActiveFilters(activeNavItem, libraryFilters, wishlistFilters).searchTerm}
                    onChange={(event) =>
                      updateActiveFilters(activeNavItem, setLibraryFilters, setWishlistFilters, {
                        searchTerm: event.target.value,
                      })
                    }
                    placeholder="Find by title"
                    type="search"
                  />
                </label>

                <FilterSelect
                  label="Platform"
                  value={getActiveFilters(activeNavItem, libraryFilters, wishlistFilters).platform}
                  options={[allOption, ...platformOptions]}
                  onChange={(value) =>
                    updateActiveFilters(activeNavItem, setLibraryFilters, setWishlistFilters, {
                      platform: value as GamePlatform | typeof allOption,
                    })
                  }
                />

                <FilterSelect
                  label="Status"
                  value={getActiveFilters(activeNavItem, libraryFilters, wishlistFilters).status}
                  options={[allOption, ...gameStatuses]}
                  onChange={(value) =>
                    updateActiveFilters(activeNavItem, setLibraryFilters, setWishlistFilters, {
                      status: value as GameStatus | typeof allOption,
                    })
                  }
                />

                <FilterSelect
                  label="Tag"
                  value={getActiveFilters(activeNavItem, libraryFilters, wishlistFilters).tag}
                  options={[allOption, ...tags]}
                  onChange={(value) =>
                    updateActiveFilters(activeNavItem, setLibraryFilters, setWishlistFilters, { tag: value })
                  }
                />
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm leading-6 text-slate-400">
                {getNavDescription(activeNavItem)}
              </div>
            )}
          </aside>

          {(activeNavItem === 'Library' || activeNavItem === 'Wishlist') && selectedGame ? (
            <GameDetailView
              game={selectedGame}
              onBack={() => setSelectedGameId(null)}
              onTrackingChange={updateGameTracking}
            />
          ) : activeNavItem === 'Library' ? (
            <CollectionPanel
              collectionType="library"
              games={filteredLibraryGames}
              onAddGame={() => setIsAddGameOpen(true)}
              onAddToWishlist={addToWishlist}
              onAddManyToWishlist={addManyToWishlist}
              onBulkEnrich={startMetadataWorkflow}
              onBulkRemove={removeManyGames}
              onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
              onBulkStatusChange={updateManyGameStatuses}
              onFindMetadata={(game) => startMetadataWorkflow([game.id])}
              onMoveToLibrary={moveToLibrary}
              onOpenDetails={(gameId) => setSelectedGameId(gameId)}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
              onStatusChange={updateGameStatus}
            />
          ) : activeNavItem === 'Wishlist' ? (
            <CollectionPanel
              collectionType="wishlist"
              games={filteredWishlistGames}
              onAddGame={() => setIsAddGameOpen(true)}
              onAddToWishlist={addToWishlist}
              onAddManyToWishlist={addManyToWishlist}
              onBulkEnrich={startMetadataWorkflow}
              onBulkRemove={removeManyGames}
              onBulkRemoveAndIgnore={removeAndIgnoreManyGames}
              onBulkStatusChange={updateManyGameStatuses}
              onFindMetadata={(game) => startMetadataWorkflow([game.id])}
              onMoveToLibrary={moveToLibrary}
              onOpenDetails={(gameId) => setSelectedGameId(gameId)}
              onRemove={removeGame}
              onRemoveAndIgnore={removeAndIgnoreSteamGame}
              onStatusChange={updateGameStatus}
            />
          ) : activeNavItem === 'Metadata' ? (
            <MetadataEnrichmentPanel
              games={games}
              initialSelectedGameIds={metadataSelectionRequest?.ids}
              onMetadataManagementChange={updateGameMetadataManagement}
              onMetadataUpdate={updateGameMetadata}
              selectionRequestId={metadataSelectionRequest?.requestId}
            />
          ) : activeNavItem === 'Recommendation' ? (
            <RecommendationPanel
              games={games}
              onOpenDetails={(gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setSelectedGameId(gameId);
                setActiveNavItem(targetGame?.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
              }}
              onStatusChange={updateGameStatus}
            />
          ) : activeNavItem === 'Settings' ? (
            <section className="min-w-0 space-y-4 overflow-y-auto lg:h-[calc(100vh-116px)]">
              <DemoDataPanel
                demoGameCount={games.filter(isMockGame).length}
                onLoadDemoData={loadDemoData}
                onRemoveDemoGames={removeDemoGames}
              />
              <RawgSettingsPanel />
              <SteamSettingsPanel
                games={games}
                ignoredSteamGames={ignoredSteamGames}
                onImportGames={importGames}
                onUnignoreSteamGame={unignoreSteamGame}
              />
            </section>
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
            setIsAddGameOpen(false);
            setSelectedGameId(game.id);
            setActiveNavItem(game.collectionType === 'wishlist' ? 'Wishlist' : 'Library');
          }}
        />
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
  games: Game[];
  onAddGame: () => void;
  onAddToWishlist: (game: Game) => void;
  onAddManyToWishlist: (games: Game[]) => void;
  onBulkEnrich: (gameIds: string[]) => void;
  onBulkRemove: (gameIds: string[]) => void;
  onBulkRemoveAndIgnore: (games: Game[]) => void;
  onBulkStatusChange: (gameIds: string[], status: GameStatus) => void;
  onFindMetadata: (game: Game) => void;
  onMoveToLibrary: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

function CollectionPanel({
  collectionType,
  games,
  onAddGame,
  onAddToWishlist,
  onAddManyToWishlist,
  onBulkEnrich,
  onBulkRemove,
  onBulkRemoveAndIgnore,
  onBulkStatusChange,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
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
          <p className="mt-1 text-sm text-slate-400">
            {games.length} items match the current view{isMultiSelectMode ? ` - ${selectedCount} selected` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
            onClick={onAddGame}
            type="button"
          >
            Add game
          </button>
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
          <div className="rounded-md border border-skyglass/15 bg-ink-950/80 px-3 py-2 text-sm text-slate-300">
            {collectionType === 'wishlist' ? 'Not owned by default' : 'Local storage enabled'}
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
        <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-skyglass/20 bg-ink-950/60 p-8 text-center">
          <div>
            <h3 className="text-lg font-semibold text-white">{emptyTitle}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{emptyText}</p>
          </div>
        </div>
      )}
    </section>
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
      <section className="qs-glass max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border shadow-panel">
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

        <form className="max-h-[calc(92vh-73px)] overflow-y-auto p-4" onSubmit={submitForm}>
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

function DemoDataPanel({ demoGameCount, onLoadDemoData, onRemoveDemoGames }: DemoDataPanelProps) {
  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Library data</h2>
          <p className="mt-1 text-sm text-slate-400">
            New installs start empty. Demo games are optional and never overwrite imported Steam games.
          </p>
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

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/80 px-3 py-2 text-sm text-slate-300">
        {demoGameCount} known demo games in this browser.
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
    return 'Integration settings are local to this browser.';
  }

  if (activeNavItem === 'Metadata') {
    return 'RAWG enrichment runs only when you start it.';
  }

  if (activeNavItem === 'Wishlist') {
    return 'Wishlist items are separate from owned library games.';
  }

  if (activeNavItem === 'Recommendation') {
    return 'Local picks based on your library.';
  }

  return `${activeNavItem} remains a placeholder for a later feature pass.`;
}

type StatProps = {
  label: string;
  value: string;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
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

  return games.filter((game) => {
    const matchesTitle = game.title.toLowerCase().includes(normalizedSearch);
    const matchesPlatform = filters.platform === allOption || game.platform === filters.platform;
    const matchesStatus = filters.status === allOption || game.status === filters.status;
    const matchesTag = filters.tag === allOption || game.tags.includes(filters.tag);

    return matchesTitle && matchesPlatform && matchesStatus && matchesTag;
  });
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

function getActiveFilters(activeNavItem: NavItem, libraryFilters: CollectionFilters, wishlistFilters: CollectionFilters) {
  return activeNavItem === 'Wishlist' ? wishlistFilters : libraryFilters;
}

function updateActiveFilters(
  activeNavItem: NavItem,
  setLibraryFilters: Dispatch<SetStateAction<CollectionFilters>>,
  setWishlistFilters: Dispatch<SetStateAction<CollectionFilters>>,
  changes: Partial<CollectionFilters>,
) {
  const setFilters = activeNavItem === 'Wishlist' ? setWishlistFilters : setLibraryFilters;
  setFilters((currentFilters) => ({
    ...currentFilters,
    ...changes,
  }));
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
