import { loadLocalJson, loadPersistedJson, removePersistedKeys, savePersistedJson } from './localPersistence';
import {
  createIndexedDbPlayActivityRepository,
  type PlayActivityRecoveryMode,
  type PlayActivityRecoveryPreview,
  type PlayActivityRecoveryResult,
  type PlayActivityRepairResult,
  type PlayActivityStoreStatus,
  type PlayActivityVerification,
} from './indexedDbPlayActivityRepository';

const STORAGE_KEY = 'questshelf.playActivity.v1';
export const PLAY_ACTIVITY_SOURCES = ['manual', 'steam'] as const;
export const PLAY_ACTIVITY_TYPES = ['played_today', 'playtime_delta'] as const;

export type PlayActivitySource = (typeof PLAY_ACTIVITY_SOURCES)[number];
export type PlayActivityType = (typeof PLAY_ACTIVITY_TYPES)[number];
export type PlayActivityAction = 'played_today';

export type PlayActivityRecord = {
  action?: PlayActivityAction;
  date: string;
  detectedAt: string;
  gameId: string;
  id: string;
  source: PlayActivitySource;
  timestamp: string;
  type: PlayActivityType;
  deltaMinutes?: number;
};

export type SteamPlaytimeDeltaInput = {
  currentPlaytimeMinutes: number;
  detectedAt?: Date;
  gameId: string;
  previousPlaytimeMinutes: number;
};

/**
 * Wave 4b seam. Play activity lives in IndexedDB via this repository, with an in-memory
 * snapshot so loadPlayActivity() stays synchronous for first paint. The legacy
 * `questshelf.playActivity.v1` blob is a read-only import fallback only — writes no longer
 * touch it. Public function signatures below are unchanged.
 */
export const playActivityRepository = createIndexedDbPlayActivityRepository({
  legacyLoadSync: () => loadLocalJson(STORAGE_KEY, [], normalizePlayActivityRecords),
  legacyLoadDurable: () => loadPersistedJson(STORAGE_KEY, [], normalizePlayActivityRecords),
  legacyClear: () => removePersistedKeys([STORAGE_KEY]),
  normalize: normalizePlayActivityRecords,
  legacySaveAll: (records) => savePersistedJson(STORAGE_KEY, normalizePlayActivityRecords(records)),
});

/** Awaited once at boot (before React renders) so the snapshot is populated. */
export function initPlayActivityRepository(): Promise<void> {
  return playActivityRepository.ready();
}

export function getPlayActivityStoreStatus(): PlayActivityStoreStatus {
  return playActivityRepository.getStatus();
}

// Wave 6: storage verification / repair / recovery (play activity).
export function verifyPlayActivityStorage(): Promise<PlayActivityVerification> {
  return playActivityRepository.verify();
}

export function repairPlayActivitySnapshot(): Promise<PlayActivityRepairResult> {
  return playActivityRepository.repairSnapshot();
}

export function previewLegacyPlayActivityRecovery(): Promise<PlayActivityRecoveryPreview> {
  return playActivityRepository.previewLegacyRecovery();
}

export function recoverPlayActivityFromLegacyBlob(mode: PlayActivityRecoveryMode): Promise<PlayActivityRecoveryResult> {
  return playActivityRepository.recoverFromLegacyBlob(mode);
}

export function loadPlayActivity(): PlayActivityRecord[] {
  return playActivityRepository.getAllSync();
}

export function loadPlayActivityFromPersistentStorage(): Promise<PlayActivityRecord[]> {
  return playActivityRepository.loadDurable();
}

export function savePlayActivity(records: PlayActivityRecord[]) {
  playActivityRepository.replaceAll(normalizePlayActivityRecords(records));
}

export function createPlayedTodayRecord(gameId: string, now = new Date()): PlayActivityRecord {
  const date = formatLocalDate(now);
  const timestamp = now.toISOString();
  return {
    action: 'played_today',
    date,
    detectedAt: timestamp,
    gameId,
    id: getDailyPlayActivityRecordId(gameId, date, 'played_today', 'manual'),
    source: 'manual',
    timestamp,
    type: 'played_today',
  };
}

export function createSteamPlaytimeDeltaRecord({ currentPlaytimeMinutes, detectedAt = new Date(), gameId, previousPlaytimeMinutes }: SteamPlaytimeDeltaInput): PlayActivityRecord | null {
  const deltaMinutes = Math.max(0, Math.round(currentPlaytimeMinutes) - Math.round(previousPlaytimeMinutes));
  if (deltaMinutes <= 0) {
    return null;
  }

  const timestamp = detectedAt.toISOString();
  return {
    date: formatLocalDate(detectedAt),
    detectedAt: timestamp,
    deltaMinutes,
    gameId,
    id: getSteamPlaytimeDeltaRecordId(gameId, timestamp, deltaMinutes),
    source: 'steam',
    timestamp,
    type: 'playtime_delta',
  };
}

export function upsertPlayedTodayActivity(records: PlayActivityRecord[], gameId: string, now = new Date()) {
  const nextRecord = createPlayedTodayRecord(gameId, now);
  const existingIndex = records.findIndex(
    (record) => record.gameId === gameId && record.date === nextRecord.date && record.type === nextRecord.type && record.source === nextRecord.source,
  );

  if (existingIndex >= 0) {
    return records.map((record, index) => (index === existingIndex ? { ...record, detectedAt: nextRecord.detectedAt, id: nextRecord.id, timestamp: nextRecord.timestamp } : record));
  }

  return normalizePlayActivityRecords([...records, nextRecord]);
}

export function appendSteamPlaytimeDeltaActivity(records: PlayActivityRecord[], deltaRecords: PlayActivityRecord[]) {
  return normalizePlayActivityRecords([...records, ...deltaRecords]);
}

export function getRecentSteamActivityForGame(records: PlayActivityRecord[], gameId: string) {
  return records
    .filter((record) => record.gameId === gameId && record.source === 'steam' && record.type === 'playtime_delta')
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0] ?? null;
}

export function getSteamActivityRecordsSince(records: PlayActivityRecord[], since: Date) {
  const sinceTime = since.getTime();
  return records.filter((record) => record.source === 'steam' && record.type === 'playtime_delta' && Date.parse(record.detectedAt) >= sinceTime);
}

export function getMostActiveGameIdBySteamActivity(records: PlayActivityRecord[], since: Date) {
  const totals = new Map<string, number>();
  getSteamActivityRecordsSince(records, since).forEach((record) => {
    totals.set(record.gameId, (totals.get(record.gameId) ?? 0) + (record.deltaMinutes ?? 0));
  });
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyPlayActivityRecordId(gameId: string, date: string, type: PlayActivityType, source: PlayActivitySource) {
  return `${source}:${type}:${gameId}:${date}`;
}

export function getSteamPlaytimeDeltaRecordId(gameId: string, timestamp: string, deltaMinutes: number) {
  return `steam:playtime_delta:${gameId}:${timestamp}:${deltaMinutes}`;
}

export function getPlayActivityRecordId(gameId: string, date: string, action: PlayActivityAction) {
  return getDailyPlayActivityRecordId(gameId, date, action, 'manual');
}

export function normalizePlayActivityRecords(value: unknown): PlayActivityRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const records: PlayActivityRecord[] = [];

  value.forEach((item) => {
    const record = normalizePlayActivityRecord(item);
    if (!record || seenKeys.has(record.id)) {
      return;
    }

    seenKeys.add(record.id);
    records.push(record);
  });

  return records.sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
}

function normalizePlayActivityRecord(value: unknown): PlayActivityRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<PlayActivityRecord>;
  const legacyAction = record.action === 'played_today' ? record.action : null;
  const type = record.type === 'playtime_delta' || record.type === 'played_today' ? record.type : legacyAction;
  const source = record.source === 'steam' || record.source === 'manual' ? record.source : 'manual';
  const date = typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date) ? record.date : null;
  const gameId = typeof record.gameId === 'string' && record.gameId.trim() ? record.gameId : null;
  const timestamp = typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp)) ? record.timestamp : null;
  const detectedAt = typeof record.detectedAt === 'string' && !Number.isNaN(Date.parse(record.detectedAt)) ? record.detectedAt : timestamp;
  const deltaMinutes = typeof record.deltaMinutes === 'number' && Number.isFinite(record.deltaMinutes) && record.deltaMinutes > 0 ? Math.round(record.deltaMinutes) : undefined;

  if (!type || !date || !gameId || !timestamp || !detectedAt) {
    return null;
  }

  if (type === 'playtime_delta') {
    if (source !== 'steam' || !deltaMinutes) {
      return null;
    }
    return { date, detectedAt, deltaMinutes, gameId, id: getSteamPlaytimeDeltaRecordId(gameId, detectedAt, deltaMinutes), source, timestamp, type };
  }

  return { action: 'played_today', date, detectedAt, gameId, id: getDailyPlayActivityRecordId(gameId, date, 'played_today', source), source, timestamp, type };
}
