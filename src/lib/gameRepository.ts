// Wave 1 persistence seam.
//
// GameRepository is the collection-level seam for the game library. Today it is
// backed by the existing single-blob Game[] persistence (createBlobGameRepository),
// so behavior is identical to the old loadGames/saveGames. Later (Wave 2) an
// IndexedDB-backed implementation can satisfy the same interface — keeping an
// in-memory snapshot for getAllSync() and doing per-row writes — without any caller
// (gameStorage facade, UI) changing.
//
// The blob implementation reads/writes the whole array per call, exactly as before.
// upsert/remove are provided for future call sites but are implemented on top of the
// whole-array read/write so they carry no new behavior today.

import type { Game } from '../types/game';

export interface GameRepository {
  /**
   * Initialize the backing store and populate the in-memory snapshot. Awaited once
   * at boot (before React renders) so getAllSync() is correct on first paint. The
   * blob repository resolves immediately; the IndexedDB repository opens the DB and
   * runs the one-time legacy import here.
   */
  ready(): Promise<void>;
  /** Synchronous snapshot of all games (enables synchronous first paint). */
  getAllSync(): Game[];
  /** Durable async load (mirrors the pre-seam loadGamesFromPersistentStorage). */
  loadDurable(): Promise<Game[]>;
  /** Replace the entire collection (matches the pre-seam saveGames semantics). */
  replaceAll(games: Game[]): void;
  /** Convenience lookup over the current snapshot. */
  getById(id: string): Game | undefined;
  /** Insert or update a single game. Forward-looking; today writes the whole blob. */
  upsert(game: Game): void;
  /** Remove a single game by id. Forward-looking; today writes the whole blob. */
  remove(id: string): void;
  /** Remove every game from the store and snapshot (used by the reset-data flow). */
  clear(): Promise<void>;
}

export type BlobGameRepositoryIo = {
  loadSync: () => Game[];
  loadDurable: () => Promise<Game[]>;
  saveAll: (games: Game[]) => void;
};

/**
 * Default repository backed by the existing whole-array blob persistence. Injecting the
 * IO (rather than importing gameStorage here) keeps this module free of the normalize
 * layer and avoids an import cycle.
 */
export function createBlobGameRepository(io: BlobGameRepositoryIo): GameRepository {
  return {
    async ready() {
      // Blob storage is synchronous; nothing to initialize.
    },
    getAllSync() {
      return io.loadSync();
    },
    loadDurable() {
      return io.loadDurable();
    },
    replaceAll(games) {
      io.saveAll(games);
    },
    getById(id) {
      return io.loadSync().find((game) => game.id === id);
    },
    upsert(game) {
      const games = io.loadSync();
      const index = games.findIndex((existing) => existing.id === game.id);
      if (index === -1) {
        io.saveAll([...games, game]);
        return;
      }
      const next = games.slice();
      next[index] = game;
      io.saveAll(next);
    },
    remove(id) {
      const games = io.loadSync();
      const next = games.filter((game) => game.id !== id);
      if (next.length !== games.length) {
        io.saveAll(next);
      }
    },
    async clear() {
      io.saveAll([]);
    },
  };
}
