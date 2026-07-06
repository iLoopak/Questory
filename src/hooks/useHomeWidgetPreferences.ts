import { useCallback, useEffect, useState } from 'react';
import {
  homeWidgetPreferencesChangeEvent,
  loadHomeWidgetPreferences,
  saveHomeWidgetPreferences,
  type HomeWidgetPreferences,
} from '../lib/homeWidgetPreferences';

/**
 * Shared source of truth for the Home widget visibility preferences. Both the
 * Home screen and the Settings panel call this; a window event keeps every
 * mounted instance in sync so a toggle in Settings applies immediately (and, at
 * minimum, on the next visit to Home).
 */
export function useHomeWidgetPreferences() {
  const [preferences, setPreferencesState] = useState<HomeWidgetPreferences>(() => loadHomeWidgetPreferences());

  useEffect(() => {
    function handleChange(event: Event) {
      const detail = (event as CustomEvent<HomeWidgetPreferences>).detail;
      setPreferencesState(detail ?? loadHomeWidgetPreferences());
    }

    window.addEventListener(homeWidgetPreferencesChangeEvent, handleChange);
    return () => window.removeEventListener(homeWidgetPreferencesChangeEvent, handleChange);
  }, []);

  const setPreferences = useCallback((next: HomeWidgetPreferences) => {
    setPreferencesState(next);
    saveHomeWidgetPreferences(next);
  }, []);

  return { preferences, setPreferences };
}
