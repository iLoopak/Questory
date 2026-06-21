import { useEffect, useMemo, useState } from 'react';
import { createTranslator, type AppLanguage } from '../../i18n';
import { loadLanguagePreference, saveLanguagePreference } from '../../lib/languagePreference';
import { loadControllerDebugEnabled, saveControllerDebugEnabled } from '../../lib/androidGamepadShortcuts';
import { loadControllerLayoutPreference, saveControllerLayoutPreference, type ControllerLayoutPreference } from '../../lib/controllerLayoutPreferences';
import { loadLandscapeLockPreference, saveLandscapeLockPreference } from '../../lib/landscapePreference';
import { loadControllerSettings, saveControllerSettings } from '../../lib/controllerSettingsStorage';
import { type ControllerProfileId, controllerProfileDetectedEvent } from '../../lib/controllerProfiles';
import { useAppAppearance } from '../../hooks/useAppAppearance';

// Maps a concrete profile id to the legacy layout preference so existing confirm/cancel logic keeps working.
function profileToLayoutPreference(profileId: ControllerProfileId): ControllerLayoutPreference {
  if (profileId === 'nintendo' || profileId === 'retroid' || profileId === 'generic-android') {
    return 'nintendo';
  }
  if (profileId === 'xbox' || profileId === 'playstation' || profileId === 'steam-deck' || profileId === 'generic-hid') {
    return 'xbox';
  }
  return 'auto';
}

export function useAppPreferencesController() {
  const [isLandscapeLockEnabled, setIsLandscapeLockEnabled] = useState(() => loadLandscapeLockPreference());
  const [language, setLanguage] = useState<AppLanguage>(() => loadLanguagePreference());
  const [isControllerDebugEnabled, setIsControllerDebugEnabled] = useState(() => loadControllerDebugEnabled());
  const [controllerLayoutPreference, setControllerLayoutPreference] = useState<ControllerLayoutPreference>(() => loadControllerLayoutPreference());
  const [controllerProfileId, setControllerProfileIdState] = useState<ControllerProfileId>(() => loadControllerSettings().profileId);
  const [detectedProfileId, setDetectedProfileId] = useState<ControllerProfileId | null>(null);
  const appearance = useAppAppearance();
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => { saveLanguagePreference(language); }, [language]);
  useEffect(() => { saveControllerDebugEnabled(isControllerDebugEnabled); }, [isControllerDebugEnabled]);
  useEffect(() => { saveControllerLayoutPreference(controllerLayoutPreference); }, [controllerLayoutPreference]);
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
    // Keep the legacy layout preference in sync so confirm/cancel logic works without Wave 2.
    if (profileId !== 'auto') {
      const derivedLayout = profileToLayoutPreference(profileId);
      setControllerLayoutPreference(derivedLayout);
    }
  }

  return {
    ...appearance,
    controllerLayoutPreference,
    controllerProfileId,
    detectedProfileId,
    isControllerDebugEnabled,
    isLandscapeLockEnabled,
    language,
    setControllerLayoutPreference,
    setControllerProfileId,
    setIsControllerDebugEnabled,
    setIsLandscapeLockEnabled,
    setLanguage,
    t,
  };
}
