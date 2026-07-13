/**
 * Test-only persistence harness for the collection fallback boundary.
 *
 * It deliberately keeps the three durable tiers separate:
 *   - a real fake-indexeddb Dexie table,
 *   - the adapter's synchronous localStorage map,
 *   - the adapter's Capacitor Preferences map.
 *
 * A fresh repository instance models an application/repository restart while the
 * underlying stores stay intact. Production modules are not given reset hooks just
 * to make restart behavior testable.
 */
import type { Table } from 'dexie';
import type { QuestoryDatabase } from '../../src/lib/gameDatabase';
import {
  createIndexedDbCollectionRepository,
  type IndexedDbCollectionRepository,
} from '../../src/lib/indexedDbCollectionRepository';
import { setStorageAdapter } from '../../src/lib/storageAdapter';
import { createControllableStorageAdapter } from './controllableStorageAdapter';
import { installIdbTransactionControl } from './indexedDbControl';

export function createPersistenceFailureHarness<T extends { id: string }>(options: {
  database: QuestoryDatabase;
  legacyKey: string;
  table: Table<T, string>;
  normalize: (value: unknown) => T[];
}) {
  const storage = createControllableStorageAdapter({ durableMode: 'auto' });
  setStorageAdapter(storage.adapter);

  const parse = (value: string | null): T[] => {
    if (value === null) return [];
    try {
      return options.normalize(JSON.parse(value));
    } catch {
      return [];
    }
  };

  const createRepository = (): IndexedDbCollectionRepository<T> =>
    createIndexedDbCollectionRepository<T>({
      legacyKey: options.legacyKey,
      getTable: () => options.table,
      io: {
        legacyLoadSync: () => parse(storage.adapter.readLocal(options.legacyKey)),
        legacyLoadDurable: async () => parse(await storage.adapter.readDurable(options.legacyKey)),
        legacyClear: async () => {
          storage.adapter.removeLocal(options.legacyKey);
          await storage.adapter.removeDurable(options.legacyKey);
        },
        normalize: options.normalize,
        legacySaveAll: (items) => {
          const serialized = JSON.stringify(items);
          storage.adapter.writeLocal(options.legacyKey, serialized);
          void storage.adapter.writeDurable(options.legacyKey, serialized);
        },
      },
    });

  return {
    storage,
    createRepository,
    /** A new repository object with the same stores is the restart seam. */
    restart: createRepository,
    controlIndexedDb: () => installIdbTransactionControl(options.database),
    inspectIndexedDb: () => options.table.toArray(),
    inspectLocalStorage: () => parse(storage.local.get(options.legacyKey) ?? null),
    inspectPreferences: () => parse(storage.durable.get(options.legacyKey) ?? null),
  };
}
