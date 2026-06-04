import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Game, GameStatus } from '../types/game';

type GameActionMenuProps = {
  game: Game;
  variant?: 'card' | 'compact' | 'shelf';
  includeDetails?: boolean;
  isOpen?: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onClose?: () => void;
  onFindMetadata?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onOpenDetails?: () => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

type GameActionMenuOverlayProps = Omit<GameActionMenuProps, 'variant' | 'isOpen' | 'onOpenChange'> & {
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuId: string;
  onClose: () => void;
};

type GameActionMenuItem = {
  disabled?: boolean;
  href?: string;
  label: string;
  onSelect?: () => void;
  tone?: 'danger';
};

export function GameActionMenu({
  game,
  variant = 'card',
  includeDetails = false,
  isOpen: controlledIsOpen,
  onAddToQueue,
  onAddToWishlist,
  onClose,
  onFindMetadata,
  onMoveToLibrary,
  onOpenChange,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
}: GameActionMenuProps) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const isControlled = typeof controlledIsOpen === 'boolean';
  const isOpen = controlledIsOpen ?? uncontrolledIsOpen;

  const setMenuOpen = useCallback(
    (nextIsOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledIsOpen(nextIsOpen);
      }

      onOpenChange?.(nextIsOpen);

      if (!nextIsOpen) {
        onClose?.();
      }
    },
    [isControlled, onClose, onOpenChange],
  );

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, [setMenuOpen]);

  function handleToggle(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setMenuOpen(!isOpen);
  }

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setMenuOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`More actions for ${game.title}`}
        className={getActionButtonClass(variant)}
        data-controller-action="context-menu"
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        <span aria-hidden="true">•••</span>
      </button>
      {isOpen ? (
        <GameActionMenuOverlay
          anchorRef={buttonRef}
          game={game}
          includeDetails={includeDetails}
          menuId={menuId}
          onAddToQueue={onAddToQueue}
          onAddToWishlist={onAddToWishlist}
          onClose={closeMenu}
          onFindMetadata={onFindMetadata}
          onMoveToLibrary={onMoveToLibrary}
          onOpenDetails={onOpenDetails}
          onRemove={onRemove}
          onRemoveAndIgnore={onRemoveAndIgnore}
          onStatusChange={onStatusChange}
        />
      ) : null}
    </>
  );
}

function GameActionMenuOverlay({
  anchorRef,
  game,
  includeDetails,
  menuId,
  onAddToQueue,
  onAddToWishlist,
  onClose,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
}: GameActionMenuOverlayProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const actions = useMemo(
    () =>
      buildGameActionMenuItems({
        game,
        includeDetails,
        onAddToQueue,
        onAddToWishlist,
        onClose,
        onFindMetadata,
        onMoveToLibrary,
        onOpenDetails,
        onRemove,
        onRemoveAndIgnore,
        onStatusChange,
      }),
    [game, includeDetails, onAddToQueue, onAddToWishlist, onClose, onFindMetadata, onMoveToLibrary, onOpenDetails, onRemove, onRemoveAndIgnore, onStatusChange],
  );

  const primaryActions = actions.filter((action) => action.tone !== 'danger');
  const destructiveActions = actions.filter((action) => action.tone === 'danger');

  useEffect(() => {
    const firstMenuItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    firstMenuItem?.focus({ preventScroll: true });

    return () => {
      window.setTimeout(() => anchorRef.current?.focus({ preventScroll: true }), 0);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'GamepadB') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);

    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const enabledItems = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const activeIndex = enabledItems.findIndex((item) => item === document.activeElement);
    const nextIndex = event.key === 'ArrowDown'
      ? (activeIndex + 1) % enabledItems.length
      : (activeIndex - 1 + enabledItems.length) % enabledItems.length;

    enabledItems[nextIndex]?.focus({ preventScroll: true });
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/45 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={menuRef}
        id={menuId}
        aria-label={`Actions for ${game.title}`}
        aria-modal="true"
        className="qs-game-action-sheet pointer-events-auto w-full max-w-md overflow-hidden rounded-t-2xl border border-skyglass/20 bg-ink-950/98 shadow-panel ring-1 ring-white/10 backdrop-blur-md sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 border-b border-skyglass/15 bg-white/[0.03] px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Actions</p>
            <h3 className="mt-1 truncate text-base font-semibold text-white">{game.title}</h3>
          </div>
          <button
            className="min-h-10 shrink-0 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(74dvh,34rem)] overflow-y-auto py-2 pb-[max(1rem,calc(var(--qs-safe-bottom)+0.75rem))]">
          <div role="menu" aria-label={`Actions for ${game.title}`}>
            {primaryActions.map((action) => (
              <GameActionMenuItemButton key={action.label} action={action} />
            ))}
            {destructiveActions.length > 0 ? (
              <div className="mt-2 border-t border-red-400/20 pt-2" aria-label={`${game.title} destructive actions`}>
                {destructiveActions.map((action) => (
                  <GameActionMenuItemButton key={action.label} action={action} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GameActionMenuItemButton({ action }: { action: GameActionMenuItem }) {
  const className = `block min-h-12 w-full px-5 py-3.5 text-left text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint sm:text-sm ${
    action.tone === 'danger'
      ? 'text-red-200 hover:bg-red-500/10 focus-visible:bg-red-500/10'
      : 'text-slate-100 hover:bg-mint/10 focus-visible:bg-mint/10'
  } ${action.disabled ? 'cursor-not-allowed text-slate-600 hover:bg-transparent' : ''}`;

  if (action.href) {
    return (
      <a
        className={className}
        href={action.href}
        onClick={action.onSelect}
        rel="noreferrer"
        role="menuitem"
        target="_blank"
      >
        {action.label}
      </a>
    );
  }

  return (
    <button
      aria-disabled={action.disabled}
      className={className}
      disabled={action.disabled}
      onClick={action.onSelect}
      role="menuitem"
      type="button"
    >
      {action.label}
    </button>
  );
}

function buildGameActionMenuItems({
  game,
  includeDetails,
  onAddToQueue,
  onAddToWishlist,
  onClose,
  onFindMetadata,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
}: Omit<GameActionMenuOverlayProps, 'anchorRef' | 'menuId'>): GameActionMenuItem[] {
  const items: GameActionMenuItem[] = [];

  const addAction = (item: GameActionMenuItem) => {
    if (item.href) {
      items.push({
        ...item,
        onSelect: () => {
          onClose();
          item.onSelect?.();
        },
      });
      return;
    }

    items.push({
      ...item,
      onSelect: () => {
        if (item.disabled) {
          return;
        }

        onClose();
        window.setTimeout(() => item.onSelect?.(), 0);
      },
    });
  };

  if (includeDetails && onOpenDetails) {
    addAction({ label: 'Details / Edit', onSelect: onOpenDetails });
  }

  if (onFindMetadata) {
    addAction({ label: 'Refresh metadata', onSelect: () => onFindMetadata(game) });
  }

  if (onAddToQueue) {
    addAction({ label: 'Add to Queue', onSelect: () => onAddToQueue(game) });
  }

  addAction({ label: 'Playing Now', onSelect: () => onStatusChange(game.id, 'Playing') });

  if (game.collectionType === 'wishlist') {
    addAction({ label: 'Move to Library', onSelect: () => onMoveToLibrary?.(game), disabled: !onMoveToLibrary });
  } else if (onAddToWishlist) {
    addAction({ label: 'Wishlist', onSelect: () => onAddToWishlist(game) });
  }

  addAction({ label: 'Finished', onSelect: () => onStatusChange(game.id, 'Finished') });

  if (game.storeUrl || game.externalUrl) {
    addAction({ label: 'Open Store', href: game.storeUrl ?? game.externalUrl });
  }

  addAction({ label: game.collectionType === 'wishlist' ? 'Remove from Wishlist' : 'Remove', onSelect: () => onRemove(game.id), tone: 'danger' });
  addAction({ label: 'Dropped', onSelect: () => onStatusChange(game.id, 'Dropped'), tone: 'danger' });
  addAction({
    disabled: typeof game.steamAppId !== 'number',
    label: 'Ignore',
    onSelect: () => onRemoveAndIgnore(game),
    tone: 'danger',
  });

  return items;
}

function getActionButtonClass(variant: GameActionMenuProps['variant']) {
  const baseClass = 'grid place-items-center rounded-md border border-skyglass/15 font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:border-mint/60 focus-visible:bg-mint/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/30';

  if (variant === 'compact') {
    return `${baseClass} h-10 w-11 text-base sm:h-9`;
  }

  if (variant === 'shelf') {
    return `${baseClass} h-10 w-11 bg-ink-950/90 text-base shadow-panel`;
  }

  return `${baseClass} h-10 w-11 text-base`;
}
