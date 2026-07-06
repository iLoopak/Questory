import type { TFunction } from '../i18n';
import { loadLocalJson, savePersistedJson } from './localPersistence';

export const homeWidgetStorageKey = 'questshelf.homeWidgets.v1';

/**
 * Fired on `window` whenever Home widget preferences are saved, so any mounted
 * consumer (Home screen, Settings panel) can stay in sync without prop drilling.
 */
export const homeWidgetPreferencesChangeEvent = 'questshelf:home-widgets-change';

export type HomeWidgetDefinition = {
  id: string;
  labelKey: Parameters<TFunction>[0];
  defaultEnabled: boolean;
};

/**
 * Registry of the configurable Home widgets. Order mirrors their visual order on
 * Home (left column first, then the right sidebar) and drives the Settings list.
 * Add a widget here and gate its JSX in HomePanel with the matching id — no other
 * toggle wiring is needed.
 */
export const homeWidgetRegistry = [
  { id: 'continuePlaying', labelKey: 'settings.home.widget.continuePlaying', defaultEnabled: true },
  { id: 'nextAdventure', labelKey: 'settings.home.widget.nextAdventure', defaultEnabled: true },
  { id: 'questoryAchievements', labelKey: 'settings.home.widget.questoryAchievements', defaultEnabled: true },
  { id: 'steamAchievements', labelKey: 'settings.home.widget.steamAchievements', defaultEnabled: true },
  { id: 'wishlistDeals', labelKey: 'settings.home.widget.wishlistDeals', defaultEnabled: true },
  { id: 'dailyQuest', labelKey: 'settings.home.widget.dailyQuest', defaultEnabled: true },
  { id: 'achievementQuiz', labelKey: 'settings.home.widget.achievementQuiz', defaultEnabled: true },
  { id: 'questoryJourney', labelKey: 'settings.home.widget.questoryJourney', defaultEnabled: true },
  { id: 'questQueue', labelKey: 'settings.home.widget.questQueue', defaultEnabled: true },
  { id: 'recommendations', labelKey: 'settings.home.widget.recommendations', defaultEnabled: true },
] as const satisfies readonly HomeWidgetDefinition[];

export type HomeWidgetId = (typeof homeWidgetRegistry)[number]['id'];
export type HomeWidgetPreferences = Record<HomeWidgetId, boolean>;

export const defaultHomeWidgetPreferences: HomeWidgetPreferences = homeWidgetRegistry.reduce(
  (preferences, widget) => {
    preferences[widget.id] = widget.defaultEnabled;
    return preferences;
  },
  {} as HomeWidgetPreferences,
);

export function loadHomeWidgetPreferences(): HomeWidgetPreferences {
  return loadLocalJson(homeWidgetStorageKey, defaultHomeWidgetPreferences, normalizeHomeWidgetPreferences);
}

export function saveHomeWidgetPreferences(preferences: HomeWidgetPreferences) {
  const normalized = normalizeHomeWidgetPreferences(preferences);
  savePersistedJson(homeWidgetStorageKey, normalized);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<HomeWidgetPreferences>(homeWidgetPreferencesChangeEvent, { detail: normalized }));
  }
}

export function normalizeHomeWidgetPreferences(value: unknown): HomeWidgetPreferences {
  if (!value || typeof value !== 'object') {
    return { ...defaultHomeWidgetPreferences };
  }

  const stored = value as Partial<Record<HomeWidgetId, unknown>>;

  return homeWidgetRegistry.reduce<HomeWidgetPreferences>((preferences, widget) => {
    preferences[widget.id] =
      typeof stored[widget.id] === 'boolean' ? (stored[widget.id] as boolean) : widget.defaultEnabled;
    return preferences;
  }, { ...defaultHomeWidgetPreferences });
}
