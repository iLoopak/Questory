import type { RawgMetadata } from '../types/rawg';
import { loadLocalJson, loadPersistedJson, removePersistedKeys } from './localPersistence';
import {
  createRawgMetadataCacheRepository,
  type RawgMetadataCacheStatus,
  type RawgRecoveryMode,
  type RawgRecoveryPreview,
  type RawgRecoveryResult,
  type RawgRepairResult,
  type RawgVerification,
} from './rawgMetadataCacheRepository';

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

/**
 * Wave 4 seam. The RAWG metadata cache lives in IndexedDB via this repository, with an
 * in-memory snapshot so the read/write API below stays synchronous. The legacy
 * `questshelf.rawgMetadataCache.v1` blob is a read-only import fallback only — writes no
 * longer touch it. Public function signatures are unchanged.
 */
export const rawgMetadataCacheRepository = createRawgMetadataCacheRepository({
  legacyLoadSync: () => loadLocalJson(STORAGE_KEY, {}, normalizeRawgMetadataCache),
  legacyLoadDurable: () => loadPersistedJson(STORAGE_KEY, {}, normalizeRawgMetadataCache),
  legacyClear: () => removePersistedKeys([STORAGE_KEY]),
});

/** Awaited once at boot (before React renders) so the cache snapshot is populated. */
export function initRawgMetadataCacheRepository(): Promise<void> {
  return rawgMetadataCacheRepository.ready();
}

export function getRawgMetadataCacheStatus(): RawgMetadataCacheStatus {
  return rawgMetadataCacheRepository.getStatus();
}

// Wave 6: storage verification / repair / recovery (RAWG metadata cache).
export function verifyRawgMetadataCache(): Promise<RawgVerification> {
  return rawgMetadataCacheRepository.verify();
}

export function repairRawgMetadataCacheSnapshot(): Promise<RawgRepairResult> {
  return rawgMetadataCacheRepository.repairSnapshot();
}

export function previewLegacyRawgMetadataCacheRecovery(): Promise<RawgRecoveryPreview> {
  return rawgMetadataCacheRepository.previewLegacyRecovery();
}

export function recoverRawgMetadataCacheFromLegacyBlob(mode: RawgRecoveryMode): Promise<RawgRecoveryResult> {
  return rawgMetadataCacheRepository.recoverFromLegacyBlob(mode);
}

export function loadRawgMetadataCache(): RawgMetadataCache {
  return rawgMetadataCacheRepository.getAllSync();
}

export function getCachedRawgMetadata(title: string): RawgMetadataCacheEntry | null {
  return rawgMetadataCacheRepository.get(getRawgMetadataCacheKey(title));
}

export function saveRawgMetadataCacheEntry(entry: RawgMetadataCacheEntry) {
  rawgMetadataCacheRepository.put(getRawgMetadataCacheKey(entry.gameTitle), entry);
}

export function normalizeRawgMetadataCache(value: unknown): RawgMetadataCache {
  return value && typeof value === 'object' ? (value as RawgMetadataCache) : {};
}
