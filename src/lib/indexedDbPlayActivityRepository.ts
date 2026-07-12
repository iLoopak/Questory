// Wave 6: play activity is a thin view over the generic id-keyed collection repository
// (see indexedDbCollectionRepository.ts). Behavior is unchanged from Wave 4b — IndexedDB
// is the sole active store, the legacy `questshelf.playActivity.v1` blob is a read-only
// import fallback kept inert — and it now also exposes the shared verify/repair/recover
// tools (Wave 6).

import type { PlayActivityRecord } from './playActivityStorage';
import {
  createIndexedDbCollectionRepository,
  type CollectionLegacyRecoveryMode,
  type CollectionLegacyRecoveryPreview,
  type CollectionLegacyRecoveryResult,
  type CollectionRepairResult,
  type CollectionSnapshotRepairResult,
  type CollectionStoreStatus,
  type CollectionVerification,
  type CollectionWriteResult,
} from './indexedDbCollectionRepository';

const PLAY_ACTIVITY_KEY = 'questshelf.playActivity.v1';

export type PlayActivityRepositoryIo = {
  legacyLoadSync: () => PlayActivityRecord[];
  legacyLoadDurable: () => Promise<PlayActivityRecord[]>;
  legacyClear: () => Promise<void>;
  normalize: (value: unknown) => PlayActivityRecord[];
  /** Durable legacy-blob write, used only when IndexedDB is unavailable or a write fails. */
  legacySaveAll: (records: PlayActivityRecord[]) => void;
};

export type PlayActivityStoreStatus = CollectionStoreStatus;
export type PlayActivityVerification = CollectionVerification;
export type PlayActivityRepairResult = CollectionSnapshotRepairResult;
export type PlayActivityRecoveryPreview = CollectionLegacyRecoveryPreview;
export type PlayActivityRecoveryMode = CollectionLegacyRecoveryMode;
export type PlayActivityRecoveryResult = CollectionLegacyRecoveryResult;
export type PlayActivityWriteResult = CollectionWriteResult;
export type PlayActivityRepairDurableResult = CollectionRepairResult;

export interface PlayActivityRepository {
  ready(): Promise<void>;
  getAllSync(): PlayActivityRecord[];
  loadDurable(): Promise<PlayActivityRecord[]>;
  replaceAll(records: PlayActivityRecord[]): void;
  clear(): Promise<void>;
  /** Awaitable destructive mutations (backup restore/merge, recovery). See AS-01. */
  replaceAllDurable(records: PlayActivityRecord[]): Promise<PlayActivityWriteResult>;
  upsertManyDurable(records: PlayActivityRecord[]): Promise<PlayActivityWriteResult>;
  removeManyDurable(ids: string[]): Promise<PlayActivityWriteResult>;
  clearDurable(): Promise<PlayActivityWriteResult>;
  /** Durable repair: rewrites the valid rows and deletes invalid/duplicate ones in IndexedDB. */
  repairDurable(): Promise<PlayActivityRepairDurableResult>;
  getStatus(): PlayActivityStoreStatus;
  verify(): Promise<PlayActivityVerification>;
  repairSnapshot(): Promise<PlayActivityRepairResult>;
  previewLegacyRecovery(): Promise<PlayActivityRecoveryPreview>;
  recoverFromLegacyBlob(mode: PlayActivityRecoveryMode): Promise<PlayActivityRecoveryResult>;
}

export function createIndexedDbPlayActivityRepository(io: PlayActivityRepositoryIo): PlayActivityRepository {
  return createIndexedDbCollectionRepository<PlayActivityRecord>({
    legacyKey: PLAY_ACTIVITY_KEY,
    getTable: (db) => db.playActivity,
    io,
  });
}
