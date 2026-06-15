import { loadLocalJson, loadPersistedJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.playActivity.v1';
const PLAY_ACTIVITY_ACTIONS = ['played_today'] as const;

export type PlayActivityAction = (typeof PLAY_ACTIVITY_ACTIONS)[number];

export type PlayActivityRecord = {
  action: PlayActivityAction;
  date: string;
  gameId: string;
  id: string;
  timestamp: string;
};

export function loadPlayActivity(): PlayActivityRecord[] {
  return loadLocalJson(STORAGE_KEY, [], normalizePlayActivityRecords);
}

export function loadPlayActivityFromPersistentStorage(): Promise<PlayActivityRecord[]> {
  return loadPersistedJson(STORAGE_KEY, [], normalizePlayActivityRecords);
}

export function savePlayActivity(records: PlayActivityRecord[]) {
  savePersistedJson(STORAGE_KEY, normalizePlayActivityRecords(records));
}

export function createPlayedTodayRecord(gameId: string, now = new Date()): PlayActivityRecord {
  const date = formatLocalDate(now);
  return {
    action: 'played_today',
    date,
    gameId,
    id: getPlayActivityRecordId(gameId, date, 'played_today'),
    timestamp: now.toISOString(),
  };
}

export function upsertPlayedTodayActivity(records: PlayActivityRecord[], gameId: string, now = new Date()) {
  const nextRecord = createPlayedTodayRecord(gameId, now);
  const existingIndex = records.findIndex(
    (record) => record.gameId === gameId && record.date === nextRecord.date && record.action === nextRecord.action,
  );

  if (existingIndex >= 0) {
    return records.map((record, index) => (index === existingIndex ? { ...record, id: nextRecord.id } : record));
  }

  return [...records, nextRecord];
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPlayActivityRecordId(gameId: string, date: string, action: PlayActivityAction) {
  return `${action}:${gameId}:${date}`;
}

export function normalizePlayActivityRecords(value: unknown): PlayActivityRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenKeys = new Set<string>();
  const records: PlayActivityRecord[] = [];

  value.forEach((item) => {
    const record = normalizePlayActivityRecord(item);
    if (!record) {
      return;
    }

    const uniqueKey = getPlayActivityRecordId(record.gameId, record.date, record.action);
    if (seenKeys.has(uniqueKey)) {
      return;
    }

    seenKeys.add(uniqueKey);
    records.push({ ...record, id: uniqueKey });
  });

  return records.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function normalizePlayActivityRecord(value: unknown): PlayActivityRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<PlayActivityRecord>;
  const action = record.action === 'played_today' ? record.action : null;
  const date = typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date) ? record.date : null;
  const gameId = typeof record.gameId === 'string' && record.gameId.trim() ? record.gameId : null;
  const timestamp = typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp)) ? record.timestamp : null;

  if (!action || !date || !gameId || !timestamp) {
    return null;
  }

  return {
    action,
    date,
    gameId,
    id: getPlayActivityRecordId(gameId, date, action),
    timestamp,
  };
}
