import type { SteamSettings } from '../types/steam';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { notifyIntegrationSettingsChanged } from './integrationSettingsRevision';

const STORAGE_KEY = 'questshelf.steamSettings.v1';

const emptySettings: SteamSettings = {
  apiKey: '',
  steamId64: '',
  wishlistUrl: '',
  profile: undefined,
};

export function loadSteamSettings(): SteamSettings {
  return loadLocalJson(STORAGE_KEY, emptySettings, normalizeSteamSettings);
}

export function saveSteamSettings(settings: SteamSettings) {
  const normalized = normalizeSteamSettings(settings);
  savePersistedJson(STORAGE_KEY, normalized);
  notifyIntegrationSettingsChanged();
  return normalized;
}

export function normalizeSteamSettings(value: unknown): SteamSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<SteamSettings>) : {};

  const profile = normalizeSteamProfileMetadata(parsedSettings.profile);

  return {
    apiKey: typeof parsedSettings.apiKey === 'string' ? parsedSettings.apiKey : '',
    steamId64: typeof parsedSettings.steamId64 === 'string' ? parsedSettings.steamId64 : '',
    wishlistUrl: typeof parsedSettings.wishlistUrl === 'string' ? parsedSettings.wishlistUrl : '',
    ...(profile ? { profile } : {}),
  };
}

function normalizeSteamProfileMetadata(value: unknown): SteamSettings['profile'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const parsedProfile = value as NonNullable<SteamSettings['profile']>;
  const profile = {
    ...(typeof parsedProfile.personaName === 'string' && parsedProfile.personaName.trim() ? { personaName: parsedProfile.personaName.trim() } : {}),
    ...(typeof parsedProfile.profileName === 'string' && parsedProfile.profileName.trim() ? { profileName: parsedProfile.profileName.trim() } : {}),
    ...(typeof parsedProfile.profileUrl === 'string' && parsedProfile.profileUrl.trim() ? { profileUrl: parsedProfile.profileUrl.trim() } : {}),
    ...(typeof parsedProfile.avatarUrl === 'string' && parsedProfile.avatarUrl.trim() ? { avatarUrl: parsedProfile.avatarUrl.trim() } : {}),
    ...(typeof parsedProfile.updatedAt === 'string' && parsedProfile.updatedAt.trim() ? { updatedAt: parsedProfile.updatedAt.trim() } : {}),
  };

  return Object.keys(profile).length > 0 ? profile : undefined;
}

export function getSteamProfileDisplayName(settings: SteamSettings) {
  return settings.profile?.personaName?.trim() || settings.profile?.profileName?.trim() || '';
}
