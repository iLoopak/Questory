import { defaultLanguage, isAppLanguage, type AppLanguage } from '../i18n';

export const languagePreferenceStorageKey = 'questshelf.languagePreference.v1';

export function loadLanguagePreference(): AppLanguage {
  if (typeof window === 'undefined') {
    return defaultLanguage;
  }

  try {
    const storedPreference = window.localStorage.getItem(languagePreferenceStorageKey);
    return isAppLanguage(storedPreference) ? storedPreference : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

export function saveLanguagePreference(language: AppLanguage) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(languagePreferenceStorageKey, language);
  } catch {
    // Language switching should remain responsive even when persistence is unavailable.
  }
}
