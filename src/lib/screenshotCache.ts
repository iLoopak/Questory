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

function hydrateStore(): void {
  if (hydrated) return;
  hydrated = true;
  storeSnapshot = readLegacyStore();
  void readAppCacheValue<ScreenshotStore>(STORAGE_KEY).then((stored) => {
    if (stored && Object.keys(stored).length > 0) storeSnapshot = stored;
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
