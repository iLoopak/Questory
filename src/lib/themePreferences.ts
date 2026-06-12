export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type AccentColorPreference = string | null;
export type AppTemplatePreference = 'classic' | 'neon-deck';

export const themePreferenceStorageKey = 'questshelf.themePreference.v1';
export const accentColorStorageKey = 'questshelf.accentColor.v1';
export const secondaryAccentColorStorageKey = 'questshelf.secondaryAccentColor.v1';
export const appTemplateStorageKey = 'questshelf.appTemplate.v1';
export const defaultAccentColor = '#ff5a2c';
export const defaultSecondaryAccentColor = '#38bdf8';
export const themePreferences: ThemePreference[] = ['light', 'dark', 'system'];
export const appTemplatePreferences: AppTemplatePreference[] = ['classic', 'neon-deck'];

const preferenceModuleName = '@capacitor/preferences';
const darkThemeQuery = '(prefers-color-scheme: dark)';
const darkThemeColor = '#0d0c0c';
const lightThemeColor = '#FAF7F5';
const hexColorPattern = /^#[0-9a-f]{6}$/i;

type PreferencesPlugin = {
  Preferences: {
    set: (options: { key: string; value: string }) => Promise<void>;
  };
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function isAccentColor(value: unknown): value is string {
  return typeof value === 'string' && hexColorPattern.test(value);
}

export function isAppTemplatePreference(value: unknown): value is AppTemplatePreference {
  return typeof value === 'string' && appTemplatePreferences.includes(value as AppTemplatePreference);
}

export function normalizeAccentColor(value: string): string | null {
  const trimmedValue = value.trim();
  return isAccentColor(trimmedValue) ? trimmedValue.toLowerCase() : null;
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

export function loadAppTemplatePreference(): AppTemplatePreference {
  if (typeof window === 'undefined') {
    return 'classic';
  }

  try {
    const storedPreference = window.localStorage.getItem(appTemplateStorageKey);
    return isAppTemplatePreference(storedPreference) ? storedPreference : 'classic';
  } catch {
    return 'classic';
  }
}

export function saveAppTemplatePreference(preference: AppTemplatePreference) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(appTemplateStorageKey, preference);
  } catch {
    // Template selection should stay responsive even when storage is unavailable.
  }

  void saveAppTemplatePreferenceToNativeStorage(preference);
}

export function applyAppTemplatePreference(preference: AppTemplatePreference) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.appTemplate = preference;
  root.classList.toggle('qs-template-classic', preference === 'classic');
  root.classList.toggle('qs-template-neon-deck', preference === 'neon-deck');
}

export function getAppTemplateClassName(preference: AppTemplatePreference) {
  return preference === 'neon-deck' ? 'qs-template-neon-deck' : 'qs-template-classic';
}

export function loadAccentColorPreference(): AccentColorPreference {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeAccentColor(window.localStorage.getItem(accentColorStorageKey) ?? '');
  } catch {
    return null;
  }
}

export function loadSecondaryAccentColorPreference(): AccentColorPreference {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeAccentColor(window.localStorage.getItem(secondaryAccentColorStorageKey) ?? '');
  } catch {
    return null;
  }
}

export function saveAccentColorPreference(color: AccentColorPreference) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (color) {
      window.localStorage.setItem(accentColorStorageKey, color);
    } else {
      window.localStorage.removeItem(accentColorStorageKey);
    }
  } catch {
    // Accent selection should stay responsive even when storage is unavailable.
  }

  void saveAccentColorPreferenceToNativeStorage(accentColorStorageKey, color);
}

export function saveSecondaryAccentColorPreference(color: AccentColorPreference) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (color) {
      window.localStorage.setItem(secondaryAccentColorStorageKey, color);
    } else {
      window.localStorage.removeItem(secondaryAccentColorStorageKey);
    }
  } catch {
    // Accent selection should stay responsive even when storage is unavailable.
  }

  void saveAccentColorPreferenceToNativeStorage(secondaryAccentColorStorageKey, color);
}

export function resolveThemePreference(
  preference: ThemePreference,
  appTemplatePreference: AppTemplatePreference = 'classic',
): ResolvedTheme {
  if (preference !== 'system') {
    return preference;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia(darkThemeQuery).matches ? 'dark' : 'light';
}

export function applyAccentColorPreference(color: AccentColorPreference, secondaryColor: AccentColorPreference = null) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  if (!color) {
    root.style.removeProperty('--accent-rgb');
    root.style.removeProperty('--qs-accent-primary-rgb');
    root.style.removeProperty('--accent-contrast');
    root.dataset.accentColor = 'default';
  } else {
    const rgb = hexToRgb(color);
    root.style.setProperty('--accent-rgb', `${rgb.r} ${rgb.g} ${rgb.b}`);
    root.style.setProperty('--qs-accent-primary-rgb', `${rgb.r} ${rgb.g} ${rgb.b}`);
    root.style.setProperty('--accent-contrast', getReadableTextColor(rgb));
    root.dataset.accentColor = color;
  }

  if (!secondaryColor) {
    root.style.removeProperty('--qs-accent-secondary-rgb');
    root.dataset.secondaryAccentColor = 'default';
  } else {
    const secondaryRgb = hexToRgb(secondaryColor);
    root.style.setProperty('--qs-accent-secondary-rgb', `${secondaryRgb.r} ${secondaryRgb.g} ${secondaryRgb.b}`);
    root.dataset.secondaryAccentColor = secondaryColor;
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  appTemplatePreference: AppTemplatePreference = 'classic',
): ResolvedTheme {
  const resolvedTheme = resolveThemePreference(preference, appTemplatePreference);

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
      detail: { preference, theme: resolvedTheme, appTemplate: appTemplatePreference },
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

async function saveAppTemplatePreferenceToNativeStorage(preference: AppTemplatePreference) {
  try {
    const preferences = (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
    await preferences.Preferences.set({ key: appTemplateStorageKey, value: preference });
  } catch {
    // Capacitor Preferences mirrors localStorage when available; browsers continue with localStorage only.
  }
}

async function saveThemePreferenceToNativeStorage(preference: ThemePreference) {
  try {
    const preferences = (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
    await preferences.Preferences.set({ key: themePreferenceStorageKey, value: preference });
  } catch {
    // Capacitor Preferences mirrors localStorage when available; browsers continue with localStorage only.
  }
}

function hexToRgb(color: string) {
  const normalizedColor = normalizeAccentColor(color) ?? defaultAccentColor;
  return {
    r: Number.parseInt(normalizedColor.slice(1, 3), 16),
    g: Number.parseInt(normalizedColor.slice(3, 5), 16),
    b: Number.parseInt(normalizedColor.slice(5, 7), 16),
  };
}

function getReadableTextColor(rgb: { r: number; g: number; b: number }) {
  const black = { r: 17, g: 24, b: 39 };
  const white = { r: 255, g: 255, b: 255 };
  return getContrastRatio(rgb, black) >= getContrastRatio(rgb, white) ? 'rgb(17 24 39)' : 'rgb(255 255 255)';
}

function getContrastRatio(firstColor: { r: number; g: number; b: number }, secondColor: { r: number; g: number; b: number }) {
  const firstLuminance = getRelativeLuminance(firstColor);
  const secondLuminance = getRelativeLuminance(secondColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

async function saveAccentColorPreferenceToNativeStorage(key: string, color: AccentColorPreference) {
  try {
    const preferences = (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
    await preferences.Preferences.set({ key, value: color ?? '' });
  } catch {
    // Capacitor Preferences mirrors localStorage when available; browsers continue with localStorage only.
  }
}
