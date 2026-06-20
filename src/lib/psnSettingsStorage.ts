import type { PsnSettings } from '../types/psn';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.psnSettings.v1';

const emptySettings: PsnSettings = {
  cookieString: '',
  accessToken: '',
  refreshToken: '',
  tokenExpiresAt: '',
  onlineId: '',
};

export function loadPsnSettings(): PsnSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizePsnSettings);
}

export function savePsnSettings(settings: PsnSettings) {
  savePersistedJson(STORAGE_KEY, normalizePsnSettings(settings));
}

export function hasPsnAccessToken(settings: PsnSettings): boolean {
  return Boolean(settings.accessToken) && isPsnTokenValid(settings);
}

export function isPsnTokenValid(settings: PsnSettings): boolean {
  if (!settings.tokenExpiresAt) return false;
  return new Date(settings.tokenExpiresAt) > new Date();
}

function normalizePsnSettings(value: unknown): PsnSettings {
  const parsed = value && typeof value === 'object' ? (value as Partial<PsnSettings> & { npssoToken?: string }) : {};
  return {
    // migrate legacy npssoToken field if present
    cookieString: typeof parsed.cookieString === 'string' ? parsed.cookieString : (parsed.npssoToken ?? ''),
    accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
    tokenExpiresAt: typeof parsed.tokenExpiresAt === 'string' ? parsed.tokenExpiresAt : '',
    onlineId: typeof parsed.onlineId === 'string' ? parsed.onlineId : '',
  };
}
