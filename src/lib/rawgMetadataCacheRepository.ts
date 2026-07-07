// Wave 4: IndexedDB-backed store for the RAWG metadata cache (keyed collection).
//
// Mirrors the Wave 3 games repository model, but for a Record<key, entry> cache:
//  - In-memory snapshot keeps the read/write API synchronous.
//  - Entries are stored as individual IndexedDB rows keyed by the existing cache key.
//  - One-time import from the legacy `questshelf.rawgMetadataCache.v1` blob if the
//    IndexedDB store is empty (reads the durable copy so a native pre-migration blob
//    in Preferences is still found). If IndexedDB already has records, the legacy blob
//    is ignored — it can't overwrite them.
//  - No dual-write. The legacy blob is a read-only fallback, kept inert (not deleted).
//  - If IndexedDB is unavailable/fails, the repo degrades to the legacy blob (reads)
//    and surfaces a storage diagnostic; the non-empty legacy blob is never overwritten.

import type { RawgMetadataCacheEntry } from './rawgMetadataCache';
import { getGameDatabase, QUESTORY_DB_VERSION, type RawgMetadataCacheRow } from './gameDatabase';
import { reportStorageIssue } from './localPersistence';
import { getStorageAdapter } from './storageAdapter';
import type {
  CollectionLegacyRecoveryMode,
  CollectionLegacyRecoveryPreview,
  CollectionLegacyRecoveryResult,
  CollectionSnapshotRepairResult,
  CollectionStoreStatus,
  CollectionVerification,
} from './indexedDbCollectionRepository';

const RAWG_CACHE_KEY = 'questshelf.rawgMetadataCache.v1';

export type RawgMetadataCache = Record<string, RawgMetadataCacheEntry>;

export type RawgMetadataCacheRepositoryIo = {
  legacyLoadSync: () => RawgMetadataCache;
  legacyLoadDurable: () => Promise<RawgMetadataCache>;
  legacyClear: () => Promise<void>;
};

// The RAWG cache is a Record<key, entry> map, but it reports the same status/verify/repair/
// recover shapes as the id-keyed collection stores so the Storage tools UI stays uniform.
export type RawgMetadataCacheStatus = CollectionStoreStatus;
export type RawgVerification = CollectionVerification;
export type RawgRepairResult = CollectionSnapshotRepairResult;
export type RawgRecoveryPreview = CollectionLegacyRecoveryPreview;
export type RawgRecoveryMode = CollectionLegacyRecoveryMode;
export type RawgRecoveryResult = CollectionLegacyRecoveryResult;

export interface RawgMetadataCacheRepository {
  ready(): Promise<void>;
  getAllSync(): RawgMetadataCache;
  get(key: string): RawgMetadataCacheEntry | null;
  put(key: string, entry: RawgMetadataCacheEntry): void;
  replaceAll(cache: RawgMetadataCache): void;
  clear(): Promise<void>;
  getStatus(): RawgMetadataCacheStatus;
  verify(): Promise<RawgVerification>;
  repairSnapshot(): Promise<RawgRepairResult>;
  previewLegacyRecovery(): Promise<RawgRecoveryPreview>;
  recoverFromLegacyBlob(mode: RawgRecoveryMode): Promise<RawgRecoveryResult>;
}

const toRows = (cache: RawgMetadataCache): RawgMetadataCacheRow[] =>
  Object.entries(cache).map(([key, entry]) => ({ key, ...entry }));

function fromRows(rows: RawgMetadataCacheRow[]): RawgMetadataCache {
  const cache: RawgMetadataCache = {};
  for (const row of rows) {
    const { key, ...entry } = row;
    cache[key] = entry;
  }
  return cache;
}

export function createRawgMetadataCacheRepository(io: RawgMetadataCacheRepositoryIo): RawgMetadataCacheRepository {
  let snapshot: RawgMetadataCache = io.legacyLoadSync();
  let isReady = false;
  let backend: CollectionStoreStatus['backend'] = 'indexeddb';
  let migratedFromLegacy = false;
  let lastError: string | null = null;

  const legacyBlobPresent = () => getStorageAdapter().readLocal(RAWG_CACHE_KEY) !== null;

  function fallbackToLegacy(message: string) {
    lastError = message;
    if (backend !== 'legacy-fallback') {
      backend = 'legacy-fallback';
      reportStorageIssue(RAWG_CACHE_KEY, `RAWG cache database unavailable, using legacy storage: ${message}`);
    }
  }

  async function ready(): Promise<void> {
    if (isReady) {
      return;
    }

    const db = getGameDatabase();

    if (!db) {
      snapshot = io.legacyLoadSync();
      isReady = true;
      fallbackToLegacy('IndexedDB is not available in this environment.');
      return;
    }

    try {
      const count = await db.rawgMetadataCache.count();

      if (count === 0) {
        // One-time import. Read the durable copy so a pre-migration native blob that
        // only survived in Preferences is still imported.
        let legacy = io.legacyLoadSync();
        if (Object.keys(legacy).length === 0) {
          legacy = await io.legacyLoadDurable();
        }
        const rows = toRows(legacy);
        if (rows.length > 0) {
          await db.transaction('rw', db.rawgMetadataCache, async () => {
            await db.rawgMetadataCache.bulkPut(rows);
          });
          migratedFromLegacy = true;
        }
        snapshot = legacy;
      } else {
        // IndexedDB has records: it is the source of truth; the legacy blob is ignored.
        snapshot = fromRows(await db.rawgMetadataCache.toArray());
      }

      isReady = true;
    } catch (error) {
      snapshot = io.legacyLoadSync();
      isReady = true;
      fallbackToLegacy(error instanceof Error ? error.message : 'Unknown IndexedDB error.');
    }
  }

  return {
    ready,
    getAllSync() {
      return snapshot;
    },
    get(key) {
      return snapshot[key] ?? null;
    },
    put(key, entry) {
      snapshot = { ...snapshot, [key]: entry };
      const db = getGameDatabase();
      if (!db || backend === 'legacy-fallback') {
        return;
      }
      void db.rawgMetadataCache.put({ key, ...entry }).catch((error: unknown) => {
        fallbackToLegacy(error instanceof Error ? error.message : 'RAWG cache write failed.');
      });
    },
    replaceAll(cache) {
      snapshot = cache;
      const db = getGameDatabase();
      if (!db || backend === 'legacy-fallback') {
        return;
      }
      void db
        .transaction('rw', db.rawgMetadataCache, async () => {
          await db.rawgMetadataCache.clear();
          await db.rawgMetadataCache.bulkPut(toRows(cache));
        })
        .catch((error: unknown) => {
          fallbackToLegacy(error instanceof Error ? error.message : 'RAWG cache write failed.');
        });
    },
    async clear() {
      snapshot = {};
      await io.legacyClear();
      const db = getGameDatabase();
      if (db && backend !== 'legacy-fallback') {
        try {
          await db.rawgMetadataCache.clear();
        } catch (error) {
          fallbackToLegacy(error instanceof Error ? error.message : 'RAWG cache clear failed.');
        }
      }
    },
    getStatus() {
      return {
        backend,
        ready: isReady,
        migratedFromLegacy,
        recordCount: Object.keys(snapshot).length,
        legacyBlobPresent: legacyBlobPresent(),
        schemaVersion: QUESTORY_DB_VERSION,
        lastError,
      };
    },
    async verify() {
      const db = getGameDatabase();
      const legacy = io.legacyLoadSync();
      const base = {
        idbAvailable: Boolean(db),
        backend,
        snapshotCount: Object.keys(snapshot).length,
        legacyBlobPresent: legacyBlobPresent(),
        legacyBlobCount: Object.keys(legacy).length,
      };

      if (!db) {
        return { ...base, idbRowCount: 0, validCount: 0, invalidCount: 0, duplicateIds: [] };
      }

      try {
        const rows = await db.rawgMetadataCache.toArray();
        let valid = 0;
        let invalid = 0;
        for (const row of rows) {
          // A valid cache row has a non-empty key and a metadata object.
          if (row && typeof row.key === 'string' && row.key.length > 0 && row.metadata && typeof row.metadata === 'object') {
            valid += 1;
          } else {
            invalid += 1;
          }
        }
        // Keys are the primary key, so duplicates cannot exist in the store.
        return { ...base, idbRowCount: rows.length, validCount: valid, invalidCount: invalid, duplicateIds: [] };
      } catch (error) {
        fallbackToLegacy(error instanceof Error ? error.message : 'RAWG cache read failed.');
        return { ...base, idbAvailable: true, idbRowCount: 0, validCount: 0, invalidCount: 0, duplicateIds: [] };
      }
    },
    async repairSnapshot() {
      const before = Object.keys(snapshot).length;
      const db = getGameDatabase();

      if (!db || backend === 'legacy-fallback') {
        snapshot = io.legacyLoadSync();
        return { backend, before, after: Object.keys(snapshot).length, removedInvalid: 0 };
      }

      try {
        const rows = await db.rawgMetadataCache.toArray();
        const rebuilt: RawgMetadataCache = {};
        for (const row of rows) {
          // Rebuild from IndexedDB, dropping rows with an unusable key. The entry spread
          // preserves all (including unknown/future) metadata fields.
          if (row && typeof row.key === 'string' && row.key.length > 0) {
            const { key, ...entry } = row;
            rebuilt[key] = entry as RawgMetadataCacheEntry;
          }
        }
        snapshot = rebuilt;
        return { backend, before, after: Object.keys(rebuilt).length, removedInvalid: rows.length - Object.keys(rebuilt).length };
      } catch (error) {
        fallbackToLegacy(error instanceof Error ? error.message : 'RAWG cache read failed.');
        snapshot = io.legacyLoadSync();
        return { backend, before, after: Object.keys(snapshot).length, removedInvalid: 0 };
      }
    },
    async previewLegacyRecovery() {
      const legacy = await io.legacyLoadDurable();
      const db = getGameDatabase();
      const idbAvailable = Boolean(db) && backend !== 'legacy-fallback';
      const idbCache = idbAvailable ? fromRows(await db!.rawgMetadataCache.toArray()) : snapshot;
      const idbKeys = new Set(Object.keys(idbCache));
      const legacyKeys = Object.keys(legacy);
      const onlyInLegacyCount = legacyKeys.reduce((count, key) => (idbKeys.has(key) ? count : count + 1), 0);

      return {
        legacyBlobPresent: legacyBlobPresent(),
        idbAvailable,
        legacyCount: legacyKeys.length,
        idbCount: idbKeys.size,
        onlyInLegacyCount,
        conflictCount: legacyKeys.length - onlyInLegacyCount,
      };
    },
    async recoverFromLegacyBlob(mode) {
      const db = getGameDatabase();
      if (!db || backend === 'legacy-fallback') {
        throw new Error('IndexedDB is not available; cannot recover into it.');
      }

      const legacy = await io.legacyLoadDurable();
      const legacyEntries = Object.entries(legacy);

      if (mode === 'replace') {
        // Safety: never wipe a non-empty store with an empty legacy blob.
        if (legacyEntries.length === 0 && (await db.rawgMetadataCache.count()) > 0) {
          throw new Error('Refusing to replace a non-empty store with an empty legacy blob.');
        }
        await db.transaction('rw', db.rawgMetadataCache, async () => {
          await db.rawgMetadataCache.clear();
          if (legacyEntries.length > 0) {
            await db.rawgMetadataCache.bulkPut(toRows(legacy));
          }
        });
        snapshot = legacy;
        return { mode, importedCount: legacyEntries.length, totalCount: legacyEntries.length, skippedExistingCount: 0 };
      }

      // merge: add legacy-only keys; keep existing records on key conflicts.
      const existing = fromRows(await db.rawgMetadataCache.toArray());
      const existingKeys = new Set(Object.keys(existing));
      const toAdd = legacyEntries.filter(([key]) => !existingKeys.has(key));
      if (toAdd.length > 0) {
        const rows = toAdd.map(([key, entry]) => ({ key, ...entry }));
        await db.transaction('rw', db.rawgMetadataCache, async () => {
          await db.rawgMetadataCache.bulkPut(rows);
        });
      }
      const merged: RawgMetadataCache = { ...existing };
      for (const [key, entry] of toAdd) {
        merged[key] = entry;
      }
      snapshot = merged;
      return {
        mode,
        importedCount: toAdd.length,
        totalCount: Object.keys(merged).length,
        skippedExistingCount: legacyEntries.length - toAdd.length,
      };
    },
  };
}
