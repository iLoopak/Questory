import type { Game } from '../types/game';
import { normalizeTitle } from './rawgMatchScoring';
import { readAppCacheValue, removeAppCacheValue, writeAppCacheValue } from './indexedDbAppCache';

const STORAGE_KEY = 'questshelf.screenshots.v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type ScreenshotEntry = {
  urls: string[];
  provider: string;
  cachedAt: number;
};

type ScreenshotStore = Record<string, ScreenshotEntry>;

// Primary key: rawgId when known (stable). Fallback: normalized title + platform.
function entryKey(game: Game): string {
  if (game.rawgId) return `rawg:${game.rawgId}`;
  return `title:${normalizeTitle(game.title)}:${game.platform}`;
}

let storeSnapshot: ScreenshotStore = {};
let hydrated = false;

function readLegacyStore(): ScreenshotStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ScreenshotStore) : {};
  } catch {
    return {};
  }
}

/**
 * AS-13: hydration MERGES; it never replaces.
 *
 * The IndexedDB read is asynchronous, and it used to assign the whole stored object over
 * `storeSnapshot` when it landed — so a screenshot fetched from the network while the read was in
 * flight was silently thrown away and replaced by the older record. Entries are now merged one by
 * one, and the newer `cachedAt` wins, so a fresh network result always survives a late hydration.
 */
export function mergeScreenshotStores(current: ScreenshotStore, hydrated: ScreenshotStore): ScreenshotStore {
  const merged: ScreenshotStore = { ...hydrated };

  for (const [key, entry] of Object.entries(current)) {
    const stored = merged[key];
    if (!stored || entry.cachedAt >= stored.cachedAt) {
      merged[key] = entry;
    }
  }

  return merged;
}

function hydrateStore(): void {
  if (hydrated) return;
  hydrated = true;
  storeSnapshot = readLegacyStore();
  void readAppCacheValue<ScreenshotStore>(STORAGE_KEY).then((stored) => {
    if (!stored || typeof stored !== 'object') return;
    storeSnapshot = mergeScreenshotStores(storeSnapshot, stored);
  });
}

function readStore(): ScreenshotStore {
  hydrateStore();
  return storeSnapshot;
}

function writeStore(store: ScreenshotStore): void {
  storeSnapshot = store;
  void writeAppCacheValue(STORAGE_KEY, store);
}

/** Returns cached screenshot URLs, or null if the entry is absent or expired. */
export function getCachedScreenshots(game: Game): string[] | null {
  const store = readStore();
  const entry = store[entryKey(game)];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) return null;
  return entry.urls;
}

/** Persists screenshot URLs for a game. Passing an empty array records "no screenshots found". */
export function setCachedScreenshots(game: Game, urls: string[], provider: string): void {
  const store = readStore();
  store[entryKey(game)] = { urls, provider, cachedAt: Date.now() };
  writeStore(store);
}

/** Removes the cache entry for a game so the next load triggers a fresh fetch. */
/** AS-18: Reset Local Data owns this cache too — it used to survive a reset in IndexedDB. */
export function clearAllCachedScreenshots(): Promise<void> {
  storeSnapshot = {};
  return removeAppCacheValue(STORAGE_KEY);
}

export function clearCachedScreenshots(game: Game): void {
  const store = readStore();
  delete store[entryKey(game)];
  writeStore(store);
  if (Object.keys(store).length === 0) void removeAppCacheValue(STORAGE_KEY);
}

// ── rawgId-based helpers (for DiscoveryGame which has rawgId but not the full Game type) ──

/** Returns cached screenshots by rawgId, or null if absent/expired. */
export function getCachedScreenshotsByRawgId(rawgId: number): string[] | null {
  const store = readStore();
  const entry = store[`rawg:${rawgId}`];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) return null;
  return entry.urls;
}

/** Persists screenshots by rawgId into the shared cache. */
export function setCachedScreenshotsByRawgId(rawgId: number, urls: string[]): void {
  const store = readStore();
  store[`rawg:${rawgId}`] = { urls, provider: 'rawg', cachedAt: Date.now() };
  writeStore(store);
}
