// Wave 3: IndexedDB is the sole active store for the games collection.
//
// What changed from Wave 2:
//  - No more dual-write to the legacy `questshelf.games.v1` blob during normal use.
//    saveGames() updates IndexedDB + the in-memory snapshot only.
//  - The Wave 2 reconciliation counter is gone; IndexedDB is the source of truth.
//  - The legacy blob is now a READ-ONLY import fallback: it is imported once if
//    IndexedDB is empty, and otherwise left inert (not deleted).
//
// Preserved:
//  - In-memory snapshot keeps loadGames() synchronous for first paint.
//  - The whole Game object is stored per row, so unknown/future fields survive.
//  - Per-edit writes diff against the snapshot and only put/delete changed rows.
//  - If IndexedDB is unavailable/fails, the repo degrades to the legacy blob and
//    surfaces a storage diagnostic.

import type { Game } from '../types/game';
import type { GameRepository } from './gameRepository';
import { getGameDatabase, GAME_DB_SCHEMA_VERSION } from './gameDatabase';
import { reportStorageIssue } from './localPersistence';
import { getStorageAdapter } from './storageAdapter';

const GAMES_KEY = 'questshelf.games.v1';

export type IndexedDbGameRepositoryIo = {
  /** Synchronous read of the legacy blob from localStorage (already normalized). */
  legacyLoadSync: () => Game[];
  /** Durable async read (localStorage + Preferences) — used for the one-time import so a
   *  pre-Wave-2 native blob that only lives in Preferences is still migrated. */
  legacyLoadDurable: () => Promise<Game[]>;
  /** Remove the legacy blob from every tier — used by clear()/reset so a stale blob
   *  cannot re-import "deleted" games on the next boot. */
  legacyClear: () => Promise<void>;
};

export type GameStoreBackend = 'indexeddb' | 'legacy-fallback';

export type GameRepositoryStatus = {
  backend: GameStoreBackend;
  ready: boolean;
  migratedFromLegacy: boolean;
  gameCount: number;
  /** Whether the legacy `questshelf.games.v1` blob is still present (kept inert this wave). */
  legacyBlobPresent: boolean;
  schemaVersion: number;
};

export interface IndexedDbGameRepository extends GameRepository {
  getStatus(): GameRepositoryStatus;
}

export function createIndexedDbGameRepository(io: IndexedDbGameRepositoryIo): IndexedDbGameRepository {
  // Best-effort synchronous seed so reads before ready() still return data on the web.
  // ready() (awaited before render) establishes the authoritative snapshot.
  let snapshot: Game[] = io.legacyLoadSync();
  let isReady = false;
  let backend: GameStoreBackend = 'indexeddb';
  let migratedFromLegacy = false;

  function fallbackToLegacy(message: string) {
    if (backend !== 'legacy-fallback') {
      backend = 'legacy-fallback';
      reportStorageIssue(GAMES_KEY, `Game database unavailable, using legacy storage: ${message}`);
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
      const idbCount = await db.games.count();

      if (idbCount === 0) {
        // First run on this device: import the legacy blob once. Read the durable copy so
        // a pre-Wave-2 native user whose blob only survived in Preferences still migrates.
        let legacyGames = io.legacyLoadSync();
        if (legacyGames.length === 0) {
          legacyGames = await io.legacyLoadDurable();
        }
        if (legacyGames.length > 0) {
          await db.transaction('rw', db.games, async () => {
            await db.games.bulkPut(legacyGames);
          });
          migratedFromLegacy = true;
        }
        snapshot = legacyGames;
      } else {
        // IndexedDB has games: it is the source of truth. The legacy blob (if any) is
        // ignored so it can never overwrite IndexedDB.
        snapshot = await db.games.toArray();
      }

      isReady = true;
    } catch (error) {
      snapshot = io.legacyLoadSync();
      isReady = true;
      fallbackToLegacy(error instanceof Error ? error.message : 'Unknown IndexedDB error.');
    }
  }

  function persistToIdb(previous: Game[], next: Game[]) {
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      return;
    }

    const previousById = new Map(previous.map((game) => [game.id, game]));
    const changed = next.filter((game) => previousById.get(game.id) !== game);
    const nextIds = new Set(next.map((game) => game.id));
    const removed = [...previousById.keys()].filter((id) => !nextIds.has(id));

    if (changed.length === 0 && removed.length === 0) {
      return;
    }

    void db
      .transaction('rw', db.games, async () => {
        if (changed.length > 0) {
          await db.games.bulkPut(changed);
        }
        if (removed.length > 0) {
          await db.games.bulkDelete(removed);
        }
      })
      .catch((error: unknown) => {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB write failed.');
      });
  }

  function commit(next: Game[]) {
    const previous = snapshot;
    snapshot = next;
    // Wave 3: IndexedDB + snapshot only — no legacy blob dual-write.
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
    replaceAll(games) {
      commit(games);
    },
    getById(id) {
      return snapshot.find((game) => game.id === id);
    },
    upsert(game) {
      const index = snapshot.findIndex((existing) => existing.id === game.id);
      if (index === -1) {
        commit([...snapshot, game]);
        return;
      }
      const next = snapshot.slice();
      next[index] = game;
      commit(next);
    },
    remove(id) {
      const next = snapshot.filter((game) => game.id !== id);
      if (next.length !== snapshot.length) {
        commit(next);
      }
    },
    async clear() {
      snapshot = [];
      // Neutralize the legacy blob across every tier so a reset can't re-import games.
      await io.legacyClear();
      const db = getGameDatabase();
      if (db && backend !== 'legacy-fallback') {
        try {
          await db.games.clear();
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
        gameCount: snapshot.length,
        legacyBlobPresent: getStorageAdapter().readLocal(GAMES_KEY) !== null,
        schemaVersion: GAME_DB_SCHEMA_VERSION,
      };
    },
  };
}
