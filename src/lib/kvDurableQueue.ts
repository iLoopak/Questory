// AS-05: per-key serialization of durable (Capacitor Preferences) writes.
//
// Preferences writes were fired and forgotten. Two saves of the same key could complete in either
// order, so the older payload could be the one that survived on disk — and the next launch would
// then hydrate it over the newer local value.
//
// Every durable mutation for a key now goes through that key's own queue:
//
//   - operations on ONE key run strictly in the order they were issued (writes and removes alike),
//   - operations on DIFFERENT keys stay independent — there is no global lock,
//   - a rejected operation is recorded and the queue carries on with the next one.
//
// The payload and its revision companion are written by the same queued operation, so the durable
// tier never advertises a revision it does not actually hold. Ordering WITHIN a session is the
// queue's job; ordering ACROSS sessions (a write that never landed before the app was killed) is
// what the revisions are for, and is settled at startup by `hydrateLocalStorageFromPreferences`.

import { getKvMetaKey, serializeKvMeta } from './kvRevisions';
import { getStorageAdapter } from './storageAdapter';

export type DurableKvOperation =
  | { kind: 'set'; revision: number; value: string }
  | { kind: 'remove'; revision: number };

export type DurableKvFailureCategory = 'write-rejected' | 'remove-rejected';

export type DurableKvOutcome = {
  key: string;
  /** False only when the durable backend exists and rejected the operation. */
  ok: boolean;
  /** True when there is no durable backend (an ordinary browser) — nothing to do, not a failure. */
  skipped?: boolean;
  category?: DurableKvFailureCategory;
  error?: string;
};

type QueueEntry = {
  chain: Promise<unknown>;
};

const queues = new Map<string, QueueEntry>();

function getQueue(key: string): QueueEntry {
  const existing = queues.get(key);
  if (existing) {
    return existing;
  }

  const entry: QueueEntry = { chain: Promise.resolve() };
  queues.set(key, entry);
  return entry;
}

/**
 * Queue a durable mutation for one key. Resolves when THIS operation has settled, with every
 * operation queued for the same key before it already settled.
 */
export function enqueueDurableKv(key: string, operation: DurableKvOperation): Promise<DurableKvOutcome> {
  const queue = getQueue(key);

  const result = queue.chain.then(
    () => runDurableOperation(key, operation),
    // A rejected predecessor must not poison the chain — the queue is an ordering device, not a
    // transaction. The failure was already reported by the operation that caused it.
    () => runDurableOperation(key, operation),
  );

  // The chain itself must never reject, or every later operation for this key would be skipped.
  queue.chain = result.catch(() => undefined);
  return result;
}

async function runDurableOperation(key: string, operation: DurableKvOperation): Promise<DurableKvOutcome> {
  const adapter = getStorageAdapter();

  if (!(await adapter.hasDurableBackend())) {
    return { key, ok: true, skipped: true };
  }

  const metaKey = getKvMetaKey(key);

  try {
    if (operation.kind === 'set') {
      await adapter.writeDurable(key, operation.value);
      await adapter.writeDurable(metaKey, serializeKvMeta({ rev: operation.revision }));
    } else {
      await adapter.removeDurable(key);
      // The tombstone stays behind so an older payload in the other tier cannot resurrect the key.
      // It is a few bytes, not a copy of the value.
      await adapter.writeDurable(metaKey, serializeKvMeta({ rev: operation.revision, deleted: true }));
    }

    return { key, ok: true };
  } catch (error) {
    return {
      key,
      ok: false,
      category: operation.kind === 'set' ? 'write-rejected' : 'remove-rejected',
      error: error instanceof Error ? error.message : 'Durable storage operation failed.',
    };
  }
}

/** Await every queued operation for a key (or for all keys). Used by tests and by awaited flows. */
export async function whenDurableKvSettled(key?: string): Promise<void> {
  const chains = key
    ? [queues.get(key)?.chain].filter(Boolean)
    : Array.from(queues.values()).map((queue) => queue.chain);

  await Promise.all(chains.map((chain) => (chain as Promise<unknown>).catch(() => undefined)));
}

/** Test seam: forget every queue. */
export function resetDurableKvQueues(): void {
  queues.clear();
}
