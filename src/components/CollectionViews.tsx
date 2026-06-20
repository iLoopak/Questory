import { Icon } from './Icon';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { translateOption, useI18n } from '../i18n';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import { GameActionMenu } from './GameActionMenu';
import { GameCard } from './GameCard';
import { AchievementProgressBadge } from './AchievementProgressBadge';
import { PlatformBadge } from './PlatformBadge';
import { DealCoverBadges } from './DealCoverBadges';
import { HltbBadge } from './HltbBadge';
import { useVirtualWindow } from '../hooks/useVirtualWindow';

type CollectionActionHandlers = {
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onPlayNow?: (game: Game) => void;
  onFinish?: (game: Game) => void;
  onDrop?: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

type CollectionSelectionProps = {
  isMultiSelectMode?: boolean;
  selectedGameIds?: Set<string>;
  onToggleSelected?: (gameId: string) => void;
};

type CollectionHighlightProps = {
  getHighlightLabel?: (game: Game) => string | undefined;
};

type CollectionViewProps = CollectionActionHandlers &
  CollectionSelectionProps &
  CollectionHighlightProps & {
    games: Game[];
    hideRecommendationBadge?: boolean;
    suppressWantToPlayStatus?: boolean;
    includeDetailsAction?: boolean;
    debugLabel?: string;
    platformQueueState?: PlatformQueueState;
    scrollElementRef?: RefObject<HTMLElement | null>;
  };


export function CollectionGrid({
  games,
  debugLabel = 'Collection grid',
  getHighlightLabel,
  hideRecommendationBadge = false,
  suppressWantToPlayStatus = false,
  includeDetailsAction = false,
  isMultiSelectMode = false,
  selectedGameIds = new Set(),
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  platformQueueState,
  scrollElementRef,
}: CollectionViewProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);
  const rowHeight = useMemo(() => getVirtualGridRowHeight(), []);
  const platformLabelByGameId = usePlatformLabelMap(games, platformQueueState);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function measureColumns() {
      const grid = gridRef.current;
      const width = grid?.clientWidth ?? 0;
      setColumns((currentColumns) => {
        const nextColumns = getVirtualGridColumns(width);
        return currentColumns === nextColumns ? currentColumns : nextColumns;
      });
    }

    measureColumns();
    const resizeObserver = typeof ResizeObserver !== 'undefined' && gridRef.current ? new ResizeObserver(measureColumns) : null;
    resizeObserver?.observe(gridRef.current as Element);
    window.addEventListener('resize', measureColumns);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measureColumns);
    };
  }, []);

  const rowCount = Math.ceil(games.length / columns);
  const virtualRows = useVirtualWindow({
    itemCount: rowCount,
    estimateItemSize: rowHeight,
    overscan: 3,
    scrollElementRef,
    virtualizerRef: gridRef,
  });
  const startItemIndex = Math.min(games.length, virtualRows.startIndex * columns);
  const endItemIndex = Math.min(games.length, (virtualRows.endIndex + 1) * columns);
  const renderedGames = games.slice(startItemIndex, endItemIndex);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const container = scrollElementRef?.current;
    console.debug('[QuestShelf VirtualGameGrid]', {
      label: debugLabel,
      totalItems: games.length,
      renderedItemCount: renderedGames.length,
      mountedCardCount: getMountedCollectionCardCount(container),
      virtualRangeStart: startItemIndex,
      virtualRangeEnd: Math.max(startItemIndex, endItemIndex - 1),
      rowRangeStart: virtualRows.startIndex,
      rowRangeEnd: virtualRows.endIndex,
      columns,
      viewportHeight: virtualRows.viewportSize,
      containerHeight: container?.clientHeight ?? null,
    });
  }, [columns, debugLabel, endItemIndex, games.length, renderedGames.length, scrollElementRef, startItemIndex, virtualRows.endIndex, virtualRows.startIndex, virtualRows.viewportSize]);

  return (
    <div ref={gridRef} className="relative" style={{ height: virtualRows.totalSize }}>
      <div
        className="qs-game-grid absolute left-0 top-0 w-full grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2 2xl:grid-cols-4"
        style={{ transform: `translateY(${virtualRows.offsetBefore}px)` }}
      >
        {renderedGames.map((game) => (
          <VirtualGridGameCard
            key={game.id}
            game={game}
            getHighlightLabel={getHighlightLabel}
            hideRecommendationBadge={hideRecommendationBadge}
            suppressWantToPlayStatus={suppressWantToPlayStatus}
            includeDetailsAction={includeDetailsAction}
            isMultiSelectMode={isMultiSelectMode}
            isSelected={selectedGameIds.has(game.id)}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            onToggleSelected={onToggleSelected}
            platformLabel={platformLabelByGameId.get(game.id) ?? game.platform}
            platformQueueState={platformQueueState}
          />
        ))}
      </div>
    </div>
  );
}

export function CollectionShelf({
  games,
  debugLabel = 'Collection shelf',
  getHighlightLabel,
  hideRecommendationBadge = false,
  suppressWantToPlayStatus = false,
  includeDetailsAction = false,
  isMultiSelectMode = false,
  selectedGameIds = new Set(),
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  platformQueueState,
}: CollectionViewProps) {
  const { t } = useI18n();
  const shelfScrollerRef = useRef<HTMLDivElement | null>(null);
  const shelfCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [cardSize, setCardSize] = useState(224);
  const platformLabelByGameId = usePlatformLabelMap(games, platformQueueState);
  const virtualItems = useVirtualWindow({
    itemCount: games.length,
    estimateItemSize: cardSize,
    overscan: 4,
    horizontal: true,
    scrollElementRef: shelfScrollerRef,
  });
  const renderedShelfGames = games.slice(virtualItems.startIndex, virtualItems.endIndex + 1);
  // Stable signature of game IDs in order. Only resets scroll when the set or
  // order of games actually changes — not on every property mutation.
  const shelfGameIdsSignature = useMemo(() => games.map((g) => g.id).join('|'), [games]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function measureCardSize() {
      const scrollerWidth = shelfScrollerRef.current?.clientWidth ?? window.innerWidth;
      const cardWidth = Math.min(256, Math.max(176, scrollerWidth * 0.22));
      setCardSize((currentSize) => {
        const nextSize = cardWidth + 8;
        return currentSize === nextSize ? currentSize : nextSize;
      });
    }

    measureCardSize();
    window.addEventListener('resize', measureCardSize);

    return () => window.removeEventListener('resize', measureCardSize);
  }, []);

  useEffect(() => {
    shelfScrollerRef.current?.scrollTo({ left: 0, behavior: 'auto' });
    shelfCardRefs.current = [];
  }, [shelfGameIdsSignature]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.debug('[QuestShelf VirtualGameShelf]', {
      label: debugLabel,
      totalItems: games.length,
      renderedItemCount: renderedShelfGames.length,
      mountedCardCount: getMountedCollectionCardCount(shelfScrollerRef.current),
      virtualRangeStart: virtualItems.startIndex,
      virtualRangeEnd: virtualItems.endIndex,
      columns: renderedShelfGames.length,
      viewportHeight: shelfScrollerRef.current?.clientHeight ?? null,
      containerHeight: shelfScrollerRef.current?.clientHeight ?? null,
    });
  }, [debugLabel, games.length, renderedShelfGames.length, virtualItems.endIndex, virtualItems.startIndex]);

  function scrollShelfIndexIntoView(index: number) {
    shelfScrollerRef.current?.scrollTo({ left: Math.max(0, index * cardSize - cardSize), behavior: 'smooth' });
  }

  function focusShelfCard(index: number) {
    const targetCard = shelfCardRefs.current[index];

    if (!targetCard) {
      scrollShelfIndexIntoView(index);
      return;
    }

    targetCard.focus({ preventScroll: true });
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleShelfKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, absoluteIndex: number, game: Game) {
    if (event.key === 'ArrowRight' || event.key === 'DPadRight') {
      event.preventDefault();
      focusShelfCard(Math.min(absoluteIndex + 1, games.length - 1));
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'DPadLeft') {
      event.preventDefault();
      focusShelfCard(Math.max(absoluteIndex - 1, 0));
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'DPadDown') {
      event.preventDefault();
      focusShelfCard(Math.min(absoluteIndex + 4, games.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'DPadUp') {
      event.preventDefault();
      focusShelfCard(Math.max(absoluteIndex - 4, 0));
      return;
    }

    if (event.key === 'x' || event.key === 'X' || event.key === 'y' || event.key === 'Y') {
      if (!isMultiSelectMode) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'a' || event.key === 'A' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isMultiSelectMode) {
        onToggleSelected?.(game.id);
      } else {
        onOpenDetails(game.id);
      }
    }
  }

  return (
    <div>
      <div
        ref={shelfScrollerRef}
        aria-label={t('collection.shelfA11y')}
        className="qs-shelf-scroller -mx-2 overflow-x-auto px-2 pb-3 pt-1 sm:-mx-3 sm:px-3"
      >
        <div className="relative" style={{ height: '100%', minHeight: '27rem', width: virtualItems.totalSize }}>
          <div className="absolute inset-y-0 left-0 flex snap-x gap-2" style={{ transform: `translateX(${virtualItems.offsetBefore}px)` }}>
            {renderedShelfGames.map((game, visibleIndex) => {
              const absoluteIndex = virtualItems.startIndex + visibleIndex;

              return (
                <ShelfGameCard
                  key={game.id}
                  refCallback={(element) => {
                    shelfCardRefs.current[absoluteIndex] = element;
                  }}
                  game={game}
                  getHighlightLabel={getHighlightLabel}
                  hideRecommendationBadge={hideRecommendationBadge}
                  suppressWantToPlayStatus={suppressWantToPlayStatus}
                  includeDetailsAction={includeDetailsAction}
                  index={absoluteIndex}
                  isMultiSelectMode={isMultiSelectMode}
                  isSelected={selectedGameIds.has(game.id)}
                  onAddToQueue={onAddToQueue}
                  onAddToWishlist={onAddToWishlist}
                  onFindMetadata={onFindMetadata}
                  onKeyDown={handleShelfKeyDown}
                  onMoveToLibrary={onMoveToLibrary}
                  onOpenDetails={onOpenDetails}
                  onRemove={onRemove}
                  onRemoveAndIgnore={onRemoveAndIgnore}
                  onStatusChange={onStatusChange}
                  onToggleSelected={onToggleSelected}
                  platformLabel={platformLabelByGameId.get(game.id) ?? game.platform}
                  platformQueueState={platformQueueState}
                />
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t('collection.shelfHelp')}</p>
    </div>
  );
}

export function CollectionList({
  games,
  debugLabel = 'Collection list',
  getHighlightLabel,
  hideRecommendationBadge = false,
  suppressWantToPlayStatus = false,
  includeDetailsAction = false,
  isMultiSelectMode = false,
  selectedGameIds = new Set(),
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onPlayNow,
  onFinish,
  onDrop,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  platformQueueState,
  scrollElementRef,
}: CollectionViewProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = 98;
  const platformLabelByGameId = usePlatformLabelMap(games, platformQueueState);
  const virtualRows = useVirtualWindow({
    itemCount: games.length,
    estimateItemSize: rowHeight,
    overscan: 6,
    scrollElementRef,
    virtualizerRef: listRef,
  });
  const renderedGames = games.slice(virtualRows.startIndex, virtualRows.endIndex + 1);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const container = scrollElementRef?.current;
    console.debug('[QuestShelf VirtualGameList]', {
      label: debugLabel,
      totalItems: games.length,
      renderedItemCount: renderedGames.length,
      mountedCardCount: getMountedCollectionCardCount(container),
      virtualRangeStart: virtualRows.startIndex,
      virtualRangeEnd: virtualRows.endIndex,
      columns: 1,
      viewportHeight: virtualRows.viewportSize,
      containerHeight: container?.clientHeight ?? null,
    });
  }, [debugLabel, games.length, renderedGames.length, scrollElementRef, virtualRows.endIndex, virtualRows.startIndex, virtualRows.viewportSize]);

  return (
    <div ref={listRef} className="relative" style={{ height: virtualRows.totalSize }}>
      <div className="absolute left-0 top-0 grid w-full gap-2" style={{ transform: `translateY(${virtualRows.offsetBefore}px)` }}>
        {renderedGames.map((game) => (
          <CompactGameRow
            key={game.id}
            game={game}
            getHighlightLabel={getHighlightLabel}
            hideRecommendationBadge={hideRecommendationBadge}
            suppressWantToPlayStatus={suppressWantToPlayStatus}
            includeDetailsAction={includeDetailsAction}
            isMultiSelectMode={isMultiSelectMode}
            isSelected={selectedGameIds.has(game.id)}
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
            onToggleSelected={onToggleSelected}
            platformLabel={platformLabelByGameId.get(game.id) ?? game.platform}
            platformQueueState={platformQueueState}
          />
        ))}
      </div>
    </div>
  );
}


type VirtualGridGameCardProps = CollectionActionHandlers &
  CollectionSelectionProps &
  CollectionHighlightProps & {
    game: Game;
    hideRecommendationBadge: boolean;
    suppressWantToPlayStatus: boolean;
    includeDetailsAction: boolean;
    isMultiSelectMode: boolean;
    isSelected: boolean;
    platformLabel: GamePlatform;
    platformQueueState?: PlatformQueueState;
  };

const VirtualGridGameCard = memo(function VirtualGridGameCard({
  game,
  getHighlightLabel,
  hideRecommendationBadge,
  suppressWantToPlayStatus,
  includeDetailsAction,
  isMultiSelectMode,
  isSelected,
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  platformLabel,
  platformQueueState,
}: VirtualGridGameCardProps) {
  const openDetails = useCallback(() => onOpenDetails(game.id), [game.id, onOpenDetails]);
  const toggleSelected = useCallback(() => onToggleSelected?.(game.id), [game.id, onToggleSelected]);
  const highlightLabel = hideRecommendationBadge ? undefined : getHighlightLabel?.(game);

  return (
    <GameCard
      game={game}
      highlightLabel={highlightLabel}
      includeDetailsAction={includeDetailsAction}
      isMultiSelectMode={isMultiSelectMode}
      isSelected={isSelected}
      suppressWantToPlayStatus={suppressWantToPlayStatus}
      onAddToQueue={onAddToQueue}
      onAddToWishlist={onAddToWishlist}
      onFindMetadata={onFindMetadata}
      onMoveToLibrary={onMoveToLibrary}
      onOpenDetails={openDetails}
      onRemove={onRemove}
      onRemoveAndIgnore={onRemoveAndIgnore}
      onStatusChange={onStatusChange}
      onToggleSelected={toggleSelected}
      platformLabel={platformLabel}
      platformQueueState={platformQueueState}
    />
  );
});

type ShelfGameCardProps = {
  game: Game;
  getHighlightLabel?: (game: Game) => string | undefined;
  hideRecommendationBadge: boolean;
  suppressWantToPlayStatus: boolean;
  includeDetailsAction: boolean;
  index: number;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, absoluteIndex: number, game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onToggleSelected?: (gameId: string) => void;
  refCallback: (element: HTMLDivElement | null) => void;
  platformLabel: GamePlatform;
  platformQueueState?: PlatformQueueState;
};

function useStableCollectionCoverSources(game: Game) {
  const coverSources = useMemo(
    () => getGameCoverSources(game, { includeGeneratedFallback: false }),
    [
      game.artworkSource,
      game.backgroundImage,
      game.coverImage,
      game.externalSource,
      game.steamAppId,
    ],
  );
  const coverSourceSignature = useMemo(() => coverSources.join('\n'), [coverSources]);

  return { coverSourceSignature, coverSources };
}

const ShelfGameCard = memo(function ShelfGameCard({
  game,
  getHighlightLabel,
  hideRecommendationBadge,
  suppressWantToPlayStatus,
  includeDetailsAction,
  index,
  isMultiSelectMode,
  isSelected,
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onKeyDown,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  refCallback,
  platformLabel,
  platformQueueState,
}: ShelfGameCardProps) {
  const { t } = useI18n();
  const { coverSourceSignature, coverSources } = useStableCollectionCoverSources(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];
  const highlightLabel = hideRecommendationBadge ? undefined : getHighlightLabel?.(game);
  const shouldShowStatusBadge = game.status !== 'Want to play' || (game.collectionType === 'library' && !suppressWantToPlayStatus);
  const openDetails = useCallback(() => onOpenDetails(game.id), [game.id, onOpenDetails]);
  const toggleSelected = useCallback(() => onToggleSelected?.(game.id), [game.id, onToggleSelected]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSourceSignature]);

  function handleShelfCardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setIsActionMenuOpen(false);
      onKeyDown(event, index, game);
      return;
    }

    if (event.key === 'x' || event.key === 'X' || event.key === 'y' || event.key === 'Y') {
      if (!isMultiSelectMode) {
        event.preventDefault();
        setIsActionMenuOpen((currentValue) => !currentValue);
        return;
      }
    }

    onKeyDown(event, index, game);
  }

  return (
    <div
      ref={refCallback}
      aria-label={`${isMultiSelectMode ? t('collection.select') : 'Open'} ${game.title}`}
      aria-posinset={index + 1}
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-shelf-card group relative flex w-[clamp(11rem,22vw,16rem)] shrink-0 snap-center flex-col rounded-xl border bg-ink-950/80 p-2 text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-mint/45 hover:shadow-glow focus-visible:-translate-y-1 focus-visible:border-mint/80 focus-visible:shadow-glow ${
        isSelected ? 'border-mint/80 shadow-glow ring-2 ring-mint/40' : highlightLabel ? 'border-amber-300/70 ring-1 ring-amber-300/30' : 'border-skyglass/18'
      }`}
      onClick={isMultiSelectMode ? toggleSelected : openDetails}
      onKeyDown={handleShelfCardKeyDown}
      role="button"
      tabIndex={0}
    >
      {isMultiSelectMode ? (
        <span className="absolute left-4 top-4 z-20 grid h-8 w-8 place-items-center rounded-full border border-mint/45 bg-ink-950/95 text-sm font-bold text-mint shadow-glow">
          {isSelected ? <Icon name="check" /> : null}
        </span>
      ) : null}

      {highlightLabel ? (
        <span className="absolute right-4 top-4 z-20 rounded-full border border-amber-300/40 bg-amber-300 px-2.5 py-1 text-xs font-bold text-ink-950 shadow-glow">
          {highlightLabel}
        </span>
      ) : null}

      <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-ink-700">
        {activeCoverSource ? (
          <>
            {!isCoverLoaded ? <span className="absolute inset-0 animate-pulse bg-white/5" /> : null}
            <img
              alt=""
              className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${
                isCoverLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              decoding="async"
              loading="lazy"
              onError={() => {
                setIsCoverLoaded(false);
                setCoverSourceIndex((currentIndex) => currentIndex + 1);
              }}
              onLoad={() => setIsCoverLoaded(true)}
              src={activeCoverSource}
            />
          </>
        ) : (
          <MissingCover title={game.title} />
        )}
        <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />
        <span className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
          <PlatformBadge
            className="max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold"
            platform={platformLabel}
            queueState={platformQueueState}
          />
          {shouldShowStatusBadge ? (
            <span className="platform-badge max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold" title={translateOption(game.status, t)}>
              <span className="platform-badge__label">{translateOption(game.status, t)}</span>
            </span>
          ) : null}
        </span>
        {game.status === 'Playing' || game.status === 'Paused' ? (
          <span className="absolute right-3 top-3 h-3 w-3 rounded-full border border-white/70 bg-mint shadow-glow" title={translateOption(game.status, t)} />
        ) : null}
        <DealCoverBadges game={game} variant="shelf" />
      </span>

      <span className="mt-2.5 block min-h-[2.75rem]">
        <span className="line-clamp-2 text-base font-semibold leading-6 text-white">{game.title}</span>

      </span>

      {!isMultiSelectMode ? (
        <span className="mt-2.5 flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {onAddToQueue ? (
            <button
              className="min-h-10 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow focus-visible:bg-mint focus-visible:text-ink-950"
              onClick={() => onAddToQueue(game)}
              onKeyDown={(event) => event.stopPropagation()}
              type="button"
            >
              {t('action.addToQueue')}
            </button>
          ) : null}
          <GameActionMenu
            game={game}
            includeDetails={includeDetailsAction}
            isOpen={isActionMenuOpen}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onClose={() => setIsActionMenuOpen(false)}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenChange={setIsActionMenuOpen}
            onOpenDetails={openDetails}
            onRemove={onRemove}
            onRemoveAndIgnore={onRemoveAndIgnore}
            onStatusChange={onStatusChange}
            variant="shelf"
          />
        </span>
      ) : null}
    </div>
  );
}, areVirtualCardPropsEqual);

type CompactGameRowProps = {
  game: Game;
  getHighlightLabel?: (game: Game) => string | undefined;
  hideRecommendationBadge: boolean;
  suppressWantToPlayStatus: boolean;
  includeDetailsAction: boolean;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onPlayNow?: (game: Game) => void;
  onFinish?: (game: Game) => void;
  onDrop?: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onToggleSelected?: (gameId: string) => void;
  platformLabel: GamePlatform;
  platformQueueState?: PlatformQueueState;
};

const CompactGameRow = memo(function CompactGameRow({
  game,
  getHighlightLabel,
  hideRecommendationBadge,
  suppressWantToPlayStatus,
  includeDetailsAction,
  isMultiSelectMode,
  isSelected,
  onAddToQueue,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onPlayNow,
  onFinish,
  onDrop,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
  platformLabel,
  platformQueueState,
}: CompactGameRowProps) {
  const { t } = useI18n();
  const { coverSourceSignature, coverSources } = useStableCollectionCoverSources(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];
  const highlightLabel = hideRecommendationBadge ? undefined : getHighlightLabel?.(game);
  const shouldShowStatusBadge = game.status !== 'Want to play' || (game.collectionType === 'library' && !suppressWantToPlayStatus);
  const openDetails = useCallback(() => onOpenDetails(game.id), [game.id, onOpenDetails]);
  const removeGame = useCallback(() => onRemove(game.id), [game.id, onRemove]);
  const removeAndIgnoreGame = useCallback(() => onRemoveAndIgnore(game), [game, onRemoveAndIgnore]);
  const changeStatus = useCallback((status: GameStatus) => onStatusChange(game.id, status), [game.id, onStatusChange]);
  const toggleSelected = useCallback(() => onToggleSelected?.(game.id), [game.id, onToggleSelected]);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSourceSignature]);

  return (
    <article
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-compact-card flex min-w-0 gap-2 rounded-lg border bg-ink-950/70 p-2 transition hover:border-mint/35 hover:bg-mint/10 focus-within:border-mint/70 ${
        isMultiSelectMode ? 'flex-row items-center' : 'flex-col sm:flex-row sm:items-center'
      } ${
        isSelected ? 'border-mint/70 shadow-glow ring-1 ring-mint/40' : highlightLabel ? 'border-amber-300/70 ring-1 ring-amber-300/25' : 'border-skyglass/15'
      }`}
    >
      {isMultiSelectMode ? (
        <label
          className={`grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md border transition focus-within:ring-2 focus-within:ring-mint/70 ${
            isSelected ? 'border-mint bg-mint text-ink-950 shadow-glow' : 'border-skyglass/30 bg-ink-950/70 text-slate-300 hover:border-mint/60 hover:text-white'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          <input aria-label={`Select ${game.title}`} checked={isSelected} className="sr-only" onChange={toggleSelected} type="checkbox" />
          {isSelected ? (
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-current opacity-80" />
          )}
        </label>
      ) : null}

      <button
        aria-label={isMultiSelectMode ? `Select ${game.title}` : `Open details for ${game.title}`}
        aria-pressed={isMultiSelectMode ? isSelected : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={isMultiSelectMode ? toggleSelected : openDetails}
        type="button"
      >
        <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-md bg-ink-700">
          {activeCoverSource ? (
            <img
              alt=""
              className={`h-full w-full object-cover transition-opacity ${isCoverLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              loading="lazy"
              onError={() => {
                setIsCoverLoaded(false);
                setCoverSourceIndex((currentIndex) => currentIndex + 1);
              }}
              onLoad={() => setIsCoverLoaded(true)}
              src={activeCoverSource}
            />
          ) : (
            <MissingCover title={game.title} />
          )}
          <DealCoverBadges game={game} isInteractive={false} variant="compact" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            {highlightLabel ? (
              <span className="rounded-full border border-amber-300/40 bg-amber-300 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-950">
                {highlightLabel}
              </span>
            ) : null}
            <span className="line-clamp-1 text-sm font-semibold text-white sm:text-base">{game.title}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <PlatformBadge className="rounded-full px-2 py-0.5 font-semibold" platform={platformLabel} queueState={platformQueueState} />
            {shouldShowStatusBadge ? <span className="platform-badge rounded-full px-2 py-0.5 font-semibold">{translateOption(game.status, t)}</span> : null}
            {game.collectionType === 'wishlist' ? <span>{t('collection.wishlist')}</span> : null}

          </span>
        </span>
      </button>

      {!isMultiSelectMode ? (
        <div className="flex flex-wrap gap-1.5 sm:justify-end" aria-label={t('app.quickActionsForGame').replace('{game}', game.title)}>
          {onAddToQueue ? <RowAction label={t('queue.platforms')} onClick={() => onAddToQueue(game)} /> : null}
          <RowAction label={t('action.details')} onClick={openDetails} primary />
          <GameActionMenu
            game={game}
            includeDetails={includeDetailsAction}
            onAddToQueue={onAddToQueue}
            onAddToWishlist={onAddToWishlist}
            onFindMetadata={onFindMetadata}
            onMoveToLibrary={onMoveToLibrary}
            onOpenDetails={openDetails}
            onRemove={removeGame}
            onRemoveAndIgnore={removeAndIgnoreGame}
            onStatusChange={(gameId, status) => changeStatus(status)}
            variant="compact"
          />
        </div>
      ) : null}
    </article>
  );
}, areVirtualCardPropsEqual);


function getVirtualGridColumns(width: number) {
  if (width <= 0) {
    return 1;
  }

  const minimumCardWidth = 256;
  const gap = 8;
  const measuredColumns = Math.max(1, Math.floor((width + gap) / (minimumCardWidth + gap)));
  const largeScreenColumnCap = typeof window !== 'undefined' && window.innerWidth >= 1536 ? 4 : measuredColumns;

  return Math.min(measuredColumns, largeScreenColumnCap);
}

function getVirtualGridRowHeight() {
  if (typeof window === 'undefined') {
    return 268;
  }

  const isHandheld = window.matchMedia(
    '(orientation: landscape) and (max-height: 620px), (pointer: coarse) and (max-width: 940px)'
  ).matches;

  if (isHandheld) {
    return 220;
  }

  if (window.matchMedia('(min-width: 640px)').matches) {
    return 300;
  }

  return 268;
}

function usePlatformLabelMap(games: Game[], platformQueueState?: PlatformQueueState) {
  return useMemo(() => {
    const platformLabelByGameId = new Map<string, GamePlatform>();

    for (const game of games) {
      platformLabelByGameId.set(game.id, game.platform);
    }

    for (const entry of platformQueueState?.entries ?? []) {
      platformLabelByGameId.set(entry.gameId, entry.targetPlatform);
    }

    return platformLabelByGameId;
  }, [games, platformQueueState]);
}

function areVirtualCardPropsEqual<
  T extends CollectionActionHandlers &
    CollectionSelectionProps &
    CollectionHighlightProps & {
      game: Game;
      hideRecommendationBadge: boolean;
      includeDetailsAction: boolean;
      index?: number;
      isMultiSelectMode: boolean;
      isSelected: boolean;
      platformLabel: GamePlatform;
      platformQueueState?: PlatformQueueState;
    },
>(previousProps: T, nextProps: T) {
  return (
    previousProps.game === nextProps.game &&
    previousProps.getHighlightLabel === nextProps.getHighlightLabel &&
    previousProps.hideRecommendationBadge === nextProps.hideRecommendationBadge &&
    previousProps.includeDetailsAction === nextProps.includeDetailsAction &&
    previousProps.index === nextProps.index &&
    previousProps.isMultiSelectMode === nextProps.isMultiSelectMode &&
    previousProps.isSelected === nextProps.isSelected &&
    previousProps.onAddToQueue === nextProps.onAddToQueue &&
    previousProps.onAddToWishlist === nextProps.onAddToWishlist &&
    previousProps.onFindMetadata === nextProps.onFindMetadata &&
    previousProps.onMoveToLibrary === nextProps.onMoveToLibrary &&
    previousProps.onOpenDetails === nextProps.onOpenDetails &&
    previousProps.onRemove === nextProps.onRemove &&
    previousProps.onRemoveAndIgnore === nextProps.onRemoveAndIgnore &&
    previousProps.onStatusChange === nextProps.onStatusChange &&
    previousProps.onToggleSelected === nextProps.onToggleSelected &&
    previousProps.platformLabel === nextProps.platformLabel &&
    previousProps.platformQueueState === nextProps.platformQueueState
  );
}

function getMountedCollectionCardCount(container: HTMLElement | null | undefined) {
  return container?.querySelectorAll('.qs-game-card, .qs-shelf-card, .qs-compact-card').length ?? null;
}

function RowAction({ label, onClick, primary = false, tone }: { label: string; onClick: () => void; primary?: boolean; tone?: 'danger' }) {
  return (
    <button
      className={`h-8 rounded-md border px-2 text-xs font-semibold transition sm:h-9 sm:px-2.5 sm:text-sm ${
        primary
          ? 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20'
          : tone === 'danger'
            ? 'border-red-400/25 text-red-200 hover:bg-red-500/10'
            : 'border-skyglass/15 text-slate-200 hover:bg-mint/10 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function MissingCover({ title }: { title: string }) {
  const { t } = useI18n();

  return (
    <span className="grid h-full place-items-center bg-ink-700 px-3 text-center">
      <span>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-mint/20 bg-ink-900 text-lg font-semibold text-mint shadow-glow">
          {title.slice(0, 1).toUpperCase()}
        </span>
        <span className="mt-2 block text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-500">{t('collection.noCover')}</span>
      </span>
    </span>
  );
}
