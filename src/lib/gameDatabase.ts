// Wave 2/4: IndexedDB storage for Questory's heavy collections (via Dexie).
//
// Wave 2 added the games store. Wave 4 adds the RAWG metadata cache store. Only
// unbounded/heavy collections live here; small settings stay on the localStorage +
// Capacitor Preferences path. Whole objects are stored per row (structured clone),
// so all current and future/unknown fields are preserved — indexes are secondary.

import Dexie, { type Table } from 'dexie';
import type { Game } from '../types/game';
import type { RawgMetadataCacheEntry } from './rawgMetadataCache';

export const GAME_DATABASE_NAME = 'questory';
/** Dexie schema version for the shared Questory database. Bumped when a store is added. */
export const QUESTORY_DB_VERSION = 2;

/** RAWG cache row: the entry plus its cache key as the inbound primary key. */
export type RawgMetadataCacheRow = { key: string } & RawgMetadataCacheEntry;

export class QuestoryDatabase extends Dexie {
  games!: Table<Game, string>;
  rawgMetadataCache!: Table<RawgMetadataCacheRow, string>;

  constructor() {
    super(GAME_DATABASE_NAME);
    // v1 (Wave 2): games. Primary key `id` (never auto-generated — the app's own ids).
    this.version(1).stores({
      games: 'id, collectionType, status, platform, steamAppId, rawgId, updatedAt',
    });
    // v2 (Wave 4): add the RAWG metadata cache, keyed by the existing cache key.
    this.version(2).stores({
      games: 'id, collectionType, status, platform, steamAppId, rawgId, updatedAt',
      rawgMetadataCache: 'key, rawgId, cachedAt',
    });
  }
}

let database: QuestoryDatabase | null = null;

/** Lazily construct the Dexie database. Returns null when IndexedDB is unavailable. */
export function getGameDatabase(): QuestoryDatabase | null {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  if (!database) {
    try {
      database = new QuestoryDatabase();
    } catch {
      return null;
    }
  }

  return database;
}
