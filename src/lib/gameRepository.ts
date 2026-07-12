// The collection-level seam for the game library.
//
// The only implementation is `indexedDbGameRepository`, which keeps an in-memory snapshot for
// getAllSync() and writes per row. AS-21: the original blob implementation this interface was
// introduced for (`createBlobGameRepository`) had no consumer left — the IndexedDB repository owns
// the legacy blob as a migration/recovery INPUT, which is a different thing and stays.

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
