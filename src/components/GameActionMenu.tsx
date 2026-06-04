import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Game, GameStatus } from '../types/game';

type MenuAnchorRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type MenuPosition = {
  left: number;
  maxHeight: number;
  placement: 'above' | 'below';
  top: number;
  width: number;
};

type GameActionMenuProps = {
  game: Game;
  variant?: 'card' | 'compact' | 'shelf';
  includeDetails?: boolean;
  isOpen?: boolean;
  onAddToQueue?: (game: Game) => void;
  onAddToWishlist?: (game: Game) => void;
  onClose?: () => void;
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

const menuWidth = 232;
const viewportMargin = 12;

export function GameActionMenu({
  game,
  variant = 'card',
  includeDetails = false,
  isOpen: controlledIsOpen,
  onAddToQueue,
  onAddToWishlist,
  onClose,
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    return () => {
      window.setTimeout(() => buttonRef.current?.focus({ preventScroll: true }), 0);
    };
  }, [isOpen]);

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
        aria-haspopup="menu"
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
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
}: GameActionMenuOverlayProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(() => getAnchorRect(anchorRef.current));
  const [position, setPosition] = useState<MenuPosition>(() => getSheetPosition());
  const actions = useMemo(
    () =>
      buildGameActionMenuItems({
        game,
        includeDetails,
        onAddToQueue,
        onAddToWishlist,
        onClose,
        onMoveToLibrary,
        onOpenDetails,
        onRemove,
        onRemoveAndIgnore,
        onStatusChange,
      }),
    [game, includeDetails, onAddToQueue, onAddToWishlist, onClose, onMoveToLibrary, onOpenDetails, onRemove, onRemoveAndIgnore, onStatusChange],
  );

  const primaryActions = actions.filter((action) => action.tone !== 'danger');
  const destructiveActions = actions.filter((action) => action.tone === 'danger');

  useEffect(() => {
    const updateAnchorRect = () => setAnchorRect(getAnchorRect(anchorRef.current));

    updateAnchorRect();
    window.addEventListener('resize', updateAnchorRect);
    window.addEventListener('scroll', updateAnchorRect, true);

    return () => {
      window.removeEventListener('resize', updateAnchorRect);
      window.removeEventListener('scroll', updateAnchorRect, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    setPosition(getMenuPosition(anchorRect, menuRef.current));
  }, [anchorRect, actions.length]);

  useEffect(() => {
    const firstMenuItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    firstMenuItem?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'BrowserBack' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        onClose();
      }
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [anchorRef, onClose]);

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

  return createPortal(
    <div className="fixed inset-0 z-[1200] pointer-events-none" aria-label="Game actions overlay">
      <div
        ref={menuRef}
        id={menuId}
        className="pointer-events-auto fixed overflow-hidden rounded-xl border border-skyglass/20 bg-ink-950/98 shadow-panel ring-1 ring-white/10 backdrop-blur-md"
        role="menu"
        aria-label={`Actions for ${game.title}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeyDown}
        style={{
          left: `${position.left}px`,
          maxHeight: `${position.maxHeight}px`,
          top: `${position.top}px`,
          width: `${position.width}px`,
        }}
      >
        {anchorRect ? <span className={`absolute right-5 h-2 w-2 rotate-45 border-skyglass/20 bg-ink-950 ${position.placement === 'below' ? '-top-1 border-l border-t' : '-bottom-1 border-b border-r'}`} /> : null}
        <div className="max-h-[inherit] overflow-y-auto py-1">
          {primaryActions.map((action) => (
            <GameActionMenuItemButton key={action.label} action={action} />
          ))}
          {destructiveActions.length > 0 ? (
            <div className="mt-1 border-t border-red-400/20 pt-1" aria-label={`${game.title} destructive actions`}>
              {destructiveActions.map((action) => (
                <GameActionMenuItemButton key={action.label} action={action} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GameActionMenuItemButton({ action }: { action: GameActionMenuItem }) {
  const className = `block min-h-11 w-full px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint ${
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
          item.onSelect?.();
          onClose();
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

        item.onSelect?.();
        onClose();
      },
    });
  };

  if (includeDetails && onOpenDetails) {
    addAction({ label: 'Details', onSelect: onOpenDetails });
  }

  if (onAddToQueue) {
    addAction({ label: 'Add to Backlog', onSelect: () => onAddToQueue(game) });
  }

  addAction({ label: 'Playing', onSelect: () => onStatusChange(game.id, 'Playing') });

  if (game.collectionType === 'wishlist') {
    addAction({ label: 'Move to Library', onSelect: () => onMoveToLibrary?.(game) });
  } else {
    addAction({ label: 'Add to Wishlist', onSelect: () => onAddToWishlist?.(game) });
  }

  addAction({ label: 'Finished', onSelect: () => onStatusChange(game.id, 'Finished') });

  if (game.storeUrl || game.externalUrl) {
    addAction({ label: 'Open Steam Store', href: game.storeUrl ?? game.externalUrl });
  }

  addAction({ label: game.collectionType === 'wishlist' ? 'Remove from Wishlist' : 'Remove', onSelect: () => onRemove(game.id), tone: 'danger' });
  addAction({ label: 'Drop', onSelect: () => onStatusChange(game.id, 'Dropped'), tone: 'danger' });
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

function getAnchorRect(anchor: HTMLButtonElement | null): MenuAnchorRect | null {
  if (!anchor) {
    return null;
  }

  const rect = anchor.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function getMenuPosition(anchorRect: MenuAnchorRect | null, menuElement: HTMLDivElement | null): MenuPosition {
  if (!anchorRect) {
    return getSheetPosition();
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const measuredHeight = menuElement?.offsetHeight ?? 420;
  const width = Math.min(menuWidth, viewportWidth - viewportMargin * 2);
  const left = Math.min(Math.max(anchorRect.left + anchorRect.width - width, viewportMargin), viewportWidth - width - viewportMargin);
  const belowTop = anchorRect.top + anchorRect.height + 8;
  const aboveTop = anchorRect.top - measuredHeight - 8;
  const belowSpace = viewportHeight - belowTop - viewportMargin;
  const aboveSpace = anchorRect.top - viewportMargin - 8;
  const placement = belowSpace >= Math.min(measuredHeight, 280) || belowSpace >= aboveSpace ? 'below' : 'above';
  const availableHeight = placement === 'below' ? belowSpace : aboveSpace;
  const top = placement === 'below'
    ? belowTop
    : Math.max(viewportMargin, anchorRect.top - Math.min(measuredHeight, availableHeight) - 8);

  return {
    left,
    maxHeight: Math.max(220, Math.min(measuredHeight, availableHeight, viewportHeight - viewportMargin * 2)),
    placement,
    top,
    width,
  };
}

function getSheetPosition(): MenuPosition {
  const width = Math.min(menuWidth, window.innerWidth - viewportMargin * 2);
  const maxHeight = Math.min(420, window.innerHeight - viewportMargin * 2);

  return {
    left: Math.max(viewportMargin, (window.innerWidth - width) / 2),
    maxHeight,
    placement: 'below',
    top: Math.max(viewportMargin, window.innerHeight - maxHeight - viewportMargin),
    width,
  };
}
