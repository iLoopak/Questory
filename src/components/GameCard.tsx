import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';

type GameCardProps = {
  game: Game;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: () => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onToggleSelected?: () => void;
};

export function GameCard({
  game,
  isMultiSelectMode = false,
  isSelected = false,
  onAddToWishlist,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
  onToggleSelected,
}: GameCardProps) {
  const coverSources = useMemo(() => {
    return getGameCoverSources(game);
  }, [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  const activeCoverSource = coverSources[coverSourceIndex];

  function handleCardClick() {
    if (isMultiSelectMode) {
      onToggleSelected?.();
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      setIsActionMenuOpen(false);
      return;
    }

    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      if (isMultiSelectMode) {
        onToggleSelected?.();
      } else {
        onOpenDetails();
      }
      return;
    }

    if (event.key === 'x' || event.key === 'X' || event.key === 'y' || event.key === 'Y') {
      event.preventDefault();
      if (isMultiSelectMode) {
        onToggleSelected?.();
      } else {
        setIsActionMenuOpen((currentValue) => !currentValue);
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    if (isMultiSelectMode) {
      onToggleSelected?.();
    } else {
      onOpenDetails();
    }
  }

  function stopCardAction(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <article
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-game-card qs-glass relative flex h-full min-h-[290px] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-lg border transition hover:border-mint/35 hover:shadow-glow focus-within:border-mint/45 focus-within:shadow-glow sm:min-h-[320px] ${
        isSelected ? 'border-mint/70 shadow-glow ring-1 ring-mint/40' : ''
      } ${isMultiSelectMode ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      {isMultiSelectMode ? (
        <div className="absolute left-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-mint/40 bg-ink-950/90 shadow-glow">
          <input
            aria-label={`Select ${game.title}`}
            checked={isSelected}
            className="h-4 w-4 accent-mint"
            onChange={() => onToggleSelected?.()}
            onClick={stopCardAction}
            type="checkbox"
          />
        </div>
      ) : null}

      <div className="relative aspect-[16/9] max-h-32 shrink-0 overflow-hidden bg-ink-700 sm:max-h-36">
        {activeCoverSource ? (
          <>
            {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
            <img
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                isCoverLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              src={activeCoverSource}
              alt=""
              decoding="async"
              loading="lazy"
              onError={() => {
                setIsCoverLoaded(false);
                setCoverSourceIndex((currentIndex) => currentIndex + 1);
              }}
              onLoad={() => setIsCoverLoaded(true)}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-mint/20 bg-ink-900 text-xl font-semibold text-mint shadow-glow">
                {game.title.slice(0, 1).toUpperCase()}
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">No cover</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 max-w-[75%] truncate rounded-full border border-skyglass/20 bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
          {game.platform}
        </span>
        {game.collectionType === 'wishlist' ? (
          <span className="absolute right-3 top-3 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
            Wishlist
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3
            className="line-clamp-2 text-base font-semibold leading-6 text-white sm:text-lg"
            title={game.title}
          >
            {game.title}
          </h3>

          <div className="mt-2 text-sm text-slate-400">{game.status}</div>
        </div>

        {!isMultiSelectMode ? (
          <select
            className="h-10 w-full rounded-md border border-skyglass/15 bg-ink-950/80 px-2 text-sm font-medium text-slate-100 outline-none transition focus:border-mint"
            value={game.status}
            aria-label={`Change status for ${game.title}`}
            onChange={(event) => onStatusChange(game.id, event.target.value as GameStatus)}
            onClick={stopCardAction}
          >
            {gameStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ) : null}

        <div className="mt-auto border-t border-skyglass/15 pt-3">
          <div className="flex items-center gap-2">
            <button
              className="h-10 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={(event) => {
                stopCardAction(event);
                onOpenDetails();
              }}
              type="button"
            >
              Details
            </button>
            <div className="relative" onClick={stopCardAction}>
              <button
                aria-expanded={isActionMenuOpen}
                aria-label={`More actions for ${game.title}`}
                data-controller-action="context-menu"
                className="grid h-10 w-11 place-items-center rounded-md border border-skyglass/15 text-lg font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                onClick={() => setIsActionMenuOpen((currentValue) => !currentValue)}
                type="button"
              >
                ...
              </button>
              {isActionMenuOpen ? (
                <div className="absolute bottom-11 right-0 z-20 w-48 overflow-hidden rounded-md border border-skyglass/15 bg-ink-950 shadow-panel">
                  {game.collectionType === 'wishlist' ? (
                    <ActionMenuButton
                      label="Move to Library"
                      onClick={() => {
                        onMoveToLibrary?.(game);
                        setIsActionMenuOpen(false);
                      }}
                    />
                  ) : (
                    <ActionMenuButton
                      label="Add to Wishlist"
                      onClick={() => {
                        onAddToWishlist?.(game);
                        setIsActionMenuOpen(false);
                      }}
                    />
                  )}
                  <ActionMenuButton
                    label="Find info"
                    onClick={() => {
                      onFindMetadata(game);
                      setIsActionMenuOpen(false);
                    }}
                  />
                  {game.storeUrl || game.externalUrl ? (
                    <ActionMenuLink label="Open Steam store" url={game.storeUrl ?? game.externalUrl ?? ''} />
                  ) : null}
                  <ActionMenuButton
                    label={game.collectionType === 'wishlist' ? 'Remove Wishlist' : 'Remove'}
                    onClick={() => {
                      onRemove(game.id);
                      setIsActionMenuOpen(false);
                    }}
                    tone="danger"
                  />
                  {game.collectionType === 'library' ? (
                    <ActionMenuButton
                      disabled={typeof game.steamAppId !== 'number'}
                      label="Remove and ignore"
                      onClick={() => {
                        onRemoveAndIgnore(game);
                        setIsActionMenuOpen(false);
                      }}
                      tone="danger"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionMenuLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      className="block h-10 w-full px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-mint/10"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

type ActionMenuButtonProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: 'danger';
};

function ActionMenuButton({ disabled = false, label, onClick, tone }: ActionMenuButtonProps) {
  return (
    <button
      className={`block h-10 w-full px-3 text-left text-sm transition hover:bg-mint/10 disabled:cursor-not-allowed disabled:text-slate-600 ${
        tone === 'danger' ? 'text-red-200' : 'text-slate-200'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
