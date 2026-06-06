import type { TFunction } from '../i18n';
import type { ConfigurableNavigationItem } from '../lib/navigationVisibilityPreferences';

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
