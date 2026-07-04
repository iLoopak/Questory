import { fetchSuggestedGames, fetchGameSeries } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';
import type { Game } from '../types/game';
import type {
  DiscoveryCandidate,
  DiscoveryExclusionReason,
  DiscoveryGame,
  DiscoverySection,
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

function mapRawgResult(result: RawgSearchResult): DiscoveryGame {
  const rawPlatformNames = (result.platforms ?? []).map((p) => p.platform.name);
  const hasSteamVersion = rawPlatformNames.some((n) => n === 'PC');
  const platforms = rawPlatformNames
    .map((n) => PLATFORM_ABBREV[n] ?? n)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 4);
  const genres = (result.genres ?? []).map((g) => g.name);

  return {
    rawgId: result.id,
    title: result.name,
    coverUrl: result.background_image,
    metacritic: result.metacritic,
    platforms,
    hasSteamVersion,
    genres,
    released: result.released,
    slug: result.slug ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cache — keyed by rawgId, stores raw RAWG results only.
// Library-dependent filtering is applied later in buildDiscoveryCandidates so
// the same cached data works regardless of library changes.
// ---------------------------------------------------------------------------

interface CacheEntry {
  sections: DiscoverySection[];
  fetchedAt: number;
}

const cache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchDiscoverySections(
  rawgId: number,
): Promise<DiscoverySection[]> {
  const cached = cache.get(rawgId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.sections;
  }

  const [suggested, series] = await Promise.all([
    fetchSuggestedGames(rawgId),
    fetchGameSeries(rawgId),
  ]);

  // Merge, deduplicate, exclude the current game, cap at 10 before filtering.
  const seen = new Set<number>([rawgId]);
  const merged: RawgSearchResult[] = [];
  for (const result of [...suggested, ...series]) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push(result);
    }
    if (merged.length === 10) break;
  }

  const games: DiscoveryGame[] = merged.map(mapRawgResult);
  const sections: DiscoverySection[] =
    games.length > 0
      ? [{ id: 'you-might-also-like', title: 'You Might Also Like', games }]
      : [];

  cache.set(rawgId, { sections, fetchedAt: Date.now() });
  return sections;
}

// ---------------------------------------------------------------------------
// Library-aware filtering + ranking
// Call this after fetchDiscoverySections, passing the live userGames snapshot.
// ---------------------------------------------------------------------------

export interface CandidateFilterOptions {
  /** Exclude games the user has dropped. Defaults to false. */
  excludeDropped?: boolean;
}

export function buildDiscoveryCandidates(
  sections: DiscoverySection[],
  userGames: Game[],
  options: CandidateFilterOptions = {},
): DiscoveryCandidate[] {
  const { excludeDropped = false } = options;

  const allGames = sections.flatMap((s) => s.games);

  return allGames
    .map((game): DiscoveryCandidate => {
      const match = userGames.find((g) => g.rawgId === game.rawgId);
      const libraryStatus =
        match == null ? null : match.collectionType === 'wishlist' ? 'wishlist' : 'library';

      let excluded = false;
      let exclusionReason: DiscoveryExclusionReason | null = null;

      if (match) {
        if (match.status === 'Finished') {
          excluded = true;
          exclusionReason = 'finished';
        } else if (excludeDropped && match.status === 'Dropped') {
          excluded = true;
          exclusionReason = 'dropped';
        }
      }

      // Non-owned games rank first; owned/wishlisted rank lower.
      const score = libraryStatus === null ? 0 : -1;

      return { game, libraryStatus, excluded, exclusionReason, score };
    })
    .filter((c) => !c.excluded)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
