import type { RawgSearchResult } from '../types/rawg';
import type { Game } from '../types/game';
import type {
  DiscoveryCandidate,
  DiscoveryExclusionReason,
  DiscoveryGame,
} from '../lib/discovery';

const PLATFORM_ABBREV: Record<string, string> = {
  'PlayStation 5': 'PS5',
  'PlayStation 4': 'PS4',
  'PlayStation 3': 'PS3',
  'PlayStation 2': 'PS2',
  'Nintendo Switch': 'Switch',
  'Xbox Series S/X': 'Xbox',
  'Xbox One': 'Xbox One',
  'Xbox 360': 'Xbox 360',
  'macOS': 'Mac',
};

export function mapRawgResult(result: RawgSearchResult): DiscoveryGame {
  const rawPlatformNames = (result.platforms ?? []).map((p) => p.platform.name);
  const hasSteamVersion = rawPlatformNames.some((n) => n === 'PC');
  const platforms = rawPlatformNames
    .map((n) => PLATFORM_ABBREV[n] ?? n)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 4);
  const genres = (result.genres ?? []).map((g) => g.name);
  // Tag slugs for semantic similarity scoring. RAWG returns these in list results.
  const tags = (result.tags ?? [])
    .map((t) => t.slug ?? t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);

  return {
    rawgId: result.id,
    title: result.name,
    coverUrl: result.background_image,
    metacritic: result.metacritic,
    rawgRating: typeof result.rating === 'number' && Number.isFinite(result.rating) && result.rating > 0 ? result.rating : undefined,
    rawgRatingsCount: typeof result.ratings_count === 'number' && Number.isFinite(result.ratings_count) && result.ratings_count >= 0 ? Math.floor(result.ratings_count) : undefined,
    platforms,
    hasSteamVersion,
    genres,
    tags,
    released: result.released,
    slug: result.slug ?? null,
  };
}

// ---------------------------------------------------------------------------
// Library-aware filtering + ranking
// ---------------------------------------------------------------------------

export interface CandidateFilterOptions {
  /** Exclude games the user has dropped. Defaults to false. */
  excludeDropped?: boolean;
}

export function buildDiscoveryCandidates(
  games: DiscoveryGame[],
  userGames: Game[],
  options: CandidateFilterOptions = {},
): DiscoveryCandidate[] {
  void options;

  const allGames = games;

  return allGames
    .map((game): DiscoveryCandidate => {
      const match = userGames.find((g) => g.rawgId === game.rawgId);
      const libraryStatus =
        match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';

      let excluded = false;
      let exclusionReason: DiscoveryExclusionReason | null = null;

      if (match) {
        excluded = true;
        exclusionReason = match.status === 'Dropped' ? 'dropped' : match.status === 'Finished' ? 'finished' : match.collectionType === 'wishlist' ? 'wishlist' : 'owned';
      }

      // Non-owned games rank first; owned/wishlisted rank lower.
      const score = libraryStatus === null ? 0 : -1;

      return { game, libraryStatus, inboxStatus: false, excluded, exclusionReason, score };
    })
    .filter((c) => !c.excluded)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
