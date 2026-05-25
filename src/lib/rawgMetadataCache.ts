import type { RawgMetadata } from '../types/rawg';

const STORAGE_KEY = 'questshelf.rawgMetadataCache.v1';

const isBrowser = typeof window !== 'undefined';

export type RawgMetadataCacheEntry = {
  gameTitle: string;
  rawgId: number;
  metadata: RawgMetadata;
  cachedAt: string;
};

type RawgMetadataCache = Record<string, RawgMetadataCacheEntry>;

export function getRawgMetadataCacheKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function loadRawgMetadataCache(): RawgMetadataCache {
  if (!isBrowser) {
    return {};
  }

  const storedCache = window.localStorage.getItem(STORAGE_KEY);

  if (!storedCache) {
    return {};
  }

  try {
    const parsedCache = JSON.parse(storedCache) as RawgMetadataCache;
    return parsedCache && typeof parsedCache === 'object' ? parsedCache : {};
  } catch {
    return {};
  }
}

export function getCachedRawgMetadata(title: string): RawgMetadataCacheEntry | null {
  const cache = loadRawgMetadataCache();
  return cache[getRawgMetadataCacheKey(title)] ?? null;
}

export function saveRawgMetadataCacheEntry(entry: RawgMetadataCacheEntry) {
  if (!isBrowser) {
    return;
  }

  const cache = loadRawgMetadataCache();
  cache[getRawgMetadataCacheKey(entry.gameTitle)] = entry;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}
