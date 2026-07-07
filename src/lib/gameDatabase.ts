// Wave 2: IndexedDB storage for the games collection (via Dexie).
//
// Only the games collection moves to IndexedDB in this wave. Every other slice stays
// on the localStorage + Capacitor Preferences path. The whole Game object is stored
// per row (structured clone), so all current and future/unknown fields are preserved
// — the indexes below are secondary and never define the stored shape.

import Dexie, { type Table } from 'dexie';
import type { Game } from '../types/game';

export const GAME_DATABASE_NAME = 'questory';
export const GAME_DB_SCHEMA_VERSION = 1;

export class QuestoryDatabase extends Dexie {
  games!: Table<Game, string>;

  constructor() {
    super(GAME_DATABASE_NAME);
    // Primary key `id` (never auto-generated — we keep the app's own Game ids).
    // Secondary indexes power future querying; undefined values are simply not indexed.
    this.version(1).stores({
      games: 'id, collectionType, status, platform, steamAppId, rawgId, updatedAt',
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
