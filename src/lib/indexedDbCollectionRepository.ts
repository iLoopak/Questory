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
//  - No dual-write in normal operation. The legacy blob is a read-only import fallback while
//    IndexedDB is healthy. If IndexedDB is unavailable or a write fails, the repo degrades to
//    writing the legacy blob (the pre-IndexedDB behavior) so writes are never lost, and
//    surfaces a storage diagnostic.
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

/**
 * Outcome of a mutation that was awaited to durable completion.
 *
 * `ok: false` still means the data is not lost: the repository degrades to the legacy blob
 * (`persistedToLegacy`) exactly as the fire-and-forget path always has. What is new is that
 * the caller now learns about it and can report which store failed.
 */
export type CollectionWriteResult = {
  ok: boolean;
  backend: CollectionStoreBackend;
  /** Present when the IndexedDB write failed. */
  error?: string;
  /** True when the failed write was rescued into the legacy blob. */
  persistedToLegacy?: boolean;
};

/** Durable repair: rows are rewritten/removed in IndexedDB, not just in the snapshot. */
export type CollectionRepairResult = CollectionSnapshotRepairResult & {
  /** False when the store is in legacy fallback, so only the snapshot could be rebuilt. */
  durable: boolean;
  /**
   * The raw rows that were removed. Returned rather than silently dropped, so the UI can
   * offer them for download before they are gone.
   */
  removedRows: unknown[];
  error?: string;
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
  /** Durable write of the whole collection to the legacy blob (localStorage + Preferences).
   *  Used ONLY when IndexedDB is unavailable or a write fails, so writes are not lost in
   *  those cases (restores the pre-IndexedDB durability). Never called in normal operation,
   *  so there is no dual-write while IndexedDB is healthy. */
  legacySaveAll: (items: T[]) => void;
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
  /**
   * Optimistic whole-collection replace: updates the snapshot and detaches the IndexedDB
   * write. Kept for ordinary feature saves (the debounced games save), where blocking the UI
   * on a durable write would be a regression. Destructive callers must use `replaceAllDurable`.
   */
  replaceAll(items: T[]): void;
  getById(id: string): T | undefined;
  upsert(item: T): void;
  remove(id: string): void;
  clear(): Promise<void>;

  // ── Awaitable mutations. Used by backup restore/merge and the recovery tools, which must
  //    not report success before the data is durable (AS-01).
  /** Replace the whole collection and await IndexedDB. */
  replaceAllDurable(items: T[]): Promise<CollectionWriteResult>;
  /** Insert-or-update a batch and await IndexedDB. */
  upsertManyDurable(items: T[]): Promise<CollectionWriteResult>;
  /** Remove a batch by id and await IndexedDB. */
  removeManyDurable(ids: string[]): Promise<CollectionWriteResult>;
  /** Empty the collection and await IndexedDB (clear() already awaits; this reports failure). */
  clearDurable(): Promise<CollectionWriteResult>;

  getStatus(): CollectionStoreStatus;
  verify(): Promise<CollectionVerification>;
  /** Rebuild the in-memory snapshot only. Does NOT repair the rows in IndexedDB. */
  repairSnapshot(): Promise<CollectionSnapshotRepairResult>;
  /** Durable repair: rewrite the valid rows and delete the invalid/duplicate ones, awaited. */
  repairDurable(): Promise<CollectionRepairResult>;
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

  /**
   * The single write path. It always returns a promise for the durable outcome; the optimistic
   * callers simply do not await it, so their behavior is byte-for-byte what it was.
   */
  function persistToIdb(previous: T[], next: T[]): Promise<CollectionWriteResult> {
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      // IndexedDB is unavailable (or already failed this session): persist durably to the
      // legacy blob so the write is not lost. This is the pre-IndexedDB behavior, used only
      // in the degraded path — normal operation never writes the legacy blob.
      io.legacySaveAll(next);
      return Promise.resolve({ ok: true, backend, persistedToLegacy: true });
    }

    const table = getTable(db);
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const changed = next.filter((item) => previousById.get(item.id) !== item);
    const nextIds = new Set(next.map((item) => item.id));
    const removed = [...previousById.keys()].filter((id) => !nextIds.has(id));

    if (changed.length === 0 && removed.length === 0) {
      return Promise.resolve({ ok: true, backend });
    }

    return db
      .transaction('rw', table, async () => {
        if (changed.length > 0) {
          await table.bulkPut(changed);
        }
        if (removed.length > 0) {
          await table.bulkDelete(removed);
        }
      })
      .then((): CollectionWriteResult => ({ ok: true, backend }))
      .catch((error: unknown): CollectionWriteResult => {
        const message = error instanceof Error ? error.message : 'IndexedDB write failed.';
        fallbackToLegacy(message);
        // Persist the write that just failed to the legacy blob so it is not lost.
        io.legacySaveAll(next);
        return { ok: false, backend, error: message, persistedToLegacy: true };
      });
  }

  function commit(next: T[]) {
    // IndexedDB + snapshot only — no legacy blob dual-write.
    void commitDurable(next);
  }

  function commitDurable(next: T[]): Promise<CollectionWriteResult> {
    const previous = snapshot;
    snapshot = next;
    return persistToIdb(previous, next);
  }

  async function clearDurable(): Promise<CollectionWriteResult> {
    snapshot = [];
    // Neutralize the legacy blob across every tier so a reset can't re-import records.
    await io.legacyClear();
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      return { ok: true, backend };
    }

    try {
      await getTable(db).clear();
      return { ok: true, backend };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'IndexedDB clear failed.';
      fallbackToLegacy(message);
      return { ok: false, backend, error: message };
    }
  }

  function mergeById(items: T[]): T[] {
    const next = snapshot.slice();
    items.forEach((item) => {
      const index = next.findIndex((existing) => existing.id === item.id);
      if (index === -1) {
        next.push(item);
      } else {
        next[index] = item;
      }
    });
    return next;
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
      await clearDurable();
    },
    replaceAllDurable(items) {
      return commitDurable(items);
    },
    upsertManyDurable(items) {
      return commitDurable(mergeById(items));
    },
    removeManyDurable(ids) {
      const removing = new Set(ids);
      return commitDurable(snapshot.filter((item) => !removing.has(item.id)));
    },
    clearDurable,
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
    async repairDurable(): Promise<CollectionRepairResult> {
      const before = snapshot.length;
      const db = getGameDatabase();

      if (!db || backend === 'legacy-fallback') {
        // Nothing to repair in IndexedDB — rebuild the snapshot from the legacy blob and say
        // plainly that the repair was not durable.
        const rebuilt = io.legacyLoadSync();
        snapshot = rebuilt;
        return { backend, before, after: rebuilt.length, removedInvalid: 0, durable: false, removedRows: [] };
      }

      const table = getTable(db);

      try {
        const rows = await table.toArray();
        const keptById = new Map<string, T>();
        const removedRows: unknown[] = [];

        for (const row of rows) {
          const normalized = io.normalize([row]);
          // Invalid rows, and duplicates of an id already kept, are the rows to drop.
          if (normalized.length === 0 || keptById.has(normalized[0].id)) {
            removedRows.push(row);
            continue;
          }
          keptById.set(normalized[0].id, normalized[0]);
        }

        const rebuilt = [...keptById.values()];

        if (removedRows.length > 0 || rebuilt.length > 0) {
          // Rewrite the store from the repaired rows: put the normalized keepers back and
          // delete everything else. Previously this only rebuilt memory, so the invalid rows
          // returned on the next restart and the "repair" silently undid itself.
          await db.transaction('rw', table, async () => {
            await table.clear();
            if (rebuilt.length > 0) {
              await table.bulkPut(rebuilt);
            }
          });
        }

        snapshot = rebuilt;
        return {
          backend,
          before,
          after: rebuilt.length,
          removedInvalid: removedRows.length,
          durable: true,
          removedRows,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'IndexedDB repair failed.';
        fallbackToLegacy(message);
        snapshot = io.legacyLoadSync();
        return {
          backend,
          before,
          after: snapshot.length,
          removedInvalid: 0,
          durable: false,
          removedRows: [],
          error: message,
        };
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
