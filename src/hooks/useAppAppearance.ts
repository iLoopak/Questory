import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  applyAccentColorPreference,
  applyAppTemplatePreference,
  applyThemePreference,
  getAccentColorThemeVariables,
  loadAccentColorPreference,
  loadAppTemplatePreference,
  loadSecondaryAccentColorPreference,
  loadThemePreference,
  normalizeThemePreferenceForTemplate,
  saveAccentColorPreference,
  saveAppTemplatePreference,
  saveSecondaryAccentColorPreference,
  saveThemePreference,
  watchSystemTheme,
  type AccentColorPreference,
  type AppTemplatePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/themePreferences';

export function useAppAppearance() {
  const [appTemplatePreference, setAppTemplatePreferenceState] = useState<AppTemplatePreference>(() => loadAppTemplatePreference());
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
    normalizeThemePreferenceForTemplate(loadThemePreference(), appTemplatePreference),
  );
  const [accentColorPreference, setAccentColorPreference] = useState<AccentColorPreference>(() => loadAccentColorPreference());
  const [secondaryAccentColorPreference, setSecondaryAccentColorPreference] = useState<AccentColorPreference>(() => loadSecondaryAccentColorPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyThemePreference(themePreference, appTemplatePreference),
  );

  const accentThemeStyle = useMemo(
    () => getAccentColorThemeVariables(accentColorPreference, secondaryAccentColorPreference) as CSSProperties,
    [accentColorPreference, secondaryAccentColorPreference],
  );

  function setThemePreference(preference: ThemePreference) {
    setThemePreferenceState(normalizeThemePreferenceForTemplate(preference, appTemplatePreference));
  }

  function setAppTemplatePreference(preference: AppTemplatePreference) {
    setAppTemplatePreferenceState(preference);
    setThemePreferenceState((currentThemePreference) => normalizeThemePreferenceForTemplate(currentThemePreference, preference));
  }

  useEffect(() => {
    const normalizedThemePreference = normalizeThemePreferenceForTemplate(themePreference, appTemplatePreference);

    if (normalizedThemePreference !== themePreference) {
      setThemePreferenceState(normalizedThemePreference);
    }

    setResolvedTheme(applyThemePreference(normalizedThemePreference, appTemplatePreference));
    saveThemePreference(normalizedThemePreference);

    if (normalizedThemePreference !== 'system') {
      return undefined;
    }

    return watchSystemTheme(() => {
      setResolvedTheme(applyThemePreference('system', appTemplatePreference));
    });
  }, [appTemplatePreference, themePreference]);

  useEffect(() => {
    applyAppTemplatePreference(appTemplatePreference);
    saveAppTemplatePreference(appTemplatePreference);
  }, [appTemplatePreference]);

  useEffect(() => {
    applyAccentColorPreference(accentColorPreference, secondaryAccentColorPreference);
    saveAccentColorPreference(accentColorPreference);
    saveSecondaryAccentColorPreference(secondaryAccentColorPreference);
  }, [accentColorPreference, secondaryAccentColorPreference]);

  return {
    accentColorPreference,
    accentThemeStyle,
    appTemplatePreference,
    resolvedTheme,
    secondaryAccentColorPreference,
    setAccentColorPreference,
    setAppTemplatePreference,
    setSecondaryAccentColorPreference,
    setThemePreference,
    themePreference,
  };
}
