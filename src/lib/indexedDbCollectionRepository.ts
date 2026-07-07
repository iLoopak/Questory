// Wave 6: generic IndexedDB repository for id-keyed array collections.
//
// This is a faithful extraction of the Wave 3/5 games repository so the games and
// play-activity stores (both `T extends { id: string }` arrays) share one implementation
// instead of duplicating it. The RAWG metadata cache is intentionally NOT built on this —
// it is a Record<key, entry> map with a different key model.
//
// Behavior (unchanged from the games repository):
//  - In-memory snapshot keeps getAllSync() synchronous for first paint.
//  - Whole records are stored per row (structured clone), so unknown/future fields survive.
//  - Per-save writes diff against the snapshot by id and only put/delete changed rows.
//  - One-time import from the legacy blob if the store is empty (durable read so a native
//    pre-migration blob in Preferences still imports). If the store already has records,
//    the legacy blob is ignored — it can't overwrite them.
//  - No dual-write. The legacy blob is a read-only fallback, kept inert (never overwritten
//    with empty data). If IndexedDB is unavailable/fails, the repo degrades to the legacy
//    blob and surfaces a storage diagnostic.
//  - Wave 5 verify/repair/recover, all safe by construction (never write the legacy blob).

import type { Table } from 'dexie';
import { getGameDatabase, QUESTORY_DB_VERSION, type QuestoryDatabase } from './gameDatabase';
import { reportStorageIssue } from './localPersistence';
import { getStorageAdapter } from './storageAdapter';

export type CollectionStoreBackend = 'indexeddb' | 'legacy-fallback';

export type CollectionStoreStatus = {
  backend: CollectionStoreBackend;
  ready: boolean;
  migratedFromLegacy: boolean;
  recordCount: number;
  legacyBlobPresent: boolean;
  schemaVersion: number;
  /** Last migration/recovery/read-write error message, if any (also surfaced via diagnostics). */
  lastError: string | null;
};

export type CollectionVerification = {
  idbAvailable: boolean;
  backend: CollectionStoreBackend;
  idbRowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateIds: string[];
  snapshotCount: number;
  legacyBlobPresent: boolean;
  legacyBlobCount: number;
};

export type CollectionSnapshotRepairResult = {
  backend: CollectionStoreBackend;
  before: number;
  after: number;
  removedInvalid: number;
};

export type CollectionLegacyRecoveryPreview = {
  legacyBlobPresent: boolean;
  idbAvailable: boolean;
  legacyCount: number;
  idbCount: number;
  onlyInLegacyCount: number;
  conflictCount: number;
};

export type CollectionLegacyRecoveryMode = 'merge' | 'replace';

export type CollectionLegacyRecoveryResult = {
  mode: CollectionLegacyRecoveryMode;
  importedCount: number;
  totalCount: number;
  skippedExistingCount: number;
};

export type CollectionRepositoryIo<T> = {
  legacyLoadSync: () => T[];
  legacyLoadDurable: () => Promise<T[]>;
  legacyClear: () => Promise<void>;
  normalize: (value: unknown) => T[];
};

export type CollectionRepositoryConfig<T> = {
  legacyKey: string;
  getTable: (db: QuestoryDatabase) => Table<T, string>;
  io: CollectionRepositoryIo<T>;
};

export interface IndexedDbCollectionRepository<T extends { id: string }> {
  ready(): Promise<void>;
  getAllSync(): T[];
  loadDurable(): Promise<T[]>;
  replaceAll(items: T[]): void;
  getById(id: string): T | undefined;
  upsert(item: T): void;
  remove(id: string): void;
  clear(): Promise<void>;
  getStatus(): CollectionStoreStatus;
  verify(): Promise<CollectionVerification>;
  repairSnapshot(): Promise<CollectionSnapshotRepairResult>;
  previewLegacyRecovery(): Promise<CollectionLegacyRecoveryPreview>;
  recoverFromLegacyBlob(mode: CollectionLegacyRecoveryMode): Promise<CollectionLegacyRecoveryResult>;
}

export function createIndexedDbCollectionRepository<T extends { id: string }>(
  config: CollectionRepositoryConfig<T>,
): IndexedDbCollectionRepository<T> {
  const { legacyKey, getTable, io } = config;

  let snapshot: T[] = io.legacyLoadSync();
  let isReady = false;
  let backend: CollectionStoreBackend = 'indexeddb';
  let migratedFromLegacy = false;
  let lastError: string | null = null;

  const legacyBlobPresent = () => getStorageAdapter().readLocal(legacyKey) !== null;

  function fallbackToLegacy(message: string) {
    lastError = message;
    if (backend !== 'legacy-fallback') {
      backend = 'legacy-fallback';
      reportStorageIssue(legacyKey, `Store unavailable, using legacy storage: ${message}`);
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
      const table = getTable(db);
      const count = await table.count();

      if (count === 0) {
        // First run on this device: import the legacy blob once. Read the durable copy so
        // a pre-migration native blob that only survived in Preferences still migrates.
        let legacy = io.legacyLoadSync();
        if (legacy.length === 0) {
          legacy = await io.legacyLoadDurable();
        }
        if (legacy.length > 0) {
          await db.transaction('rw', table, async () => {
            await table.bulkPut(legacy);
          });
          migratedFromLegacy = true;
        }
        snapshot = legacy;
      } else {
        // IndexedDB has records: it is the source of truth; the legacy blob is ignored.
        snapshot = await table.toArray();
      }

      isReady = true;
    } catch (error) {
      snapshot = io.legacyLoadSync();
      isReady = true;
      fallbackToLegacy(error instanceof Error ? error.message : 'Unknown IndexedDB error.');
    }
  }

  function persistToIdb(previous: T[], next: T[]) {
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      return;
    }

    const table = getTable(db);
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const changed = next.filter((item) => previousById.get(item.id) !== item);
    const nextIds = new Set(next.map((item) => item.id));
    const removed = [...previousById.keys()].filter((id) => !nextIds.has(id));

    if (changed.length === 0 && removed.length === 0) {
      return;
    }

    void db
      .transaction('rw', table, async () => {
        if (changed.length > 0) {
          await table.bulkPut(changed);
        }
        if (removed.length > 0) {
          await table.bulkDelete(removed);
        }
      })
      .catch((error: unknown) => {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB write failed.');
      });
  }

  function commit(next: T[]) {
    const previous = snapshot;
    snapshot = next;
    // IndexedDB + snapshot only — no legacy blob dual-write.
    persistToIdb(previous, next);
  }

  return {
    ready,
    getAllSync() {
      return snapshot;
    },
    loadDurable() {
      return Promise.resolve(snapshot);
    },
    replaceAll(items) {
      commit(items);
    },
    getById(id) {
      return snapshot.find((item) => item.id === id);
    },
    upsert(item) {
      const index = snapshot.findIndex((existing) => existing.id === item.id);
      if (index === -1) {
        commit([...snapshot, item]);
        return;
      }
      const next = snapshot.slice();
      next[index] = item;
      commit(next);
    },
    remove(id) {
      const next = snapshot.filter((item) => item.id !== id);
      if (next.length !== snapshot.length) {
        commit(next);
      }
    },
    async clear() {
      snapshot = [];
      // Neutralize the legacy blob across every tier so a reset can't re-import records.
      await io.legacyClear();
      const db = getGameDatabase();
      if (db && backend !== 'legacy-fallback') {
        try {
          await getTable(db).clear();
        } catch (error) {
          fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB clear failed.');
        }
      }
    },
    getStatus() {
      return {
        backend,
        ready: isReady,
        migratedFromLegacy,
        recordCount: snapshot.length,
        legacyBlobPresent: legacyBlobPresent(),
        schemaVersion: QUESTORY_DB_VERSION,
        lastError,
      };
    },
    async verify() {
      const db = getGameDatabase();
      const base = {
        idbAvailable: Boolean(db),
        backend,
        snapshotCount: snapshot.length,
        legacyBlobPresent: legacyBlobPresent(),
        legacyBlobCount: io.legacyLoadSync().length,
      };

      if (!db) {
        return { ...base, idbRowCount: 0, validCount: 0, invalidCount: 0, duplicateIds: [] };
      }

      try {
        const rows = await getTable(db).toArray();
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        let valid = 0;
        let invalid = 0;

        for (const row of rows) {
          const normalized = io.normalize([row]);
          if (normalized.length === 0) {
            invalid += 1;
            continue;
          }
          valid += 1;
          const id = normalized[0].id;
          if (seen.has(id)) {
            duplicates.add(id);
          } else {
            seen.add(id);
          }
        }

        return {
          ...base,
          idbRowCount: rows.length,
          validCount: valid,
          invalidCount: invalid,
          duplicateIds: [...duplicates],
        };
      } catch (error) {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB read failed.');
        return { ...base, idbAvailable: true, idbRowCount: 0, validCount: 0, invalidCount: 0, duplicateIds: [] };
      }
    },
    async repairSnapshot() {
      const before = snapshot.length;
      const db = getGameDatabase();

      if (!db || backend === 'legacy-fallback') {
        const rebuilt = io.legacyLoadSync();
        snapshot = rebuilt;
        return { backend, before, after: rebuilt.length, removedInvalid: 0 };
      }

      try {
        const rows = await getTable(db).toArray();
        const normalized = io.normalize(rows);
        const byId = new Map<string, T>();
        for (const item of normalized) {
          if (!byId.has(item.id)) {
            byId.set(item.id, item);
          }
        }
        const rebuilt = [...byId.values()];
        snapshot = rebuilt;
        return { backend, before, after: rebuilt.length, removedInvalid: rows.length - rebuilt.length };
      } catch (error) {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB read failed.');
        snapshot = io.legacyLoadSync();
        return { backend, before, after: snapshot.length, removedInvalid: 0 };
      }
    },
    async previewLegacyRecovery() {
      const legacy = await io.legacyLoadDurable();
      const db = getGameDatabase();
      const idbAvailable = Boolean(db) && backend !== 'legacy-fallback';
      const idbItems = idbAvailable ? await getTable(db!).toArray() : snapshot;
      const idbIds = new Set(idbItems.map((item) => item.id));
      const onlyInLegacyCount = legacy.reduce((count, item) => (idbIds.has(item.id) ? count : count + 1), 0);

      return {
        legacyBlobPresent: legacyBlobPresent(),
        idbAvailable,
        legacyCount: legacy.length,
        idbCount: idbItems.length,
        onlyInLegacyCount,
        conflictCount: legacy.length - onlyInLegacyCount,
      };
    },
    async recoverFromLegacyBlob(mode) {
      const db = getGameDatabase();
      if (!db || backend === 'legacy-fallback') {
        throw new Error('IndexedDB is not available; cannot recover into it.');
      }

      const table = getTable(db);
      const legacy = await io.legacyLoadDurable();

      if (mode === 'replace') {
        // Safety: never wipe a non-empty store with an empty legacy blob.
        if (legacy.length === 0 && (await table.count()) > 0) {
          throw new Error('Refusing to replace a non-empty store with an empty legacy blob.');
        }
        await db.transaction('rw', table, async () => {
          await table.clear();
          if (legacy.length > 0) {
            await table.bulkPut(legacy);
          }
        });
        snapshot = legacy;
        return { mode, importedCount: legacy.length, totalCount: legacy.length, skippedExistingCount: 0 };
      }

      // merge: add legacy-only records; keep existing records on id conflicts.
      const existing = await table.toArray();
      const existingIds = new Set(existing.map((item) => item.id));
      const toAdd = legacy.filter((item) => !existingIds.has(item.id));
      if (toAdd.length > 0) {
        await db.transaction('rw', table, async () => {
          await table.bulkPut(toAdd);
        });
      }
      snapshot = [...existing, ...toAdd];
      return {
        mode,
        importedCount: toAdd.length,
        totalCount: snapshot.length,
        skippedExistingCount: legacy.length - toAdd.length,
      };
    },
  };
}
