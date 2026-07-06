import type { TFunction } from '../i18n';
import { loadLocalJson, savePersistedJson } from './localPersistence';

export const homeWidgetStorageKey = 'questshelf.homeWidgets.v1';

/**
 * Fired on `window` whenever Home widget preferences are saved, so any mounted
 * consumer (Home screen, Settings panel) can stay in sync without prop drilling.
 */
export const homeWidgetPreferencesChangeEvent = 'questshelf:home-widgets-change';

/** The two Home render lanes. On <lg screens they stack (main then sidebar). */
export type HomeWidgetColumn = 'main' | 'sidebar';

export type HomeWidgetDefinition = {
  id: string;
  labelKey: Parameters<TFunction>[0];
  defaultEnabled: boolean;
  column: HomeWidgetColumn;
};

/**
 * Registry of the configurable Home widgets. Order mirrors their default visual
 * order on Home and drives the Settings list. Add a widget here and add a matching
 * case to HomePanel's renderWidget — no other toggle/order wiring is needed.
 */
export const homeWidgetRegistry = [
  { id: 'continuePlaying', labelKey: 'settings.home.widget.continuePlaying', defaultEnabled: true, column: 'main' },
  { id: 'nextAdventure', labelKey: 'settings.home.widget.nextAdventure', defaultEnabled: true, column: 'main' },
  { id: 'questoryAchievements', labelKey: 'settings.home.widget.questoryAchievements', defaultEnabled: true, column: 'main' },
  { id: 'steamAchievements', labelKey: 'settings.home.widget.steamAchievements', defaultEnabled: true, column: 'main' },
  { id: 'wishlistDeals', labelKey: 'settings.home.widget.wishlistDeals', defaultEnabled: true, column: 'sidebar' },
  { id: 'dailyQuest', labelKey: 'settings.home.widget.dailyQuest', defaultEnabled: true, column: 'sidebar' },
  { id: 'achievementQuiz', labelKey: 'settings.home.widget.achievementQuiz', defaultEnabled: true, column: 'sidebar' },
  { id: 'questoryJourney', labelKey: 'settings.home.widget.questoryJourney', defaultEnabled: true, column: 'sidebar' },
  { id: 'questQueue', labelKey: 'settings.home.widget.questQueue', defaultEnabled: true, column: 'sidebar' },
  { id: 'recommendations', labelKey: 'settings.home.widget.recommendations', defaultEnabled: true, column: 'sidebar' },
] as const satisfies readonly HomeWidgetDefinition[];

export type HomeWidgetId = (typeof homeWidgetRegistry)[number]['id'];

export type HomeWidgetPreferences = {
  /** Per-widget on/off. */
  enabled: Record<HomeWidgetId, boolean>;
  /** User-defined render order (a permutation of every known widget id). */
  order: HomeWidgetId[];
  /** Compact density for the whole Home screen. */
  compact: boolean;
};

const widgetIds = homeWidgetRegistry.map((widget) => widget.id) as HomeWidgetId[];
const widgetIdSet = new Set<string>(widgetIds);
const columnById = new Map<HomeWidgetId, HomeWidgetColumn>(homeWidgetRegistry.map((widget) => [widget.id, widget.column]));

export const defaultHomeWidgetPreferences: HomeWidgetPreferences = {
  enabled: homeWidgetRegistry.reduce((enabled, widget) => {
    enabled[widget.id] = widget.defaultEnabled;
    return enabled;
  }, {} as Record<HomeWidgetId, boolean>),
  order: [...widgetIds],
  compact: false,
};

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

/**
 * Widget ids for one column, in the user's order, with any unknown/missing ids
 * repaired so the result is always the exact set of that column's widgets.
 */
export function orderedWidgetIdsForColumn(preferences: HomeWidgetPreferences, column: HomeWidgetColumn): HomeWidgetId[] {
  return preferences.order.filter((id) => columnById.get(id) === column);
}

export function normalizeHomeWidgetPreferences(value: unknown): HomeWidgetPreferences {
  if (!value || typeof value !== 'object') {
    return cloneDefaults();
  }

  // Legacy shape (v1 initial release) was a flat Record<HomeWidgetId, boolean>.
  // Detect it by the absence of the new container keys and migrate in place.
  const hasNewShape = 'enabled' in value || 'order' in value || 'compact' in value;
  const source = value as Record<string, unknown>;
  const enabledSource = hasNewShape
    ? (source.enabled && typeof source.enabled === 'object' ? (source.enabled as Record<string, unknown>) : {})
    : source;

  const enabled = homeWidgetRegistry.reduce((result, widget) => {
    result[widget.id] = typeof enabledSource[widget.id] === 'boolean' ? (enabledSource[widget.id] as boolean) : widget.defaultEnabled;
    return result;
  }, {} as Record<HomeWidgetId, boolean>);

  return {
    enabled,
    order: normalizeOrder(source.order),
    compact: typeof source.compact === 'boolean' ? source.compact : false,
  };
}

function normalizeOrder(value: unknown): HomeWidgetId[] {
  const seen = new Set<HomeWidgetId>();
  const order: HomeWidgetId[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && widgetIdSet.has(entry) && !seen.has(entry as HomeWidgetId)) {
        seen.add(entry as HomeWidgetId);
        order.push(entry as HomeWidgetId);
      }
    }
  }

  // Append any widgets missing from the stored order (e.g. newly added ones) at
  // their registry position so the result is always a complete permutation.
  for (const id of widgetIds) {
    if (!seen.has(id)) {
      order.push(id);
    }
  }

  return order;
}

function cloneDefaults(): HomeWidgetPreferences {
  return {
    enabled: { ...defaultHomeWidgetPreferences.enabled },
    order: [...defaultHomeWidgetPreferences.order],
    compact: defaultHomeWidgetPreferences.compact,
  };
}
