/**
 * Game fixtures for the backup identity / contract characterization tests.
 *
 * Questory deliberately allows a Wishlist COPY of a Library game: `addToWishlist`
 * clones the record with a new id while retaining the provider ids (steamAppId /
 * rawgId) and the title+platform. These builders make those "twins" explicit so the
 * merge-identity tests read as scenarios rather than object literals.
 */
import type { Game } from '../../src/types/game';

/** Every value `Game.externalSource` currently accepts (src/types/game.ts). */
export const supportedExternalSources = [
  'manual',
  'steam',
  'steam-wishlist',
  'retro-rom',
  'playstation-library',
  'nintendo-virtual-game-cards',
] as const satisfies readonly NonNullable<Game['externalSource']>[];

export function makeGame(overrides: Partial<Game> & { id: string; title: string }): Game {
  return {
    platform: 'PC',
    status: 'Want to play',
    coverImage: '',
    playtimeHours: 0,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    ...overrides,
  };
}

export function makeLibraryGame(overrides: Partial<Game> & { id: string; title: string }): Game {
  return makeGame({ ...overrides, collectionType: 'library' });
}

export function makeWishlistGame(overrides: Partial<Game> & { id: string; title: string }): Game {
  return makeGame({ status: 'Want to play', ...overrides, collectionType: 'wishlist' });
}

/**
 * A Library record and its Wishlist copy, sharing one identity signal.
 *
 * `identity: 'steam'` shares steamAppId, `'rawg'` shares rawgId, and
 * `'title-platform'` shares only the normalized title + platform (no provider ids) —
 * the three branches of `areGamesMatching` in backupStorage.ts.
 */
export function makeCollectionTwins(
  identity: 'steam' | 'rawg' | 'title-platform',
  overrides: { title?: string; platform?: Game['platform']; updatedAt?: string } = {},
): { library: Game; wishlist: Game } {
  const title = overrides.title ?? 'Hollow Knight';
  const platform = overrides.platform ?? 'PC';
  const updatedAt = overrides.updatedAt;

  const shared: Partial<Game> =
    identity === 'steam'
      ? { steamAppId: 367520 }
      : identity === 'rawg'
        ? { rawgId: 9767 }
        : {};

  return {
    library: makeLibraryGame({
      id: 'library-hollow-knight',
      title,
      platform,
      status: 'Playing',
      playtimeHours: 12,
      notes: 'library notes',
      updatedAt,
      ...shared,
    }),
    wishlist: makeWishlistGame({
      id: 'wishlist-hollow-knight',
      title,
      platform,
      priority: 'high',
      notes: 'wishlist notes',
      updatedAt,
      ...shared,
    }),
  };
}

/**
 * A play-activity row that survives `normalizePlayActivityRecords`.
 * `timestamp` is required — a record without it is silently dropped.
 */
export function makePlayActivityRecord(overrides: { id?: string; gameId?: string; date?: string } = {}) {
  const date = overrides.date ?? '2026-07-01';
  const timestamp = `${date}T10:00:00.000Z`;

  return {
    id: overrides.id ?? 'activity-1',
    gameId: overrides.gameId ?? 'g1',
    date,
    timestamp,
    detectedAt: timestamp,
    source: 'manual' as const,
    type: 'played_today' as const,
  };
}

/** Rows that `normalizeLoadedGame` rejects (missing/!string `id` or `title`). */
export const invalidGameRows: unknown[] = [
  null,
  'not-an-object',
  42,
  {},
  { id: 'missing-title' },
  { title: 'missing-id' },
  { id: 7, title: 'numeric id' },
  { id: 'numeric-title', title: 99 },
];
