import type { RawgMetadata } from '../types/rawg';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.rawgMetadataCache.v1';

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
  return loadLocalJson(STORAGE_KEY, {}, normalizeRawgMetadataCache);
}

export function getCachedRawgMetadata(title: string): RawgMetadataCacheEntry | null {
  const cache = loadRawgMetadataCache();
  return cache[getRawgMetadataCacheKey(title)] ?? null;
}

export function saveRawgMetadataCacheEntry(entry: RawgMetadataCacheEntry) {
  const cache = loadRawgMetadataCache();
  cache[getRawgMetadataCacheKey(entry.gameTitle)] = entry;
  savePersistedJson(STORAGE_KEY, normalizeRawgMetadataCache(cache));
}

export function normalizeRawgMetadataCache(value: unknown): RawgMetadataCache {
  return value && typeof value === 'object' ? (value as RawgMetadataCache) : {};
}
