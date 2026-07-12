/**
 * A StorageAdapter whose durable tier (Capacitor Preferences on device) can be delayed,
 * failed, and settled in an arbitrary order.
 *
 * Questory's KV path is two-tier: `savePersistedJson` writes localStorage
 * synchronously and then fires the durable write WITHOUT awaiting it
 * (`void getStorageAdapter().writeDurable(...)`). These tests need to observe that
 * gap, so the adapter records every durable operation and — in `manual` mode —
 * leaves each one pending until the test settles it.
 *
 * Install with `setStorageAdapter(controllable.adapter)` from `src/lib/storageAdapter`.
 */
import { createDeferred, type Deferred } from './deferred';
import type { StorageAdapter } from '../../src/lib/storageAdapter';

export type DurableOperationKind = 'read' | 'write' | 'remove';

export type DurableOperation = {
  /** Order in which the operation was STARTED (0-based). */
  index: number;
  kind: DurableOperationKind;
  key: string;
  /** Serialized value for writes. */
  value?: string;
  /** Order in which the operation COMPLETED, or null while still pending. */
  completionIndex: number | null;
  /**
   * `failed` means the underlying native write threw. The promise still RESOLVES, because the
   * real adapter catches the error (`localStoragePreferencesAdapter.writeDurable` has an empty
   * catch): a failed durable write is invisible to every caller — the value simply never
   * becomes durable. That is the behavior these tests need to reproduce, so there is
   * deliberately no "rejecting" mode here.
   */
  outcome: 'pending' | 'resolved' | 'failed';
  deferred: Deferred<void>;
};

export type DurableMode = 'auto' | 'manual';

export type ControllableStorageAdapter = {
  adapter: StorageAdapter;
  /** The synchronous local tier (stands in for localStorage). */
  local: Map<string, string>;
  /** Every durable operation, in the order it was started. */
  operations: DurableOperation[];
  /** `auto`: durable ops settle immediately. `manual`: they stay pending until settled. */
  setDurableMode: (mode: DurableMode) => void;
  /** Keys whose durable writes/removes fail when settled (simulates a failed native write). */
  failDurableKeys: Set<string>;
  pendingOperations: () => DurableOperation[];
  operationsForKey: (key: string) => DurableOperation[];
  /** Settle one pending operation (it "fails" if its key is in `failDurableKeys`). */
  settleOperation: (operation: DurableOperation) => Promise<void>;
  /** Settle the pending operations for a key — lets a test choose the completion ORDER. */
  settleKey: (key: string) => Promise<void>;
  /** Settle every pending operation, in the order they were started. */
  settleAll: () => Promise<void>;
  /** Keys that reached the durable tier successfully, in completion order. */
  durableCompletionOrder: () => string[];
  reset: () => void;
};

export function createControllableStorageAdapter(
  options: { durableMode?: DurableMode; hasDurableBackend?: boolean } = {},
): ControllableStorageAdapter {
  const local = new Map<string, string>();
  const durable = new Map<string, string>();
  const operations: DurableOperation[] = [];
  const failDurableKeys = new Set<string>();

  let durableMode: DurableMode = options.durableMode ?? 'auto';
  const hasDurable = options.hasDurableBackend ?? true;
  let completionCounter = 0;

  function startOperation(kind: DurableOperationKind, key: string, value?: string): DurableOperation {
    const operation: DurableOperation = {
      index: operations.length,
      kind,
      key,
      value,
      completionIndex: null,
      outcome: 'pending',
      deferred: createDeferred<void>(),
    };
    operations.push(operation);

    if (durableMode === 'auto') {
      void settleOperation(operation);
    }

    return operation;
  }

  /** Apply the operation's effect to the durable tier, then settle its promise. */
  async function settleOperation(operation: DurableOperation): Promise<void> {
    if (operation.outcome !== 'pending') {
      return;
    }

    operation.completionIndex = completionCounter;
    completionCounter += 1;

    if (failDurableKeys.has(operation.key) && operation.kind !== 'read') {
      // The native write threw. Production catches this and resolves anyway, so the durable
      // tier is left untouched while the caller sees a perfectly successful write.
      operation.outcome = 'failed';
      operation.deferred.resolve();
    } else {
      if (operation.kind === 'write' && typeof operation.value === 'string') {
        durable.set(operation.key, operation.value);
      }
      if (operation.kind === 'remove') {
        durable.delete(operation.key);
      }
      operation.outcome = 'resolved';
      operation.deferred.resolve();
    }

    // Let the caller's continuation (if it ever awaited) actually run.
    await Promise.resolve();
  }

  const adapter: StorageAdapter = {
    readLocal: (key) => (local.has(key) ? local.get(key)! : null),
    writeLocal: (key, value) => {
      local.set(key, value);
    },
    removeLocal: (key) => {
      local.delete(key);
    },
    localKeys: () => [...local.keys()],
    readDurable: async (key) => {
      const operation = startOperation('read', key);
      await operation.deferred.promise;
      return durable.has(key) ? durable.get(key)! : null;
    },
    writeDurable: async (key, value) => {
      const operation = startOperation('write', key, value);
      await operation.deferred.promise;
    },
    removeDurable: async (key) => {
      const operation = startOperation('remove', key);
      await operation.deferred.promise;
    },
    hasDurableBackend: async () => hasDurable,
  };

  const pendingOperations = () => operations.filter((operation) => operation.outcome === 'pending');

  return {
    adapter,
    local,
    operations,
    failDurableKeys,
    setDurableMode: (mode) => {
      durableMode = mode;
    },
    pendingOperations,
    operationsForKey: (key) => operations.filter((operation) => operation.key === key),
    settleOperation,
    settleKey: async (key) => {
      for (const operation of pendingOperations().filter((candidate) => candidate.key === key)) {
        await settleOperation(operation);
      }
    },
    settleAll: async () => {
      // Re-read the pending list each pass: settling one operation can start another.
      for (let guard = 0; guard < 50; guard += 1) {
        const pending = pendingOperations();
        if (pending.length === 0) {
          return;
        }
        for (const operation of pending) {
          await settleOperation(operation);
        }
      }
    },
    durableCompletionOrder: () =>
      operations
        .filter((operation) => operation.completionIndex !== null && operation.outcome === 'resolved')
        .sort((first, second) => (first.completionIndex ?? 0) - (second.completionIndex ?? 0))
        .map((operation) => operation.key),
    reset: () => {
      local.clear();
      durable.clear();
      operations.length = 0;
      failDurableKeys.clear();
      completionCounter = 0;
      durableMode = options.durableMode ?? 'auto';
    },
  };
}
