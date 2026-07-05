import { loadLocalJson, savePersistedJson } from './localPersistence';

export const navigationVisibilityStorageKey = 'questshelf.navigationVisibility.v1';

export const configurableNavigationItems = [
  'Wishlist',
  'Queue',
  'Review Mode',
  'Artwork',
  'Stats',
  'Discovery Inbox',
] as const;

export type ConfigurableNavigationItem = (typeof configurableNavigationItems)[number];
export type NavigationVisibilityPreferences = Record<ConfigurableNavigationItem, boolean>;

export const defaultNavigationVisibilityPreferences: NavigationVisibilityPreferences = {
  Artwork: true,
  'Discovery Inbox': true,
  Queue: true,
  'Review Mode': true,
  Stats: true,
  Wishlist: true,
};

export function loadNavigationVisibilityPreferences(): NavigationVisibilityPreferences {
  return loadLocalJson(
    navigationVisibilityStorageKey,
    defaultNavigationVisibilityPreferences,
    normalizeNavigationVisibilityPreferences,
  );
}

export function saveNavigationVisibilityPreferences(preferences: NavigationVisibilityPreferences) {
  savePersistedJson(navigationVisibilityStorageKey, normalizeNavigationVisibilityPreferences(preferences));
}

function normalizeNavigationVisibilityPreferences(value: unknown): NavigationVisibilityPreferences {
  if (!value || typeof value !== 'object') {
    return defaultNavigationVisibilityPreferences;
  }

  const storedPreferences = value as Partial<Record<ConfigurableNavigationItem, unknown>>;

  return configurableNavigationItems.reduce<NavigationVisibilityPreferences>((preferences, item) => {
    preferences[item] =
      typeof storedPreferences[item] === 'boolean'
        ? storedPreferences[item]
        : defaultNavigationVisibilityPreferences[item];
    return preferences;
  }, { ...defaultNavigationVisibilityPreferences });
}
