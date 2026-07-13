import type { IsThereAnyDealSettings } from '../types/itad';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { notifyIntegrationSettingsChanged } from './integrationSettingsRevision';

export const ITAD_SETTINGS_STORAGE_KEY = 'questshelf.isThereAnyDealSettings.v1';
const STORAGE_KEY = ITAD_SETTINGS_STORAGE_KEY;

const emptySettings: IsThereAnyDealSettings = {
  apiKey: '',
};

export function loadIsThereAnyDealSettings(): IsThereAnyDealSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeIsThereAnyDealSettings);
}

export function saveIsThereAnyDealSettings(settings: IsThereAnyDealSettings) {
  const normalized = normalizeIsThereAnyDealSettings(settings);
  savePersistedJson(STORAGE_KEY, normalized);
  notifyIntegrationSettingsChanged();
  return normalized;
}

export function normalizeIsThereAnyDealSettings(value: unknown): IsThereAnyDealSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<IsThereAnyDealSettings>) : {};

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
  };
}
