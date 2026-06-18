import { memo, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { Game, GameStatus } from '../types/game';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { GameActionMenu } from './GameActionMenu';
import { PlatformBadge } from './PlatformBadge';
import { DealCoverBadges } from './DealCoverBadges';
import { translateOption, useI18n } from '../i18n';

type GameCardProps = {
  game: Game;
  highlightLabel?: string;
  includeDetailsAction?: boolean;
  isMultiSelectMode?: boolean;
  onAddToQueue?: (game: Game) => void;
  isSelected?: boolean;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: () => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onToggleSelected?: () => void;
  platformQueueState?: PlatformQueueState;
  platformLabel?: string;
  suppressWantToPlayStatus?: boolean;
};

function GameCardComponent({
  game,
  highlightLabel,
  includeDetailsAction = false,
  isMultiSelectMode = false,
  isSelected = false,
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
  platformLabel,
  suppressWantToPlayStatus = false,
}: GameCardProps) {
  const { t } = useI18n();
  const coverSources = useMemo(() => {
    return getGameCoverSources(game, { includeGeneratedFallback: false });
  }, [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const shouldShowStatusBadge = game.status !== 'Want to play' || (game.collectionType === 'library' && !suppressWantToPlayStatus);

  const firstCoverSource = coverSources[0] ?? null;
  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [firstCoverSource]);

  const activeCoverSource = coverSources[coverSourceIndex];

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (isInteractiveCardChild(event.target, event.currentTarget)) {
      return;
    }

    if (isMultiSelectMode) {
      onToggleSelected?.();
    } else {
      onOpenDetails();
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      setIsActionMenuOpen(false);
      return;
    }

    if (event.target !== event.currentTarget && isInteractiveCardChild(event.target, event.currentTarget)) {
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
      aria-label={isMultiSelectMode ? `Select ${game.title}` : `Open details for ${game.title}`}
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-game-card qs-glass relative flex h-full min-h-[290px] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-lg border transition hover:border-mint/35 hover:shadow-glow focus-within:border-mint/45 focus-within:shadow-glow sm:min-h-[320px] ${
        isSelected ? 'border-mint/70 shadow-glow ring-1 ring-mint/40' : ''
      } ${highlightLabel ? 'border-amber-300/70 ring-1 ring-amber-300/30' : ''} cursor-pointer`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      {highlightLabel ? (
        <div className="absolute right-3 top-3 z-10 rounded-full border border-amber-300/40 bg-amber-300 px-2.5 py-1 text-xs font-bold text-ink-950 shadow-glow">
          {highlightLabel}
        </div>
      ) : null}

      <div className="qs-game-card-artwork relative aspect-[16/9] max-h-32 shrink-0 overflow-hidden bg-ink-700 sm:max-h-36">
        {isMultiSelectMode ? (
          <label
            className={`absolute left-0 top-0 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-br-xl transition ${
              isSelected ? 'bg-mint' : 'bg-ink-950/60 hover:bg-ink-950/80'
            }`}
            onClick={stopCardAction}
          >
            <input
              aria-label={`Select ${game.title}`}
              checked={isSelected}
              className="sr-only"
              onChange={() => onToggleSelected?.()}
              type="checkbox"
            />
            {isSelected ? (
              <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="18" className="text-ink-950">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="16" className="text-white/70">
                <circle cx="12" cy="12" r="9" />
              </svg>
            )}
          </label>
        ) : null}
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
              <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{t('common.noCover')}</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/85 via-transparent to-transparent" />
        <div className={`absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-1.5 ${game.collectionType === 'wishlist' ? 'max-w-[42%] sm:max-w-[48%]' : 'max-w-[calc(100%-1.5rem)]'}`}>
          <PlatformBadge
            className="max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold"
            platform={platformLabel ?? game.platform}
            queueState={platformQueueState}
          />
          {shouldShowStatusBadge ? (
            <span className="platform-badge max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold" title={translateOption(game.status, t)}>
              <span className="platform-badge__label">{translateOption(game.status, t)}</span>
            </span>
          ) : null}
        </div>
        {game.collectionType === 'wishlist' ? (
          <span className="absolute right-3 top-3 rounded-full border border-mint/30 bg-ink-950/80 px-2.5 py-1 text-xs font-medium text-mint">
            {t('collection.wishlist')}
          </span>
        ) : null}
        <DealCoverBadges game={game} variant="grid" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3
            className="line-clamp-2 text-base font-semibold leading-6 text-white sm:text-lg"
            title={game.title}
          >
            {game.title}
          </h3>

        </div>

        <div className="mt-auto border-t border-skyglass/15 pt-3">
          <div className="flex items-center gap-2">
            <button
              className="qs-game-card-details-button h-10 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={(event) => {
                stopCardAction(event);
                onOpenDetails();
              }}
              type="button"
            >
              {t('action.details')}
            </button>
            <div onClick={stopCardAction}>
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
                onOpenDetails={onOpenDetails}
                onRemove={onRemove}
                onRemoveAndIgnore={onRemoveAndIgnore}
                onStatusChange={onStatusChange}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export const GameCard = memo(GameCardComponent);

function isInteractiveCardChild(target: EventTarget | null, cardElement: HTMLElement) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveElement = target.closest(
    'a, button, input, select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [data-card-action]',
  );

  return Boolean(interactiveElement && interactiveElement !== cardElement);
}
