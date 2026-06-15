import { useEffect, useMemo, useState } from 'react';
import { createTranslator, type AppLanguage } from '../../i18n';
import { loadLanguagePreference, saveLanguagePreference } from '../../lib/languagePreference';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from '../../lib/androidGamepadShortcuts';
import { loadControllerLayoutPreference, saveControllerLayoutPreference, type ControllerLayoutPreference } from '../../lib/controllerLayoutPreferences';
import { loadLandscapeLockPreference, saveLandscapeLockPreference } from '../../lib/landscapePreference';
import { useAppAppearance } from '../../hooks/useAppAppearance';

export function useAppPreferencesController() {
  const [isLandscapeLockEnabled, setIsLandscapeLockEnabled] = useState(() => loadLandscapeLockPreference());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguagePreference());
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [controllerLayoutPreference, setControllerLayoutPreference] = useState<ControllerLayoutPreference>(() => loadControllerLayoutPreference());
  const appearance = useAppAppearance();
  const t = useMemo(() => createTranslator(language), [language]);
  useEffect(() => { saveLanguagePreference(language); }, [language]);
  useEffect(() => { saveControllerDebugEnabled(isControllerDebugEnabled); }, [isControllerDebugEnabled]);
  useEffect(() => { saveControllerLayoutPreference(controllerLayoutPreference); }, [controllerLayoutPreference]);
  useEffect(() => { saveLandscapeLockPreference(isLandscapeLockEnabled); window.dispatchEvent(new CustomEvent('questshelf:landscape-lock-change', { detail: isLandscapeLockEnabled })); }, [isLandscapeLockEnabled]);
  return { ...appearance, controllerLayoutPreference, isControllerDebugEnabled, isLandscapeLockEnabled, language, setControllerLayoutPreference, setIsControllerDebugEnabled, setIsLandscapeLockEnabled, setLanguage, t };
}
