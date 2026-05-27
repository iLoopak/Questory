import type { SteamSettings } from '../types/steam';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.steamSettings.v1';

const emptySettings: SteamSettings = {
  apiKey: '',
  steamId64: '',
  wishlistUrl: '',
};

export function loadSteamSettings(): SteamSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeSteamSettings);
}

export function saveSteamSettings(settings: SteamSettings) {
  savePersistedJson(STORAGE_KEY, settings);
}

function normalizeSteamSettings(value: unknown): SteamSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<SteamSettings>) : {};

  return {
    apiKey: parsedSettings.apiKey ?? '',
    steamId64: parsedSettings.steamId64 ?? '',
    wishlistUrl: parsedSettings.wishlistUrl ?? '',
  };
}
