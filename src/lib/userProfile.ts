import type { Game } from '../types/game';
import { noPlannedGameIds, plannedGameFingerprint, type PlannedGameIds } from './plannedGames';

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
  topTagWeights: SignalWeight[]; // sorted, weighted gameplay/theme affinity
  topDevelopers: string[];  // top 3 positively weighted developers
  topDeveloperWeights: SignalWeight[];
  topFranchises: SignalWeight[];
  topPlatforms: string[];   // top 5 positively weighted platforms
  negativeGenres: GenreWeight[];
  negativeTags: SignalWeight[];
  negativeDevelopers: SignalWeight[];
  negativeFranchises: SignalWeight[];
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

const VERY_HIGH_VALUE_TAGS = new Set([
  'roguelite', 'roguelike', 'deckbuilding', 'deckbuilder', 'card-battler',
  'souls-like', 'soulslike', 'metroidvania', 'immersive-sim', 'tactical-rpg',
  'turn-based-tactics', 'factory-automation', 'automation', 'colony-sim',
  'colony-simulation', 'city-builder', 'city-building', 'extraction-shooter',
  'crpg', 'computer-role-playing-game', 'bullet-heaven', 'survivors-like',
  'survival-horror', 'life-sim', 'farming-sim', '4x', 'grand-strategy',
  'real-time-strategy', 'base-building',
]);

const DISTINCTIVE_GENRES = new Set(['RPG', 'Strategy', 'Simulation', 'Puzzle', 'Platformer', 'Racing', 'Fighting', 'Shooter']);
const BROAD_GENRES = new Set(['Action', 'Adventure', 'Indie', 'Casual', 'Family', 'Arcade']);

const MECHANIC_TAGS = new Set([
  'stealth', 'crafting', 'survival', 'open-world', 'sandbox', 'management',
  'resource-management', 'turn-based', 'turn-based-combat', 'tactical',
  'strategy-rpg', 'hack-and-slash', 'loot', 'looter-shooter', 'platformer',
  'puzzle-platformer', 'precision-platformer', 'tower-defense', 'rhythm',
  'fighting', 'racing', 'soulslike',
]);

const BROAD_TAGS = new Set([
  'open-world', 'sandbox', 'survival', 'crafting', 'action', 'adventure',
  'role-playing', 'rpg', 'shooter', 'strategy', 'multiplayer', 'singleplayer',
]);

const THEME_TAGS = new Set([
  'sci-fi', 'science-fiction', 'horror', 'dark-fantasy', 'post-apocalyptic',
  'cyberpunk', 'space', 'war', 'military', 'zombies', 'lovecraftian',
]);

const PRESENTATION_TAGS = new Set(['first-person', 'third-person', 'isometric', 'top-down', 'side-scroller', 'side-scrolling', '2-5d']);

const GENERIC_TAGS = new Set([
  'imported', 'steam', 'steam-trading-cards', 'trading-cards',
  'steam-workshop', 'workshop', 'steam-leaderboards', 'steam-turn-notifications',
  'steam-achievements', 'achievements', 'achievement', 'generic-achievements',
  'steam-cloud', 'cloud-saves', 'cloud-save', 'cloud-saving',
  'full-controller-support', 'partial-controller-support', 'controller-support',
  '2d', '3d', 'singleplayer', 'multiplayer', 'co-op', 'online-co-op',
  'local-co-op', 'great-soundtrack', 'atmospheric', 'story-rich', 'dark',
  'violent', 'exploration', 'steam-achievements', 'full-controller-support',
  'partial-controller-support', 'steam-cloud', 'controller', 'controller-support',
  'linux', 'macos', 'windows', 'difficult', 'relaxing', 'colorful', 'cute',
  'funny', 'casual', 'indie', 'pixel-graphics', 'retro', 'early-access',
  'score-attack', 'fantasy',
]);

export function isGenericPreferenceTag(slugOrName: string): boolean {
  return GENERIC_TAGS.has(toSlug(slugOrName));
}

export function isDistinctivePreferenceTag(slugOrName: string): boolean {
  const slug = toSlug(slugOrName);
  return VERY_HIGH_VALUE_TAGS.has(slug) || (MECHANIC_TAGS.has(slug) && !BROAD_TAGS.has(slug));
}

export function signalInformationValue(kind: 'genre' | 'tag', nameOrSlug: string): number {
  if (kind === 'genre') {
    if (BROAD_GENRES.has(nameOrSlug)) return 0.45;
    if (DISTINCTIVE_GENRES.has(nameOrSlug)) return 1.05;
    return 0.8;
  }
  const slug = toSlug(nameOrSlug);
  if (isGenericPreferenceTag(slug)) return 0;
  if (VERY_HIGH_VALUE_TAGS.has(slug)) return 1.35;
  if (BROAD_TAGS.has(slug)) return 0.55;
  if (MECHANIC_TAGS.has(slug)) return 1.1;
  if (THEME_TAGS.has(slug)) return 0.8;
  if (PRESENTATION_TAGS.has(slug)) return 0.55;
  return 0.9;
}

export function preferenceTagWeight(slug: string): number {
  if (VERY_HIGH_VALUE_TAGS.has(slug)) return 18;
  if (MECHANIC_TAGS.has(slug)) return BROAD_TAGS.has(slug) ? 5 : 12;
  if (THEME_TAGS.has(slug)) return 4;
  if (PRESENTATION_TAGS.has(slug)) return 2;
  if (GENERIC_TAGS.has(slug)) return 0.35;
  return 7;
}

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

/**
 * AS-15: `plannedGameIds` is the set of games the user actually put in a Platform Plan. It used to be
 * inferred from `status === 'Want to play'`, which an import stamps on a whole backlog — so an
 * imported library was read as 800 deliberate plans. The weights below are unchanged; only what
 * qualifies as "planned" is.
 */
export function getRecommendationSignalWeight(game: Game, plannedGameIds: PlannedGameIds = noPlannedGameIds): { weight: number; reason: string } {
  const rating = typeof game.rating === 'number' ? game.rating : null;
  if (game.status === 'Dropped') return { weight: rating != null && rating <= 2 ? -7 : -5, reason: 'dropped' };

  let weight = 0;
  const reasons: string[] = [];
  if (game.favorite) { weight += 8; reasons.push('favorite'); }
  if (game.status === 'Finished') {
    if (rating != null) {
      if (rating >= 5) { weight += 9; reasons.push('5-star finished'); }
      else if (rating >= 4) { weight += 5.5; reasons.push('4-star finished'); }
      else if (rating === 3) { weight += 1.5; reasons.push('3-star finished'); }
      else if (rating > 0) return { weight: -5, reason: 'low-rated finished' };
    } else {
      weight += 2.5;
      reasons.push('finished');
    }
  }
  if (game.status === 'Playing') { weight += 4; reasons.push('currently playing'); }
  if (game.collectionType === 'library') {
    if (game.playtimeHours >= 80) { weight += 2.5; reasons.push('very high playtime'); }
    else if (game.playtimeHours >= 40) { weight += 2; reasons.push('high playtime'); }
    else if (game.playtimeHours >= 20) { weight += 2; reasons.push('meaningful playtime'); }
  }
  if (game.collectionType === 'wishlist') { weight += game.priority === 'high' ? 2.2 : 1.6; reasons.push('wishlist'); }
  // The explicit plan signal: an entry the user made in a Platform Plan, not a default import status.
  if (plannedGameIds.has(game.id)) { weight += 1.4; reasons.push('in a platform plan'); }
  if (game.status === 'Paused') return { weight: -0.5, reason: 'paused/later' };
  if (weight > 0) return { weight: Math.min(12, weight), reason: reasons.join(' + ') };
  if (game.collectionType === 'library' && ((game.genres?.length ?? 0) > 0 || (game.rawgTags?.length ?? 0) > 0)) return { weight: 0.12, reason: 'owned' };
  return { weight: 0, reason: 'neutral' };
}

function buildFrequencyMap(
  items: WeightedGame[],
  extract: (g: Game) => string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { game, weight } of items) {
    for (const value of extract(game)) {
      const normalized = value.trim();
      if (normalized) map.set(normalized, (map.get(normalized) ?? 0) + weight);
    }
  }
  return map;
}

function getTasteTags(game: Game): string[] {
  const seen = new Set<string>();
  const rawgTags = (game.rawgTags ?? []).map(toSlug);
  const userTags = (game.tags ?? []).map(toSlug);
  for (const tag of [...rawgTags, ...userTags]) {
    if (tag && !isGenericPreferenceTag(tag)) seen.add(tag);
  }
  return [...seen];
}

function compressFrequencyMap(map: Map<string, number>): void {
  for (const [key, weight] of [...map.entries()]) {
    map.set(key, Math.log1p(Math.max(0, weight)) * 4);
  }
}

function normalizeDeveloperName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function recommendationFranchiseKey(value: string | undefined | null): string | null {
  const slug = toSlug(value ?? '');
  if (!slug) return null;
  const cleaned = slug
    .replace(/\b(\d+|ii|iii|iv|v|vi|vii|viii|ix|x|remake|remastered|remaster|redux|definitive|deluxe|ultimate|edition|complete|goty|hd)\b/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const parts = cleaned.split('-').filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(0, Math.min(3, parts.length)).join('-');
}

function topN<K>(map: Map<K, number>, n: number): K[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key]) => key);
}

export function buildUserProfile(games: Game[], plannedGameIds: PlannedGameIds = noPlannedGameIds): UserProfile {
  const positive: WeightedGame[] = [];
  const negative: WeightedGame[] = [];

  for (const game of games) {
    const signal = getRecommendationSignalWeight(game, plannedGameIds);
    if (signal.weight > 0) positive.push({ game, weight: signal.weight, reason: signal.reason });
    if (signal.weight < 0) negative.push({ game, weight: Math.abs(signal.weight), reason: signal.reason });
  }

  const genreMap = buildFrequencyMap(positive, (g) => g.genres ?? []);
  const tagMap = buildFrequencyMap(positive, getTasteTags);
  const devMap = buildFrequencyMap(positive, (g) => g.developers ?? []);
  const platformMap = buildFrequencyMap(positive, (g) => [g.platform]);
  const franchiseMap = buildFrequencyMap(positive, (g) => {
    const key = recommendationFranchiseKey(g.rawgSlug ?? g.rawgTitle ?? g.title);
    return key ? [key] : [];
  });
  const negativeGenreMap = buildFrequencyMap(negative, (g) => g.genres ?? []);
  const negativeTagMap = buildFrequencyMap(negative, getTasteTags);
  const negativeDevMap = buildFrequencyMap(negative, (g) => g.developers ?? []);
  const negativeFranchiseMap = buildFrequencyMap(negative, (g) => {
    const key = recommendationFranchiseKey(g.rawgSlug ?? g.rawgTitle ?? g.title);
    return key ? [key] : [];
  });
  const negativePlatformMap = buildFrequencyMap(negative, (g) => [g.platform]);

  [genreMap, tagMap, devMap, platformMap, franchiseMap, negativeGenreMap, negativeTagMap, negativeDevMap, negativePlatformMap, negativeFranchiseMap].forEach(compressFrequencyMap);

  for (const [tag, weight] of [...tagMap.entries()]) tagMap.set(tag, weight * preferenceTagWeight(tag));
  for (const [tag, weight] of [...negativeTagMap.entries()]) negativeTagMap.set(tag, weight * preferenceTagWeight(tag));

  for (const [genre, weight] of [...genreMap.entries()]) genreMap.set(genre, weight * signalInformationValue('genre', genre));
  for (const [genre, weight] of [...negativeGenreMap.entries()]) negativeGenreMap.set(genre, weight * signalInformationValue('genre', genre));
  for (const [developer, weight] of [...devMap.entries()]) {
    devMap.delete(developer);
    devMap.set(normalizeDeveloperName(developer), weight);
  }
  for (const [developer, weight] of [...negativeDevMap.entries()]) {
    negativeDevMap.delete(developer);
    negativeDevMap.set(normalizeDeveloperName(developer), weight);
  }

  const topGenreNames = topN(genreMap, 6);
  const positiveFranchiseCounts = new Map<string, number>();
  for (const { game } of positive) {
    const key = recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
    if (key) positiveFranchiseCounts.set(key, (positiveFranchiseCounts.get(key) ?? 0) + 1);
  }
  const negativeFranchiseCounts = new Map<string, number>();
  for (const { game } of negative) {
    const key = recommendationFranchiseKey(game.rawgSlug ?? game.rawgTitle ?? game.title);
    if (key) negativeFranchiseCounts.set(key, (negativeFranchiseCounts.get(key) ?? 0) + 1);
  }
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
    .filter((g) => getRecommendationSignalWeight(g, plannedGameIds).weight > 0)
    .slice(0, 3)
    .map((g) => g.title);

  return {
    topGenres,
    topTags: topN(tagMap, 10),
    topTagWeights: topN(tagMap, 12).map((name) => ({ name, weight: tagMap.get(name) ?? 0 })),
    topDevelopers: topN(devMap, 5),
    topDeveloperWeights: topN(devMap, 8).map((name) => ({ name, weight: devMap.get(name) ?? 0 })),
    topFranchises: topN(franchiseMap, 8)
      .map((name) => ({ name, weight: franchiseMap.get(name) ?? 0 }))
      .filter((signal) => (positiveFranchiseCounts.get(signal.name) ?? 0) >= 2),
    topPlatforms: topN(platformMap, 5),
    negativeGenres: topN(negativeGenreMap, 5).map((name) => ({ name, slug: toSlug(name), weight: negativeGenreMap.get(name) ?? 0 })),
    negativeTags: topN(negativeTagMap, 8).map((name) => ({ name, weight: negativeTagMap.get(name) ?? 0 })),
    negativeDevelopers: topN(negativeDevMap, 3).map((name) => ({ name, weight: negativeDevMap.get(name) ?? 0 })),
    negativeFranchises: topN(negativeFranchiseMap, 8)
      .map((name) => ({ name, weight: negativeFranchiseMap.get(name) ?? 0 }))
      .filter((signal) => (negativeFranchiseCounts.get(signal.name) ?? 0) >= 2),
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
 *
 * AS-15: Platform Plan membership is an input too, so adding or removing a Plan entry moves the
 * fingerprint — but only membership. Reordering a Plan, moving an entry to another platform or
 * editing a Plan note changes nothing the profile reads, and must not force a refresh.
 */
export function profileFingerprint(games: Game[], plannedGameIds: PlannedGameIds = noPlannedGameIds): string {
  const planned = plannedGameFingerprint(plannedGameIds);
  const gamesPart = games
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

  return `${gamesPart}##plans:${planned}`;
}
