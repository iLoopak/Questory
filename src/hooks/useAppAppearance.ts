import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  applyAccentColorPreference,
  applyAppTemplatePreference,
  applyThemePreference,
  getAccentColorThemeVariables,
  loadAccentColorPreference,
  loadGradientOrientationPreference,
  loadAppTemplatePreference,
  loadNeonButtonGradientBalancePreference,
  loadNeonButtonGradientMidpointPreference,
  loadNeonButtonStylePreference,
  loadSecondaryAccentColorPreference,
  loadThemePreference,
  normalizeThemePreferenceForTemplate,
  saveAccentColorPreference,
  saveGradientOrientationPreference,
  saveAppTemplatePreference,
  saveNeonButtonGradientBalancePreference,
  saveNeonButtonGradientMidpointPreference,
  saveNeonButtonStylePreference,
  saveSecondaryAccentColorPreference,
  saveThemePreference,
  applyNeonButtonStylePreference,
  watchSystemTheme,
  type AccentColorPreference,
  type AppTemplatePreference,
  type GradientOrientationPreference,
  type NeonButtonGradientBalancePreference,
  type NeonButtonGradientMidpointPreference,
  type NeonButtonStylePreference,
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
  const [gradientOrientationPreference, setGradientOrientationPreference] = useState<GradientOrientationPreference>(() => loadGradientOrientationPreference());
  const [neonButtonGradientBalancePreference, setNeonButtonGradientBalancePreference] = useState<NeonButtonGradientBalancePreference>(() =>
    loadNeonButtonGradientBalancePreference(),
  );
  const [neonButtonGradientMidpointPreference, setNeonButtonGradientMidpointPreference] = useState<NeonButtonGradientMidpointPreference>(() =>
    loadNeonButtonGradientMidpointPreference(),
  );
  const [neonButtonStylePreference, setNeonButtonStylePreference] = useState<NeonButtonStylePreference>(() =>
    loadNeonButtonStylePreference(),
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
        gradientOrientationPreference,
      ) as CSSProperties,
    [accentColorPreference, gradientOrientationPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, secondaryAccentColorPreference],
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
      gradientOrientationPreference,
    );
    saveAccentColorPreference(accentColorPreference);
    saveSecondaryAccentColorPreference(secondaryAccentColorPreference);
    saveNeonButtonGradientBalancePreference(neonButtonGradientBalancePreference);
    saveNeonButtonGradientMidpointPreference(neonButtonGradientMidpointPreference);
    saveGradientOrientationPreference(gradientOrientationPreference);
  }, [accentColorPreference, gradientOrientationPreference, neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference, secondaryAccentColorPreference]);

  useEffect(() => {
    applyNeonButtonStylePreference(neonButtonStylePreference);
    saveNeonButtonStylePreference(neonButtonStylePreference);
  }, [neonButtonStylePreference]);

  return {
    accentColorPreference,
    accentThemeStyle,
    appTemplatePreference,
    gradientOrientationPreference,
    neonButtonGradientBalancePreference,
    neonButtonGradientMidpointPreference,
    resolvedTheme,
    secondaryAccentColorPreference,
    setAccentColorPreference,
    setGradientOrientationPreference,
    setAppTemplatePreference,
    setNeonButtonGradientBalancePreference,
    setNeonButtonGradientMidpointPreference,
    neonButtonStylePreference,
    setNeonButtonStylePreference,
    setSecondaryAccentColorPreference,
    setThemePreference,
    themePreference,
  };
}
