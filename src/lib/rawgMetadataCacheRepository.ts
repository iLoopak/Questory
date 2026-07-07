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

const RAWG_CACHE_KEY = 'questshelf.rawgMetadataCache.v1';

export type RawgMetadataCache = Record<string, RawgMetadataCacheEntry>;

export type RawgMetadataCacheRepositoryIo = {
  legacyLoadSync: () => RawgMetadataCache;
  legacyLoadDurable: () => Promise<RawgMetadataCache>;
  legacyClear: () => Promise<void>;
};

export type RawgMetadataCacheStatus = {
  backend: 'indexeddb' | 'legacy-fallback';
  ready: boolean;
  migratedFromLegacy: boolean;
  recordCount: number;
  legacyBlobPresent: boolean;
  schemaVersion: number;
};

export interface RawgMetadataCacheRepository {
  ready(): Promise<void>;
  getAllSync(): RawgMetadataCache;
  get(key: string): RawgMetadataCacheEntry | null;
  put(key: string, entry: RawgMetadataCacheEntry): void;
  replaceAll(cache: RawgMetadataCache): void;
  clear(): Promise<void>;
  getStatus(): RawgMetadataCacheStatus;
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
  let backend: RawgMetadataCacheStatus['backend'] = 'indexeddb';
  let migratedFromLegacy = false;

  function fallbackToLegacy(message: string) {
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
        legacyBlobPresent: getStorageAdapter().readLocal(RAWG_CACHE_KEY) !== null,
        schemaVersion: QUESTORY_DB_VERSION,
      };
    },
  };
}
