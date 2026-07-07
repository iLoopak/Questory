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
  type CollectionSnapshotRepairResult,
  type CollectionStoreStatus,
  type CollectionVerification,
} from './indexedDbCollectionRepository';

const PLAY_ACTIVITY_KEY = 'questshelf.playActivity.v1';

export type PlayActivityRepositoryIo = {
  legacyLoadSync: () => PlayActivityRecord[];
  legacyLoadDurable: () => Promise<PlayActivityRecord[]>;
  legacyClear: () => Promise<void>;
  normalize: (value: unknown) => PlayActivityRecord[];
};

export type PlayActivityStoreStatus = CollectionStoreStatus;
export type PlayActivityVerification = CollectionVerification;
export type PlayActivityRepairResult = CollectionSnapshotRepairResult;
export type PlayActivityRecoveryPreview = CollectionLegacyRecoveryPreview;
export type PlayActivityRecoveryMode = CollectionLegacyRecoveryMode;
export type PlayActivityRecoveryResult = CollectionLegacyRecoveryResult;

export interface PlayActivityRepository {
  ready(): Promise<void>;
  getAllSync(): PlayActivityRecord[];
  loadDurable(): Promise<PlayActivityRecord[]>;
  replaceAll(records: PlayActivityRecord[]): void;
  clear(): Promise<void>;
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
