import { loadIgnoredSteamGames } from './steamIgnoredGamesStorage';
import { loadGames } from './gameStorage';
import { removePersistedKeys, savePersistedJson } from './localPersistence';
import type { Game } from '../types/game';

export const questShelfBackupVersion = 1;
export const questShelfAppVersion = '0.1.0';

export const coreBackupStorageKeys = [
  'questshelf.games.v1',
  'questshelf.rawgMetadataCache.v1',
  'questshelf.steamIgnoredGames.v1',
  'questshelf.libraryFilters.v1',
  'questshelf.wishlistFilters.v1',
] as const;

export const integrationBackupStorageKeys = ['questshelf.rawgSettings.v1', 'questshelf.steamSettings.v1'] as const;

export const allBackupStorageKeys = [...coreBackupStorageKeys, ...integrationBackupStorageKeys] as const;

export type QuestShelfBackup = {
  app: 'QuestShelf';
  data: Partial<Record<(typeof allBackupStorageKeys)[number], unknown>>;
  metadata: {
    appVersion: string;
    exportedAt: string;
    includesIntegrationSettings: boolean;
    schemaVersion: typeof questShelfBackupVersion;
  };
  schemaVersion: typeof questShelfBackupVersion;
};

export type RestoredQuestShelfData = {
  games: Game[];
  ignoredSteamGames: ReturnType<typeof loadIgnoredSteamGames>;
};

type BackupParseResult =
  | {
      backup: QuestShelfBackup;
      ok: true;
    }
  | {
      error: string;
      ok: false;
    };

const knownBackupStorageKeys = new Set<string>(allBackupStorageKeys);

export function createQuestShelfBackup(includeIntegrationSettings: boolean): QuestShelfBackup {
  const keys = includeIntegrationSettings
    ? [...coreBackupStorageKeys, ...integrationBackupStorageKeys]
    : [...coreBackupStorageKeys];

  return {
    app: 'QuestShelf',
    schemaVersion: questShelfBackupVersion,
    metadata: {
      appVersion: questShelfAppVersion,
      exportedAt: new Date().toISOString(),
      includesIntegrationSettings: includeIntegrationSettings,
      schemaVersion: questShelfBackupVersion,
    },
    data: keys.reduce<QuestShelfBackup['data']>((backupData, key) => {
      const value = readStorageJson(key);

      if (typeof value !== 'undefined') {
        backupData[key] = value;
      }

      return backupData;
    }, {}),
  };
}

export function parseQuestShelfBackupText(text: string): BackupParseResult {
  try {
    return validateQuestShelfBackup(JSON.parse(text));
  } catch {
    return {
      ok: false,
      error: 'Backup file is not valid JSON.',
    };
  }
}

export function restoreQuestShelfBackup(backup: QuestShelfBackup): RestoredQuestShelfData {
  allBackupStorageKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      savePersistedJson(key, backup.data[key]);
      return;
    }

    if (!integrationBackupStorageKeys.includes(key as (typeof integrationBackupStorageKeys)[number])) {
      void removePersistedKeys([key]);
    }
  });

  return {
    games: loadGames(),
    ignoredSteamGames: loadIgnoredSteamGames(),
  };
}

export async function resetQuestShelfLocalData() {
  await removePersistedKeys([...allBackupStorageKeys]);
}

function validateQuestShelfBackup(value: unknown): BackupParseResult {
  if (!value || typeof value !== 'object') {
    return {
      ok: false,
      error: 'Backup file does not contain a QuestShelf backup object.',
    };
  }

  const backup = value as Partial<QuestShelfBackup>;

  if (backup.app !== 'QuestShelf') {
    return {
      ok: false,
      error: 'Backup file is not marked as a QuestShelf backup.',
    };
  }

  if (!backup.metadata || typeof backup.metadata !== 'object') {
    return {
      ok: false,
      error: 'Backup metadata is missing.',
    };
  }

  const metadata = backup.metadata as Partial<QuestShelfBackup['metadata']>;
  const schemaVersion = metadata.schemaVersion ?? backup.schemaVersion;

  if (schemaVersion !== questShelfBackupVersion) {
    return {
      ok: false,
      error: `Unsupported backup version. Expected version ${questShelfBackupVersion}.`,
    };
  }

  if (typeof metadata.appVersion !== 'string' || metadata.appVersion.trim().length === 0) {
    return {
      ok: false,
      error: 'Backup metadata is missing the QuestShelf app version.',
    };
  }

  if (typeof metadata.exportedAt !== 'string' || Number.isNaN(new Date(metadata.exportedAt).getTime())) {
    return {
      ok: false,
      error: 'Backup metadata has an invalid export timestamp.',
    };
  }

  if (typeof metadata.includesIntegrationSettings !== 'boolean') {
    return {
      ok: false,
      error: 'Backup metadata is missing the integration settings flag.',
    };
  }

  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    return {
      ok: false,
      error: 'Backup data is missing or malformed.',
    };
  }

  const backupData = backup.data as Partial<Record<(typeof allBackupStorageKeys)[number], unknown>>;
  const dataKeys = Object.keys(backupData);
  const unknownKey = dataKeys.find((key) => !knownBackupStorageKeys.has(key));

  if (unknownKey) {
    return {
      ok: false,
      error: `Backup contains an unknown data section: ${unknownKey}.`,
    };
  }

  const malformedKey = dataKeys.find(
    (key) =>
      !isValidBackupDataSection(
        key as (typeof allBackupStorageKeys)[number],
        backupData[key as (typeof allBackupStorageKeys)[number]],
      ),
  );

  if (malformedKey) {
    return {
      ok: false,
      error: `Backup data section is malformed: ${malformedKey}.`,
    };
  }

  return {
    ok: true,
    backup: {
      ...(backup as QuestShelfBackup),
      schemaVersion: questShelfBackupVersion,
      metadata: {
        appVersion: metadata.appVersion,
        exportedAt: metadata.exportedAt,
        includesIntegrationSettings: metadata.includesIntegrationSettings,
        schemaVersion: questShelfBackupVersion,
      },
    },
  };
}

function isValidBackupDataSection(key: (typeof allBackupStorageKeys)[number], value: unknown) {
  switch (key) {
    case 'questshelf.games.v1':
    case 'questshelf.steamIgnoredGames.v1':
      return Array.isArray(value);
    case 'questshelf.rawgMetadataCache.v1':
    case 'questshelf.rawgSettings.v1':
    case 'questshelf.steamSettings.v1':
    case 'questshelf.libraryFilters.v1':
    case 'questshelf.wishlistFilters.v1':
      return isPlainObject(value);
  }

  return false;
}

function isPlainObject(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStorageJson(key: string) {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const value = window.localStorage.getItem(key);

  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
