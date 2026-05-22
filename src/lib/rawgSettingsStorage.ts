import type { RawgSettings } from '../types/rawg';

const STORAGE_KEY = 'questshelf.rawgSettings.v1';

const emptySettings: RawgSettings = {
  apiKey: '',
};

const isBrowser = typeof window !== 'undefined';

export function loadRawgSettings(): RawgSettings {
  if (!isBrowser) {
    return emptySettings;
  }

  const storedSettings = window.localStorage.getItem(STORAGE_KEY);

  if (!storedSettings) {
    return emptySettings;
  }

  try {
    const parsedSettings = JSON.parse(storedSettings) as Partial<RawgSettings>;

    return {
      apiKey: parsedSettings.apiKey ?? '',
    };
  } catch {
    return emptySettings;
  }
}

export function saveRawgSettings(settings: RawgSettings) {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
