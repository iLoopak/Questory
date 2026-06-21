import { useEffect, useMemo, useState } from 'react';
import { createTranslator, type AppLanguage } from '../../i18n';
import { loadLanguagePreference, saveLanguagePreference } from '../../lib/languagePreference';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from '../../lib/androidGamepadShortcuts';
import { loadLandscapeLockPreference, saveLandscapeLockPreference } from '../../lib/landscapePreference';
import { loadControllerSettings, saveControllerSettings } from '../../lib/controllerSettingsStorage';
import { resolveProfile, type ControllerProfileId, controllerProfileDetectedEvent } from '../../lib/controllerProfiles';
import { useAppAppearance } from '../../hooks/useAppAppearance';

export function useAppPreferencesController() {
  const [isLandscapeLockEnabled, setIsLandscapeLockEnabled] = useState(() => loadLandscapeLockPreference());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguagePreference());
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [controllerProfileId, setControllerProfileIdState] = useState<ControllerProfileId>(() => loadControllerSettings().profileId);
  const [detectedProfileId, setDetectedProfileId] = useState<ControllerProfileId | null>(null);
  const appearance = useAppAppearance();
  const t = useMemo(() => createTranslator(language), [language]);

  const confirmCancelConvention = resolveProfile(controllerProfileId, detectedProfileId).confirmCancelConvention;

  useEffect(() => { saveLanguagePreference(language); }, [language]);
  useEffect(() => { saveControllerDebugEnabled(isControllerDebugEnabled); }, [isControllerDebugEnabled]);
  useEffect(() => { saveLandscapeLockPreference(isLandscapeLockEnabled); window.dispatchEvent(new CustomEvent('questshelf:landscape-lock-change', { detail: isLandscapeLockEnabled })); }, [isLandscapeLockEnabled]);

  useEffect(() => {
    function handleProfileDetected(event: Event) {
      const detected = (event as CustomEvent<ControllerProfileId | null>).detail;
      setDetectedProfileId(detected);
    }
    window.addEventListener(controllerProfileDetectedEvent, handleProfileDetected);
    return () => window.removeEventListener(controllerProfileDetectedEvent, handleProfileDetected);
  }, []);

  function setControllerProfileId(profileId: ControllerProfileId) {
    setControllerProfileIdState(profileId);
    saveControllerSettings({ profileId });
  }

  return {
    ...appearance,
    confirmCancelConvention,
    controllerProfileId,
    detectedProfileId,
    isControllerDebugEnabled,
    isLandscapeLockEnabled,
    language,
    setControllerProfileId,
    setIsControllerDebugEnabled,
    setIsLandscapeLockEnabled,
    setLanguage,
    t,
  };
}
