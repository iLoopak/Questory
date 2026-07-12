// AS-05: freshness metadata for the two-tier KV store.
//
// Questory writes every KV key to localStorage synchronously and mirrors it to Capacitor
// Preferences asynchronously. Neither tier carried any notion of WHICH copy is newer, so startup
// hydration simply let Preferences win — and a durable write that completed late, out of order or
// not at all could resurrect an older value over a newer local one.
//
// The fix is a per-key REVISION, stored in a companion key rather than wrapped around the payload:
//
//   questshelf.platformQueues.v1        ← the payload, byte-for-byte what it always was
//   questshelf.kvMeta.v1:questshelf.platformQueues.v1   ← {"rev":7}
//
// Keeping the payload untouched is what makes this safe to ship: no feature schema changes, no
// backup format change, and every existing reader (including a downgraded build) still parses the
// value it finds. A missing or malformed companion key just means "revision 0" — legacy — and
// never makes a valid payload unreadable.
//
// Revisions are monotonic per key and derived from the local tier, which is synchronous and
// single-threaded, so they need no wall clock and are deterministic in tests.

import { getStorageAdapter } from './storageAdapter';

const metaKeyPrefix = 'questshelf.kvMeta.v1:';

/** Legacy data (written before this contract existed) reads as revision 0. */
export const legacyRevision = 0;

export type KvMeta = {
  /** Monotonic per key. Higher wins. */
  rev: number;
  /** A tombstone: the key was removed at this revision, so an older copy must not come back. */
  deleted?: boolean;
};

export function getKvMetaKey(key: string): string {
  return `${metaKeyPrefix}${key}`;
}

export function isKvMetaKey(key: string): boolean {
  return key.startsWith(metaKeyPrefix);
}

/**
 * Parse a companion value.
 *
 * Malformed metadata is treated as legacy (revision 0) rather than as an error: the payload it
 * describes is still perfectly readable, and refusing to read it would turn a cosmetic problem
 * into data loss.
 */
export function parseKvMeta(rawValue: string | null): KvMeta | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const candidate = parsed as Partial<KvMeta>;
    if (typeof candidate.rev !== 'number' || !Number.isFinite(candidate.rev) || candidate.rev < 0) {
      return null;
    }

    return { rev: candidate.rev, deleted: candidate.deleted === true };
  } catch {
    return null;
  }
}

export function serializeKvMeta(meta: KvMeta): string {
  return JSON.stringify(meta.deleted ? { rev: meta.rev, deleted: true } : { rev: meta.rev });
}

/** The revision the local tier currently claims for this key. */
export function readLocalKvMeta(key: string): KvMeta | null {
  return parseKvMeta(getStorageAdapter().readLocal(getKvMetaKey(key)));
}

/**
 * The revision to stamp on the next write.
 *
 * Read from the local tier, which is the one the running app writes synchronously, so two writes
 * in the same tick still get strictly increasing revisions.
 */
export function nextKvRevision(key: string): number {
  return (readLocalKvMeta(key)?.rev ?? legacyRevision) + 1;
}

export function writeLocalKvMeta(key: string, meta: KvMeta): void {
  try {
    getStorageAdapter().writeLocal(getKvMetaKey(key), serializeKvMeta(meta));
  } catch {
    // A missing revision degrades this key to legacy behavior for one boot. That is strictly
    // better than failing the payload write that just succeeded, so it is swallowed here and
    // reported by the caller that owns the payload.
  }
}

export function removeLocalKvMeta(key: string): void {
  getStorageAdapter().removeLocal(getKvMetaKey(key));
}
