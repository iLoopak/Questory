import type { Game } from '../types/game';

export type RecommendationBenchmarkProfile = {
  id: string;
  description: string;
  games: Game[];
  expected: {
    minPositiveTags?: number;
    hasNegativeSignals?: boolean;
    minReadyGames?: number;
  };
};

function game(overrides: Partial<Game>): Game {
  return {
    id: overrides.id ?? String(overrides.rawgId ?? overrides.title ?? 'game'),
    title: overrides.title ?? 'Synthetic Game',
    platform: overrides.platform ?? 'Steam',
    status: overrides.status ?? 'Finished',
    coverImage: '',
    playtimeHours: overrides.playtimeHours ?? 0,
    rating: overrides.rating,
    favorite: overrides.favorite,
    tags: overrides.tags ?? [],
    rawgTags: overrides.rawgTags ?? [],
    genres: overrides.genres ?? [],
    developers: overrides.developers ?? [],
    lastPlayedAt: null,
    notes: '',
    collectionType: overrides.collectionType ?? 'library',
    rawgId: overrides.rawgId,
    rawgSlug: overrides.rawgSlug,
    rawgTitle: overrides.rawgTitle,
  };
}

export const recommendationBenchmarkProfiles: RecommendationBenchmarkProfile[] = [
  { id: 'small-new-library', description: 'Small new library with few ratings', games: [game({ id: 'new-1', genres: ['Action'], rawgTags: ['singleplayer'] })], expected: { minReadyGames: 1 } },
  { id: 'large-imported-backlog', description: 'Large imported backlog with little engagement', games: Array.from({ length: 30 }, (_, index) => game({ id: `backlog-${index}`, status: 'Want to play', genres: [index % 2 ? 'Action' : 'Adventure'], rawgTags: ['singleplayer'] })), expected: { minReadyGames: 8 } },
  { id: 'jrpg-turn-based', description: 'Strong JRPG / turn-based preference', games: Array.from({ length: 6 }, (_, index) => game({ id: `jrpg-${index}`, rating: 5, genres: ['RPG'], rawgTags: ['turn-based-combat', 'party-rpg'], developers: ['Fictional JRPG Studio'] })), expected: { minPositiveTags: 1 } },
  { id: 'action-soulslike', description: 'Strong action / soulslike preference', games: Array.from({ length: 6 }, (_, index) => game({ id: `souls-${index}`, rating: 5, genres: ['Action'], rawgTags: ['soulslike', 'difficult'], developers: ['Ashen Works'] })), expected: { minPositiveTags: 1 } },
  { id: 'strategy-management', description: 'Strategy and management preference', games: Array.from({ length: 6 }, (_, index) => game({ id: `strategy-${index}`, rating: 4, genres: ['Strategy', 'Simulation'], rawgTags: ['management', 'base-building'] })), expected: { minPositiveTags: 1 } },
  { id: 'mixed-eclectic', description: 'Mixed eclectic profile', games: ['RPG', 'Puzzle', 'Racing', 'Strategy', 'Action', 'Simulation'].map((genre, index) => game({ id: `mixed-${index}`, rating: 4, genres: [genre], rawgTags: index % 2 ? ['metroidvania'] : ['deckbuilding'] })), expected: { minPositiveTags: 1 } },
  { id: 'many-dropped-low-rated', description: 'Many Dropped and low-rated games', games: Array.from({ length: 8 }, (_, index) => game({ id: `drop-${index}`, status: 'Dropped', rating: 1, genres: ['Shooter'], rawgTags: ['military'] })), expected: { hasNegativeSignals: true } },
  { id: 'wishlist-plans', description: 'Mostly Wishlist and Plans', games: Array.from({ length: 8 }, (_, index) => game({ id: `plan-${index}`, status: 'Want to play', collectionType: index % 2 ? 'wishlist' : 'library', genres: ['RPG'], rawgTags: ['turn-based-combat'] })), expected: { minReadyGames: 8 } },
  { id: 'single-platform', description: 'Single-platform profile', games: Array.from({ length: 8 }, (_, index) => game({ id: `steam-${index}`, platform: 'Steam', rating: 4, genres: ['Strategy'], rawgTags: ['management'] })), expected: { minReadyGames: 8 } },
  { id: 'multi-platform', description: 'Multi-platform profile', games: ['Steam', 'PS5', 'Switch', 'PC', 'Android', 'PS4', 'Steam', 'Switch'].map((platform, index) => game({ id: `platform-${index}`, platform, rating: 4, genres: ['Action'], rawgTags: ['soulslike'] })), expected: { minReadyGames: 8 } },
  { id: 'sparse-rawg-metadata', description: 'Sparse RAWG metadata', games: Array.from({ length: 8 }, (_, index) => game({ id: `sparse-${index}`, rating: 4, genres: index < 3 ? ['Puzzle'] : undefined, rawgTags: [] })), expected: { minReadyGames: 3 } },
  { id: 'strong-franchise', description: 'Strong franchise preference', games: Array.from({ length: 4 }, (_, index) => game({ id: `franchise-${index}`, title: `Sky Saga ${index + 1}`, rawgSlug: `sky-saga-${index + 1}`, rating: 5, genres: ['RPG'], rawgTags: ['turn-based-combat'] })), expected: { minPositiveTags: 1 } },
  { id: 'negative-franchise', description: 'Strong negative franchise preference', games: Array.from({ length: 4 }, (_, index) => game({ id: `bad-franchise-${index}`, title: `Dust War ${index + 1}`, rawgSlug: `dust-war-${index + 1}`, status: 'Dropped', rating: 1, genres: ['Shooter'], rawgTags: ['military'] })), expected: { hasNegativeSignals: true } },
  { id: 'conflicting-signals', description: 'Conflicting positive and negative signals', games: [game({ id: 'good', rating: 5, genres: ['RPG'], rawgTags: ['turn-based-combat'] }), game({ id: 'bad', status: 'Dropped', rating: 1, genres: ['RPG'], rawgTags: ['military'] })], expected: { minPositiveTags: 1, hasNegativeSignals: true } },
];
