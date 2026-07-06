import type { Game } from '../types/game';

export interface DiscoveryGame {
  rawgId: number;
  title: string;
  coverUrl: string | null;
  metacritic: number | null;
  platforms: string[];
  hasSteamVersion: boolean;
  genres: string[];
  /** RAWG tag slugs — used for semantic similarity scoring. */
  tags: string[];
  released: string | null;
  slug: string | null;
}

// Pipeline type that carries library context alongside each game.
// score is reserved for future ranking passes — currently 0 for non-owned,
// -1 for owned so owned games naturally sort after unknowns.
export type DiscoveryCandidateStatus = 'library' | 'wishlist' | null;
export type DiscoveryExclusionReason = 'finished' | 'dropped';

export interface DiscoveryCandidate {
  game: DiscoveryGame;
  libraryStatus: DiscoveryCandidateStatus;
  /** True when the game is waiting in the Discovery Inbox. */
  inboxStatus: boolean;
  excluded: boolean;
  exclusionReason: DiscoveryExclusionReason | null;
  /** Composite score used for ranking. Higher = shown first. */
  score: number;
  /** Human-readable explanation set by the personal recommendations engine. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Synthetic Game adapters — the single place where discovery data is shaped
// into a Game so shared components (GameCard, GameHero, …) can render games
// the user does not own. No library record is ever created from these.
// ---------------------------------------------------------------------------

export function discoveryGameToGame(game: DiscoveryGame, idPrefix: string): Game {
  return {
    id: `${idPrefix}-${game.rawgId}`,
    title: game.title,
    platform: game.hasSteamVersion ? 'Steam' : (game.platforms[0] ?? 'PC'),
    status: 'Want to play',
    coverImage: game.coverUrl ?? '',
    backgroundImage: game.coverUrl ?? null,
    playtimeHours: 0,
    tags: game.tags.slice(0, 5),
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rawgId: game.rawgId,
    rawgSlug: game.slug ?? undefined,
    genres: game.genres,
    metacritic: game.metacritic ?? null,
    released: game.released,
  };
}

/**
 * Resolves a candidate to a renderable Game: the user's real record when the
 * game is already in the library/wishlist (so status, rating and artwork are
 * accurate), otherwise a synthetic Game via discoveryGameToGame.
 */
export function discoveryCandidateToGame(
  candidate: DiscoveryCandidate,
  userGames: Game[],
  idPrefix: string,
): Game {
  if (candidate.libraryStatus !== null) {
    const real = userGames.find((g) => g.rawgId === candidate.game.rawgId);
    if (real) return real;
  }
  return discoveryGameToGame(candidate.game, idPrefix);
}
