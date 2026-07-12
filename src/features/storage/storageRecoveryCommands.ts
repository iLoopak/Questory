// AS-03: the recovery/repair commands, with owner synchronization built in.
//
// These operations replace a repository's contents behind the mounted React owner. Doing that
// safely takes two steps that must not be left to the caller to remember:
//
//   1. SUSPEND owner writes for the duration, so a games debounce already in flight (or an
//      unmount/visibility flush) cannot write the pre-recovery array over the recovered one.
//   2. REPLACE the owner's canonical state with the recovered snapshot once it is durable, so
//      the owner's next ordinary save writes the recovered data rather than the stale data.
//
// Every destructive Data Management tool goes through here, so there is one place where that
// contract lives and one place to test it.

import {
  replaceCanonicalGames,
  replaceCanonicalPlayActivity,
  suspendCanonicalCollectionWrites,
} from '../../lib/canonicalCollections';
import {
  loadGames,
  recoverGamesFromLegacyBlob,
  repairGameStorage,
} from '../../lib/gameStorage';
import {
  loadPlayActivity,
  recoverPlayActivityFromLegacyBlob,
  repairPlayActivityStorage,
} from '../../lib/playActivityStorage';
import {
  recoverRawgMetadataCacheFromLegacyBlob,
  repairRawgMetadataCacheStorage,
} from '../../lib/rawgMetadataCache';
import type {
  CollectionLegacyRecoveryMode,
  CollectionLegacyRecoveryResult,
  CollectionRepairResult,
} from '../../lib/indexedDbCollectionRepository';

export type StorageCommandResult<T> = {
  result: T;
  /**
   * False when no React owner was mounted to receive the new snapshot, so the caller must fall
   * back to a reload before the user edits anything.
   */
  ownerSynced: boolean;
};

/** Run a destructive store operation with owner writes frozen, then hand the result to the owner. */
async function withOwnerSync<T>(
  operation: () => Promise<T>,
  syncOwner: () => boolean,
): Promise<StorageCommandResult<T>> {
  const releaseWrites = suspendCanonicalCollectionWrites();

  try {
    const result = await operation();
    // Only now is the data durable, so only now is it safe to make it canonical.
    const ownerSynced = syncOwner();
    return { result, ownerSynced };
  } finally {
    // The owner's own hook keeps its suspension until it has re-rendered with the replacement,
    // so releasing here does not reopen the stale-write window.
    releaseWrites();
  }
}

export function runGameRepair(): Promise<StorageCommandResult<CollectionRepairResult>> {
  return withOwnerSync(repairGameStorage, () => replaceCanonicalGames(loadGames()));
}

export function runGameRecovery(
  mode: CollectionLegacyRecoveryMode,
): Promise<StorageCommandResult<CollectionLegacyRecoveryResult>> {
  return withOwnerSync(() => recoverGamesFromLegacyBlob(mode), () => replaceCanonicalGames(loadGames()));
}

export function runPlayActivityRepair(): Promise<StorageCommandResult<CollectionRepairResult>> {
  return withOwnerSync(repairPlayActivityStorage, () => replaceCanonicalPlayActivity(loadPlayActivity()));
}

export function runPlayActivityRecovery(
  mode: CollectionLegacyRecoveryMode,
): Promise<StorageCommandResult<CollectionLegacyRecoveryResult>> {
  return withOwnerSync(
    () => recoverPlayActivityFromLegacyBlob(mode),
    () => replaceCanonicalPlayActivity(loadPlayActivity()),
  );
}

// The RAWG metadata cache has no mounted React owner — it is read straight from the repository —
// so there is nothing to synchronize. It still suspends, because a games save firing mid-repair
// would be just as unwelcome.
export function runRawgCacheRepair(): Promise<StorageCommandResult<CollectionRepairResult>> {
  return withOwnerSync(repairRawgMetadataCacheStorage, () => true);
}

export function runRawgCacheRecovery(
  mode: CollectionLegacyRecoveryMode,
): Promise<StorageCommandResult<CollectionLegacyRecoveryResult>> {
  return withOwnerSync(() => recoverRawgMetadataCacheFromLegacyBlob(mode), () => true);
}
