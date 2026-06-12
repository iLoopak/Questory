import type { TFunction } from '../i18n';
import type { ConfigurableNavigationItem, NavigationVisibilityPreferences } from '../lib/navigationVisibilityPreferences';

export const navItems = ['Library', 'Wishlist', 'Queue', 'Review Mode', 'Artwork', 'Recommendation', 'Stats', 'Settings'] as const;
export const alwaysVisibleNavItems = ['Library', 'Settings'] as const;

export type TopNavItem = (typeof navItems)[number];

export const navItemLabelKeys: Record<TopNavItem, Parameters<TFunction>[0]> = {
  Artwork: 'nav.artwork',
  Library: 'nav.library',
  Queue: 'nav.queue',
  Recommendation: 'nav.recommendations',
  'Review Mode': 'nav.reviewMode',
  Settings: 'nav.settings',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};

export const navigationVisibilityLabelKeys: Record<ConfigurableNavigationItem, Parameters<TFunction>[0]> = {
  Artwork: 'nav.artwork',
  Queue: 'settings.navigation.platformsQueue',
  Recommendation: 'nav.recommendations',
  'Review Mode': 'settings.navigation.questQueueReviewMode',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};

export const allNavItems = ['Home', ...navItems, 'Metadata'] as const;
export type NavItem = (typeof allNavItems)[number];

export function getNavDescription(activeNavItem: NavItem) {
  if (activeNavItem === 'Settings') {
    return 'Settings are grouped for handheld use.';
  }

  if (activeNavItem === 'Metadata') {
    return 'Metadata runs only when you start it.';
  }

  if (activeNavItem === 'Wishlist') {
    return 'Wishlist items are separate from owned library games.';
  }

  if (activeNavItem === 'Recommendation') {
    return 'Local picks based on your library.';
  }

  if (activeNavItem === 'Queue') {
    return 'Platforms is the focused plan for active systems, currently playing games, and platform backlogs.';
  }

  if (activeNavItem === 'Review Mode') {
    return 'Quest Queue helps quickly process imported games into Platforms plans, wishlist picks, status updates, or ignores.';
  }

  if (activeNavItem === 'Stats') {
    return 'Local overview of backlog, progress, and playtime.';
  }

  return 'Local library and wishlist data stays on this device.';
}

export function getVisibleNavItems(navigationVisibility: NavigationVisibilityPreferences): TopNavItem[] {
  return navItems.filter((item) => isNavigationItemVisible(item, navigationVisibility));
}

export function isNavigationItemVisible(item: TopNavItem, navigationVisibility: NavigationVisibilityPreferences) {
  if (alwaysVisibleNavItems.includes(item as (typeof alwaysVisibleNavItems)[number])) {
    return true;
  }

  return navigationVisibility[item as ConfigurableNavigationItem] ?? true;
}

export function isTopNavItem(item: NavItem): item is TopNavItem {
  return navItems.includes(item as TopNavItem);
}
