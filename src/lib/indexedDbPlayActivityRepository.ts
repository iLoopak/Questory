// Wave 4b: IndexedDB-backed store for play activity records.
//
// Same model as the Wave 3 games repository (an id-keyed array collection):
//  - In-memory snapshot keeps loadPlayActivity() synchronous for first paint.
//  - Whole records are stored per row (structured clone), so unknown/future fields survive.
//  - Per-save writes diff against the snapshot by id and only put/delete changed rows.
//  - One-time import from the legacy `questshelf.playActivity.v1` blob if the store is
//    empty (durable read so a native pre-migration blob in Preferences still imports).
//    If the store already has records, the legacy blob is ignored — it can't overwrite them.
//  - No dual-write. The legacy blob is a read-only fallback, kept inert (not deleted); it is
//    never overwritten with an empty array (writes only ever touch IndexedDB + the snapshot).
//  - If IndexedDB is unavailable/fails, the repo degrades to the legacy blob and surfaces a
//    storage diagnostic.

import type { PlayActivityRecord } from './playActivityStorage';
import { getGameDatabase, QUESTORY_DB_VERSION } from './gameDatabase';
import { reportStorageIssue } from './localPersistence';
import { getStorageAdapter } from './storageAdapter';

const PLAY_ACTIVITY_KEY = 'questshelf.playActivity.v1';

export type PlayActivityRepositoryIo = {
  legacyLoadSync: () => PlayActivityRecord[];
  legacyLoadDurable: () => Promise<PlayActivityRecord[]>;
  legacyClear: () => Promise<void>;
};

export type PlayActivityStoreStatus = {
  backend: 'indexeddb' | 'legacy-fallback';
  ready: boolean;
  migratedFromLegacy: boolean;
  recordCount: number;
  legacyBlobPresent: boolean;
  schemaVersion: number;
};

export interface PlayActivityRepository {
  ready(): Promise<void>;
  getAllSync(): PlayActivityRecord[];
  loadDurable(): Promise<PlayActivityRecord[]>;
  replaceAll(records: PlayActivityRecord[]): void;
  clear(): Promise<void>;
  getStatus(): PlayActivityStoreStatus;
}

export function createIndexedDbPlayActivityRepository(io: PlayActivityRepositoryIo): PlayActivityRepository {
  let snapshot: PlayActivityRecord[] = io.legacyLoadSync();
  let isReady = false;
  let backend: PlayActivityStoreStatus['backend'] = 'indexeddb';
  let migratedFromLegacy = false;

  function fallbackToLegacy(message: string) {
    if (backend !== 'legacy-fallback') {
      backend = 'legacy-fallback';
      reportStorageIssue(PLAY_ACTIVITY_KEY, `Play activity database unavailable, using legacy storage: ${message}`);
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
      const count = await db.playActivity.count();

      if (count === 0) {
        // One-time import. Read the durable copy so a pre-migration native blob that only
        // survived in Preferences is still imported.
        let legacy = io.legacyLoadSync();
        if (legacy.length === 0) {
          legacy = await io.legacyLoadDurable();
        }
        if (legacy.length > 0) {
          await db.transaction('rw', db.playActivity, async () => {
            await db.playActivity.bulkPut(legacy);
          });
          migratedFromLegacy = true;
        }
        snapshot = legacy;
      } else {
        // IndexedDB has records: it is the source of truth; the legacy blob is ignored.
        snapshot = await db.playActivity.toArray();
      }

      isReady = true;
    } catch (error) {
      snapshot = io.legacyLoadSync();
      isReady = true;
      fallbackToLegacy(error instanceof Error ? error.message : 'Unknown IndexedDB error.');
    }
  }

  function persistToIdb(previous: PlayActivityRecord[], next: PlayActivityRecord[]) {
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      return;
    }

    const previousById = new Map(previous.map((record) => [record.id, record]));
    const changed = next.filter((record) => previousById.get(record.id) !== record);
    const nextIds = new Set(next.map((record) => record.id));
    const removed = [...previousById.keys()].filter((id) => !nextIds.has(id));

    if (changed.length === 0 && removed.length === 0) {
      return;
    }

    void db
      .transaction('rw', db.playActivity, async () => {
        if (changed.length > 0) {
          await db.playActivity.bulkPut(changed);
        }
        if (removed.length > 0) {
          await db.playActivity.bulkDelete(removed);
        }
      })
      .catch((error: unknown) => {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB write failed.');
      });
  }

  return {
    ready,
    getAllSync() {
      return snapshot;
    },
    loadDurable() {
      return Promise.resolve(snapshot);
    },
    replaceAll(records) {
      const previous = snapshot;
      snapshot = records;
      // Wave 4b: IndexedDB + snapshot only — no legacy blob dual-write.
      persistToIdb(previous, records);
    },
    async clear() {
      snapshot = [];
      // Neutralize the legacy blob across every tier so a reset can't re-import records.
      await io.legacyClear();
      const db = getGameDatabase();
      if (db && backend !== 'legacy-fallback') {
        try {
          await db.playActivity.clear();
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
        legacyBlobPresent: getStorageAdapter().readLocal(PLAY_ACTIVITY_KEY) !== null,
        schemaVersion: QUESTORY_DB_VERSION,
      };
    },
  };
}
