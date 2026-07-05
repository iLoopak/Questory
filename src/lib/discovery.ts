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

export interface DiscoverySection {
  id: string;
  title: string;
  games: DiscoveryGame[];
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
