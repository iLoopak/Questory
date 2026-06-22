import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { getPreferredArtworkSources } from '../lib/gameCoverImages';
import type { Game, GameStatus } from '../types/game';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { GameActionMenu } from './GameActionMenu';
import { PlatformBadge } from './PlatformBadge';
import { DealCoverBadges } from './DealCoverBadges';
import { translateOption, useI18n } from '../i18n';

type HeroGridCardProps = {
  game: Game;
  highlightLabel?: string;
  includeDetailsAction?: boolean;
  isMultiSelectMode?: boolean;
  isSelected?: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: () => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
  onToggleSelected?: () => void;
  platformLabel?: string;
  platformQueueState?: PlatformQueueState;
  suppressWantToPlayStatus?: boolean;
};

function HeroGridCardComponent({
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
  platformLabel,
  platformQueueState,
  suppressWantToPlayStatus = false,
}: HeroGridCardProps) {
  const { t } = useI18n();
  // hero usage: prefers heroImage → wideCoverImage → backgroundImage → portrait cover fallback
  const heroSources = useMemo(() => getPreferredArtworkSources(game, 'hero'), [game]);
  const [heroSourceIndex, setHeroSourceIndex] = useState(0);
  const [isHeroLoaded, setIsHeroLoaded] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const shouldShowStatusBadge =
    game.status !== 'Want to play' ||
    (game.collectionType === 'library' && !suppressWantToPlayStatus);

  const firstHeroSource = heroSources[0] ?? null;
  useEffect(() => {
    setHeroSourceIndex(0);
    setIsHeroLoaded(false);
  }, [firstHeroSource]);

  const activeHeroSource = heroSources[heroSourceIndex];

  const handleCardClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (isInteractiveCardChild(event.target, event.currentTarget)) return;
      if (isMultiSelectMode) {
        onToggleSelected?.();
      } else {
        onOpenDetails();
      }
    },
    [isMultiSelectMode, onOpenDetails, onToggleSelected],
  );

  const handleCardKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
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
        if (!isMultiSelectMode) setIsActionMenuOpen((v) => !v);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (isMultiSelectMode) {
        onToggleSelected?.();
      } else {
        onOpenDetails();
      }
    },
    [isMultiSelectMode, onOpenDetails, onToggleSelected],
  );

  const stopCardAction = useCallback((event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <article
      aria-label={isMultiSelectMode ? `Select ${game.title}` : `Open details for ${game.title}`}
      aria-selected={isMultiSelectMode ? isSelected : undefined}
      className={`qs-hero-grid-card relative flex h-full min-h-[260px] min-w-0 scroll-mt-4 flex-col overflow-hidden rounded-lg border transition hover:border-mint/35 hover:shadow-glow focus-within:border-mint/45 focus-within:shadow-glow sm:min-h-[292px] cursor-pointer ${
        isSelected ? 'border-mint/70 shadow-glow ring-1 ring-mint/40' : ''
      } ${highlightLabel ? 'qs-highlight-card-border ring-1' : ''}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* Hero artwork — flex-1 fills all space above the actions row */}
      <div className="relative flex-1 overflow-hidden bg-ink-800">
        {/* Multiselect checkbox */}
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

        {/* Highlight / recommendation badge */}
        {highlightLabel ? (
          <div className="qs-highlight-badge absolute right-3 top-3 z-10 rounded-full border px-2.5 py-1 text-xs font-bold shadow-glow">
            {highlightLabel}
          </div>
        ) : null}

        {/* Hero / cover image with skeleton + fallback cycling */}
        {activeHeroSource ? (
          <>
            {!isHeroLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
            <img
              alt=""
              className={`h-full w-full object-cover transition-opacity duration-300 ${isHeroLoaded ? 'opacity-100' : 'opacity-0'}`}
              decoding="async"
              loading="lazy"
              onError={() => {
                setIsHeroLoaded(false);
                setHeroSourceIndex((i) => i + 1);
              }}
              onLoad={() => setIsHeroLoaded(true)}
              src={activeHeroSource}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-ink-800 px-4 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-mint/20 bg-ink-900 text-xl font-semibold text-mint shadow-glow">
                {game.title.slice(0, 1).toUpperCase()}
              </div>
              <div className="mt-3 qs-label-caps text-muted">{t('common.noCover')}</div>
            </div>
          </div>
        )}

        {/* Gradient overlay + title / platform / rating */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-transparent px-3 pb-3 pt-10">
          <div className="mb-1.5 flex max-w-full flex-wrap items-center gap-1.5">
            <PlatformBadge
              className="max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold"
              platform={platformLabel ?? game.platform}
              queueState={platformQueueState}
            />
            {shouldShowStatusBadge ? (
              <span
                className="qs-status-badge max-w-full rounded-md px-2 py-0.5 text-xs font-medium"
                title={translateOption(game.status, t)}
              >
                {translateOption(game.status, t)}
              </span>
            ) : null}
          </div>
          <h3
            className="line-clamp-2 text-sm font-semibold leading-snug text-white drop-shadow sm:text-base"
            title={game.title}
          >
            {game.title}
          </h3>
          {game.status === 'Finished' && typeof game.rating === 'number' && game.rating > 0 ? (
            <div className="mt-1 text-xs leading-none tracking-wider text-amber-400">
              {'★'.repeat(game.rating)}{'☆'.repeat(5 - game.rating)}
            </div>
          ) : null}
        </div>

        <DealCoverBadges game={game} variant="grid" />
      </div>

      {/* Actions row */}
      <div className="flex shrink-0 items-center gap-2 border-t border-skyglass/15 bg-ink-950/80 p-2.5">
        <button
          className="qs-game-card-details-button h-9 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
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
    </article>
  );
}

export const HeroGridCard = memo(HeroGridCardComponent);

function isInteractiveCardChild(target: EventTarget | null, cardElement: HTMLElement) {
  if (!(target instanceof HTMLElement)) return false;
  const interactive = target.closest(
    'a, button, input, select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [data-card-action]',
  );
  return Boolean(interactive && interactive !== cardElement);
}
