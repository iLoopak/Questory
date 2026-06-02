import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';
import { GameCard } from './GameCard';

type CollectionActionHandlers = {
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
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
  };

const shelfInitialRenderCount = 72;
const shelfRenderBatchSize = 48;

export function CollectionGrid({
  games,
  getHighlightLabel,
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
}: CollectionViewProps) {
  return (
    <div className="qs-game-grid grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2 2xl:grid-cols-4">
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          highlightLabel={getHighlightLabel?.(game)}
          isMultiSelectMode={isMultiSelectMode}
          isSelected={selectedGameIds.has(game.id)}
          onAddToQueue={onAddToQueue}
          onAddToWishlist={onAddToWishlist}
          onFindMetadata={onFindMetadata}
          onMoveToLibrary={onMoveToLibrary}
          onOpenDetails={() => onOpenDetails(game.id)}
          onRemove={onRemove}
          onRemoveAndIgnore={onRemoveAndIgnore}
          onStatusChange={onStatusChange}
          onToggleSelected={() => onToggleSelected?.(game.id)}
        />
      ))}
    </div>
  );
}

export function CollectionShelf({
  games,
  getHighlightLabel,
  isMultiSelectMode = false,
  selectedGameIds = new Set(),
  onOpenDetails,
  onToggleSelected,
}: Pick<CollectionViewProps, 'games' | 'getHighlightLabel' | 'isMultiSelectMode' | 'onOpenDetails' | 'onToggleSelected' | 'selectedGameIds'>) {
  const [shelfRenderCount, setShelfRenderCount] = useState(shelfInitialRenderCount);
  const shelfScrollerRef = useRef<HTMLDivElement | null>(null);
  const shelfCardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const renderedShelfGames = games.slice(0, shelfRenderCount);
  const hasMoreShelfGames = shelfRenderCount < games.length;

  useEffect(() => {
    setShelfRenderCount(shelfInitialRenderCount);
    shelfCardRefs.current = [];
  }, [games]);

  function loadMoreShelfGames() {
    setShelfRenderCount((currentCount) => Math.min(games.length, currentCount + shelfRenderBatchSize));
  }

  function handleShelfScroll() {
    const scroller = shelfScrollerRef.current;

    if (!scroller || !hasMoreShelfGames) {
      return;
    }

    if (scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 640) {
      loadMoreShelfGames();
    }
  }

  function focusShelfCard(index: number) {
    const targetCard = shelfCardRefs.current[index];

    if (!targetCard) {
      return;
    }

    targetCard.focus({ preventScroll: true });
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleShelfKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number, game: Game) {
    if (event.key === 'ArrowRight' || event.key === 'DPadRight') {
      event.preventDefault();

      if (index + 1 >= renderedShelfGames.length && hasMoreShelfGames) {
        loadMoreShelfGames();
        window.setTimeout(() => focusShelfCard(Math.min(index + 1, games.length - 1)), 0);
        return;
      }

      if (index >= renderedShelfGames.length - 8 && hasMoreShelfGames) {
        loadMoreShelfGames();
      }

      focusShelfCard(Math.min(index + 1, games.length - 1));
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'DPadLeft') {
      event.preventDefault();
      focusShelfCard(Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'DPadDown') {
      event.preventDefault();
      focusShelfCard(Math.min(index + 4, games.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'DPadUp') {
      event.preventDefault();
      focusShelfCard(Math.max(index - 4, 0));
      return;
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
        aria-label="Collection shelf"
        className="qs-shelf-scroller -mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-3 pt-1 sm:-mx-3 sm:px-3"
        onScroll={handleShelfScroll}
      >
        {renderedShelfGames.map((game, index) => (
          <ShelfGameCard
            key={game.id}
            refCallback={(element) => {
              shelfCardRefs.current[index] = element;
            }}
            game={game}
            highlightLabel={getHighlightLabel?.(game)}
            index={index}
            isMultiSelectMode={isMultiSelectMode}
            isSelected={selectedGameIds.has(game.id)}
            onKeyDown={(event) => handleShelfKeyDown(event, index, game)}
            onOpenDetails={() => onOpenDetails(game.id)}
            onToggleSelected={() => onToggleSelected?.(game.id)}
          />
        ))}
        {hasMoreShelfGames ? (
          <button
            className="flex w-48 shrink-0 snap-center flex-col items-center justify-center rounded-xl border border-dashed border-skyglass/25 bg-ink-950/70 p-4 text-sm font-semibold text-slate-300 transition hover:border-mint/40 hover:bg-mint/10 hover:text-white"
            onClick={loadMoreShelfGames}
            type="button"
          >
            Load more covers
            <span className="mt-2 block text-xs font-medium text-slate-500">{games.length - renderedShelfGames.length} still hidden for performance</span>
          </button>
        ) : null}
      </div>
      <p className="text-xs text-slate-500">Use D-pad / arrow keys to move across covers. Press A or Enter to open.</p>
    </div>
  );
}

export function CollectionList({
  games,
  getHighlightLabel,
  isMultiSelectMode = false,
  selectedGameIds = new Set(),
  onAddToQueue,
  onAddToWishlist,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
}: CollectionViewProps) {
  return (
    <div className="grid gap-2">
      {games.map((game) => (
        <CompactGameRow
          key={game.id}
          game={game}
          highlightLabel={getHighlightLabel?.(game)}
          isMultiSelectMode={isMultiSelectMode}
          isSelected={selectedGameIds.has(game.id)}
          onAddToQueue={onAddToQueue}
          onAddToWishlist={onAddToWishlist}
          onMoveToLibrary={onMoveToLibrary}
          onOpenDetails={() => onOpenDetails(game.id)}
          onRemove={() => onRemove(game.id)}
          onRemoveAndIgnore={() => onRemoveAndIgnore(game)}
          onStatusChange={(status) => onStatusChange(game.id, status)}
          onToggleSelected={() => onToggleSelected?.(game.id)}
        />
      ))}
    </div>
  );
}

type ShelfGameCardProps = {
  game: Game;
  highlightLabel?: string;
  index: number;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onOpenDetails: () => void;
  onToggleSelected: () => void;
  refCallback: (element: HTMLButtonElement | null) => void;
};

function ShelfGameCard({
  game,
  highlightLabel,
  index,
  isMultiSelectMode,
  isSelected,
  onKeyDown,
  onOpenDetails,
  onToggleSelected,
  refCallback,
}: ShelfGameCardProps) {
  const coverSources = useMemo(() => getGameCoverSources(game), [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  return (
    <button
      ref={refCallback}
      aria-label={`${isMultiSelectMode ? 'Select' : 'Open'} ${game.title}`}
      aria-posinset={index + 1}
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-shelf-card group relative flex w-[clamp(11rem,22vw,16rem)] shrink-0 snap-center flex-col rounded-xl border bg-ink-950/80 p-2 text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-mint/45 hover:shadow-glow focus-visible:-translate-y-1 focus-visible:border-mint/80 focus-visible:shadow-glow ${
        isSelected ? 'border-mint/80 shadow-glow ring-2 ring-mint/40' : highlightLabel ? 'border-amber-300/70 ring-1 ring-amber-300/30' : 'border-skyglass/18'
      }`}
      onClick={isMultiSelectMode ? onToggleSelected : onOpenDetails}
      onKeyDown={onKeyDown}
      type="button"
    >
      {isMultiSelectMode ? (
        <span className="absolute left-4 top-4 z-20 grid h-8 w-8 place-items-center rounded-full border border-mint/45 bg-ink-950/95 text-sm font-bold text-mint shadow-glow">
          {isSelected ? '✓' : ''}
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
        <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          {game.platform}
        </span>
        {game.status === 'Playing' || game.status === 'Paused' ? (
          <span className="absolute right-3 top-3 h-3 w-3 rounded-full border border-white/70 bg-mint shadow-glow" title={game.status} />
        ) : null}
      </span>

      <span className="mt-3 block min-h-[3rem]">
        <span className="line-clamp-2 text-base font-semibold leading-6 text-white">{game.title}</span>
        <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{game.status}</span>
      </span>
    </button>
  );
}

type CompactGameRowProps = {
  game: Game;
  highlightLabel?: string;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: () => void;
  onRemove: () => void;
  onRemoveAndIgnore: () => void;
  onStatusChange: (status: GameStatus) => void;
  onToggleSelected: () => void;
};

function CompactGameRow({
  game,
  highlightLabel,
  isMultiSelectMode,
  isSelected,
  onAddToQueue,
  onAddToWishlist,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
}: CompactGameRowProps) {
  const coverSources = useMemo(() => getGameCoverSources(game), [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  return (
    <article
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-ink-950/70 p-2 transition hover:border-mint/35 hover:bg-mint/10 focus-within:border-mint/70 sm:flex-row sm:items-center ${
        isSelected ? 'border-mint/70 shadow-glow ring-1 ring-mint/40' : highlightLabel ? 'border-amber-300/70 ring-1 ring-amber-300/25' : 'border-skyglass/15'
      }`}
    >
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={isMultiSelectMode ? onToggleSelected : onOpenDetails} type="button">
        <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-md bg-ink-700">
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
          <span className="mt-1 block text-xs text-slate-400">
            {game.platform} · {game.status}
            {game.collectionType === 'wishlist' ? ' · Wishlist' : ''}
          </span>
        </span>
      </button>

      {!isMultiSelectMode ? (
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <select
            aria-label={`Change status for ${game.title}`}
            className="h-9 rounded-md border border-skyglass/15 bg-ink-900 px-2 text-sm text-slate-100 outline-none transition focus:border-mint"
            onChange={(event) => onStatusChange(event.target.value as GameStatus)}
            value={game.status}
          >
            {gameStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          {onAddToQueue ? <RowAction label="Queue" onClick={() => onAddToQueue(game)} /> : null}
          {game.collectionType === 'wishlist' ? (
            <RowAction label="Library" onClick={() => onMoveToLibrary?.(game)} />
          ) : (
            <RowAction label="Wishlist" onClick={() => onAddToWishlist?.(game)} />
          )}
          <RowAction label="Details" onClick={onOpenDetails} primary />
          <RowAction label="Ignore" onClick={onRemoveAndIgnore} tone="danger" />
          <RowAction label={game.collectionType === 'wishlist' ? 'Remove' : 'Drop'} onClick={game.collectionType === 'wishlist' ? onRemove : () => onStatusChange('Dropped')} tone="danger" />
        </div>
      ) : null}
    </article>
  );
}

function RowAction({ label, onClick, primary = false, tone }: { label: string; onClick: () => void; primary?: boolean; tone?: 'danger' }) {
  return (
    <button
      className={`h-9 rounded-md border px-2.5 text-sm font-medium transition ${
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
  return (
    <span className="grid h-full place-items-center bg-ink-700 px-3 text-center">
      <span>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-mint/20 bg-ink-900 text-lg font-semibold text-mint shadow-glow">
          {title.slice(0, 1).toUpperCase()}
        </span>
        <span className="mt-2 block text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-500">No cover</span>
      </span>
    </span>
  );
}
