import type { SteamSettings } from '../types/steam';

const STORAGE_KEY = 'questshelf.steamSettings.v1';

const emptySettings: SteamSettings = {
  apiKey: '',
  steamId64: '',
};

const isBrowser = typeof window !== 'undefined';

export function loadSteamSettings(): SteamSettings {
  if (!isBrowser) {
    return emptySettings;
  }

  const storedSettings = window.localStorage.getItem(STORAGE_KEY);

  if (!storedSettings) {
    return emptySettings;
  }

  try {
    const parsedSettings = JSON.parse(storedSettings) as Partial<SteamSettings>;

    return {
      apiKey: parsedSettings.apiKey ?? '',
      steamId64: parsedSettings.steamId64 ?? '',
    };
  } catch {
    return emptySettings;
  }
}

export function saveSteamSettings(settings: SteamSettings) {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
