import type { RawgSettings } from '../types/rawg';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.rawgSettings.v1';

const emptySettings: RawgSettings = {
  apiKey: '',
};

export function loadRawgSettings(): RawgSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeRawgSettings);
}

export function saveRawgSettings(settings: RawgSettings) {
  savePersistedJson(STORAGE_KEY, settings);
}

function normalizeRawgSettings(value: unknown): RawgSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<RawgSettings>) : {};

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
  };
}
