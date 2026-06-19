import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BacklogPlatformPicker } from '../../components/BacklogPlatformPicker';
import { GameListEmptyState, GameListShell } from '../../components/GameListShell';
import { CollectionToolbar } from '../../components/CollectionToolbar';
import { CollectionBulkToolbar } from '../../components/CollectionBulkToolbar';
import { ViewportModal } from '../../components/ViewportModal';
import { CollectionGrid, CollectionList, CollectionShelf } from '../../components/CollectionViews';
import { Icon } from '../../components/Icon';
import { SteamWishlistHtmlImportModal } from '../../components/settings/WishlistSettingsPanel';
import { useI18n } from '../../i18n';
import { translateOption } from '../../i18n';
import {
  achievementFilterOptions,
  allOption,
  collectionViewModes,
  enrichmentFilterOptions,
  librarySortOptions,
  quickFilterOptions,
  type AchievementFilter,
  type CollectionFilters,
  type CollectionViewMode,
  type EnrichmentFilter,
  type LibrarySortOption,
  type QuickFilter,
  type SourceFilter,
  sourceFilterOptions,
} from '../../config/collection';
import type { ItadDealSyncState } from '../../config/syncStates';
import { isMissingOrGeneratedCover } from '../../lib/gameCoverImages';
import { isSteamAchievementSyncableGame } from '../../lib/steamAchievementsSync';
import { isRefreshableSteamGame } from '../../lib/steamPlaytimeRefresh';
import type { ParsedSteamWishlistImportItem } from '../../lib/steamWishlistHtmlImport';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import { useCollectionViewMode } from '../../hooks/useCollectionUiState';
import {
  formatBulkSummary,
  formatHltbSyncSummary,
  formatMessageTemplate,
  formatSteamAchievementSyncSummary,
  type BulkActionSummary,
  type SteamWishlistHtmlImportSummary,
} from '../../utils/summaryFormatters';
import { getActiveAdvancedFilterCount, getActiveFilterCount, isCollectionFiltered } from '../../utils/gameFilters';
import type { HltbSyncSummary } from '../../lib/hltb';
import type { Game, GameCollectionType, GamePlatform, GameStatus } from '../../types/game';
import { gamePlatforms, gameStatuses } from '../../types/game';
import type {
  SteamAchievementSyncState,
  SteamAchievementSyncSummary,
  SteamPlaytimeRefreshState,
  SteamPlaytimeRefreshSummary,
  SteamWishlistSyncState,
} from '../../types/steam';
import type { ReviewSource } from '../../lib/reviewModeStorage';

export type CollectionPanelProps = {
  collectionType: GameCollectionType;
  contentScrollRef: RefObject<HTMLElement | null>;
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

export function CollectionPanel({
  collectionType,
  contentScrollRef,
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
  const { setViewMode, viewMode } = useCollectionViewMode(collectionType);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [isSteamWishlistHtmlImportOpen, setIsSteamWishlistHtmlImportOpen] = useState(false);
  const [isCollectionSteamAchievementSyncVisible, setIsCollectionSteamAchievementSyncVisible] = useState(false);
  const [isCollectionSteamPlaytimeSyncVisible, setIsCollectionSteamPlaytimeSyncVisible] = useState(false);
  const advancedFiltersButtonRef = useRef<HTMLButtonElement | null>(null);
  const advancedFiltersCloseRef = useRef<HTMLButtonElement | null>(null);
  const steamWishlistHtmlImportButtonRef = useRef<HTMLButtonElement | null>(null);
  const collectionPanelRef = useRef<HTMLElement | null>(null);
  const { t } = useI18n();
  const title = collectionType === 'wishlist' ? t('collection.wishlist') : t('collection.library');
  const emptyTitle = collectionType === 'wishlist' ? t('collection.emptyWishlistTitle') : t('collection.emptyLibraryTitle');
  const emptyText =
    collectionType === 'wishlist'
      ? t('collection.emptyWishlistText')
      : t('collection.emptyLibraryText');
  const virtualResetKey = useMemo(
    () =>
      [
        collectionType,
        viewMode,
        filters.searchTerm,
        filters.status,
        filters.platform,
        filters.tag,
        filters.source,
        filters.enrichment,
        filters.achievement,
        filters.sortBy,
        filters.quickFilters.join('|'),
      ].join(':'),
    [collectionType, filters, viewMode],
  );
  const visibleGames = games;
  const realCoverCount = useMemo(() => games.reduce((count, game) => count + (isMissingOrGeneratedCover(game.coverImage) ? 0 : 1), 0), [games]);
  const selectedGames = useMemo(() => games.filter((game) => selectedGameIds.has(game.id)), [games, selectedGameIds]);
  const selectedCount = selectedGames.length;
  const selectedSteamCount = useMemo(() => selectedGames.reduce((count, game) => count + (typeof game.steamAppId === 'number' ? 1 : 0), 0), [selectedGames]);
  const selectedAchievementSteamCount = useMemo(() => selectedGames.reduce((count, game) => count + (isSteamAchievementSyncableGame(game) ? 1 : 0), 0), [selectedGames]);
  const selectedRefreshableSteamCount = useMemo(() => selectedGames.reduce((count, game) => count + (isRefreshableSteamGame(game) ? 1 : 0), 0), [selectedGames]);
  const visibleRefreshableSteamCount = useMemo(() => games.reduce((count, game) => count + (isRefreshableSteamGame(game) ? 1 : 0), 0), [games]);
  const visibleAchievementSteamCount = useMemo(() => games.reduce((count, game) => count + (isSteamAchievementSyncableGame(game) ? 1 : 0), 0), [games]);
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
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [contentScrollRef, virtualResetKey]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const panel = collectionPanelRef.current;
    const panelRect = panel?.getBoundingClientRect();

    console.debug('[QuestShelf Library] render window', {
      collectionType,
      filteredItemCount: games.length,
      realCoverCount,
      placeholderCount: games.length - realCoverCount,
      viewMode,
      scrollContainer: panel
        ? {
            clientHeight: panel.clientHeight,
            scrollHeight: panel.scrollHeight,
            top: panelRect?.top,
            height: panelRect?.height,
          }
        : null,
      viewportHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? null,
    });
  }, [collectionType, games.length, realCoverCount, viewMode]);

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

  async function refreshSelectedSteamPlaytime() {
    if (selectedCount === 0 || !onBulkRefreshSteamPlaytime || isSteamPlaytimeSyncing) {
      return;
    }

    setBulkSummary(null);
    setIsCollectionSteamPlaytimeSyncVisible(true);
    try {
      const summary = await onBulkRefreshSteamPlaytime(selectedGames.map((game) => game.id), {
        emptyToastMessage: 'No selected Steam games are eligible for playtime sync.',
      });

      if (summary) {
        setBulkSummary(summary);
      }
    } finally {
      setIsCollectionSteamPlaytimeSyncVisible(false);
    }
  }

  async function syncLibrarySteamAchievements() {
    if (collectionType !== 'library' || !onBulkSyncSteamAchievements || isSteamAchievementSyncing) {
      return;
    }

    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;

    setBulkSummary(null);
    setIsCollectionSteamAchievementSyncVisible(true);
    try {
      const summary = await onBulkSyncSteamAchievements(targetGames.map((game) => game.id), {
        emptyToastMessage: hasSelection
          ? 'No selected Steam games are eligible for achievement sync.'
          : t('collection.noEligibleSteamGames'),
      });

      if (summary) {
        setBulkSummary({ ...summary, message: formatSteamAchievementSyncSummary(summary) });
      }
    } finally {
      setIsCollectionSteamAchievementSyncVisible(false);
    }
  }

  async function syncLibrarySteamPlaytime() {
    if (collectionType !== 'library' || !onBulkRefreshSteamPlaytime || isSteamPlaytimeSyncing) {
      return;
    }

    const hasSelection = selectedCount > 0;
    const targetGames = hasSelection ? selectedGames : games;

    setBulkSummary(null);
    setIsCollectionSteamPlaytimeSyncVisible(true);
    try {
      const summary = await onBulkRefreshSteamPlaytime(targetGames.map((game) => game.id), {
        emptyToastMessage: hasSelection
          ? 'No selected Steam games are eligible for playtime sync.'
          : 'No visible Steam games are eligible for playtime sync.',
      });

      if (summary) {
        setBulkSummary(summary);
      }
    } finally {
      setIsCollectionSteamPlaytimeSyncVisible(false);
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
      setBulkSummary({ ...summary, message: formatMessageTemplate(t('app.bulkItadSummary'), { updated: summary.updatedCount, noMatch: summary.noMatchCount, failed: summary.failedCount }) });
    }
  }

  return (
    <GameListShell
      scrollRef={collectionPanelRef}
      stickyChrome={
        <>
          <CollectionToolbar
            title={title}
        searchValue={filters.searchTerm}
        searchPlaceholder={t('toolbar.findTitle')}
        onSearchChange={(value) => onFiltersChange({ searchTerm: value })}
        moreFiltersActiveCount={activeAdvancedFilterCount}
        moreFiltersOpen={isAdvancedFiltersOpen}
        moreFiltersButtonRef={advancedFiltersButtonRef}
        onMoreFiltersClick={() => setIsAdvancedFiltersOpen(true)}
        onClearFilters={hasActiveFilters ? onClearFilters : undefined}
        viewMode={{
          label: t('toolbar.viewMode'),
          value: viewMode,
          options: [...collectionViewModes],
          onChange: (value) => setViewMode(value as CollectionViewMode),
        }}
        primaryAction={
          <button
            aria-label={collectionType === 'wishlist' ? t('toolbar.addWishlistGame') : t('toolbar.addGame')}
            className="grid h-9 w-9 place-items-center rounded-md bg-mint text-ink-950 shadow-glow transition hover:bg-mint/90"
            onClick={onAddGame}
            title={collectionType === 'wishlist' ? t('toolbar.addWishlistGame') : t('toolbar.addGame')}
            type="button"
          >
            <Icon name="plus" size={18} strokeWidth={2.5} />
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
        {isMultiSelectMode ? (
          <CollectionBulkToolbar
            collectionType={collectionType}
            selectedCount={selectedCount}
            isHltbSyncing={isHltbSyncing}
            isSteamPlaytimeSyncing={isSteamPlaytimeSyncing}
            isWishlistDealSyncing={isItadDealSyncing}
            isWishlistDealSyncDisabled={isWishlistDealSyncDisabled}
            wishlistDealSyncTitle={wishlistDealSyncTitle}
            onSelectAll={selectAllVisible}
            onClearSelection={clearSelection}
            onStatusChange={changeSelectedStatus}
            onEnrich={enrichSelectedGames}
            onSyncHltb={syncVisibleOrSelectedHltb}
            onAddToWishlist={collectionType === 'library' ? addSelectedToWishlist : undefined}
            onRefreshSteamPlaytime={collectionType === 'library' && onBulkRefreshSteamPlaytime ? refreshSelectedSteamPlaytime : undefined}
            onSyncSteamAchievements={collectionType === 'library' && onBulkSyncSteamAchievements ? syncLibrarySteamAchievements : undefined}
            onSyncWishlistDeals={hasWishlistDealSyncAction ? syncVisibleOrSelectedWishlistDeals : undefined}
            onRemove={removeSelectedGames}
            onRemoveAndIgnore={collectionType === 'library' ? removeAndIgnoreSelectedGames : undefined}
          />
        ) : null}
        </>
      }
    >

      {collectionType === 'library' && isCollectionSteamAchievementSyncVisible && steamAchievementSyncState && steamAchievementSyncState.status === 'loading' ? (
        <SteamAchievementSyncNotice syncState={steamAchievementSyncState} />
      ) : null}

      {collectionType === 'library' && isCollectionSteamPlaytimeSyncVisible && steamPlaytimeRefreshState && steamPlaytimeRefreshState.status === 'loading' ? (
        <SteamPlaytimeRefreshNotice refreshState={steamPlaytimeRefreshState} />
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
                  label={t('toolbar.status')}
                  value={filters.status}
                  options={[allOption, ...gameStatuses]}
                  onChange={(value) => onFiltersChange({ status: value as GameStatus | typeof allOption })}
                />

                <FilterSelect
                  label={t('toolbar.platform')}
                  value={filters.platform}
                  options={[allOption, ...platformOptions]}
                  onChange={(value) => onFiltersChange({ platform: value as GamePlatform | typeof allOption })}
                />

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
            debugLabel={`${collectionType} shelf`}
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
            debugLabel={`${collectionType} compact`}
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
            scrollElementRef={contentScrollRef}
          />
        ) : (
          <CollectionGrid
            debugLabel={`${collectionType} grid`}
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
            scrollElementRef={contentScrollRef}
          />
        )
      ) : (
        <GameListEmptyState title={emptyTitle} text={emptyText} />
      )}

    </GameListShell>
  );
}

// ── Internal notice sub-components ───────────────────────────────────────────

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
          <NoticeStat label={t('app.unchanged')} value={syncState.summary.unchangedCount.toString()} />
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
          <NoticeStat label={t('app.updated')} value={refreshState.summary.updatedCount.toString()} />
          <NoticeStat label={t('app.unchanged')} value={refreshState.summary.unchangedCount.toString()} />
          <NoticeStat label={t('app.failed')} value={refreshState.summary.failedCount.toString()} />
          <NoticeStat label={t('app.nonSteamSkipped')} value={refreshState.summary.skippedNonSteamCount.toString()} />
        </div>
      ) : null}
    </div>
  );
}

function ItadDealSyncNotice({ syncState }: { syncState: ItadDealSyncState }) {
  const { t } = useI18n();
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
          <SyncStat label={t('app.updated')} value={syncState.summary.updatedCount} />
          <SyncStat label={t('app.noMatch')} value={syncState.summary.noMatchCount} />
          <SyncStat label={t('app.failed')} value={syncState.summary.failedCount} />
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

// ── Shared filter select ──────────────────────────────────────────────────────

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
