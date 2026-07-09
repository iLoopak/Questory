import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Icon } from '../../components/Icon';
import { BackToTopButton } from '../../components/BackToTopButton';
import { PwaStatusBanner } from '../../components/PwaStatusBanner';
import { ShelfAvatar } from '../../components/ShelfIdentity';
import { ShelfProfilePopover } from '../shelf-profile/ShelfProfilePopover';
import { QuestShelfLogo } from './components/QuestShelfLogo';
import {
  getNavDescription,
  moreNavItems,
  navItemLabelKeys,
  type MoreNavItem,
  type NavItem,
  type TopNavItem,
} from '../../config/navigation';
import type { TFunction } from '../../i18n';
import type { Game } from '../../types/game';
import type { ShelfIdentitySettings } from '../../lib/shelfIdentity';
import type { QuestShelfAchievementProgress } from '../../lib/questShelfAchievements';
import type { DiscoveryInboxItem } from '../../lib/discoveryInboxStorage';

type ShelfOverviewCounts = {
  games: number;
  platforms: number;
  playing: number;
  queue: number;
};

type AppHeaderProps = {
  t: TFunction;
  isScrolled: boolean;
  personalizedQuestShelfTitle: string;
  hasIncompleteSetupTasks: boolean;

  isShelfProfileOpen: boolean;
  setIsShelfProfileOpen: Dispatch<SetStateAction<boolean>>;
  shelfProfileRef: RefObject<HTMLDivElement | null>;
  shelfIdentity: ShelfIdentitySettings;
  steamAvatarUrl: string;
  activeShelfAchievement: QuestShelfAchievementProgress | null | undefined;
  resolvedFeaturedGame: Game | undefined;
  shelfOverview: ShelfOverviewCounts;
  openSettingsFromShelfProfile: () => void;

  visibleNavItems: TopNavItem[];
  activeNavItem: NavItem;
  selectNavigationItem: (item: TopNavItem | MoreNavItem) => void;
  discoveryInboxItems: DiscoveryInboxItem[];
};

export function AppHeader({
  t,
  isScrolled,
  personalizedQuestShelfTitle,
  hasIncompleteSetupTasks,
  isShelfProfileOpen,
  setIsShelfProfileOpen,
  shelfProfileRef,
  shelfIdentity,
  steamAvatarUrl,
  activeShelfAchievement,
  resolvedFeaturedGame,
  shelfOverview,
  openSettingsFromShelfProfile,
  visibleNavItems,
  activeNavItem,
  selectNavigationItem,
  discoveryInboxItems,
}: AppHeaderProps) {
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const isMoreNavActive = moreNavItems.includes(activeNavItem as MoreNavItem);

  useEffect(() => {
    if (!isMoreMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  function handleSelectNavItem(item: TopNavItem | MoreNavItem) {
    setIsMoreMenuOpen(false);
    selectNavigationItem(item);
  }

  return (
    <header className={`qs-compact-header qs-glass shrink-0 flex items-center gap-2 rounded-lg border px-2 transition-all duration-300 ${isScrolled ? 'qs-header-stuck py-1' : 'py-1.5'}`}>
      <div className="relative min-w-0 shrink-0" ref={shelfProfileRef}>
        {hasIncompleteSetupTasks ? (
          <span
            className="pointer-events-none absolute right-0.5 top-0.5 z-10 h-2 w-2 rounded-full bg-mint ring-2 ring-ink-950"
            aria-label="Setup incomplete"
          />
        ) : null}
        <button
          aria-expanded={isShelfProfileOpen}
          aria-haspopup="menu"
          aria-label={`${personalizedQuestShelfTitle} shelf profile`}
          className="flex min-h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition hover:bg-mint/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
          onClick={() => setIsShelfProfileOpen((isOpen) => !isOpen)}
          type="button"
        >
          <QuestShelfLogo className="h-7 w-7 rounded-md" />
          <span className="hidden min-w-0 max-w-[12rem] truncate text-xs font-semibold uppercase tracking-spread text-mint sm:block">{personalizedQuestShelfTitle}</span>
        </button>
        {isShelfProfileOpen ? (
          <ShelfProfilePopover
            activeAchievement={activeShelfAchievement}
            avatar={<ShelfAvatar {...shelfIdentity} steamAvatarUrl={steamAvatarUrl} sizeClassName="h-12 w-12" />}
            featuredGame={resolvedFeaturedGame}
            onOpenSettings={openSettingsFromShelfProfile}
            shelfName={personalizedQuestShelfTitle}
            shelfOverview={shelfOverview}
            t={t}
          />
        ) : null}
      </div>

      <nav className="qs-top-nav flex flex-1 gap-1 overflow-x-auto rounded-md border border-skyglass/15 bg-ink-950/70 p-0.5 shadow-inner">
        {visibleNavItems.map((item) => (
          <button
            key={item}
            className={`h-8 shrink-0 rounded px-2.5 text-xs font-semibold transition sm:h-9 sm:text-sm ${
              item === activeNavItem
                ? 'bg-mint text-ink-950 shadow-glow'
                : 'text-slate-300 hover:bg-mint/10 hover:text-white hover:shadow-glow'
            }`}
            onClick={() => handleSelectNavItem(item)}
            title={getNavDescription(item)}
            type="button"
          >
            {item === 'Discovery Inbox' && discoveryInboxItems.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {t(navItemLabelKeys[item])}
                <span className="inline-flex min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-none text-ink-950">
                  {discoveryInboxItems.length > 99 ? '99+' : discoveryInboxItems.length}
                </span>
              </span>
            ) : (
              t(navItemLabelKeys[item])
            )}
          </button>
        ))}
      </nav>

      <div className="relative shrink-0" ref={moreMenuRef}>
        <button
          aria-expanded={isMoreMenuOpen}
          aria-haspopup="menu"
          className={`flex h-8 items-center gap-1 rounded px-2.5 text-xs font-semibold transition sm:h-9 sm:text-sm ${
            isMoreNavActive
              ? 'bg-mint text-ink-950 shadow-glow'
              : 'text-slate-300 hover:bg-mint/10 hover:text-white hover:shadow-glow'
          }`}
          onClick={() => setIsMoreMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span>{t('action.more')}</span>
          <Icon name="chevrons-right" size={13} className="rotate-90" strokeWidth={2.4} />
        </button>
        {isMoreMenuOpen ? (
          <div
            className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-xl border border-mint/25 bg-ink-950/95 p-2 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl max-h-[calc(100dvh-env(safe-area-inset-top,0px)-4rem)] overflow-y-auto overscroll-contain"
            role="menu"
          >
            {moreNavItems.map((item) => (
              <button
                key={item}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70 ${
                  item === activeNavItem ? 'bg-mint/15 text-white' : 'text-slate-200 hover:bg-mint/10 hover:text-white'
                }`}
                onClick={() => handleSelectNavItem(item)}
                role="menuitem"
                type="button"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-mint/25 bg-mint/10 text-mint">
                  <Icon
                    name={
                      item === 'Stats' ? 'panel-top-open' :
                      item === 'Discover' ? 'sparkles' :
                      item === 'Quest Runner' ? 'gamepad-2' :
                      item === 'Settings' ? 'settings' :
                      'image-frame'
                    }
                    size={15}
                    strokeWidth={2.2}
                  />
                </span>
                <span className="whitespace-nowrap">{t(navItemLabelKeys[item])}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <PwaStatusBanner appTitle={personalizedQuestShelfTitle} />
      <BackToTopButton />
    </header>
  );
}
