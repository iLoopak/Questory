export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type AccentColorPreference = string | null;
export type AppTemplatePreference = 'classic' | 'neon-deck';
export type NeonButtonGradientBalancePreference = number;
export type NeonButtonGradientMidpointPreference = number;
export type GradientOrientationPreference = 'horizontal' | 'vertical' | 'diagonal-down' | 'diagonal-up';

export const themePreferenceStorageKey = 'questshelf.themePreference.v1';
export const accentColorStorageKey = 'questshelf.accentColor.v1';
export const secondaryAccentColorStorageKey = 'questshelf.secondaryAccentColor.v1';
export const neonButtonGradientBalanceStorageKey = 'questshelf.neonButtonGradientBalance.v1';
export const neonButtonGradientMidpointStorageKey = 'questshelf.neonButtonGradientMidpoint.v1';
export const gradientOrientationStorageKey = 'questshelf.gradientOrientation.v1';
export const appTemplateStorageKey = 'questshelf.appTemplate.v1';
export const defaultAccentColor = '#ff5a2c';
export const defaultSecondaryAccentColor = '#38bdf8';
export const defaultNeonButtonGradientBalance = 50;
export const defaultNeonButtonGradientMidpoint = 50;
export const defaultGradientOrientation: GradientOrientationPreference = 'diagonal-down';
export const themePreferences: ThemePreference[] = ['light', 'dark', 'system'];
export const appTemplatePreferences: AppTemplatePreference[] = ['classic', 'neon-deck'];
export const darkOnlyAppTemplatePreferences: AppTemplatePreference[] = ['neon-deck'];
export const gradientOrientationPreferences: GradientOrientationPreference[] = ['horizontal', 'vertical', 'diagonal-down', 'diagonal-up'];

const preferenceModuleName = '@capacitor/preferences';
const darkThemeQuery = '(prefers-color-scheme: dark)';
const darkThemeColor = '#0d0c0c';
const neonDeckThemeColor = '#030612';
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

export function isGradientOrientationPreference(value: unknown): value is GradientOrientationPreference {
  return typeof value === 'string' && gradientOrientationPreferences.includes(value as GradientOrientationPreference);
}

export function normalizeGradientOrientation(value: unknown): GradientOrientationPreference {
  return isGradientOrientationPreference(value) ? value : defaultGradientOrientation;
}

export function getGradientOrientationCssDirection(orientation: GradientOrientationPreference = defaultGradientOrientation) {
  switch (normalizeGradientOrientation(orientation)) {
    case 'horizontal':
      return 'to right';
    case 'vertical':
      return 'to bottom';
    case 'diagonal-up':
      return 'to bottom left';
    case 'diagonal-down':
    default:
      return 'to bottom right';
  }
}

export function isDarkOnlyAppTemplate(preference: AppTemplatePreference): boolean {
  return darkOnlyAppTemplatePreferences.includes(preference);
}

export function normalizeThemePreferenceForTemplate(
  preference: ThemePreference,
  appTemplatePreference: AppTemplatePreference = 'classic',
): ThemePreference {
  return isDarkOnlyAppTemplate(appTemplatePreference) ? 'dark' : preference;
}

export function normalizeAccentColor(value: string): string | null {
  const trimmedValue = value.trim();
  return isAccentColor(trimmedValue) ? trimmedValue.toLowerCase() : null;
}

function normalizeGradientSliderValue(value: unknown, defaultValue: number) {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue)) {
    return defaultValue;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

export function normalizeNeonButtonGradientBalance(value: unknown): NeonButtonGradientBalancePreference {
  return normalizeGradientSliderValue(value, defaultNeonButtonGradientBalance);
}

export function normalizeNeonButtonGradientMidpoint(value: unknown): NeonButtonGradientMidpointPreference {
  return normalizeGradientSliderValue(value, defaultNeonButtonGradientMidpoint);
}

export function getNeonButtonGradientStops(
  balance: NeonButtonGradientBalancePreference,
  midpoint: NeonButtonGradientMidpointPreference = defaultNeonButtonGradientMidpoint,
) {
  const normalizedBalance = normalizeNeonButtonGradientBalance(balance);
  const normalizedMidpoint = normalizeNeonButtonGradientMidpoint(midpoint);
  const transitionCenter = 85 - normalizedBalance * 0.7 + (normalizedMidpoint - 50) * 0.16;
  const transitionSpread = 2 + normalizedMidpoint * 0.36;
  const startStop = Math.min(100, Math.max(0, Math.round(transitionCenter - transitionSpread / 2)));
  const midStop = Math.min(100, Math.max(0, Math.round(transitionCenter)));
  const endStop = Math.min(100, Math.max(0, Math.round(transitionCenter + transitionSpread / 2)));

  return {
    startStop: `${startStop}%`,
    midStop: `${midStop}%`,
    endStop: `${endStop}%`,
  };
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

export function loadGradientOrientationPreference(): GradientOrientationPreference {
  if (typeof window === 'undefined') {
    return defaultGradientOrientation;
  }

  try {
    return normalizeGradientOrientation(window.localStorage.getItem(gradientOrientationStorageKey));
  } catch {
    return defaultGradientOrientation;
  }
}

export function saveGradientOrientationPreference(orientation: GradientOrientationPreference) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedOrientation = normalizeGradientOrientation(orientation);

  try {
    if (normalizedOrientation === defaultGradientOrientation) {
      window.localStorage.removeItem(gradientOrientationStorageKey);
    } else {
      window.localStorage.setItem(gradientOrientationStorageKey, normalizedOrientation);
    }
  } catch {
    // Gradient tuning should stay responsive even when storage is unavailable.
  }

  void saveAccentColorPreferenceToNativeStorage(gradientOrientationStorageKey, normalizedOrientation);
}

export function loadNeonButtonGradientBalancePreference(): NeonButtonGradientBalancePreference {
  if (typeof window === 'undefined') {
    return defaultNeonButtonGradientBalance;
  }

  try {
    return normalizeNeonButtonGradientBalance(window.localStorage.getItem(neonButtonGradientBalanceStorageKey));
  } catch {
    return defaultNeonButtonGradientBalance;
  }
}

export function saveNeonButtonGradientBalancePreference(balance: NeonButtonGradientBalancePreference) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedBalance = normalizeNeonButtonGradientBalance(balance);

  try {
    if (normalizedBalance === defaultNeonButtonGradientBalance) {
      window.localStorage.removeItem(neonButtonGradientBalanceStorageKey);
    } else {
      window.localStorage.setItem(neonButtonGradientBalanceStorageKey, String(normalizedBalance));
    }
  } catch {
    // Gradient tuning should stay responsive even when storage is unavailable.
  }

  void saveAccentColorPreferenceToNativeStorage(neonButtonGradientBalanceStorageKey, String(normalizedBalance));
}

export function loadNeonButtonGradientMidpointPreference(): NeonButtonGradientMidpointPreference {
  if (typeof window === 'undefined') {
    return defaultNeonButtonGradientMidpoint;
  }

  try {
    return normalizeNeonButtonGradientMidpoint(window.localStorage.getItem(neonButtonGradientMidpointStorageKey));
  } catch {
    return defaultNeonButtonGradientMidpoint;
  }
}

export function saveNeonButtonGradientMidpointPreference(midpoint: NeonButtonGradientMidpointPreference) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedMidpoint = normalizeNeonButtonGradientMidpoint(midpoint);

  try {
    if (normalizedMidpoint === defaultNeonButtonGradientMidpoint) {
      window.localStorage.removeItem(neonButtonGradientMidpointStorageKey);
    } else {
      window.localStorage.setItem(neonButtonGradientMidpointStorageKey, String(normalizedMidpoint));
    }
  } catch {
    // Gradient tuning should stay responsive even when storage is unavailable.
  }

  void saveAccentColorPreferenceToNativeStorage(neonButtonGradientMidpointStorageKey, String(normalizedMidpoint));
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
  const normalizedPreference = normalizeThemePreferenceForTemplate(preference, appTemplatePreference);

  if (normalizedPreference !== 'system') {
    return normalizedPreference;
  }

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }

  return window.matchMedia(darkThemeQuery).matches ? 'dark' : 'light';
}

export function getAccentColorThemeVariables(
  color: AccentColorPreference,
  secondaryColor: AccentColorPreference = null,
  neonButtonGradientBalance: NeonButtonGradientBalancePreference = defaultNeonButtonGradientBalance,
  neonButtonGradientMidpoint: NeonButtonGradientMidpointPreference = defaultNeonButtonGradientMidpoint,
  gradientOrientation: GradientOrientationPreference = defaultGradientOrientation,
) {
  const primaryColor = color ?? defaultAccentColor;
  const primaryRgb = hexToRgb(primaryColor);
  const primaryRgbValue = `${primaryRgb.r} ${primaryRgb.g} ${primaryRgb.b}`;
  const secondaryResolvedColor = secondaryColor ?? defaultSecondaryAccentColor;
  const secondaryRgb = hexToRgb(secondaryResolvedColor);
  const secondaryRgbValue = `${secondaryRgb.r} ${secondaryRgb.g} ${secondaryRgb.b}`;
  const normalizedGradientBalance = normalizeNeonButtonGradientBalance(neonButtonGradientBalance);
  const normalizedGradientMidpoint = normalizeNeonButtonGradientMidpoint(neonButtonGradientMidpoint);
  const gradientStops = getNeonButtonGradientStops(normalizedGradientBalance, normalizedGradientMidpoint);
  const dominantButtonRgb = normalizedGradientBalance > 50 ? secondaryRgb : primaryRgb;

  return {
    '--accent-rgb': primaryRgbValue,
    '--qs-accent-primary': primaryColor,
    '--qs-accent-secondary': secondaryResolvedColor,
    '--qs-accent-primary-rgb': primaryRgbValue,
    '--qs-accent-secondary-rgb': secondaryRgbValue,
    '--qs-neon-button-gradient-balance': String(normalizedGradientBalance),
    '--qs-neon-button-gradient-midpoint': String(normalizedGradientMidpoint),
    '--qs-neon-button-gradient-start': gradientStops.startStop,
    '--qs-neon-button-gradient-mid': gradientStops.midStop,
    '--qs-neon-button-gradient-end': gradientStops.endStop,
    '--qs-accent-gradient-direction': getGradientOrientationCssDirection(gradientOrientation),
    '--qs-neon-button-text': getReadableTextColor(dominantButtonRgb),
    '--accent-contrast': getReadableTextColor(primaryRgb),
    '--qs-glow-primary': `0 0 28px rgb(${primaryRgbValue} / 0.26)`,
    '--qs-glow-secondary': `0 0 32px rgb(${secondaryRgbValue} / 0.2)`,
  };
}

export function applyAccentColorPreference(
  color: AccentColorPreference,
  secondaryColor: AccentColorPreference = null,
  neonButtonGradientBalance: NeonButtonGradientBalancePreference = defaultNeonButtonGradientBalance,
  neonButtonGradientMidpoint: NeonButtonGradientMidpointPreference = defaultNeonButtonGradientMidpoint,
  gradientOrientation: GradientOrientationPreference = defaultGradientOrientation,
) {
  if (typeof document === 'undefined') {
    return;
  }

  const accentVariables = getAccentColorThemeVariables(color, secondaryColor, neonButtonGradientBalance, neonButtonGradientMidpoint, gradientOrientation);
  const themedRoots = [document.documentElement, ...Array.from(document.querySelectorAll<HTMLElement>('.qs-app-root'))];

  themedRoots.forEach((root) => {
    Object.entries(accentVariables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  });

  document.documentElement.dataset.accentColor = color ?? 'default';
  document.documentElement.dataset.secondaryAccentColor = secondaryColor ?? 'default';
  document.documentElement.dataset.neonButtonGradientBalance = String(normalizeNeonButtonGradientBalance(neonButtonGradientBalance));
  document.documentElement.dataset.neonButtonGradientMidpoint = String(normalizeNeonButtonGradientMidpoint(neonButtonGradientMidpoint));
  document.documentElement.dataset.gradientOrientation = normalizeGradientOrientation(gradientOrientation);
}

export function applyThemePreference(
  preference: ThemePreference,
  appTemplatePreference: AppTemplatePreference = 'classic',
): ResolvedTheme {
  const normalizedPreference = normalizeThemePreferenceForTemplate(preference, appTemplatePreference);
  const resolvedTheme = resolveThemePreference(normalizedPreference, appTemplatePreference);

  if (typeof document === 'undefined') {
    return resolvedTheme;
  }

  const root = document.documentElement;
  root.dataset.themePreference = normalizedPreference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  updateThemeColorMeta(resolvedTheme, appTemplatePreference);

  window.dispatchEvent(
    new CustomEvent('questshelf:theme-change', {
      detail: { preference: normalizedPreference, theme: resolvedTheme, appTemplate: appTemplatePreference },
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

export function getThemeColor(theme: ResolvedTheme, appTemplatePreference: AppTemplatePreference = 'classic') {
  if (appTemplatePreference === 'neon-deck') {
    return neonDeckThemeColor;
  }

  return theme === 'light' ? lightThemeColor : darkThemeColor;
}

function updateThemeColorMeta(theme: ResolvedTheme, appTemplatePreference: AppTemplatePreference) {
  const themeColor = getThemeColor(theme, appTemplatePreference);
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

async function saveAccentColorPreferenceToNativeStorage(key: string, color: string | null) {
  try {
    const preferences = (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
    await preferences.Preferences.set({ key, value: color ?? '' });
  } catch {
    // Capacitor Preferences mirrors localStorage when available; browsers continue with localStorage only.
  }
}
