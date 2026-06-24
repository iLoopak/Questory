import type { Game } from '../types/game';
import { normalizeTitle } from './rawgMatchScoring';

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

function readStore(): ScreenshotStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ScreenshotStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ScreenshotStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota/unavailability errors — screenshots are a best-effort enrichment.
  }
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
}
