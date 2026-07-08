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

export type DiscoveryCollectionStatus = DiscoveryCandidateStatus | 'inbox';

export type DiscoveryCardModel = {
  id: string;
  rawgId: number;
  title: string;
  artwork: { coverUrl: string | null };
  metadata: { metacritic: number | null; platforms: string[]; genres: string[]; released: string | null };
  badges: string[];
  reason?: string;
  context?: string;
  collectionStatus: DiscoveryCollectionStatus;
  availableActions: Array<'open-library' | 'open-preview' | 'review-later'>;
};

export type GamePreviewModel = {
  identity: { rawgId: number; slug: string | null; title: string };
  title: string;
  artwork: { coverUrl: string | null; backgroundImage?: string | null };
  metadata: {
    platforms: string[];
    hasSteamVersion: boolean;
    genres: string[];
    tags: string[];
    released: string | null;
    metacritic: number | null;
    developers?: string[];
    publishers?: string[];
    averagePlaytime?: number | null;
  };
  recommendation?: { reason?: string; source?: string };
  collectionStatus: DiscoveryCollectionStatus;
  availableActions: Array<'add-to-library' | 'add-to-wishlist' | 'open-library' | 'move-to-library' | 'save-to-inbox'>;
};

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

export function discoveryCandidateToCardModel(candidate: DiscoveryCandidate): DiscoveryCardModel {
  const collectionStatus = getDiscoveryCollectionStatus(candidate);
  return {
    id: `rawg-${candidate.game.rawgId}`,
    rawgId: candidate.game.rawgId,
    title: candidate.game.title,
    artwork: { coverUrl: candidate.game.coverUrl },
    metadata: {
      metacritic: candidate.game.metacritic,
      platforms: candidate.game.platforms,
      genres: candidate.game.genres,
      released: candidate.game.released,
    },
    badges: getDiscoveryBadges(candidate),
    reason: candidate.reason,
    collectionStatus,
    availableActions: [
      candidate.libraryStatus === 'library' ? 'open-library' : 'open-preview',
      !candidate.libraryStatus && !candidate.inboxStatus ? 'review-later' : null,
    ].filter((action): action is DiscoveryCardModel['availableActions'][number] => Boolean(action)),
  };
}

export function discoveryCandidateToPreviewModel(
  candidate: DiscoveryCandidate,
  options: {
    backgroundImage?: string | null;
    developers?: string[];
    publishers?: string[];
    averagePlaytime?: number | null;
    source?: string;
  } = {},
): GamePreviewModel {
  const collectionStatus = getDiscoveryCollectionStatus(candidate);
  return {
    identity: { rawgId: candidate.game.rawgId, slug: candidate.game.slug, title: candidate.game.title },
    title: candidate.game.title,
    artwork: { coverUrl: candidate.game.coverUrl, backgroundImage: options.backgroundImage ?? candidate.game.coverUrl },
    metadata: {
      platforms: candidate.game.platforms,
      hasSteamVersion: candidate.game.hasSteamVersion,
      genres: candidate.game.genres,
      tags: candidate.game.tags,
      released: candidate.game.released,
      metacritic: candidate.game.metacritic,
      developers: options.developers,
      publishers: options.publishers,
      averagePlaytime: options.averagePlaytime,
    },
    recommendation: { reason: candidate.reason, source: options.source },
    collectionStatus,
    availableActions: getPreviewActions(collectionStatus),
  };
}

function getDiscoveryCollectionStatus(candidate: DiscoveryCandidate): DiscoveryCollectionStatus {
  return candidate.libraryStatus ?? (candidate.inboxStatus ? 'inbox' : null);
}

function getDiscoveryBadges(candidate: DiscoveryCandidate): string[] {
  return [
    candidate.libraryStatus === 'library' ? 'library' : null,
    candidate.libraryStatus === 'wishlist' ? 'wishlist' : null,
    candidate.inboxStatus ? 'inbox' : null,
    candidate.game.metacritic ? 'metacritic' : null,
  ].filter((badge): badge is string => Boolean(badge));
}

function getPreviewActions(collectionStatus: DiscoveryCollectionStatus): GamePreviewModel['availableActions'] {
  if (collectionStatus === 'library') return ['open-library'];
  if (collectionStatus === 'wishlist') return ['move-to-library', 'open-library'];
  if (collectionStatus === 'inbox') return ['add-to-library', 'add-to-wishlist'];
  return ['add-to-library', 'add-to-wishlist', 'save-to-inbox'];
}
