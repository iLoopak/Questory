// Wave 6: the games store is now a thin games-typed view over the generic id-keyed
// collection repository (see indexedDbCollectionRepository.ts). Behavior is unchanged
// from Wave 3/5 — IndexedDB is the sole active store, the legacy `questshelf.games.v1`
// blob is a read-only import fallback kept inert, and the Wave 5 verify/repair/recover
// tools remain available. The only games-specific piece kept here is the status shape
// (`gameCount`), for backward compatibility with existing diagnostics consumers.

import type { Game } from '../types/game';
import type { GameRepository } from './gameRepository';
import {
  createIndexedDbCollectionRepository,
  type CollectionLegacyRecoveryMode,
  type CollectionLegacyRecoveryPreview,
  type CollectionLegacyRecoveryResult,
  type CollectionSnapshotRepairResult,
  type CollectionStoreBackend,
  type CollectionVerification,
} from './indexedDbCollectionRepository';

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
  /** Normalize raw values into valid Games (drops invalid, preserves unknown fields). */
  normalize: (value: unknown) => Game[];
  /** Durable legacy-blob write, used only when IndexedDB is unavailable or a write fails. */
  legacySaveAll: (games: Game[]) => void;
};

export type GameStoreBackend = CollectionStoreBackend;

export type GameRepositoryStatus = {
  backend: GameStoreBackend;
  ready: boolean;
  migratedFromLegacy: boolean;
  gameCount: number;
  /** Whether the legacy `questshelf.games.v1` blob is still present (kept inert this wave). */
  legacyBlobPresent: boolean;
  schemaVersion: number;
  /** Last migration/recovery/read-write error message, if any. */
  lastError: string | null;
};

// Wave 5 result types (now shared with the other collection stores via the generic repo).
export type GameStorageVerification = CollectionVerification;
export type GameSnapshotRepairResult = CollectionSnapshotRepairResult;
export type LegacyRecoveryPreview = CollectionLegacyRecoveryPreview;
export type LegacyRecoveryMode = CollectionLegacyRecoveryMode;
export type LegacyRecoveryResult = CollectionLegacyRecoveryResult;

export interface IndexedDbGameRepository extends GameRepository {
  getStatus(): GameRepositoryStatus;
  /** Read-only integrity check of the IndexedDB game store. Never mutates data. */
  verify(): Promise<GameStorageVerification>;
  /** Rebuild the in-memory snapshot from IndexedDB (normalized, deduped). Non-destructive:
   *  never writes to IndexedDB and never overwrites the legacy blob. */
  repairSnapshot(): Promise<GameSnapshotRepairResult>;
  /** Non-mutating preview of importing the legacy blob into IndexedDB. */
  previewLegacyRecovery(): Promise<LegacyRecoveryPreview>;
  /** Import the legacy blob into IndexedDB. 'merge' (default) adds legacy-only records and
   *  keeps existing IndexedDB records on id conflicts; 'replace' overwrites the store but
   *  refuses to wipe a non-empty store with an empty legacy blob. Never writes the legacy blob. */
  recoverFromLegacyBlob(mode: LegacyRecoveryMode): Promise<LegacyRecoveryResult>;
}

export function createIndexedDbGameRepository(io: IndexedDbGameRepositoryIo): IndexedDbGameRepository {
  const repository = createIndexedDbCollectionRepository<Game>({
    legacyKey: GAMES_KEY,
    getTable: (db) => db.games,
    io,
  });

  return {
    ...repository,
    getStatus() {
      const status = repository.getStatus();
      return {
        backend: status.backend,
        ready: status.ready,
        migratedFromLegacy: status.migratedFromLegacy,
        gameCount: status.recordCount,
        legacyBlobPresent: status.legacyBlobPresent,
        schemaVersion: status.schemaVersion,
        lastError: status.lastError,
      };
    },
  };
}
