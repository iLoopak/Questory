import { normalizeAchievementCounters } from './achievementCounters';
import { loadIgnoredSteamGames, normalizeIgnoredSteamGames } from './steamIgnoredGamesStorage';
import { findGameRecordIndex } from './gameIdentity';
import { gameRepository, loadGames, normalizeLoadedGames, parseLoadedGameRows, type GameRowRejection } from './gameStorage';
import {
  removePersistedKeys,
  removePersistedKeysDurable,
  savePersistedJsonDurable,
  type KvWriteResult,
} from './localPersistence';
import { saveRecoverySnapshot, type RecoverySnapshot } from './recoverySnapshotStorage';
import { normalizeOnboardingState } from './onboardingStorage';
import { loadPlatformQueueState, normalizePlatformQueuePersistedState, normalizePlatformQueueState } from './platformQueueStorage';
import { getPlannedGameIds, type PlannedGameIds } from './plannedGames';
import { loadPlayActivity, normalizePlayActivityRecords, playActivityRepository } from './playActivityStorage';
import { loadRawgMetadataCache, normalizeRawgMetadataCache, rawgMetadataCacheRepository } from './rawgMetadataCache';
import { normalizeRawgSettings } from './rawgSettingsStorage';
import { normalizeReviewModeState } from './reviewModeStorage';
import { normalizeIsThereAnyDealSettings } from './isThereAnyDealSettingsStorage';
import {
  coreBackupStorageKeys,
  deviceOnlyStorageKeys,
  integrationBackupStorageKeys,
  preservedStorageKeys,
  resettableKvStorageKeys,
  resettableLocalStorageKeys,
  resettableSessionStorageKeys,
  resettableStorageKeyPrefixes,
  storageKeyRegistry,
} from './storageRegistry';
import { getStorageAdapter } from './storageAdapter';
import { clearAllCachedScreenshots } from './screenshotCache';
import { normalizeSteamGridDbSettings } from './steamGridDbSettingsStorage';
import { normalizeSteamSettings } from './steamSettingsStorage';
import { normalizeShelfIdentitySettings, shelfIdentityStorageKey } from './shelfIdentity';
import { normalizeAppPersonalizationSettings } from './appPersonalization';
import { normalizeRecommendationFeedbackRecords, normalizeRecommendationPreferences, recommendationExposureStorageKey } from './recommendationFeedback';
import type { RecommendationFeedbackRecord } from './recommendationFeedback';
import { buildTasteProfile, normalizeTasteProfile } from './tasteProfile';
import type { TasteProfile, TasteSignal } from './tasteProfile';
import { clearPersonalRecommendationCaches } from '../services/personalRecommendationsService';
import { clearContextualRecommendationCache } from '../services/contextualRecommendationsService';
import { clearReleaseCalendarCache } from '../services/releaseCalendarService';
import type { Game } from '../types/game';
import { discoveryInboxStorageKey, invalidateDiscoveryInboxRequests } from './discoveryInboxStorage';
import type { CanonicalBackupSnapshots } from './canonicalCollections';

const generatedStateStorageKeys = [
  discoveryInboxStorageKey,
  recommendationExposureStorageKey,
  'questshelf.releaseCalendarIgnoredRawgIds.v1',
] as const;

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
    includesSecrets: boolean;
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

/** Per-row outcome for the backup's games section. */
export type BackupGamesReport = {
  /** Rows present in the backup's games array. */
  rowCount: number;
  /** Rows that parsed into a usable Game. */
  acceptedCount: number;
  rejectedCount: number;
  rejected: GameRowRejection[];
  /** False when the backup had no games section at all (restore then clears the collection). */
  present: boolean;
};

/** Which store an outcome refers to. Never carries a value — only the key and an error string. */
export type BackupStoreId = 'games' | 'playActivity' | 'rawgMetadataCache' | 'kv' | 'recommendation-caches' | 'recovery-snapshot';

export type BackupStoreOutcome = {
  store: BackupStoreId;
  /** Storage key, for the KV tier and the collection blobs. Never a value, so never a secret. */
  key?: string;
  ok: boolean;
  /** Whether a failure here fails the whole import (cache cleanup does not). */
  required: boolean;
  error?: string;
  /** True when a failed IndexedDB write was rescued into the legacy blob. */
  persistedToLegacy?: boolean;
};

export type BackupImportOptions = {
  /** Skip the pre-restore safety snapshot. Used by tests and by the snapshot-restore path itself. */
  skipRecoverySnapshot?: boolean;
};

/**
 * Result of restoring/merging a backup (AS-01).
 *
 * Success means every REQUIRED store settled successfully — restore only resolves once every
 * IndexedDB transaction and every durable KV write it issued has completed. The four failure
 * shapes are distinguishable so the UI can say what actually happened:
 *
 *   - `validation-failed`    nothing was written; the backup itself is unusable.
 *   - `recovery-export-failed` nothing was written; the pre-restore safety snapshot could not
 *                              be created, so a destructive replace was not attempted.
 *   - `partial`              some stores settled and at least one required store did not. The
 *                            data is not lost (failed IndexedDB writes fall back to the legacy
 *                            blob), but the app must not claim a clean restore.
 *   - (success with a failed optional store) reported in `stores`, does not fail the import.
 */
export type QuestShelfBackupImportResult =
  | {
      ok: true;
      status: 'restored';
      data: RestoredQuestShelfData;
      games: BackupGamesReport;
      stores: BackupStoreOutcome[];
    }
  | {
      ok: false;
      status: 'validation-failed';
      reason: 'games-section-unusable';
      games: BackupGamesReport;
      stores: BackupStoreOutcome[];
    }
  | {
      ok: false;
      status: 'recovery-export-failed';
      games: BackupGamesReport;
      stores: BackupStoreOutcome[];
    }
  | {
      ok: false;
      status: 'partial';
      games: BackupGamesReport;
      stores: BackupStoreOutcome[];
      failedStores: BackupStoreOutcome[];
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

export function createQuestShelfBackup(includeIntegrationSettings: boolean, snapshots?: CanonicalBackupSnapshots): QuestShelfBackup {
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
      includesSecrets: includeIntegrationSettings,
      schemaVersion: questShelfBackupVersion,
    },
    data: keys.reduce<QuestShelfBackup['data']>((backupData, key) => {
      // Wave 3: games come from the IndexedDB repository (the blob is inert), but the
      // backup shape is unchanged — still data['questshelf.games.v1'] = Game[].
      if (key === 'questshelf.games.v1') {
        backupData[key] = normalizeLoadedGames(snapshots?.games ?? loadGames());
        return backupData;
      }

      // Wave 4: RAWG cache also comes from its IndexedDB repository; same blob shape.
      if (key === 'questshelf.rawgMetadataCache.v1') {
        backupData[key] = normalizeRawgMetadataCache(loadRawgMetadataCache());
        return backupData;
      }

      // Wave 4b: play activity also comes from its IndexedDB repository; same blob shape.
      if (key === 'questshelf.playActivity.v1') {
        backupData[key] = normalizePlayActivityRecords(snapshots?.playActivity ?? loadPlayActivity());
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

/**
 * Replace-restore. Awaits every required store, so success is only reported once the data is
 * durable (AS-01).
 *
 * Ordering is deliberate:
 *   1. validate the games section (refuse a wipe),
 *   2. take a pre-restore safety snapshot and refuse to continue without one,
 *   3. write every store, awaiting each,
 *   4. only then report success.
 */
export async function restoreQuestShelfBackup(
  backup: QuestShelfBackup,
  options: BackupImportOptions = {},
): Promise<QuestShelfBackupImportResult> {
  const gamesReport = getBackupGamesReport(backup);

  // Refuse a replace that would swap a populated collection for nothing because every row in a
  // non-empty games section was corrupt. An intentionally empty section (rowCount 0) still clears.
  if (wouldWipeGamesCollection(gamesReport)) {
    return { ok: false, status: 'validation-failed', reason: 'games-section-unusable', games: gamesReport, stores: [] };
  }

  const snapshotOutcome = await createPreRestoreSnapshot('replace-restore', options);
  if (snapshotOutcome && !snapshotOutcome.ok) {
    return {
      ok: false,
      status: 'recovery-export-failed',
      games: gamesReport,
      stores: [snapshotOutcome],
    };
  }

  // Pre-normalize all sections before touching storage so an unexpected normalize error
  // cannot leave storage in a partially-written state.
  const writes: Array<[(typeof allBackupStorageKeys)[number], unknown]> = [];
  const removes: Array<(typeof allBackupStorageKeys)[number]> = [];

  allBackupStorageKeys.forEach((key) => {
    // Collection-backed keys (games, RAWG cache, play activity) are written through their
    // IndexedDB repositories below; everything else uses the localStorage + Preferences path.
    if (isCollectionBackedKey(key)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      writes.push([key, normalizeBackupDataSection(key, backup.data[key])]);
    } else if (!integrationBackupStorageKeys.includes(key as (typeof integrationBackupStorageKeys)[number])) {
      removes.push(key);
    }
  });

  const stores: BackupStoreOutcome[] = snapshotOutcome ? [snapshotOutcome] : [];

  stores.push(...(await writeKvSections(writes)));
  stores.push(...toKvOutcomes(await removePersistedKeysDurable(removes)));

  // Replace the game collection through the repository (IndexedDB + in-memory snapshot).
  // A backup without a games section clears it.
  stores.push(
    await runStore('games', 'questshelf.games.v1', () =>
      Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.games.v1')
        ? gameRepository.replaceAllDurable(normalizeLoadedGames(backup.data['questshelf.games.v1']))
        : gameRepository.clearDurable(),
    ),
  );

  // Replace the RAWG metadata cache through its repository. A backup without the section
  // clears the cache (restore has replace semantics); it will simply repopulate on demand.
  stores.push(
    await runStore('rawgMetadataCache', 'questshelf.rawgMetadataCache.v1', () =>
      Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.rawgMetadataCache.v1')
        ? rawgMetadataCacheRepository.replaceAllDurable(
            normalizeRawgMetadataCache(backup.data['questshelf.rawgMetadataCache.v1']),
          )
        : rawgMetadataCacheRepository.clearDurable(),
    ),
  );

  // Replace play activity through its repository. A backup without the section clears it
  // (restore has replace semantics).
  stores.push(
    await runStore('playActivity', 'questshelf.playActivity.v1', () =>
      Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.playActivity.v1')
        ? playActivityRepository.replaceAllDurable(
            normalizePlayActivityRecords(backup.data['questshelf.playActivity.v1']),
          )
        : playActivityRepository.clearDurable(),
    ),
  );

  stores.push(await clearGeneratedRecommendationState());

  return finishImport(gamesReport, stores);
}

/** Merge-restore. Additive, but awaited and reported exactly like replace. */
export async function mergeQuestShelfBackup(
  backup: QuestShelfBackup,
  options: BackupImportOptions = {},
): Promise<QuestShelfBackupImportResult> {
  const gamesReport = getBackupGamesReport(backup);

  const snapshotOutcome = await createPreRestoreSnapshot('merge-restore', options);
  if (snapshotOutcome && !snapshotOutcome.ok) {
    return {
      ok: false,
      status: 'recovery-export-failed',
      games: gamesReport,
      stores: [snapshotOutcome],
    };
  }

  // Pre-normalize before touching storage so an unexpected normalize error cannot leave
  // storage in a partially-written state.
  const mergedGames = mergeGames(loadGames(), getBackupGames(backup));
  const writes: Array<[(typeof allBackupStorageKeys)[number], unknown]> = [];
  const backupTasteProfile = Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.tasteProfile.v1')
    ? normalizeTasteProfile(backup.data['questshelf.tasteProfile.v1'])
    : null;
  // AS-15: the taste profile is rebuilt from the library, and Platform Plans are part of that input.
  // A backup that carries Plans overwrites the local ones, so the profile must be rebuilt against
  // the Plans the user will actually have when the restore finishes.
  const restoredPlannedGameIds = getRestoredPlannedGameIds(backup, mergedGames);

  allBackupStorageKeys.forEach((key) => {
    if (isCollectionBackedKey(key)) {
      return;
    }

    if (key === 'questshelf.tasteProfile.v1' || key === 'questshelf.recommendationFeedback.v1') {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
      writes.push([key, normalizeBackupDataSection(key, backup.data[key])]);
    }
  });

  if (backupTasteProfile) {
    const localTasteProfile = normalizeTasteProfile(readStorageJson('questshelf.tasteProfile.v1'));
    writes.push(['questshelf.tasteProfile.v1', mergeTasteProfiles(localTasteProfile, backupTasteProfile, mergedGames, restoredPlannedGameIds)]);
  } else {
    writes.push([
      'questshelf.tasteProfile.v1',
      buildTasteProfile(mergedGames, normalizeTasteProfile(undefined), new Date(), restoredPlannedGameIds),
    ]);
  }

  if (Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.recommendationFeedback.v1')) {
    writes.push([
      'questshelf.recommendationFeedback.v1',
      mergeRecommendationFeedback(
        normalizeRecommendationFeedbackRecords(readStorageJson('questshelf.recommendationFeedback.v1')),
        normalizeRecommendationFeedbackRecords(backup.data['questshelf.recommendationFeedback.v1']),
      ),
    ]);
  }

  const stores: BackupStoreOutcome[] = snapshotOutcome ? [snapshotOutcome] : [];

  stores.push(...(await writeKvSections(writes)));

  // Merged games go through the repository (IndexedDB + snapshot).
  stores.push(await runStore('games', 'questshelf.games.v1', () => gameRepository.replaceAllDurable(mergedGames)));

  // A present RAWG cache section overwrites the cache through its repository (merge only
  // adds/overwrites present sections; an absent section leaves the existing cache intact).
  if (Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.rawgMetadataCache.v1')) {
    stores.push(
      await runStore('rawgMetadataCache', 'questshelf.rawgMetadataCache.v1', () =>
        rawgMetadataCacheRepository.replaceAllDurable(
          normalizeRawgMetadataCache(backup.data['questshelf.rawgMetadataCache.v1']),
        ),
      ),
    );
  }

  // A present play activity section overwrites the store through its repository (merge only
  // adds/overwrites present sections; an absent section leaves the existing records intact).
  if (Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.playActivity.v1')) {
    stores.push(
      await runStore('playActivity', 'questshelf.playActivity.v1', () =>
        playActivityRepository.replaceAllDurable(
          normalizePlayActivityRecords(backup.data['questshelf.playActivity.v1']),
        ),
      ),
    );
  }

  stores.push(await clearGeneratedRecommendationState());

  return finishImport(gamesReport, stores);
}

function isCollectionBackedKey(key: (typeof allBackupStorageKeys)[number]): boolean {
  return (
    key === 'questshelf.games.v1' ||
    key === 'questshelf.rawgMetadataCache.v1' ||
    key === 'questshelf.playActivity.v1'
  );
}

/**
 * Success means: every REQUIRED store settled successfully.
 *
 * The recommendation caches are best-effort cleanup, not user data — a failure there is reported
 * but does not fail the restore. Anything else failing makes the import `partial`: the data is
 * not lost (a failed IndexedDB write still falls back to the legacy blob, and a failed durable KV
 * write still has the localStorage tier), but the user is told which store did not settle rather
 * than being shown a success message.
 */
function finishImport(games: BackupGamesReport, stores: BackupStoreOutcome[]): QuestShelfBackupImportResult {
  const failed = stores.filter((store) => !store.ok && store.required);

  if (failed.length > 0) {
    return { ok: false, status: 'partial', games, stores, failedStores: failed };
  }

  return {
    ok: true,
    status: 'restored',
    games,
    stores,
    data: {
      games: loadGames(),
      ignoredSteamGames: loadIgnoredSteamGames(),
    },
  };
}

/** Take the pre-restore safety snapshot, unless the caller explicitly opted out. */
async function createPreRestoreSnapshot(
  reason: RecoverySnapshot['reason'],
  options: BackupImportOptions,
): Promise<BackupStoreOutcome | null> {
  if (options.skipRecoverySnapshot) {
    return null;
  }

  // Include integration settings: the snapshot never leaves the device (it goes into the same
  // IndexedDB the settings already live in), and one without them would not actually restore the
  // user's state. It is not part of the restore RESULT, so no secret is exposed to the UI.
  const result = await saveRecoverySnapshot({
    backup: createQuestShelfBackup(true),
    createdAt: new Date().toISOString(),
    reason,
  });

  return {
    store: 'recovery-snapshot',
    ok: result.ok,
    required: true,
    error: result.ok ? undefined : result.error,
  };
}

async function writeKvSections(
  writes: Array<[(typeof allBackupStorageKeys)[number], unknown]>,
): Promise<BackupStoreOutcome[]> {
  const results = await Promise.all(writes.map(([key, value]) => savePersistedJsonDurable(key, value)));
  return toKvOutcomes(results);
}

function toKvOutcomes(results: KvWriteResult[]): BackupStoreOutcome[] {
  return results.map((result) => ({
    store: 'kv',
    key: result.key,
    ok: result.ok,
    // `localOnly` means localStorage took the value but the durable mirror rejected it. That can
    // only happen where a durable backend exists — i.e. native, where localStorage is the tier
    // that does NOT survive — so it is real loss and fails the restore. It is reported separately
    // from a total write failure because the distinction matters when reading the error.
    required: true,
    error: result.error,
  }));
}

/** Run one store's mutation and translate its write result into a reportable outcome. */
async function runStore(
  store: BackupStoreId,
  key: string,
  mutate: () => Promise<{ ok: boolean; error?: string; persistedToLegacy?: boolean }>,
): Promise<BackupStoreOutcome> {
  try {
    const result = await mutate();
    return {
      store,
      key,
      ok: result.ok,
      required: true,
      error: result.error,
      persistedToLegacy: result.persistedToLegacy,
    };
  } catch (error) {
    return {
      store,
      key,
      ok: false,
      required: true,
      error: error instanceof Error ? error.message : 'Store write failed.',
    };
  }
}

/** What a reset actually did, so the UI (and the tests) can state it rather than assume it. */
export type ResetLocalDataSummary = {
  removedKeys: string[];
  /** Generated keys swept through a registered family prefix. */
  removedGeneratedKeys: string[];
  removedCollections: string[];
  preservedKeys: string[];
};

/**
 * AS-18: Reset Local Data follows the registry.
 *
 * It used to remove the registry's keys plus a short hand-written list of generated ones, which left
 * every product-owned key that had never been registered behind: the controller settings, the Neon
 * button style, the collection view modes, the HLTB cache, the Daily Quest and Achievement Quiz
 * history, the Quest Runner high score, the dismissed hints. Each of those now carries an explicit
 * policy, and this function reads it.
 *
 * It still deletes nothing it was not told about: generated keys are swept by REGISTERED prefixes
 * only, never by a blanket `questshelf.*` match, so another app's keys — and Questory's own recovery
 * snapshot — are safe.
 */
export async function resetQuestShelfLocalData(): Promise<ResetLocalDataSummary> {
  invalidateDiscoveryInboxRequests();

  // Clear the IndexedDB collection stores + snapshots first so reset does not leave orphaned records
  // in IndexedDB after the legacy blobs are removed. Reset is destructive and ends in a reload, so
  // every clear is awaited to durable completion.
  await gameRepository.clearDurable();
  await rawgMetadataCacheRepository.clearDurable();
  await playActivityRepository.clearDurable();
  await clearAllCachedScreenshots();

  const kvKeys = [...new Set([...resettableKvStorageKeys, ...generatedStateStorageKeys])];
  await removePersistedKeysDurable(kvKeys);

  const removedGeneratedKeys = removeRegisteredGeneratedKeys();
  removeLocalOnlyKeys(resettableLocalStorageKeys);
  removeSessionKeys(resettableSessionStorageKeys);

  clearContextualRecommendationCache();
  clearReleaseCalendarCache();
  await clearPersonalRecommendationCaches();

  return {
    removedKeys: [...kvKeys, ...resettableLocalStorageKeys, ...resettableSessionStorageKeys],
    removedGeneratedKeys,
    removedCollections: ['games', 'rawgMetadataCache', 'playActivity', 'appCaches'],
    preservedKeys: [...preservedStorageKeys],
  };
}

/** Sweep the registered generated families — and only those. */
function removeRegisteredGeneratedKeys(): string[] {
  const adapter = getStorageAdapter();
  const removed = adapter
    .localKeys()
    .filter((key) => resettableStorageKeyPrefixes.some((prefix) => key.startsWith(prefix)));

  removed.forEach((key) => adapter.removeLocal(key));
  return removed;
}

function removeLocalOnlyKeys(keys: readonly string[]): void {
  const adapter = getStorageAdapter();
  keys.forEach((key) => adapter.removeLocal(key));
}

function removeSessionKeys(keys: readonly string[]): void {
  if (typeof window === 'undefined') return;
  keys.forEach((key) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Session storage can be unavailable (private mode); a reset must not fail on it.
    }
  });
}

/**
 * Best-effort cleanup of generated recommendation state. Awaited so a failure can be REPORTED,
 * but marked optional: a stale recommendation cache is a nuisance, not data loss, and must not
 * turn a good restore into a failed one.
 */
async function clearGeneratedRecommendationState(): Promise<BackupStoreOutcome> {
  try {
    invalidateDiscoveryInboxRequests();
    await removePersistedKeys([...generatedStateStorageKeys]);
    clearContextualRecommendationCache();
    clearReleaseCalendarCache();
    await clearPersonalRecommendationCaches();
    return { store: 'recommendation-caches', ok: true, required: false };
  } catch (error) {
    return {
      store: 'recommendation-caches',
      ok: false,
      required: false,
      error: error instanceof Error ? error.message : 'Recommendation cache cleanup failed.',
    };
  }
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

  const includesIntegrationSettings = typeof metadata.includesIntegrationSettings === 'boolean'
    ? metadata.includesIntegrationSettings
    : false;
  const includesSecrets = typeof metadata.includesSecrets === 'boolean'
    ? metadata.includesSecrets
    : includesIntegrationSettings;

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
        includesIntegrationSettings,
        includesSecrets,
        schemaVersion: questShelfBackupVersion,
      },
    },
  };
}

function getBackupGames(backup: QuestShelfBackup): Game[] {
  return normalizeLoadedGames(backup.data['questshelf.games.v1']);
}

function getBackupGamesReport(backup: QuestShelfBackup): BackupGamesReport {
  const present = Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.games.v1');
  const parsed = parseLoadedGameRows(backup.data['questshelf.games.v1']);

  return {
    present,
    rowCount: parsed.rowCount,
    acceptedCount: parsed.acceptedCount,
    rejectedCount: parsed.rejected.length,
    rejected: parsed.rejected,
  };
}

/** A games section that has rows but yielded none, against a collection that has games to lose. */
function wouldWipeGamesCollection(report: BackupGamesReport): boolean {
  return report.present && report.rowCount > 0 && report.acceptedCount === 0 && loadGames().length > 0;
}

function mergeGames(localGames: Game[], backupGames: Game[]) {
  const mergedGames = [...localGames];

  backupGames.forEach((backupGame) => {
    // Collection-aware: a Wishlist copy never resolves to its Library original (and vice
    // versa), so the pair survives the merge as two records regardless of input order.
    const existingIndex = findGameRecordIndex(mergedGames, backupGame);

    if (existingIndex === -1) {
      mergedGames.push(backupGame);
      return;
    }

    if (isBackupGameNewer(backupGame, mergedGames[existingIndex])) {
      mergedGames[existingIndex] = {
        ...mergedGames[existingIndex],
        ...backupGame,
        // Keep the local record's primary key. Matching by a provider id/title means the two
        // rows are the same record under different ids, and rewriting the id here would orphan
        // everything that references it (Platform Plan entries, selection, undo snapshots).
        id: mergedGames[existingIndex].id,
      };
    }
  });

  return mergedGames;
}

/** The Plans that will be in effect once this restore is written: the backup's if it carries any, else the local ones. */
function getRestoredPlannedGameIds(backup: QuestShelfBackup, mergedGames: Game[]): PlannedGameIds {
  const state = Object.prototype.hasOwnProperty.call(backup.data, 'questshelf.platformQueues.v1')
    ? normalizePlatformQueueState(backup.data['questshelf.platformQueues.v1'])
    : loadPlatformQueueState();
  return getPlannedGameIds(state, mergedGames);
}

function mergeTasteProfiles(localProfile: TasteProfile, backupProfile: TasteProfile, mergedGames: Game[], plannedGameIds: PlannedGameIds): TasteProfile {
  const now = new Date();
  const explicit = mergeTasteSignals(localProfile.explicit, backupProfile.explicit);
  const temporary = mergeTasteSignals(localProfile.temporary, backupProfile.temporary)
    .filter((signal) => !signal.expiresAt || new Date(signal.expiresAt).getTime() > now.getTime());
  return buildTasteProfile(mergedGames, {
    ...normalizeTasteProfile(undefined),
    explicit,
    temporary,
    prompt: { ...localProfile.prompt, ...backupProfile.prompt, inferencePausedAt: undefined },
  }, now, plannedGameIds);
}

function mergeTasteSignals(localSignals: TasteSignal[], backupSignals: TasteSignal[]): TasteSignal[] {
  const byIdentity = new Map<string, TasteSignal>();
  for (const signal of [...localSignals, ...backupSignals]) {
    const key = `${signal.kind}:${signal.key}:${signal.sentiment}`;
    const existing = byIdentity.get(key);
    if (!existing || Date.parse(signal.lastUpdatedAt || '') >= Date.parse(existing.lastUpdatedAt || '')) {
      byIdentity.set(key, signal);
    }
  }
  return [...byIdentity.values()];
}

function mergeRecommendationFeedback(localRecords: RecommendationFeedbackRecord[], backupRecords: RecommendationFeedbackRecord[]): RecommendationFeedbackRecord[] {
  const byIdentity = new Map<string, RecommendationFeedbackRecord>();
  for (const record of [...localRecords, ...backupRecords]) {
    const key = `${record.rawgId ?? record.normalizedTitle}:${record.feedbackType}`;
    const existing = byIdentity.get(key);
    if (!existing || record.createdAt >= existing.createdAt) {
      byIdentity.set(key, record);
    }
  }
  return [...byIdentity.values()].sort((a, b) => a.createdAt - b.createdAt);
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
    case 'questshelf.achievementCounters.v1':
      // Non-critical event counters. Any shape is tolerated here and repaired to safe
      // defaults by normalizeAchievementCounters on write, so a missing, partial, or
      // corrupt counters section never blocks importing games/playActivity/RAWG data.
      // Critical sections below stay strictly validated.
      return true;
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
    case 'questshelf.recommendationPreferences.v1':
    case 'questshelf.tasteProfile.v1':
    case 'questshelf.shelfIdentity.v1':
      return isPlainObject(value);
    case 'questshelf.recommendationFeedback.v1':
      return Array.isArray(value);
  }

  return false;
}

function normalizeBackupDataSection(key: (typeof allBackupStorageKeys)[number], value: unknown) {
  // Backups are user-editable JSON. Normalize every section before writing so restore/merge
  // cannot persist malformed data that later crashes startup.
  switch (key) {
    case 'questshelf.achievementCounters.v1':
      return normalizeAchievementCounters(value);
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
      return normalizePlatformQueuePersistedState(value);
    case 'questshelf.reviewMode.v1':
      return normalizeReviewModeState(value);
    case 'questshelf.appPersonalization.v1':
      return normalizeAppPersonalizationSettings(value);
    case 'questshelf.recommendationFeedback.v1':
      return normalizeRecommendationFeedbackRecords(value);
    case 'questshelf.recommendationPreferences.v1':
      return normalizeRecommendationPreferences(value);
    case 'questshelf.tasteProfile.v1':
      return normalizeTasteProfile(value);
    case 'questshelf.shelfIdentity.v1':
      return normalizeShelfIdentitySettings(value);
    case 'questshelf.libraryFilters.v1':
    case 'questshelf.wishlistFilters.v1':
      return isPlainObject(value) ? value : {};
  }
}

function isPlainObject(value: unknown) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getBackupSectionDisplayName(key: string): string {
  const displayNames: Record<string, string> = {
    'questshelf.achievementCounters.v1': 'achievement counters',
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
    'questshelf.recommendationFeedback.v1': 'recommendation feedback',
    'questshelf.recommendationPreferences.v1': 'recommendation preferences',
    'questshelf.tasteProfile.v1': 'taste profile',
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
