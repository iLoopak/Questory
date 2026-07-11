import type { TFunction } from '../i18n';
import type { ConfigurableNavigationItem, NavigationVisibilityPreferences } from '../lib/navigationVisibilityPreferences';

export const navItems = ['Home', 'Library', 'Review Mode', 'Discovery Inbox', 'Queue', 'Wishlist'] as const;
export const moreNavItems = ['Discover', 'Stats', 'Artwork', 'Quest Runner', 'Settings'] as const;
export const alwaysVisibleNavItems = ['Home', 'Library'] as const;

export type TopNavItem = (typeof navItems)[number];
export type MoreNavItem = (typeof moreNavItems)[number];

export const navItemLabelKeys: Record<TopNavItem | MoreNavItem | 'Settings', Parameters<TFunction>[0]> = {
  Artwork: 'nav.artwork',
  'Discovery Inbox': 'nav.discoveryInbox',
  Home: 'nav.home',
  Library: 'nav.library',
  Queue: 'nav.queue',
  'Quest Runner': 'nav.questRunner',
  Discover: 'nav.discover',
  'Review Mode': 'nav.reviewMode',
  Settings: 'nav.settings',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};

export const navigationVisibilityLabelKeys: Record<ConfigurableNavigationItem, Parameters<TFunction>[0]> = {
  Artwork: 'nav.artwork',
  'Discovery Inbox': 'nav.discoveryInbox',
  Queue: 'settings.navigation.platformsQueue',
  'Review Mode': 'settings.navigation.questQueueReviewMode',
  Stats: 'nav.stats',
  Wishlist: 'nav.wishlist',
};

export const allNavItems = [...navItems, ...moreNavItems, 'Metadata', 'Taste Profile'] as const;
export type NavItem = (typeof allNavItems)[number];

export function getNavDescription(activeNavItem: NavItem) {
  if (activeNavItem === 'Home') {
    return 'See what you are playing, what needs review, and Steam sync status.';
  }

  if (activeNavItem === 'Settings') {
    return 'Settings are grouped for handheld use.';
  }

  if (activeNavItem === 'Metadata') {
    return 'Metadata runs only when you start it.';
  }

  if (activeNavItem === 'Taste Profile') {
    return 'Your Gaming DNA explains and refines what Questory thinks you enjoy.';
  }

  if (activeNavItem === 'Wishlist') {
    return 'Wishlist items are separate from owned library games.';
  }

  if (activeNavItem === 'Discover') {
    return 'Find great games you haven\'t played yet.';
  }

  if (activeNavItem === 'Discovery Inbox') {
    return 'Games saved from recommendations to triage later — add to library, wishlist, plans, or ignore.';
  }

  if (activeNavItem === 'Queue') {
    return 'Platform Plans is the focused backlog for what waits on each system.';
  }

  if (activeNavItem === 'Review Mode') {
    return 'Quest Queue helps quickly process imported games into Platform Plans, wishlist picks, status updates, or ignores.';
  }

  if (activeNavItem === 'Stats') {
    return 'Local overview of backlog, progress, and playtime.';
  }

  if (activeNavItem === 'Quest Runner') {
    return 'A small runner game hidden in Questory. Jump over backlog stacks.';
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

export function isMoreNavItem(item: NavItem): item is MoreNavItem {
  return moreNavItems.includes(item as MoreNavItem);
}
