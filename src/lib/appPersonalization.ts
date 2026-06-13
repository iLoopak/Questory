import { loadLocalJson, savePersistedJson } from './localPersistence';

export const appPersonalizationStorageKey = 'questshelf.appPersonalization.v1';
export const maxLibraryOwnerNicknameLength = 32;

export type AppPersonalizationSettings = {
  libraryOwnerNickname: string;
};

const emptySettings: AppPersonalizationSettings = {
  libraryOwnerNickname: '',
};

export function loadAppPersonalizationSettings(): AppPersonalizationSettings {
  return loadLocalJson(appPersonalizationStorageKey, emptySettings, normalizeAppPersonalizationSettings);
}

export function saveAppPersonalizationSettings(settings: AppPersonalizationSettings) {
  savePersistedJson(appPersonalizationStorageKey, normalizeAppPersonalizationSettings(settings));
}

export function normalizeAppPersonalizationSettings(value: unknown): AppPersonalizationSettings {
  const parsedSettings = value && typeof value === 'object' ? (value as Partial<AppPersonalizationSettings>) : {};

  return {
    libraryOwnerNickname: sanitizeLibraryOwnerNickname(parsedSettings.libraryOwnerNickname),
  };
}

export function sanitizeLibraryOwnerNickname(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLibraryOwnerNicknameLength);
}

export function formatPersonalizedQuestShelfTitle(name: string | null | undefined) {
  const normalizedName = sanitizeLibraryOwnerNickname(name);

  if (!normalizedName) {
    return 'QuestShelf';
  }

  return /questshelf/i.test(normalizedName) ? normalizedName : `${normalizedName}’s QuestShelf`;
}

export function getPersonalizedQuestShelfTitle(nickname: string, steamProfileName?: string | null) {
  const normalizedNickname = sanitizeLibraryOwnerNickname(nickname);

  if (normalizedNickname) {
    return formatPersonalizedQuestShelfTitle(normalizedNickname);
  }

  const normalizedSteamProfileName = sanitizeLibraryOwnerNickname(steamProfileName);
  return normalizedSteamProfileName ? formatPersonalizedQuestShelfTitle(normalizedSteamProfileName) : 'QuestShelf';
}
