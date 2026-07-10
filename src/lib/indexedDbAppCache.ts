import { getGameDatabase } from './gameDatabase';
import { getStorageAdapter } from './storageAdapter';

const migratedKeys = new Set<string>();

export type AppCacheStatus = {
  backend: 'indexeddb' | 'unavailable';
  keyCount: number;
  lastError: string | null;
};

let lastError: string | null = null;

export async function readAppCacheValue<T>(key: string): Promise<T | null> {
  await migrateLegacyAppCacheKey(key);
  const db = getGameDatabase();
  if (!db) return null;
  try {
    const row = await db.appCaches.get(key);
    return (row?.value as T | undefined) ?? null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'IndexedDB read failed.';
    return null;
  }
}

export async function writeAppCacheValue(key: string, value: unknown): Promise<void> {
  const db = getGameDatabase();
  if (!db) return;
  try {
    await db.appCaches.put({ key, value, updatedAt: Date.now() });
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'IndexedDB write failed.';
  }
}

export async function removeAppCacheValue(key: string): Promise<void> {
  const db = getGameDatabase();
  if (!db) return;
  try {
    await db.appCaches.delete(key);
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'IndexedDB delete failed.';
  }
}

export async function migrateLegacyAppCacheKey(key: string): Promise<void> {
  if (migratedKeys.has(key)) return;
  migratedKeys.add(key);
  const adapter = getStorageAdapter();
  const raw = adapter.readLocal(key) ?? await adapter.readDurable(key);
  if (raw == null) return;
  const db = getGameDatabase();
  if (!db) return;
  try {
    const existing = await db.appCaches.get(key);
    if (!existing) {
      await db.appCaches.put({ key, value: JSON.parse(raw), updatedAt: Date.now() });
    }
    const verified = await db.appCaches.get(key);
    if (verified) {
      adapter.removeLocal(key);
      void adapter.removeDurable(key);
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Legacy cache migration failed.';
  }
}

export async function getAppCacheStatus(): Promise<AppCacheStatus> {
  const db = getGameDatabase();
  if (!db) return { backend: 'unavailable', keyCount: 0, lastError };
  try {
    return { backend: 'indexeddb', keyCount: await db.appCaches.count(), lastError };
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'IndexedDB status failed.';
    return { backend: 'unavailable', keyCount: 0, lastError };
  }
}
