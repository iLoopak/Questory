/**
 * Failure injection for the IndexedDB (Dexie) tier.
 *
 * `IndexedDbCollectionRepository.persistToIdb` starts a DETACHED Dexie transaction
 * (`void db.transaction(...).catch(...)`) and its `replaceAll/upsert/remove` callers
 * return `void`. To characterize that, tests need to hold the transaction open while
 * the caller runs to completion, and then release or reject it on demand.
 *
 * This gates `db.transaction` rather than the table methods: awaiting a foreign promise
 * *inside* a Dexie transaction callback would make Dexie commit the transaction early,
 * which would test the harness rather than the repository.
 *
 * Install AFTER `repository.ready()`, so the one-time legacy migration is not gated.
 */
import { createDeferred, type Deferred } from './deferred';
import type { QuestoryDatabase } from '../../src/lib/gameDatabase';

export type IdbTransactionMode = 'auto' | 'manual';

export type GatedTransaction = {
  /** Order in which the transaction was started (0-based). */
  index: number;
  /** Names of the tables the transaction was opened on, e.g. ['games']. */
  tables: string[];
  outcome: 'pending' | 'committed' | 'rejected';
  gate: Deferred<void>;
  /** Settles when the gated Dexie transaction has actually finished (or failed). */
  completion: Promise<unknown>;
};

export type IdbTransactionControl = {
  setMode: (mode: IdbTransactionMode) => void;
  /** Every gated transaction, in the order it was started. */
  transactions: GatedTransaction[];
  pendingTransactions: () => GatedTransaction[];
  /** Let a held transaction actually run against IndexedDB. */
  commit: (transaction: GatedTransaction) => Promise<void>;
  /** Commit every pending transaction, oldest first. */
  commitAll: () => Promise<void>;
  /** Fail a held transaction, as a real rejected IndexedDB write would. */
  reject: (transaction: GatedTransaction, reason?: string) => Promise<void>;
  /** Restore the original `db.transaction`. */
  restore: () => void;
};

type TransactionFn = QuestoryDatabase['transaction'];

export function installIdbTransactionControl(database: QuestoryDatabase): IdbTransactionControl {
  const originalTransaction = database.transaction.bind(database) as (...args: unknown[]) => Promise<unknown>;
  const transactions: GatedTransaction[] = [];
  let mode: IdbTransactionMode = 'manual';

  const patched = (...args: unknown[]): Promise<unknown> => {
    if (mode === 'auto') {
      return originalTransaction(...args);
    }

    const tables = args
      .filter((argument): argument is { name: string } =>
        Boolean(argument) && typeof (argument as { name?: unknown }).name === 'string',
      )
      .map((table) => table.name);

    const gate = createDeferred<void>();
    // The real transaction only runs once the gate opens; rejecting the gate
    // surfaces to the caller exactly like a failed Dexie transaction.
    const completion = gate.promise.then(() => originalTransaction(...args));
    completion.catch(() => {});

    const entry: GatedTransaction = {
      index: transactions.length,
      tables,
      outcome: 'pending',
      gate,
      completion,
    };
    transactions.push(entry);

    return completion;
  };

  (database as unknown as { transaction: unknown }).transaction = patched as unknown as TransactionFn;

  const pendingTransactions = () => transactions.filter((entry) => entry.outcome === 'pending');

  async function commit(entry: GatedTransaction): Promise<void> {
    if (entry.outcome !== 'pending') {
      return;
    }
    entry.outcome = 'committed';
    entry.gate.resolve();
    // Await the real Dexie transaction, so the data is durable when this returns.
    await entry.completion.catch(() => {});
  }

  async function reject(entry: GatedTransaction, reason = 'IndexedDB write failed.'): Promise<void> {
    if (entry.outcome !== 'pending') {
      return;
    }
    entry.outcome = 'rejected';
    entry.gate.reject(new Error(reason));
    // Let the repository's own `.catch` (fallbackToLegacy + legacySaveAll) run.
    await entry.completion.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    setMode: (nextMode) => {
      mode = nextMode;
    },
    transactions,
    pendingTransactions,
    commit,
    commitAll: async () => {
      for (const entry of pendingTransactions()) {
        await commit(entry);
      }
    },
    reject,
    restore: () => {
      (database as unknown as { transaction: unknown }).transaction = originalTransaction as unknown as TransactionFn;
    },
  };
}

/** Empty every Questory table so tests inside one bundle start from a clean store. */
export async function clearQuestoryTables(database: QuestoryDatabase): Promise<void> {
  await Promise.all([
    database.games.clear(),
    database.rawgMetadataCache.clear(),
    database.playActivity.clear(),
    database.appCaches.clear(),
  ]);
}
