import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  applyAccentColorPreference,
  applyAppTemplatePreference,
  applyThemePreference,
  getAccentColorThemeVariables,
  loadAccentColorPreference,
  loadAppTemplatePreference,
  loadNeonButtonGradientBalancePreference,
  loadNeonButtonGradientMidpointPreference,
  loadSecondaryAccentColorPreference,
  loadThemePreference,
  normalizeThemePreferenceForTemplate,
  saveAccentColorPreference,
  saveAppTemplatePreference,
  saveNeonButtonGradientBalancePreference,
  saveNeonButtonGradientMidpointPreference,
  saveSecondaryAccentColorPreference,
  saveThemePreference,
  watchSystemTheme,
  type AccentColorPreference,
  type AppTemplatePreference,
  type NeonButtonGradientBalancePreference,
  type NeonButtonGradientMidpointPreference,
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
  const [neonButtonGradientBalancePreference, setNeonButtonGradientBalancePreference] = useState<NeonButtonGradientBalancePreference>(() =>
    loadNeonButtonGradientBalancePreference(),
  );
  const [neonButtonGradientMidpointPreference, setNeonButtonGradientMidpointPreference] = useState<NeonButtonGradientMidpointPreference>(() =>
    loadNeonButtonGradientMidpointPreference(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyThemePreference(themePreference, appTemplatePreference),
  );

  const accentThemeStyle = useMemo(
    () =>
      getAccentColorThemeVariables(
        accentColorPreference,
        secondaryAccentColorPreference,
        neonButtonGradientBalancePreference,
        neonButtonGradientMidpointPreference,
      ) as CSSProperties,
    [accentColorPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, secondaryAccentColorPreference],
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
    applyAccentColorPreference(
      accentColorPreference,
      secondaryAccentColorPreference,
      neonButtonGradientBalancePreference,
      neonButtonGradientMidpointPreference,
    );
    saveAccentColorPreference(accentColorPreference);
    saveSecondaryAccentColorPreference(secondaryAccentColorPreference);
    saveNeonButtonGradientBalancePreference(neonButtonGradientBalancePreference);
    saveNeonButtonGradientMidpointPreference(neonButtonGradientMidpointPreference);
  }, [accentColorPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, secondaryAccentColorPreference]);

  return {
    accentColorPreference,
    accentThemeStyle,
    appTemplatePreference,
    neonButtonGradientBalancePreference,
    neonButtonGradientMidpointPreference,
    resolvedTheme,
    secondaryAccentColorPreference,
    setAccentColorPreference,
    setAppTemplatePreference,
    setNeonButtonGradientBalancePreference,
    setNeonButtonGradientMidpointPreference,
    setSecondaryAccentColorPreference,
    setThemePreference,
    themePreference,
  };
}
