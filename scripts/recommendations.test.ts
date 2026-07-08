import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUserProfile } from '../src/lib/userProfile';
import { buildDiscoveryCandidates } from '../src/services/discoveryService';
import { scorePersonalRecommendationCandidate } from '../src/services/personalRecommendationsService';
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
