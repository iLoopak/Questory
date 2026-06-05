import type { IsThereAnyDealSettings } from '../types/itad';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.isThereAnyDealSettings.v1';

const emptySettings: IsThereAnyDealSettings = {
  apiKey: '',
};

export function loadIsThereAnyDealSettings(): IsThereAnyDealSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeIsThereAnyDealSettings);
}

export function saveIsThereAnyDealSettings(settings: IsThereAnyDealSettings) {
  savePersistedJson(STORAGE_KEY, normalizeIsThereAnyDealSettings(settings));
}

export function normalizeIsThereAnyDealSettings(value: unknown): IsThereAnyDealSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<IsThereAnyDealSettings>) : {};

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
  };
}
