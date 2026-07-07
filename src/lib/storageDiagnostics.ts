// Wave 0 storage guardrails.
//
// Lightweight, read-only diagnostics over the current localStorage-backed persistence.
// No data format changes — this only measures what is already stored, so the app can
// surface size/quota pressure before the ~5 MB localStorage cliff silently drops writes.

import { getStorageAdapter } from './storageAdapter';
import { getGameRepositoryStatus } from './gameStorage';
import { getRawgMetadataCacheStatus } from './rawgMetadataCache';
import { getPlayActivityStoreStatus } from './playActivityStorage';
import type { GameRepositoryStatus } from './indexedDbGameRepository';
import type { RawgMetadataCacheStatus } from './rawgMetadataCacheRepository';
import type { PlayActivityStoreStatus } from './indexedDbPlayActivityRepository';

const QUESTSHELF_PREFIX = 'questshelf.';
const GAMES_KEY = 'questshelf.games.v1';

export type StorageKeySize = {
  key: string;
  bytes: number;
};

export type LocalStorageBreakdown = {
  /** Total UTF-8 bytes across all `questshelf.*` keys (keys + values). */
  totalBytes: number;
  /** UTF-8 bytes of the games blob specifically. */
  gamesBytes: number;
  /** Number of `questshelf.*` keys present. */
  keyCount: number;
  /** Largest keys first, for spotting the blob(s) driving usage. */
  largestKeys: StorageKeySize[];
};

export type DeviceStorageEstimate = {
  usageBytes: number;
  quotaBytes: number;
  /** Fraction 0–1 of quota used, or null when quota is unknown. */
  usedFraction: number | null;
};

export type StorageDiagnostics = {
  local: LocalStorageBreakdown;
  device: DeviceStorageEstimate | null;
  gameStore: GameRepositoryStatus;
  rawgCacheStore: RawgMetadataCacheStatus;
  playActivityStore: PlayActivityStoreStatus;
  /** Whether the IndexedDB API exists in this environment (the store backend depends on it). */
  indexedDbAvailable: boolean;
};

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  // Fallback: UTF-16 length is a rough proxy when TextEncoder is unavailable.
  return value.length;
}

/** Synchronous size breakdown of all `questshelf.*` localStorage entries. */
export function getLocalStorageBreakdown(): LocalStorageBreakdown {
  const adapter = getStorageAdapter();
  const keys = adapter.localKeys().filter((key) => key.startsWith(QUESTSHELF_PREFIX));

  let totalBytes = 0;
  let gamesBytes = 0;
  const sizes: StorageKeySize[] = [];

  for (const key of keys) {
    const value = adapter.readLocal(key) ?? '';
    const bytes = byteLength(key) + byteLength(value);
    totalBytes += bytes;
    if (key === GAMES_KEY) {
      gamesBytes = bytes;
    }
    sizes.push({ key, bytes });
  }

  sizes.sort((a, b) => b.bytes - a.bytes);

  return {
    totalBytes,
    gamesBytes,
    keyCount: keys.length,
    largestKeys: sizes.slice(0, 6),
  };
}

/** Device-level quota estimate via the Storage API, when available. */
export async function estimateDeviceStorage(): Promise<DeviceStorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return null;
  }

  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      usageBytes: usage,
      quotaBytes: quota,
      usedFraction: quota > 0 ? usage / quota : null,
    };
  } catch {
    return null;
  }
}

/** Combined snapshot for the storage-health UI. */
export async function getStorageDiagnostics(): Promise<StorageDiagnostics> {
  return {
    local: getLocalStorageBreakdown(),
    device: await estimateDeviceStorage(),
    gameStore: getGameRepositoryStatus(),
    rawgCacheStore: getRawgMetadataCacheStatus(),
    playActivityStore: getPlayActivityStoreStatus(),
    indexedDbAvailable: typeof indexedDB !== 'undefined',
  };
}

/** Human-readable byte size, e.g. "4.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
