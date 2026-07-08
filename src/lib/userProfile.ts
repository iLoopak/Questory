import type { Game } from '../types/game';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenreWeight {
  name: string;
  slug: string;
  weight: number;
}

export interface SignalWeight {
  name: string;
  weight: number;
}

export interface UserProfile {
  topGenres: GenreWeight[]; // sorted by positive weight, max 5
  topTags: string[];        // top 8 positively weighted RAWG tags
  topDevelopers: string[];  // top 3 positively weighted developers
  topPlatforms: string[];   // top 5 positively weighted platforms
  negativeGenres: GenreWeight[];
  negativeTags: SignalWeight[];
  negativeDevelopers: SignalWeight[];
  negativePlatforms: SignalWeight[];
  avgMetacritic: number | null;
  avgPlaytimeHours: number | null;
  sampleTitles: string[];   // up to 3 finished/playing titles for explanation copy
}

export interface ProfileReadiness {
  ready: boolean;
  /** 0–100 — how close the user is to the readiness threshold. */
  progress: number;
  analyzedCount: number;
  targetCount: number;
}

// ---------------------------------------------------------------------------
// Genre slug mapping — RAWG uses different slugs for some genre display names.
// ---------------------------------------------------------------------------

const GENRE_SLUG: Record<string, string> = {
  Action: 'action',
  Indie: 'indie',
  Adventure: 'adventure',
  RPG: 'role-playing-games-rpg',
  Strategy: 'strategy',
  Shooter: 'shooter',
  Casual: 'casual',
  Simulation: 'simulation',
  Puzzle: 'puzzle',
  Arcade: 'arcade',
  Platformer: 'platformer',
  Racing: 'racing',
  Sports: 'sports',
  Fighting: 'fighting',
  Family: 'family',
  'Massively Multiplayer': 'massively-multiplayer',
  Educational: 'educational',
  'Board Games': 'board-games',
  Card: 'card',
};

export function toSlug(name: string): string {
  return (
    GENRE_SLUG[name] ??
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

const THRESHOLD_ANALYZED = 8;
const THRESHOLD_FINISHED = 3;

export function getUserProfileReadiness(games: Game[]): ProfileReadiness {
  const analyzed = games.filter(
    (g) => g.collectionType === 'library' && (g.genres?.length ?? 0) > 0,
  ).length;
  const finished = games.filter((g) => g.status === 'Finished').length;

  const ready = analyzed >= THRESHOLD_ANALYZED || finished >= THRESHOLD_FINISHED;

  const progress = Math.min(
    100,
    Math.round(
      Math.max(
        (analyzed / THRESHOLD_ANALYZED) * 100,
        (finished / THRESHOLD_FINISHED) * 100,
      ),
    ),
  );

  return { ready, progress, analyzedCount: analyzed, targetCount: THRESHOLD_ANALYZED };
}

// ---------------------------------------------------------------------------
// Profile building
// ---------------------------------------------------------------------------

export type WeightedGame = { game: Game; weight: number; reason: string };

export interface PreferenceProfileDebug {
  positiveGames: WeightedGame[];
  negativeGames: WeightedGame[];
}

export function getRecommendationSignalWeight(game: Game): { weight: number; reason: string } {
  if (game.status === 'Dropped') return { weight: -5, reason: 'dropped' };
  if (game.collectionType === 'wishlist') return { weight: 1, reason: 'wishlist/planned' };
  if (game.status === 'Playing') return { weight: 3, reason: 'currently playing' };
  if (game.status === 'Finished') {
    if (typeof game.rating === 'number') {
      if (game.rating >= 4) return { weight: 5, reason: 'high-rated finished' };
      if (game.rating === 3) return { weight: 2, reason: 'mid-rated finished' };
      if (game.rating > 0 && game.rating <= 2) return { weight: -3, reason: 'low-rated finished' };
    }
    return { weight: 2, reason: 'finished' };
  }
  if (game.status === 'Want to play') return { weight: 1, reason: 'planned' };
  if (game.status === 'Paused') return { weight: -0.5, reason: 'paused/later' };
  if (game.playtimeHours >= 20 && game.collectionType === 'library') return { weight: 1.5, reason: 'played a lot' };
  return { weight: 0, reason: 'neutral' };
}

function buildFrequencyMap(
  items: WeightedGame[],
  extract: (g: Game) => string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { game, weight } of items) {
    for (const value of extract(game)) {
      if (value.trim()) map.set(value, (map.get(value) ?? 0) + weight);
    }
  }
  return map;
}

function topN<K>(map: Map<K, number>, n: number): K[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

export function buildUserProfile(games: Game[]): UserProfile {
  const positive: WeightedGame[] = [];
  const negative: WeightedGame[] = [];

  for (const game of games) {
    const signal = getRecommendationSignalWeight(game);
    if (signal.weight > 0) positive.push({ game, weight: signal.weight, reason: signal.reason });
    if (signal.weight < 0) negative.push({ game, weight: Math.abs(signal.weight), reason: signal.reason });
  }

  const genreMap = buildFrequencyMap(positive, (g) => g.genres ?? []);
  const tagMap = buildFrequencyMap(positive, (g) => g.rawgTags ?? []);
  const devMap = buildFrequencyMap(positive, (g) => g.developers ?? []);
  const platformMap = buildFrequencyMap(positive, (g) => [g.platform]);
  const negativeGenreMap = buildFrequencyMap(negative, (g) => g.genres ?? []);
  const negativeTagMap = buildFrequencyMap(negative, (g) => g.rawgTags ?? []);
  const negativeDevMap = buildFrequencyMap(negative, (g) => g.developers ?? []);
  const negativePlatformMap = buildFrequencyMap(negative, (g) => [g.platform]);

  const topGenreNames = topN(genreMap, 5);
  const topGenres: GenreWeight[] = topGenreNames.map((name) => ({
    name,
    slug: toSlug(name),
    weight: genreMap.get(name) ?? 0,
  }));

  const mcs = positive
    .map(({ game }) => game.metacritic ?? game.metacriticScore)
    .filter((mc): mc is number => typeof mc === 'number' && mc > 0);
  const avgMetacritic =
    mcs.length > 0 ? Math.round(mcs.reduce((a, b) => a + b, 0) / mcs.length) : null;

  const playtimes = positive
    .filter(({ game }) => game.playtimeHours > 0)
    .map(({ game }) => game.playtimeHours);
  const avgPlaytimeHours =
    playtimes.length > 0
      ? Math.round(playtimes.reduce((a, b) => a + b, 0) / playtimes.length)
      : null;

  const sampleTitles = games
    .filter((g) => getRecommendationSignalWeight(g).weight > 0)
    .slice(0, 3)
    .map((g) => g.title);

  return {
    topGenres,
    topTags: topN(tagMap, 8),
    topDevelopers: topN(devMap, 3),
    topPlatforms: topN(platformMap, 5),
    negativeGenres: topN(negativeGenreMap, 5).map((name) => ({ name, slug: toSlug(name), weight: negativeGenreMap.get(name) ?? 0 })),
    negativeTags: topN(negativeTagMap, 8).map((name) => ({ name, weight: negativeTagMap.get(name) ?? 0 })),
    negativeDevelopers: topN(negativeDevMap, 3).map((name) => ({ name, weight: negativeDevMap.get(name) ?? 0 })),
    negativePlatforms: topN(negativePlatformMap, 5).map((name) => ({ name, weight: negativePlatformMap.get(name) ?? 0 })),
    avgMetacritic,
    avgPlaytimeHours,
    sampleTitles,
  };
}

/**
 * Stable fingerprint used to invalidate the recommendations cache.
 *
 * Keep this aligned with the inputs used by buildUserProfile/applyLibraryStatus:
 * imports, collection changes, status changes, metadata enrichment, playtime/rating
 * edits, and queue-tag decisions should all move this fingerprint without tying
 * recommendation refreshes to React render identity.
 */
export function profileFingerprint(games: Game[]): string {
  return games
    .map((game) => {
      const genres = [...(game.genres ?? [])].sort().join(',');
      const rawgTags = [...(game.rawgTags ?? [])].sort().join(',');
      const developers = [...(game.developers ?? [])].sort().join(',');
      const tags = [...(game.tags ?? [])].sort().join(',');
      const metacritic = game.metacritic ?? game.metacriticScore ?? '';
      const playtime = Math.round(game.playtimeHours || 0);
      const rating = game.rating ?? '';
      return [
        game.id,
        game.rawgId ?? '',
        game.collectionType,
        game.status,
        playtime,
        rating,
        metacritic,
        genres,
        rawgTags,
        developers,
        tags,
      ].join('|');
    })
    .sort()
    .join('||');
}
