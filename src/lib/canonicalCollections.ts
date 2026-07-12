// AS-03: the bridge between storage-level recovery and the mounted React owners.
//
// `AppController` owns `games` and `playActivity` in React, and `useAppPersistence` writes them
// back on a 400 ms debounce, on unmount, on beforeunload and on visibilitychange. The Data
// Management recovery/repair tools mutate the repositories directly. Without a bridge those two
// disagree: the repository holds the recovered snapshot while React still holds the pre-recovery
// array, and the next ordinary save replaces the recovered data with it.
//
// Two narrow primitives, deliberately not a state library:
//
//   1. A write SUSPENSION, so a destructive operation can freeze the owner's saves while it is
//      in flight. This is an explicit contract, not a timing guess.
//   2. An owner REPLACEMENT command, so a recovered snapshot is pushed into the mounted owner
//      instead of being silently overwritten by it. The owner registers two setters; components
//      never receive raw `setGames`.

import type { PlayActivityRecord } from './playActivityStorage';
import type { Game } from '../types/game';

export type CanonicalCollectionOwner = {
  replaceGames: (games: Game[]) => void;
  replacePlayActivity: (records: PlayActivityRecord[]) => void;
  prepareBackup: () => Promise<CanonicalBackupSnapshots>;
};

export type CanonicalBackupSnapshots = {
  games: Game[];
  playActivity: PlayActivityRecord[];
};

let owner: CanonicalCollectionOwner | null = null;
let suspendDepth = 0;

/**
 * Freeze owner-driven saves until the returned release is called.
 *
 * Refcounted, because the destructive operation and the owner's own re-render both hold a
 * suspension: the operation suspends for its duration, and the owner keeps it suspended until
 * it has actually re-rendered with the replacement (its save refs update during that render).
 */
export function suspendCanonicalCollectionWrites(): () => void {
  suspendDepth += 1;
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    suspendDepth = Math.max(0, suspendDepth - 1);
  };
}

/** Whether owner saves are currently frozen. Checked by `useAppPersistence` before every save. */
export function areCanonicalCollectionWritesSuspended(): boolean {
  return suspendDepth > 0;
}

/** Called by the mounted owner (AppController) to expose its replacement commands. */
export function registerCanonicalCollectionOwner(nextOwner: CanonicalCollectionOwner): () => void {
  owner = nextOwner;

  return () => {
    if (owner === nextOwner) {
      owner = null;
    }
  };
}

export function hasCanonicalCollectionOwner(): boolean {
  return owner !== null;
}

/**
 * Push a recovered games snapshot into the mounted owner.
 *
 * Returns false when no owner is mounted (e.g. the Settings route rendered standalone), which
 * tells the caller it must fall back to a controlled reload instead.
 */
export function replaceCanonicalGames(games: Game[]): boolean {
  if (!owner) {
    return false;
  }
  owner.replaceGames(games);
  return true;
}

export function replaceCanonicalPlayActivity(records: PlayActivityRecord[]): boolean {
  if (!owner) {
    return false;
  }
  owner.replacePlayActivity(records);
  return true;
}

/** Flush mounted collection owners and return the exact snapshots the backup must serialize. */
export async function prepareCanonicalBackup(): Promise<CanonicalBackupSnapshots | undefined> {
  return owner?.prepareBackup();
}

/** Test seam: drop any registered owner and clear suspensions. */
export function resetCanonicalCollectionOwner(): void {
  owner = null;
  suspendDepth = 0;
}
