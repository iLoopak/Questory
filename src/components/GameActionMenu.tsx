import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, type TFunction } from '../i18n';
import { formatDealPrice } from './DealCoverBadges';
import { buildHltbSearchUrl, getHltbGameSearchTitle } from '../lib/hltb';
import { Icon, type IconName } from './Icon';
import type { Game, GameStatus } from '../types/game';
import { useScrollLock } from '../hooks/useScrollLock';

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
  t: TFunction;
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuId: string;
  onClose: () => void;
};

type GameActionMenuItem = {
  disabled?: boolean;
  href?: string;
  icon: IconName;
  currentLabel?: string;
  isCurrent?: boolean;
  label: string;
  onSelect?: () => void;
  tone?: 'danger';
};

type GameActionMenuSection = {
  items: GameActionMenuItem[];
  label: string;
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
  const { t } = useI18n();
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
        aria-label={`${t('action.moreActions')} ${game.title}`}
        className={getActionButtonClass(variant)}
        data-controller-action="context-menu"
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        <Icon name="more-horizontal" />
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
          t={t}
        />
      ) : null}
    </>
  );
}

// =============================================================================
// INVESTIGATION TOGGLES — flip one at a time, rebuild, and test on device.
// Remove this entire block once the root cause is confirmed.
// =============================================================================
//
// Toggle A — blur active element instead of restoring focus to the card's
//   "more actions" button after the menu closes.
//   Hypothesis: the focused button on the card intercepts the next scroll
//   gesture (touch-start on a focused interactive element is mis-routed by
//   Android WebView as a click rather than a pan).
const DBG_BLUR_INSTEAD_OF_FOCUS_RESTORE = false;
//
// Toggle B — override touch-action:none on the backdrop with touch-action:auto.
//   Hypothesis: removing touch-action:none from the backdrop eliminates the
//   touch-event gap that appears when the fixed overlay disappears mid-gesture.
const DBG_DISABLE_BACKDROP_TOUCH_ACTION = false;
// =============================================================================

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
  t,
}: GameActionMenuOverlayProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  useScrollLock();
  const sections = useMemo(
    () =>
      buildGameActionMenuSections({
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
        t,
      }),
    [game, includeDetails, onAddToQueue, onAddToWishlist, onClose, onFindMetadata, onMoveToLibrary, onOpenDetails, onRemove, onRemoveAndIgnore, onStatusChange, t],
  );


  useEffect(() => {
    const firstMenuItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    firstMenuItem?.focus({ preventScroll: true });

    return () => {
      const scrollEl = document.querySelector<HTMLElement>('.qs-game-list-shell, .qs-content-panel');
      const scrollTopAtClose = scrollEl?.scrollTop ?? 0;
      console.debug('[GameActionMenu] close — activeElement=', document.activeElement?.tagName, 'scrollTop=', scrollTopAtClose);

      if (DBG_BLUR_INSTEAD_OF_FOCUS_RESTORE) {
        window.setTimeout(() => {
          console.debug('[GameActionMenu] Toggle A: blurring', document.activeElement?.tagName, 'scrollTop=', scrollEl?.scrollTop ?? 0);
          (document.activeElement as HTMLElement | null)?.blur?.();
          requestAnimationFrame(() => {
            console.debug('[GameActionMenu] Toggle A: after blur — activeElement=', document.activeElement?.tagName, 'scrollTop=', scrollEl?.scrollTop ?? 0);
          });
        }, 0);
        return;
      }

      window.setTimeout(() => {
        const scrollTopBefore = scrollEl?.scrollTop ?? 0;
        console.debug('[GameActionMenu] focus-restore: before — activeElement=', document.activeElement?.tagName, 'scrollTop=', scrollTopBefore);
        anchorRef.current?.focus({ preventScroll: true });
        requestAnimationFrame(() => {
          console.debug('[GameActionMenu] focus-restore: after — activeElement=', document.activeElement?.tagName, 'scrollTop=', scrollEl?.scrollTop ?? 0);
        });
      }, 0);
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
      className="qs-game-action-backdrop fixed inset-0 z-[1200] flex items-end justify-center p-2 sm:items-center sm:p-4"
      style={DBG_DISABLE_BACKDROP_TOUCH_ACTION ? { touchAction: 'auto' } : undefined}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        id={menuId}
        aria-label={`${t('action.actions')} ${game.title}`}
        aria-modal="true"
        className="qs-game-action-sheet pointer-events-auto w-full max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <div className="qs-game-action-header">
          <div className="min-w-0">
            <p className="qs-game-action-eyebrow">{t('action.gameActions')}</p>
            <h3 className="qs-game-action-title">{game.title}</h3>
            <p className="qs-game-action-platform">{game.platform}</p>
          </div>
          <button
            aria-label={t('action.close')}
            className="qs-game-action-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="qs-game-action-scroll">
          <div role="menu" aria-label={`${t('action.actions')} ${game.title}`} className="qs-game-action-sections">
            {sections.map((section) => (
              <section key={section.label} className={section.tone === 'danger' ? 'qs-game-action-section qs-game-action-section-danger' : 'qs-game-action-section'}>
                <h4 className="qs-game-action-section-title">{section.label}</h4>
                <div className="qs-game-action-section-list" role="group" aria-label={section.label}>
                  {section.items.map((action) => (
                    <GameActionMenuItemButton key={action.label} action={action} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GameActionMenuItemButton({ action }: { action: GameActionMenuItem }) {
  const className = `qs-game-action-row ${action.tone === 'danger' ? 'qs-game-action-row-danger' : ''} ${action.isCurrent ? 'qs-game-action-row-current' : ''} ${action.disabled ? 'qs-game-action-row-disabled' : ''}`;
  const content = (
    <>
      <span className="qs-game-action-row-icon" aria-hidden="true"><Icon name={action.icon} /></span>
      <span className="qs-game-action-row-label">{action.label}</span>
      {action.isCurrent ? <span className="qs-game-action-current-badge">{action.currentLabel}</span> : null}
    </>
  );

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
        {content}
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
      {content}
    </button>
  );
}

function buildGameActionMenuSections({
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
  t,
}: Omit<GameActionMenuOverlayProps, 'anchorRef' | 'menuId'>): GameActionMenuSection[] {
  const metadataItems: GameActionMenuItem[] = [];
  const statusItems: GameActionMenuItem[] = [];
  const collectionItems: GameActionMenuItem[] = [];
  const platformItems: GameActionMenuItem[] = [];
  const otherItems: GameActionMenuItem[] = [];
  const dangerItems: GameActionMenuItem[] = [];

  const addAction = (targetItems: GameActionMenuItem[], item: GameActionMenuItem) => {
    if (item.href) {
      targetItems.push({
        ...item,
        onSelect: () => {
          onClose();
          item.onSelect?.();
        },
      });
      return;
    }

    targetItems.push({
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

  if (onFindMetadata) {
    addAction(metadataItems, { icon: 'refresh-cw', label: t('action.refreshMetadata'), onSelect: () => onFindMetadata(game) });
  }

  addAction(statusItems, {
    icon: 'gamepad-2',
    currentLabel: t('action.current'),
    isCurrent: game.status === 'Playing',
    label: t('action.playingNow'),
    onSelect: () => onStatusChange(game.id, 'Playing'),
  });

  addAction(collectionItems, {
    disabled: game.collectionType === 'library' || !onMoveToLibrary,
    icon: 'plus-square',
    currentLabel: t('action.current'),
    isCurrent: game.collectionType === 'library',
    label: t('action.moveToLibrary'),
    onSelect: () => onMoveToLibrary?.(game),
  });

  addAction(collectionItems, {
    disabled: game.collectionType === 'wishlist' || !onAddToWishlist,
    icon: 'heart',
    currentLabel: t('action.current'),
    isCurrent: game.collectionType === 'wishlist',
    label: t('action.wishlist'),
    onSelect: () => onAddToWishlist?.(game),
  });

  addAction(statusItems, {
    icon: 'trophy',
    currentLabel: t('action.current'),
    isCurrent: game.status === 'Finished',
    label: t('action.finished'),
    onSelect: () => onStatusChange(game.id, 'Finished'),
  });
  addAction(statusItems, {
    icon: 'trash-2',
    currentLabel: t('action.current'),
    isCurrent: game.status === 'Dropped',
    label: t('action.dropped'),
    onSelect: () => onStatusChange(game.id, 'Dropped'),
  });

  if (onAddToQueue) {
    addAction(platformItems, { icon: 'list-plus', label: t('action.addToQueue'), onSelect: () => onAddToQueue(game) });
  }

  if (includeDetails && onOpenDetails) {
    addAction(otherItems, { icon: 'info', label: t('action.detailsEdit'), onSelect: onOpenDetails });
  }

  if (game.itadCurrentBestUrl) {
    const dealLabel = typeof game.itadCurrentBestPrice === 'number' && game.itadCurrentBestCurrency
      ? `${t('itad.openDeal')} · ${formatDealPrice(game.itadCurrentBestPrice, game.itadCurrentBestCurrency)}`
      : t('itad.openDeal');

    addAction(otherItems, { icon: 'shopping-bag', label: dealLabel, href: game.itadCurrentBestUrl });
  }

  if (game.storeUrl || game.externalUrl) {
    addAction(otherItems, { icon: 'external-link', label: t('action.openStore'), href: game.storeUrl ?? game.externalUrl });
  }

  addAction(otherItems, { icon: 'search', label: t('hltb.findOn'), href: buildHltbSearchUrl(getHltbGameSearchTitle(game)) });

  addAction(dangerItems, {
    icon: 'trash-2',
    label: game.collectionType === 'wishlist' ? t('action.removeFromWishlist') : t('action.remove'),
    onSelect: () => onRemove(game.id),
    tone: 'danger',
  });
  addAction(dangerItems, {
    disabled: typeof game.steamAppId !== 'number',
    icon: 'eye-off',
    label: t('action.ignore'),
    onSelect: () => onRemoveAndIgnore(game),
    tone: 'danger',
  });

  const sections: GameActionMenuSection[] = [
    { label: t('action.sectionMetadata'), items: metadataItems },
    { label: t('action.sectionStatus'), items: statusItems },
    { label: t('action.sectionCollection'), items: collectionItems },
    { label: t('action.sectionPlatform'), items: platformItems },
    { label: t('action.sectionOther'), items: otherItems },
    { label: t('action.sectionDanger'), items: dangerItems, tone: 'danger' },
  ];

  return sections.filter((section) => section.items.length > 0);
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
