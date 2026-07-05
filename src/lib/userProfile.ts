import type { Game } from '../types/game';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenreWeight {
  name: string;
  slug: string;
  weight: number;
}

export interface UserProfile {
  topGenres: GenreWeight[]; // sorted by weight, max 5
  topTags: string[];        // top 8 RAWG tags
  topDevelopers: string[];  // top 3 developers
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

function toSlug(name: string): string {
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

type WeightedGame = { game: Game; weight: number };

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
  // Source games with descending priority weights.
  // A game may qualify for multiple sets — add at highest weight only.
  const seen = new Set<string>();
  const weighted: WeightedGame[] = [];

  function addIfUnseen(game: Game, weight: number) {
    if (!seen.has(game.id)) {
      seen.add(game.id);
      weighted.push({ game, weight });
    }
  }

  for (const g of games) if (g.status === 'Finished') addIfUnseen(g, 3);
  for (const g of games) if (g.status === 'Playing') addIfUnseen(g, 2);
  for (const g of games)
    if (g.playtimeHours >= 20 && g.collectionType === 'library') addIfUnseen(g, 2);
  for (const g of games) if (g.collectionType === 'wishlist') addIfUnseen(g, 1);

  const genreMap = buildFrequencyMap(weighted, (g) => g.genres ?? []);
  const tagMap = buildFrequencyMap(weighted, (g) => g.rawgTags ?? []);
  const devMap = buildFrequencyMap(weighted, (g) => g.developers ?? []);

  const topGenreNames = topN(genreMap, 5);
  const topGenres: GenreWeight[] = topGenreNames.map((name) => ({
    name,
    slug: toSlug(name),
    weight: genreMap.get(name) ?? 0,
  }));

  const mcs = weighted
    .map(({ game }) => game.metacritic ?? game.metacriticScore)
    .filter((mc): mc is number => typeof mc === 'number' && mc > 0);
  const avgMetacritic =
    mcs.length > 0 ? Math.round(mcs.reduce((a, b) => a + b, 0) / mcs.length) : null;

  const playtimes = weighted
    .filter(({ game }) => game.playtimeHours > 0)
    .map(({ game }) => game.playtimeHours);
  const avgPlaytimeHours =
    playtimes.length > 0
      ? Math.round(playtimes.reduce((a, b) => a + b, 0) / playtimes.length)
      : null;

  const sampleTitles = games
    .filter((g) => g.status === 'Finished' || g.status === 'Playing')
    .slice(0, 3)
    .map((g) => g.title);

  return {
    topGenres,
    topTags: topN(tagMap, 8),
    topDevelopers: topN(devMap, 3),
    avgMetacritic,
    avgPlaytimeHours,
    sampleTitles,
  };
}

/** Stable fingerprint used to invalidate the recommendations cache. */
export function profileFingerprint(games: Game[]): string {
  const finished = games.filter((g) => g.status === 'Finished').length;
  const withGenres = games.filter((g) => (g.genres?.length ?? 0) > 0).length;
  return `f${finished}:g${withGenres}`;
}
