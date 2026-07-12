import type { SteamGridDbSettings } from '../types/steamGridDb';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { notifyIntegrationSettingsChanged } from './integrationSettingsRevision';

const STORAGE_KEY = 'questshelf.steamGridDbSettings.v1';

const emptySettings: SteamGridDbSettings = {
  apiKey: '',
};

export function loadSteamGridDbSettings(): SteamGridDbSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeSteamGridDbSettings);
}

export function saveSteamGridDbSettings(settings: SteamGridDbSettings) {
  const normalized = normalizeSteamGridDbSettings(settings);
  savePersistedJson(STORAGE_KEY, normalized);
  notifyIntegrationSettingsChanged();
  return normalized;
}

export function normalizeSteamGridDbSettings(value: unknown): SteamGridDbSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<SteamGridDbSettings>) : {};

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
  };
}
