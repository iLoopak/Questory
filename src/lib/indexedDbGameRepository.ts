// Wave 2: IndexedDB-backed GameRepository (games collection only).
//
// Design goals (see docs/persistence-migration-audit.md):
//  - IndexedDB is the store; an in-memory snapshot keeps loadGames() synchronous for
//    first paint.
//  - One-time migration imports the legacy `questshelf.games.v1` blob into IndexedDB.
//  - The legacy blob keeps being dual-written this wave as rollback insurance and is
//    NOT deleted. Backup export still reads it, so backup format is unchanged.
//  - Per-edit writes only touch changed rows in IndexedDB (no whole-collection rewrite).
//  - If IndexedDB is unavailable or fails, the repository degrades to legacy-blob-only
//    behavior and surfaces a storage diagnostic.
//
// Rollback safety / reconciliation:
//   Every write bumps a synchronous legacy sequence number and (best-effort, async)
//   marks the sequence IndexedDB has confirmed. The legacy blob is always written
//   synchronously first, so it can only be equal to or ahead of IndexedDB. On boot, if
//   the legacy sequence is ahead (e.g. a fire-and-forget IndexedDB write was dropped
//   when the tab closed), we trust the legacy blob and re-sync IndexedDB from it — no
//   silent loss of the last edit.

import type { Game } from '../types/game';
import type { GameRepository } from './gameRepository';
import { getGameDatabase } from './gameDatabase';
import { loadLocalJson, reportStorageIssue, savePersistedJson } from './localPersistence';

const GAMES_KEY = 'questshelf.games.v1';
export const gamesSyncStateStorageKey = 'questshelf.gamesSyncState.v1';

type GamesSyncState = {
  /** Sequence of the last write applied to the legacy blob (synchronous, authoritative). */
  legacy: number;
  /** Highest sequence IndexedDB has confirmed persisting. */
  idb: number;
};

const defaultSyncState: GamesSyncState = { legacy: 0, idb: 0 };

function normalizeSyncState(value: unknown): GamesSyncState {
  if (!value || typeof value !== 'object') {
    return { ...defaultSyncState };
  }
  const raw = value as Partial<GamesSyncState>;
  return {
    legacy: typeof raw.legacy === 'number' && Number.isFinite(raw.legacy) ? raw.legacy : 0,
    idb: typeof raw.idb === 'number' && Number.isFinite(raw.idb) ? raw.idb : 0,
  };
}

// Read synchronously from localStorage (post-hydration on native); write through the
// durable path so the counters survive a WebView localStorage eviction.
const loadSyncState = () => loadLocalJson(gamesSyncStateStorageKey, defaultSyncState, normalizeSyncState);
const saveSyncState = (state: GamesSyncState) => savePersistedJson(gamesSyncStateStorageKey, state);

export type IndexedDbGameRepositoryIo = {
  /** Synchronous read of the legacy blob (already normalized). */
  legacyLoadSync: () => Game[];
  /** Durable async read of the legacy blob (localStorage + Preferences). */
  legacyLoadDurable: () => Promise<Game[]>;
  /** Whole-blob write of the legacy `questshelf.games.v1` (dual-write insurance). */
  legacySaveAll: (games: Game[]) => void;
  /** Reused normalization so IndexedDB and the blob stay identical in shape. */
  normalize: (value: unknown) => Game[];
};

export type GameStoreBackend = 'indexeddb' | 'legacy-fallback';

export type GameRepositoryStatus = {
  backend: GameStoreBackend;
  ready: boolean;
  migratedFromLegacy: boolean;
  gameCount: number;
};

export interface IndexedDbGameRepository extends GameRepository {
  getStatus(): GameRepositoryStatus;
}

export function createIndexedDbGameRepository(io: IndexedDbGameRepositoryIo): IndexedDbGameRepository {
  // Best-effort synchronous seed so reads before ready() still return data on the web
  // (native localStorage is empty until hydration, but ready() runs after hydration).
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

    const legacyGames = io.legacyLoadSync();
    const db = getGameDatabase();

    if (!db) {
      snapshot = legacyGames;
      isReady = true;
      fallbackToLegacy('IndexedDB is not available in this environment.');
      return;
    }

    try {
      const state = loadSyncState();
      const idbCount = await db.games.count();

      if (idbCount === 0) {
        // First run on this device: import the legacy blob in one transaction.
        if (legacyGames.length > 0) {
          await db.transaction('rw', db.games, async () => {
            await db.games.bulkPut(legacyGames);
          });
          migratedFromLegacy = true;
        }
        snapshot = legacyGames;
        saveSyncState({ legacy: state.legacy, idb: state.legacy });
      } else if (state.legacy > state.idb) {
        // The legacy blob has a write IndexedDB never confirmed (e.g. dropped on unload).
        // Trust the synchronously-written legacy blob and re-sync IndexedDB from it.
        await db.transaction('rw', db.games, async () => {
          await db.games.clear();
          await db.games.bulkPut(legacyGames);
        });
        snapshot = legacyGames;
        saveSyncState({ legacy: state.legacy, idb: state.legacy });
      } else {
        // IndexedDB is the source of truth.
        snapshot = await db.games.toArray();
      }

      isReady = true;
    } catch (error) {
      // Any failure: fall back to the legacy blob so the user keeps their library.
      snapshot = legacyGames;
      isReady = true;
      fallbackToLegacy(error instanceof Error ? error.message : 'Unknown IndexedDB error.');
    }
  }

  function persistToIdb(previous: Game[], next: Game[], seq: number) {
    const db = getGameDatabase();
    if (!db || backend === 'legacy-fallback') {
      return;
    }

    const previousById = new Map(previous.map((game) => [game.id, game]));
    const changed = next.filter((game) => previousById.get(game.id) !== game);
    const nextIds = new Set(next.map((game) => game.id));
    const removed = [...previousById.keys()].filter((id) => !nextIds.has(id));

    if (changed.length === 0 && removed.length === 0) {
      // Nothing to write; still mark IndexedDB as caught up to this sequence.
      saveSyncState({ ...loadSyncState(), idb: seq });
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
      .then(() => {
        saveSyncState({ ...loadSyncState(), idb: seq });
      })
      .catch((error: unknown) => {
        fallbackToLegacy(error instanceof Error ? error.message : 'IndexedDB write failed.');
      });
  }

  function commit(next: Game[]) {
    const previous = snapshot;
    // Bump the legacy sequence synchronously and write the legacy blob first so it is
    // always at least as fresh as IndexedDB (the basis for boot reconciliation).
    const seq = loadSyncState().legacy + 1;
    saveSyncState({ ...loadSyncState(), legacy: seq });
    io.legacySaveAll(next);
    snapshot = next;
    persistToIdb(previous, next, seq);
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
      io.legacySaveAll([]);
      saveSyncState({ ...defaultSyncState });
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
      };
    },
  };
}
