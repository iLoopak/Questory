import { loadIgnoredSteamGames, normalizeIgnoredSteamGames } from './steamIgnoredGamesStorage';
import { gameRepository, loadGames, normalizeLoadedGames } from './gameStorage';
import { removePersistedKeys, savePersistedJson } from './localPersistence';
import { normalizeOnboardingState } from './onboardingStorage';
import { normalizePlatformQueueState } from './platformQueueStorage';
import { normalizePlayActivityRecords } from './playActivityStorage';
import { normalizeRawgMetadataCache } from './rawgMetadataCache';
import { normalizeRawgSettings } from './rawgSettingsStorage';
import { normalizeReviewModeState } from './reviewModeStorage';
import { normalizeIsThereAnyDealSettings } from './isThereAnyDealSettingsStorage';
import {
  coreBackupStorageKeys,
  deviceOnlyStorageKeys,
  integrationBackupStorageKeys,
} from './storageRegistry';
import { normalizeSteamGridDbSettings } from './steamGridDbSettingsStorage';
import { normalizeSteamSettings } from './steamSettingsStorage';
import { normalizeShelfIdentitySettings, shelfIdentityStorageKey } from './shelfIdentity';
import { normalizeAppPersonalizationSettings } from './appPersonalization';
import type { Game } from '../types/game';

export const questShelfBackupVersion = 1;
export const questShelfAppVersion = '0.1.0';

export { coreBackupStorageKeys, integrationBackupStorageKeys };
export const deviceBackupStorageKeys = ['questshelf.syncFolderSettings.v1'] as const;

export const allBackupStorageKeys = [...coreBackupStorageKeys, ...integrationBackupStorageKeys] as const;

export type QuestShelfBackup = {
  app: 'QuestShelf' | 'Questory';
  data: Partial<Record<(typeof allBackupStorageKeys)[number], unknown>>;
  metadata: {
    appVersion: string;
    exportedAt: string;
    includesIntegrationSettings: boolean;
    schemaVersion: typeof questShelfBackupVersion;
  };
  schemaVersion: typeof questShelfBackupVersion;
};

export type QuestShelfBackupSummary = {
  exportedAt: string;
  gameCount: number;
  schemaVersion: number;
  wishlistCount: number;
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
    app: 'Questory',
    schemaVersion: questShelfBackupVersion,
    metadata: {
      appVersion: questShelfAppVersion,
      exportedAt: new Date().toISOString(),
      includesIntegrationSettings: includeIntegrationSettings,
      schemaVersion: questShelfBackupVersion,
    },
    data: keys.reduce<QuestShelfBackup['data']>((backupData, key) => {
      // Wave 3: games come from the IndexedDB repository (the blob is inert), but the
      // backup shape is unchanged — still data['questshelf.games.v1'] = Game[].
      if (key === 'questshelf.games.v1') {
        backupData[key] = normalizeLoadedGames(loadGames());
        return backupData;
      }

      const value = readStorageJson(key);

      if (typeof value !== 'undefined') {
        backupData[key] = key === shelfIdentityStorageKey ? normalizeShelfIdentitySettings(value) : value;
      } else if (key === shelfIdentityStorageKey) {
        backupData[key] = normalizeShelfIdentitySettings(undefined);
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

export function getQuestShelfBackupSummary(backup: QuestShelfBackup): QuestShelfBackupSummary {
  const games = getBackupGames(backup);

  return {
    exportedAt: backup.metadata.exportedAt,
    gameCount: games.filter((game) => game.collectionType !== 'wishlist').length,
    schemaVersion: backup.metadata.schemaVersion ?? backup.schemaVersion,
    wishlistCount: games.filter((game) => game.collectionType === 'wishlist').length,
  };
}

export function restoreQuestShelfBackup(backup: QuestShelfBackup): RestoredQuestShelfData {
  // Pre-normalize all sections before touching storage so an unexpected normalize error
  // cannot leave storage in a partially-written state.
  const writes: Array<[(typeof allBackupStorageKeys)[number], unknown]> = [];
  const removes: Array<(typeof allBackupStorageKeys)[number]> = [];

  allBackupStorageKeys.forEach((key) => {
    // Games are written through the repository below so IndexedDB + snapshot + the
    // legacy blob all stay consistent (Wave 2). Everything else uses the blob path.
    if (key === 'questshelf.games.v1') {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      writes.push([key, normalizeBackupDataSection(key, backup.data[key])]);
    } else if (!integrationBackupStorageKeys.includes(key as (typeof integrationBackupStorageKeys)[number])) {
      removes.push(key);
    }
  });

  writes.forEach(([key, value]) => savePersistedJson(key, value));
  void removePersistedKeys(removes);

  // Replace the game collection through the repository (updates IndexedDB, the in-memory
  // snapshot, and dual-writes the legacy blob). A backup without a games section clears it.
  if (Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.games.v1')) {
    gameRepository.replaceAll(normalizeLoadedGames(backup.data['questshelf.games.v1']));
  } else {
    void gameRepository.clear();
  }

  return {
    games: loadGames(),
    ignoredSteamGames: loadIgnoredSteamGames(),
  };
}

export function mergeQuestShelfBackup(backup: QuestShelfBackup): RestoredQuestShelfData {
  // Pre-normalize before touching storage so an unexpected normalize error cannot leave
  // storage in a partially-written state.
  const mergedGames = mergeGames(loadGames(), getBackupGames(backup));
  const writes: Array<[(typeof allBackupStorageKeys)[number], unknown]> = [];

  allBackupStorageKeys.forEach((key) => {
    if (key === 'questshelf.games.v1') {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      writes.push([key, normalizeBackupDataSection(key, backup.data[key])]);
    }
  });

  writes.forEach(([key, value]) => savePersistedJson(key, value));

  // Merged games go through the repository (IndexedDB + snapshot + legacy dual-write).
  gameRepository.replaceAll(mergedGames);

  return {
    games: loadGames(),
    ignoredSteamGames: loadIgnoredSteamGames(),
  };
}

export async function resetQuestShelfLocalData() {
  // Clear the IndexedDB game store + snapshot first so reset does not leave orphaned
  // games in IndexedDB after the legacy blob is removed.
  await gameRepository.clear();
  await removePersistedKeys([...allBackupStorageKeys, ...deviceOnlyStorageKeys]);
}

function validateQuestShelfBackup(value: unknown): BackupParseResult {
  if (!value || typeof value !== 'object') {
    return {
      ok: false,
      error: 'Backup file does not contain a Questory backup object.',
    };
  }

  const backup = value as Partial<QuestShelfBackup>;

  if (backup.app !== 'QuestShelf' && backup.app !== 'Questory') {
    return {
      ok: false,
      error: 'Backup file is not marked as a Questory backup.',
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
      error: 'Backup metadata is missing the Questory app version.',
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
  // Only validate keys this app version knows about; unknown keys from newer versions are ignored.
  const knownDataKeys = Object.keys(backupData).filter((key) => knownBackupStorageKeys.has(key)) as Array<
    (typeof allBackupStorageKeys)[number]
  >;

  const malformedKey = knownDataKeys.find((key) => !isValidBackupDataSection(key, backupData[key]));

  if (malformedKey) {
    return {
      ok: false,
      error: `Backup section "${getBackupSectionDisplayName(malformedKey)}" has an unexpected format and cannot be imported. The backup file may be corrupted or was edited manually.`,
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

function getBackupGames(backup: QuestShelfBackup): Game[] {
  return normalizeLoadedGames(backup.data['questshelf.games.v1']);
}

function mergeGames(localGames: Game[], backupGames: Game[]) {
  const mergedGames = [...localGames];

  backupGames.forEach((backupGame) => {
    const existingIndex = mergedGames.findIndex((localGame) => areGamesMatching(localGame, backupGame));

    if (existingIndex === -1) {
      mergedGames.push(backupGame);
      return;
    }

    if (isBackupGameNewer(backupGame, mergedGames[existingIndex])) {
      mergedGames[existingIndex] = {
        ...mergedGames[existingIndex],
        ...backupGame,
      };
    }
  });

  return mergedGames;
}

function areGamesMatching(firstGame: Game, secondGame: Game) {
  if (firstGame.id === secondGame.id) {
    return true;
  }

  if (typeof firstGame.steamAppId === 'number' && firstGame.steamAppId === secondGame.steamAppId) {
    return true;
  }

  if (typeof firstGame.rawgId === 'number' && firstGame.rawgId === secondGame.rawgId) {
    return true;
  }

  const firstRomPath = (firstGame.romPath ?? firstGame.romUri ?? '').trim().toLowerCase();
  const secondRomPath = (secondGame.romPath ?? secondGame.romUri ?? '').trim().toLowerCase();

  if (firstRomPath && secondRomPath && firstRomPath === secondRomPath) {
    return true;
  }

  return getTitlePlatformKey(firstGame) === getTitlePlatformKey(secondGame);
}

function isBackupGameNewer(backupGame: Game, localGame: Game) {
  const backupUpdatedAt = getGameUpdatedAt(backupGame);
  const localUpdatedAt = getGameUpdatedAt(localGame);

  if (!backupUpdatedAt || !localUpdatedAt) {
    return Boolean(backupUpdatedAt && !localUpdatedAt);
  }

  return backupUpdatedAt >= localUpdatedAt;
}

function getGameUpdatedAt(game: Game) {
  return game.updatedAt ?? game.metadataUpdatedAt ?? game.wishlistSyncedAt ?? game.importedAt ?? game.wishlistImportedAt ?? null;
}

function isValidBackupDataSection(key: (typeof allBackupStorageKeys)[number], value: unknown) {
  switch (key) {
    case 'questshelf.games.v1':
    case 'questshelf.steamIgnoredGames.v1':
    case 'questshelf.playActivity.v1':
      return Array.isArray(value);
    case 'questshelf.rawgMetadataCache.v1':
    case 'questshelf.rawgSettings.v1':
    case 'questshelf.steamGridDbSettings.v1':
    case 'questshelf.steamSettings.v1':
    case 'questshelf.isThereAnyDealSettings.v1':
    case 'questshelf.libraryFilters.v1':
    case 'questshelf.wishlistFilters.v1':
    case 'questshelf.onboarding.v1':
    case 'questshelf.platformQueues.v1':
    case 'questshelf.reviewMode.v1':
    case 'questshelf.appPersonalization.v1':
    case 'questshelf.shelfIdentity.v1':
      return isPlainObject(value);
  }

  return false;
}

function normalizeBackupDataSection(key: (typeof allBackupStorageKeys)[number], value: unknown) {
  // Backups are user-editable JSON. Normalize every section before writing so restore/merge
  // cannot persist malformed data that later crashes startup.
  switch (key) {
    case 'questshelf.games.v1':
      return normalizeLoadedGames(value);
    case 'questshelf.steamIgnoredGames.v1':
      return normalizeIgnoredSteamGames(value);
    case 'questshelf.playActivity.v1':
      return normalizePlayActivityRecords(value);
    case 'questshelf.rawgMetadataCache.v1':
      return normalizeRawgMetadataCache(value);
    case 'questshelf.rawgSettings.v1':
      return normalizeRawgSettings(value);
    case 'questshelf.steamGridDbSettings.v1':
      return normalizeSteamGridDbSettings(value);
    case 'questshelf.steamSettings.v1':
      return normalizeSteamSettings(value);
    case 'questshelf.isThereAnyDealSettings.v1':
      return normalizeIsThereAnyDealSettings(value);
    case 'questshelf.onboarding.v1':
      return normalizeOnboardingState(value);
    case 'questshelf.platformQueues.v1':
      return normalizePlatformQueueState(value);
    case 'questshelf.reviewMode.v1':
      return normalizeReviewModeState(value);
    case 'questshelf.appPersonalization.v1':
      return normalizeAppPersonalizationSettings(value);
    case 'questshelf.shelfIdentity.v1':
      return normalizeShelfIdentitySettings(value);
    case 'questshelf.libraryFilters.v1':
    case 'questshelf.wishlistFilters.v1':
      return isPlainObject(value) ? value : {};
  }
}

function getTitlePlatformKey(game: Game) {
  return `${game.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')}|${String(game.platform).trim().toLowerCase()}`;
}

function isPlainObject(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getBackupSectionDisplayName(key: string): string {
  const displayNames: Record<string, string> = {
    'questshelf.games.v1': 'game library',
    'questshelf.steamIgnoredGames.v1': 'ignored Steam games',
    'questshelf.rawgMetadataCache.v1': 'RAWG metadata cache',
    'questshelf.rawgSettings.v1': 'RAWG settings',
    'questshelf.steamGridDbSettings.v1': 'SteamGridDB settings',
    'questshelf.steamSettings.v1': 'Steam settings',
    'questshelf.isThereAnyDealSettings.v1': 'IsThereAnyDeal settings',
    'questshelf.libraryFilters.v1': 'library filters',
    'questshelf.wishlistFilters.v1': 'wishlist filters',
    'questshelf.onboarding.v1': 'onboarding state',
    'questshelf.platformQueues.v1': 'platform queues',
    'questshelf.playActivity.v1': 'play activity',
    'questshelf.reviewMode.v1': 'quest queue settings',
    'questshelf.appPersonalization.v1': 'app personalization',
    'questshelf.shelfIdentity.v1': 'shelf identity',
  };

  return displayNames[key] ?? key;
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