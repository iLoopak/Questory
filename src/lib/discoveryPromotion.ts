// AS-09: one way to turn a Discovery candidate into a real Questory record.
//
// There used to be two conversions and two identity checks. The preview adapter
// (`discoveryGameToGame`) used the candidate's actual platform and kept its tags; the persisted
// adapter (`AppController.createGameFromDiscovery`) hardcoded every non-Steam candidate to `PC` and
// dropped the tags entirely. Preview promotion looked for an existing record; Inbox promotion always
// minted a new one. So a PS5-only recommendation previewed as PS5 and persisted as a tagless PC
// game, an already-imported game could be duplicated from a stale Inbox item, and the Plans path
// could hand the backlog picker a synthetic `rawg-…` id that no persisted game ever had.
//
// This module is the whole decision, and it is pure:
//
//   1. PLATFORM — provider labels normalized through one table, no invented console ownership;
//   2. MAPPER   — candidate → proposed `Game`, the same payload whatever surface asked;
//   3. IDENTITY — the proposed game resolved against the LATEST canonical games, provider ids
//                 first, weak title matches last and never when they are ambiguous;
//   4. PLAN     — what the caller must do (reuse / move / create) and which canonical id comes out.
//
// Nothing here writes state or knows about React. The caller applies the plan and, for Plans, only
// ever passes the resolved canonical id to the Platform Plans command.

import { gamePlatforms, type Game, type GameCollectionType, type GamePlatform } from '../types/game';
import type { DiscoveryGame } from './discovery';
import { getSharedGameIdentitySignal, type GameIdentitySignal } from './gameIdentity';

export type DiscoveryPromotionDestination = 'library' | 'wishlist' | 'plans';

/**
 * Platforms Questory can own a game on beyond `gamePlatforms`. `GamePlatform` is a widened string,
 * and Platform Plans already suggests `Xbox Series X|S`, so these are real destinations — they are
 * simply not in the enum.
 */
const additionalSupportedPlatforms = ['Xbox Series X|S', 'Xbox One', 'Xbox 360', 'Mac', 'Linux', 'iOS'] as const;

const supportedPlatforms = new Set<string>([...gamePlatforms, ...additionalSupportedPlatforms]);

/**
 * Provider platform labels → Questory platforms.
 *
 * `mapRawgResult` already abbreviates some RAWG names (`PlayStation 5` → `PS5`), so both spellings
 * arrive here depending on the pipeline. A label that maps to nothing is not a platform we can own
 * a game on, and it is skipped rather than guessed at.
 */
const platformAliases: Record<string, GamePlatform> = {
  'pc': 'PC',
  'steam': 'Steam',
  'windows': 'PC',
  'macos': 'Mac',
  'mac': 'Mac',
  'linux': 'Linux',
  'ios': 'iOS',
  'android': 'Android',
  'playstation 5': 'PS5',
  'ps5': 'PS5',
  'playstation 4': 'PS4',
  'ps4': 'PS4',
  'playstation 3': 'Other',
  'ps3': 'Other',
  'playstation 2': 'PS2',
  'ps2': 'PS2',
  'playstation': 'PS1',
  'ps1': 'PS1',
  'psp': 'PSP',
  'ps vita': 'PS Vita',
  'playstation vita': 'PS Vita',
  'nintendo switch': 'Switch',
  'switch': 'Switch',
  'nintendo switch 2': 'Switch 2',
  'switch 2': 'Switch 2',
  'xbox series s/x': 'Xbox Series X|S',
  'xbox series x|s': 'Xbox Series X|S',
  'xbox': 'Xbox Series X|S',
  'xbox one': 'Xbox One',
  'xbox 360': 'Xbox 360',
  'wii u': 'Wii U',
  'wii': 'Wii',
  'gamecube': 'GameCube',
  'nintendo ds': 'Nintendo DS',
  'nintendo 3ds': 'Nintendo DS',
  'nintendo 64': 'Nintendo 64',
  'snes': 'SNES',
  'nes': 'NES',
  'game boy': 'Game Boy',
  'game boy color': 'Game Boy Color',
  'game boy advance': 'Game Boy Advance',
};

/** A single provider label, or `null` when it names no platform Questory can own a game on. */
export function normalizeDiscoveryPlatform(label: string | null | undefined): GamePlatform | null {
  const normalized = (label ?? '').trim();
  if (!normalized) return null;

  const alias = platformAliases[normalized.toLowerCase()];
  if (alias) return alias;

  return supportedPlatforms.has(normalized) ? (normalized as GamePlatform) : null;
}

/** Every platform the candidate is actually available on, in the provider's order, de-duplicated. */
export function resolveDiscoveryPlatforms(game: DiscoveryGame): GamePlatform[] {
  const platforms: GamePlatform[] = [];

  for (const label of game.platforms) {
    const platform = normalizeDiscoveryPlatform(label);
    if (platform && !platforms.includes(platform)) {
      platforms.push(platform);
    }
  }

  return platforms;
}

/**
 * The one platform the record is created on.
 *
 * A Steam version wins — that is the rule both adapters already used, and it is the platform the
 * user is most likely to own the game on. Otherwise the FIRST actual platform the candidate reports
 * is kept, which is what the preview has always shown. `Other` is the fallback when a candidate
 * names no platform we recognize: it is honest, where the old `PC` default silently claimed a PC
 * copy of a PS5-only game.
 */
export function resolveDiscoveryPlatform(game: DiscoveryGame): GamePlatform {
  if (game.hasSteamVersion) return 'Steam';
  return resolveDiscoveryPlatforms(game)[0] ?? 'Other';
}

/** Deterministic, collision-free id in the shape the discovery import has always used. */
export function createDiscoveryGameId(game: DiscoveryGame, existingIds: Set<string>): string {
  const slug = game.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
  let id = `rawg-${slug}`;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `rawg-${slug}-${suffix}`;
    suffix += 1;
  }
  return id;
}

export type DiscoveryGameMapperOptions = {
  id: string;
  now: Date;
  collectionType?: GameCollectionType;
};

/**
 * Candidate → proposed canonical `Game`. The one conversion, shared by preview, Inbox and every
 * destination, so they can no longer disagree about platform, tags or provenance.
 *
 * Preview-only fields (badges, reasons, scores, available actions, the recommendation source) are
 * NOT part of a Game and never reach persistence.
 */
export function mapDiscoveryCandidateToGame(
  game: DiscoveryGame,
  { id, now, collectionType = 'library' }: DiscoveryGameMapperOptions,
): Game {
  const timestamp = now.toISOString();

  return {
    id,
    title: game.title,
    platform: resolveDiscoveryPlatform(game),
    status: 'Want to play',
    coverImage: game.coverUrl ?? '',
    artworkSource: game.coverUrl ? 'rawg' : undefined,
    artworkUpdatedAt: game.coverUrl ? timestamp : undefined,
    backgroundImage: game.coverUrl,
    playtimeHours: 0,
    // The candidate's tags survive persistence now. `tags` is the user-facing list the rest of the
    // app filters on, so it stays capped the way the preview capped it; the full provider list is
    // kept in `rawgTags`, which is where every other RAWG path puts it.
    tags: game.tags.slice(0, 5),
    rawgTags: game.tags.length > 0 ? game.tags : undefined,
    lastPlayedAt: null,
    notes: '',
    collectionType,
    externalSource: 'manual',
    importedAt: timestamp,
    rawgId: game.rawgId,
    rawgSlug: game.slug ?? undefined,
    rawgTitle: game.title,
    metacritic: game.metacritic,
    metacriticScore: game.metacritic ?? undefined,
    rawgRating: game.rawgRating,
    rawgRatingsCount: game.rawgRatingsCount,
    released: game.released,
    genres: game.genres.length > 0 ? game.genres : undefined,
    metadataSource: 'rawg',
    metadataUpdatedAt: timestamp,
  };
}

export type DiscoveryIdentityMatch = {
  game: Game;
  signal: GameIdentitySignal;
};

export type DiscoveryIdentityResolution = {
  library: DiscoveryIdentityMatch | null;
  wishlist: DiscoveryIdentityMatch | null;
  /**
   * True when the only thing that matched was a weak title+platform signal and MORE THAN ONE record
   * matched it. Reusing one of them could overwrite the wrong game, so the caller must not.
   */
  ambiguous: boolean;
};

const strongSignals: GameIdentitySignal[] = ['id', 'steam-app-id', 'rawg-id', 'rom-path'];

/**
 * Resolve the proposed game against the latest canonical games, per collection.
 *
 * Provider ids beat titles: a Steam id, a RAWG id or a ROM path identifies the record outright,
 * and only when none of them match does a normalized title+platform count — and then only when
 * exactly one record matches it. Library and Wishlist are resolved SEPARATELY, because a Wishlist
 * copy of a Library game is a legitimate twin (`gameIdentity`), not a duplicate to collapse.
 */
export function resolveDiscoveryIdentity(proposed: Game, games: Game[]): DiscoveryIdentityResolution {
  const library = resolveInCollection(proposed, games, 'library');
  const wishlist = resolveInCollection(proposed, games, 'wishlist');

  return {
    library: library.match,
    wishlist: wishlist.match,
    ambiguous: library.ambiguous || wishlist.ambiguous,
  };
}

function resolveInCollection(
  proposed: Game,
  games: Game[],
  collectionType: GameCollectionType,
): { match: DiscoveryIdentityMatch | null; ambiguous: boolean } {
  const candidates = games
    .filter((game) => game.collectionType === collectionType)
    .map((game) => ({ game, signal: getSharedGameIdentitySignal(game, { ...proposed, collectionType }) }))
    .filter((entry): entry is DiscoveryIdentityMatch => entry.signal !== null);

  const strong = candidates.find((entry) => strongSignals.includes(entry.signal));
  if (strong) return { match: strong, ambiguous: false };

  const weak = candidates.filter((entry) => entry.signal === 'title-platform');
  if (weak.length === 1) return { match: weak[0], ambiguous: false };

  // Zero weak matches is simply "no record". Two or more is ambiguous: the candidate names a title
  // and platform that several records share, and picking one of them is a coin flip.
  return { match: null, ambiguous: weak.length > 1 };
}

/** What the caller must actually do. Each variant names the records it touches — nothing implicit. */
export type DiscoveryPromotionAction =
  /** The destination already holds this game. Nothing is written. */
  | { kind: 'none' }
  /** Create this Library record (Plans creates one too — a Plan entry references a real game). */
  | { kind: 'create-library'; game: Game }
  /** Create a Wishlist record for a candidate the user does not own. */
  | { kind: 'create-wishlist'; game: Game }
  /** Wishlist the EXISTING Library record, so the twin keeps its provider ids and artwork. */
  | { kind: 'wishlist-existing'; game: Game }
  /** Promote the existing Wishlist copy in place. No second record is created. */
  | { kind: 'move-to-library'; game: Game };

export type DiscoveryPromotionOutcome = 'created' | 'reused' | 'already-present' | 'failed';

export type DiscoveryPromotionPlan = {
  destination: DiscoveryPromotionDestination;
  /** What the caller should report. `reused` means an existing record was adopted, not created. */
  outcome: DiscoveryPromotionOutcome;
  action: DiscoveryPromotionAction;
  /**
   * The canonical game id the promotion resolves to — an existing record's id, or the id the
   * action will create. This, and never the candidate's synthetic id, is what a Plan entry gets.
   */
  gameId: string;
  /** True when the plan resolved through an unusable weak match, so a new record is being made. */
  ambiguous: boolean;
  reason?: string;
};

export type PlanDiscoveryPromotionInput = {
  candidate: DiscoveryGame;
  destination: DiscoveryPromotionDestination;
  /** The LATEST canonical games. Never the snapshot a preview opened with. */
  games: Game[];
  now: Date;
};

/**
 * The whole promotion decision.
 *
 * Plans is deliberately Library-shaped: a Plan entry references a persisted game, so promoting an
 * unowned candidate to Platform Plans also creates (or adopts) its Library record — the same rule
 * "Add to Library" follows, and the behavior the picker already relied on. What changes is that the
 * picker now receives the id of that real record.
 */
export function planDiscoveryPromotion({
  candidate,
  destination,
  games,
  now,
}: PlanDiscoveryPromotionInput): DiscoveryPromotionPlan {
  const existingIds = new Set(games.map((game) => game.id));
  const proposed = mapDiscoveryCandidateToGame(candidate, {
    id: createDiscoveryGameId(candidate, existingIds),
    now,
    collectionType: destination === 'wishlist' ? 'wishlist' : 'library',
  });
  const identity = resolveDiscoveryIdentity(proposed, games);
  const ambiguous = identity.ambiguous;

  if (destination === 'wishlist') {
    if (identity.wishlist) {
      return {
        destination,
        outcome: 'already-present',
        action: { kind: 'none' },
        gameId: identity.wishlist.game.id,
        ambiguous,
        reason: `wishlist-match:${identity.wishlist.signal}`,
      };
    }

    // An owned Library record stays owned. Wishlisting it copies it (the existing twin rule) rather
    // than rewriting the record the user already has.
    if (identity.library) {
      return {
        destination,
        outcome: 'created',
        action: { kind: 'wishlist-existing', game: identity.library.game },
        gameId: identity.library.game.id,
        ambiguous,
        reason: `library-twin:${identity.library.signal}`,
      };
    }

    return {
      destination,
      outcome: 'created',
      action: { kind: 'create-wishlist', game: proposed },
      gameId: proposed.id,
      ambiguous,
    };
  }

  if (identity.library) {
    return {
      destination,
      outcome: 'already-present',
      action: { kind: 'none' },
      gameId: identity.library.game.id,
      ambiguous,
      reason: `library-match:${identity.library.signal}`,
    };
  }

  if (identity.wishlist) {
    return {
      destination,
      outcome: 'reused',
      action: { kind: 'move-to-library', game: identity.wishlist.game },
      gameId: identity.wishlist.game.id,
      ambiguous,
      reason: `wishlist-match:${identity.wishlist.signal}`,
    };
  }

  return {
    destination,
    outcome: 'created',
    action: { kind: 'create-library', game: proposed },
    gameId: proposed.id,
    ambiguous,
  };
}
