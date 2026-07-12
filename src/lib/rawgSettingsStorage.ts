import type { RawgSettings } from '../types/rawg';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { notifyIntegrationSettingsChanged } from './integrationSettingsRevision';

const STORAGE_KEY = 'questshelf.rawgSettings.v1';

const emptySettings: RawgSettings = {
  apiKey: '',
};

export function loadRawgSettings(): RawgSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeRawgSettings);
}

export function saveRawgSettings(settings: RawgSettings) {
  const normalized = normalizeRawgSettings(settings);
  savePersistedJson(STORAGE_KEY, normalized);
  notifyIntegrationSettingsChanged();
  return normalized;
}

export function normalizeRawgSettings(value: unknown): RawgSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<RawgSettings>) : {};

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
  };
}
