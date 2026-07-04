export interface DiscoveryGame {
  rawgId: number;
  title: string;
  coverUrl: string | null;
  metacritic: number | null;
  platforms: string[];
  hasSteamVersion: boolean;
  genres: string[];
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
  excluded: boolean;
  exclusionReason: DiscoveryExclusionReason | null;
  score: number;
}
