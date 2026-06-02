export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const themePreferenceStorageKey = 'questshelf.themePreference.v1';
export const themePreferences: ThemePreference[] = ['light', 'dark', 'system'];

const preferenceModuleName = '@capacitor/preferences';
const darkThemeQuery = '(prefers-color-scheme: dark)';
const darkThemeColor = '#0d0c0c';
const lightThemeColor = '#FAF7F5';

type PreferencesPlugin = {
  Preferences: {
    set: (options: { key: string; value: string }) => Promise<void>;
  };
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function loadThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  try {
    const storedPreference = window.localStorage.getItem(themePreferenceStorageKey);
    return isThemePreference(storedPreference) ? storedPreference : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(themePreferenceStorageKey, preference);
  } catch {
    // Theme selection should stay responsive even when storage is unavailable.
  }

  void saveThemePreferenceToNativeStorage(preference);
}

export function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') {
    return preference;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia(darkThemeQuery).matches ? 'dark' : 'light';
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(preference);

  if (typeof document === 'undefined') {
    return resolvedTheme;
  }

  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  updateThemeColorMeta(resolvedTheme);

  window.dispatchEvent(
    new CustomEvent('questshelf:theme-change', {
      detail: { preference, theme: resolvedTheme },
    }),
  );

  return resolvedTheme;
}

export function watchSystemTheme(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(darkThemeQuery);
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

export function getThemeColor(theme: ResolvedTheme) {
  return theme === 'light' ? lightThemeColor : darkThemeColor;
}

function updateThemeColorMeta(theme: ResolvedTheme) {
  const themeColor = getThemeColor(theme);
  let metaElement = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (!metaElement) {
    metaElement = document.createElement('meta');
    metaElement.name = 'theme-color';
    document.head.append(metaElement);
  }

  metaElement.content = themeColor;
}

async function saveThemePreferenceToNativeStorage(preference: ThemePreference) {
  try {
    const preferences = (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
    await preferences.Preferences.set({ key: themePreferenceStorageKey, value: preference });
  } catch {
    // Capacitor Preferences mirrors localStorage when available; browsers continue with localStorage only.
  }
}
