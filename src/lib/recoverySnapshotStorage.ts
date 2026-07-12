// AS-01, requirement 5: the pre-restore safety snapshot.
//
// A replace-restore is destructive: it swaps the whole collection for the backup's. Before it
// runs, we take a full export of the CURRENT state and store it durably, so a restore that turns
// out to be wrong (or that half-completes) still has an undo path. If the snapshot cannot be
// written, the restore does not proceed — losing the old data with no way back is exactly the
// failure this PR exists to prevent.
//
// It lives in the Dexie `appCaches` table (not localStorage): a full library easily exceeds the
// localStorage quota, and appCaches is already the store for heavy blobs.

import { getGameDatabase } from './gameDatabase';
import type { QuestShelfBackup } from './backupStorage';

export const recoverySnapshotKey = 'questory.preRestoreSnapshot.v1';

export type RecoverySnapshot = {
  backup: QuestShelfBackup;
  createdAt: string;
  /** What the snapshot was taken before, for the UI's benefit. */
  reason: 'replace-restore' | 'merge-restore';
};

export type RecoverySnapshotWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Store a pre-restore snapshot, awaited.
 *
 * Secrets: the snapshot is written with the caller's backup object as-is. Callers pass a backup
 * that includes integration settings, because this never leaves the device — it is written to
 * the same IndexedDB the settings already live in — and a recovery export without them would not
 * actually restore the user's state.
 */
export async function saveRecoverySnapshot(snapshot: RecoverySnapshot): Promise<RecoverySnapshotWriteResult> {
  const db = getGameDatabase();

  if (!db) {
    // No IndexedDB (private mode, or an unsupported runtime). Say so rather than pretending the
    // safety net exists — the caller decides whether to continue.
    return { ok: false, error: 'IndexedDB is not available, so a pre-restore snapshot cannot be saved.' };
  }

  try {
    await db.appCaches.put({ key: recoverySnapshotKey, value: snapshot, updatedAt: Date.now() });
    // Read it back: a put that resolves but stores nothing usable is not a safety net.
    const stored = await db.appCaches.get(recoverySnapshotKey);
    if (!stored) {
      return { ok: false, error: 'The pre-restore snapshot could not be read back after writing.' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'The pre-restore snapshot could not be saved.',
    };
  }
}

export async function loadRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  const db = getGameDatabase();
  if (!db) {
    return null;
  }

  try {
    const row = await db.appCaches.get(recoverySnapshotKey);
    return (row?.value as RecoverySnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}
