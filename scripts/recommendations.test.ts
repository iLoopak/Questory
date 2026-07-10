import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUserProfile } from '../src/lib/userProfile';
import { buildDiscoveryCandidates } from '../src/services/discoveryService';
import { scorePersonalRecommendationCandidate } from '../src/services/personalRecommendationsService';
import { scoreContextualTagOverlapForTest } from '../src/services/contextualRecommendationsService';
import { getUpcomingDateRange, ignoreReleaseCalendarGame, getIgnoredReleaseRawgIds, rankReleaseCalendarResults } from '../src/services/releaseCalendarService';
import type { Game } from '../src/types/game';
import type { DiscoveryGame } from '../src/lib/discovery';
import type { RawgSearchResult } from '../src/types/rawg';

function game(overrides: Partial<Game>): Game {
  return {
    id: overrides.id ?? 'g',
    title: overrides.title ?? 'Game',
    platform: overrides.platform ?? 'Steam',
    status: overrides.status ?? 'Want to play',
    coverImage: '',
    playtimeHours: overrides.playtimeHours ?? 0,
    rating: overrides.rating,
    tags: overrides.tags ?? [],
    rawgTags: overrides.rawgTags,
    genres: overrides.genres,
    developers: overrides.developers,
    lastPlayedAt: null,
    notes: '',
    collectionType: overrides.collectionType ?? 'library',
    rawgId: overrides.rawgId,
  };
}

function rawg(overrides: Partial<RawgSearchResult>): RawgSearchResult {
  return {
    id: overrides.id ?? 100,
    name: overrides.name ?? 'Candidate',
    background_image: null,
    metacritic: overrides.metacritic ?? null,
    rating: overrides.rating,
    ratings_count: overrides.ratings_count,
    platforms: overrides.platforms ?? [{ platform: { id: 4, name: 'PC', slug: 'pc' } }],
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    released: overrides.released ?? null,
    slug: overrides.slug ?? null,
  };
}

function discovery(overrides: Partial<DiscoveryGame>): DiscoveryGame {
  return {
    rawgId: overrides.rawgId ?? 100,
    title: overrides.title ?? 'Candidate',
    coverUrl: null,
    metacritic: null,
    platforms: [],
    hasSteamVersion: false,
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    released: null,
    slug: null,
  };
}


test('contextual recommendations rank niche gameplay overlap above generic tag overlap', () => {
  const current = ['roguelite', 'deckbuilder', 'singleplayer', 'indie', '2d', 'controller'];
  const niche = scoreContextualTagOverlapForTest(['roguelite', 'deckbuilder'], current);
  const generic = scoreContextualTagOverlapForTest(['singleplayer', 'indie', '2d', 'controller', 'pixel-graphics', '3d'], current);

  assert.ok(niche.score > generic.score);
  assert.ok(niche.meaningfulMatches >= 2);
  assert.equal(generic.meaningfulMatches, 0);
});

test('highly rated finished games raise matching candidate scores', () => {
  const profile = buildUserProfile([game({ id: 'hades', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['roguelite'] })]);
  const matching = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 1, name: 'Action', slug: 'action' }], tags: [{ id: 1, name: 'Roguelite', slug: 'roguelite' }] }), profile);
  const unrelated = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 2, name: 'Puzzle', slug: 'puzzle' }], tags: [] }), profile);
  assert.ok(matching.total > unrelated.total);
});

test('low-rated finished games reduce matching candidate scores', () => {
  const profile = buildUserProfile([game({ id: 'bad', status: 'Finished', rating: 1, genres: ['Shooter'], rawgTags: ['military'] })]);
  const disliked = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 1, name: 'Shooter', slug: 'shooter' }], tags: [{ id: 1, name: 'Military', slug: 'military' }] }), profile);
  assert.ok(disliked.total < 0);
});

test('dropped, owned, finished, and wishlist games are filtered from discovery candidates', () => {
  const userGames = [
    game({ id: 'owned', rawgId: 1, status: 'Playing' }),
    game({ id: 'finished', rawgId: 2, status: 'Finished' }),
    game({ id: 'dropped', rawgId: 3, status: 'Dropped' }),
    game({ id: 'wish', rawgId: 4, collectionType: 'wishlist' }),
  ];
  const candidates = buildDiscoveryCandidates([1, 2, 3, 4, 5].map((rawgId) => discovery({ rawgId })), userGames);
  assert.deepEqual(candidates.map((c) => c.game.rawgId), [5]);
});

test('home profile changes when ratings change', () => {
  const fiveStar = buildUserProfile([game({ id: 'rpg', status: 'Finished', rating: 5, genres: ['RPG'] })]);
  const oneStar = buildUserProfile([game({ id: 'rpg', status: 'Finished', rating: 1, genres: ['RPG'] })]);
  assert.equal(fiveStar.topGenres[0]?.name, 'RPG');
  assert.equal(oneStar.topGenres.length, 0);
  assert.equal(oneStar.negativeGenres[0]?.name, 'RPG');
});


test('release calendar builds an upcoming date range from today through the selected window', () => {
  assert.equal(getUpcomingDateRange(30, new Date('2026-07-08T12:00:00Z')), '2026-07-08,2026-08-07');
  assert.equal(getUpcomingDateRange(90, new Date('2026-07-08T12:00:00Z')), '2026-07-08,2026-10-06');
});

test('release calendar ignored games are persisted as RAWG ids', () => {
  const store = new Map<string, string>();
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } as Storage;
  ignoreReleaseCalendarGame(1234);
  assert.deepEqual([...getIgnoredReleaseRawgIds()], [1234]);
});


test('release calendar relaxes thresholds to keep a healthy upcoming pool', () => {
  const userGames = [
    game({ id: 'liked', title: 'Loved Action', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['roguelite'], platform: 'Steam' }),
    game({ id: 'plan', title: 'Planned RPG', status: 'Want to play', genres: ['RPG'], rawgTags: ['party'], platform: 'Steam' }),
  ];
  const results = [
    rawg({ id: 1, name: 'Strong Action', genres: [{ id: 1, name: 'Action', slug: 'action' }], tags: [{ id: 1, name: 'Roguelite', slug: 'roguelite' }], rating: 4.2, ratings_count: 900 }),
    rawg({ id: 2, name: 'RPG Plan', genres: [{ id: 2, name: 'RPG', slug: 'role-playing-games-rpg' }], tags: [{ id: 2, name: 'Party', slug: 'party' }] }),
    rawg({ id: 3, name: 'Puzzle North', genres: [{ id: 3, name: 'Puzzle', slug: 'puzzle' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 4, name: 'Strategy East', genres: [{ id: 4, name: 'Strategy', slug: 'strategy' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 5, name: 'Adventure South', genres: [{ id: 5, name: 'Adventure', slug: 'adventure' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 6, name: 'Simulation West', genres: [{ id: 6, name: 'Simulation', slug: 'simulation' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 7, name: 'Racing Nova', genres: [{ id: 7, name: 'Racing', slug: 'racing' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 8, name: 'Sports Orbit', genres: [{ id: 8, name: 'Sports', slug: 'sports' }], platforms: [], rating: 4.1, ratings_count: 1200 }),
  ];
  const ranked = rankReleaseCalendarResults(results, userGames);
  assert.equal(ranked.length, 8);
  assert.equal(ranked[0].result.id, 1);
  assert.ok(ranked.some((item) => item.pass === 'general'));
});

test('release calendar diversity avoids one genre or franchise taking over', () => {
  const userGames = [game({ id: 'liked', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['soulslike'], platform: 'Steam' })];
  const results = Array.from({ length: 8 }, (_, index) => rawg({
    id: index + 10,
    name: `Dragon Quest ${index + 1}`,
    slug: `dragon-quest-${index + 1}`,
    genres: [{ id: 1, name: 'Action', slug: 'action' }],
    tags: [{ id: 1, name: 'Soulslike', slug: 'soulslike' }],
    rating: 4.5,
    ratings_count: 2000,
  })).concat([
    rawg({ id: 30, name: 'Puzzle Star', genres: [{ id: 2, name: 'Puzzle', slug: 'puzzle' }], rating: 4.2, ratings_count: 1000 }),
    rawg({ id: 31, name: 'Strategy Moon', genres: [{ id: 3, name: 'Strategy', slug: 'strategy' }], rating: 4.2, ratings_count: 1000 }),
  ]);
  const ranked = rankReleaseCalendarResults(results, userGames);
  assert.ok(ranked.filter((item) => item.result.name.startsWith('Dragon Quest')).length <= 2);
  assert.ok(new Set(ranked.map((item) => item.result.genres?.[0]?.name)).size > 1);
});
