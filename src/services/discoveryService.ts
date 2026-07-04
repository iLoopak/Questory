import { fetchSuggestedGames, fetchGameSeries } from './rawgApi';
import type { RawgSearchResult } from '../types/rawg';
import type { DiscoveryGame, DiscoverySection } from '../lib/discovery';

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

function abbreviatePlatform(name: string): string {
  return PLATFORM_ABBREV[name] ?? name;
}

function mapRawgResult(result: RawgSearchResult): DiscoveryGame {
  const platforms = (result.platforms ?? [])
    .map((p) => abbreviatePlatform(p.platform.name))
    .filter((name, i, arr) => arr.indexOf(name) === i)
    .slice(0, 4);
  return {
    rawgId: result.id,
    title: result.name,
    coverUrl: result.background_image,
    metacritic: result.metacritic,
    platforms,
    released: result.released,
    slug: result.slug ?? null,
  };
}

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

  // Fetch both endpoints in parallel; either may return empty.
  const [suggested, series] = await Promise.all([
    fetchSuggestedGames(rawgId),
    fetchGameSeries(rawgId),
  ]);

  // Merge, deduplicate by rawgId, exclude the current game, take up to 6.
  const seen = new Set<number>([rawgId]);
  const merged: RawgSearchResult[] = [];
  for (const result of [...suggested, ...series]) {
    if (!seen.has(result.id)) {
      seen.add(result.id);
      merged.push(result);
    }
    if (merged.length === 6) break;
  }

  const games: DiscoveryGame[] = merged.map(mapRawgResult);

  const sections: DiscoverySection[] =
    games.length > 0
      ? [{ id: 'you-might-also-like', title: 'You Might Also Like', games }]
      : [];

  cache.set(rawgId, { sections, fetchedAt: Date.now() });
  return sections;
}
