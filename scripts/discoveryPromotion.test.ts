/**
 * AS-09 — one conversion, one identity contract, one promotion decision.
 *
 * The preview adapter and the persisted adapter used to disagree: the preview showed the candidate's
 * real platform and its tags, the persisted conversion hardcoded every non-Steam game to `PC` and
 * dropped the tags. Identity was ad hoc too — preview promotion looked for an existing record, Inbox
 * promotion always minted a new one — so a game imported elsewhere could be duplicated, and the
 * Plans path could hand the picker a synthetic id that no persisted game ever had.
 *
 * These tests pin the pure half: the mapper, the platform rules, the identity resolver and the plan.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment } from './testUtils/testEnvironment';
import { makeLibraryGame, makeWishlistGame } from './testUtils/gameFixtures';
import { discoveryGameToGame } from '../src/lib/discovery';
import {
  createDiscoveryGameId,
  mapDiscoveryCandidateToGame,
  planDiscoveryPromotion,
  resolveDiscoveryIdentity,
  resolveDiscoveryPlatform,
  resolveDiscoveryPlatforms,
} from '../src/lib/discoveryPromotion';
import type { DiscoveryGame } from '../src/lib/discovery';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const now = new Date('2026-07-12T10:00:00.000Z');

function makeCandidate(overrides: Partial<DiscoveryGame> = {}): DiscoveryGame {
  return {
    rawgId: 3498,
    title: 'Bloodborne',
    coverUrl: 'https://media.rawg.io/bloodborne.jpg',
    metacritic: 92,
    rawgRating: 4.6,
    rawgRatingsCount: 4200,
    platforms: ['PS4'],
    hasSteamVersion: false,
    genres: ['Action', 'RPG'],
    tags: ['souls-like', 'gothic', 'difficult', 'atmospheric', 'singleplayer', 'boss-rush'],
    released: '2015-03-24',
    slug: 'bloodborne',
    ...overrides,
  };
}

const mapCandidate = (candidate: DiscoveryGame) =>
  mapDiscoveryCandidateToGame(candidate, { id: 'rawg-bloodborne', now });

// ---------------------------------------------------------------------------
// Platform mapping
// ---------------------------------------------------------------------------

test('AS-09: a PS5 candidate does not persist as PC', () => {
  const candidate = makeCandidate({ platforms: ['PS5'], hasSteamVersion: false });
  assert.equal(resolveDiscoveryPlatform(candidate), 'PS5');
  assert.equal(mapCandidate(candidate).platform, 'PS5');
});

test('AS-09: provider platform labels are normalized through one table', () => {
  const cases: Array<[string[], string]> = [
    [['PlayStation 5'], 'PS5'],
    [['PS4'], 'PS4'],
    [['Xbox Series S/X'], 'Xbox Series X|S'],
    [['Xbox One'], 'Xbox One'],
    [['Nintendo Switch'], 'Switch'],
    [['PC'], 'PC'],
  ];

  for (const [platforms, expected] of cases) {
    assert.equal(resolveDiscoveryPlatform(makeCandidate({ platforms, hasSteamVersion: false })), expected, platforms[0]);
  }
});

test('AS-09: a multi-platform candidate maps deterministically', () => {
  const consoleOnly = makeCandidate({ platforms: ['PS5', 'Xbox Series S/X', 'Nintendo Switch'], hasSteamVersion: false });
  // The first actual platform wins — the same one the preview has always displayed.
  assert.equal(resolveDiscoveryPlatform(consoleOnly), 'PS5');
  assert.deepEqual(resolveDiscoveryPlatforms(consoleOnly), ['PS5', 'Xbox Series X|S', 'Switch']);

  // A PC version means the user can own it on Steam; that beats a console listing, and it is the
  // rule both adapters already used.
  const withPc = makeCandidate({ platforms: ['PS5', 'PC'], hasSteamVersion: true });
  assert.equal(resolveDiscoveryPlatform(withPc), 'Steam');
});

test('AS-09: an underivable platform falls back to Other rather than inventing a PC copy', () => {
  const candidate = makeCandidate({ platforms: ['Atari Jaguar'], hasSteamVersion: false });
  assert.equal(resolveDiscoveryPlatform(candidate), 'Other');
  assert.deepEqual(resolveDiscoveryPlatforms(candidate), []);
});

// ---------------------------------------------------------------------------
// Mapper parity
// ---------------------------------------------------------------------------

test('AS-09: preview and persisted conversion agree on the platform', () => {
  const candidates = [
    makeCandidate({ platforms: ['PS5'], hasSteamVersion: false }),
    makeCandidate({ platforms: ['Nintendo Switch'], hasSteamVersion: false }),
    makeCandidate({ platforms: ['PC', 'PS5'], hasSteamVersion: true }),
  ];

  for (const candidate of candidates) {
    assert.equal(
      discoveryGameToGame(candidate, 'preview').platform,
      mapCandidate(candidate).platform,
      `${candidate.platforms.join('/')} must persist as it previews`,
    );
  }
});

test('AS-09: tags and provider ids survive persistence', () => {
  const candidate = makeCandidate();
  const game = mapCandidate(candidate);

  assert.deepEqual(game.tags, ['souls-like', 'gothic', 'difficult', 'atmospheric', 'singleplayer']);
  assert.deepEqual(game.rawgTags, candidate.tags, 'the full provider list is kept alongside the capped user tags');
  assert.equal(game.rawgId, 3498);
  assert.equal(game.rawgSlug, 'bloodborne');
  assert.equal(game.rawgTitle, 'Bloodborne');
  assert.deepEqual(game.genres, ['Action', 'RPG']);
  assert.equal(game.released, '2015-03-24');
  assert.equal(game.coverImage, candidate.coverUrl);
  assert.equal(game.artworkSource, 'rawg');
  assert.equal(game.externalSource, 'manual');
  assert.equal(game.metadataSource, 'rawg');
});

test('AS-09: preview-only fields are not persisted', () => {
  const game = mapCandidate(makeCandidate()) as Record<string, unknown>;

  for (const previewOnlyField of ['badges', 'reason', 'source', 'score', 'availableActions', 'collectionStatus', 'hasSteamVersion', 'platforms']) {
    assert.equal(previewOnlyField in game, false, `${previewOnlyField} is a view-model field and must not persist`);
  }
});

test('AS-09: ids are stable and collision-free', () => {
  const candidate = makeCandidate();
  assert.equal(createDiscoveryGameId(candidate, new Set()), 'rawg-bloodborne');
  assert.equal(createDiscoveryGameId(candidate, new Set(['rawg-bloodborne'])), 'rawg-bloodborne-2');
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

const proposed = () => mapCandidate(makeCandidate());

test('AS-09: an existing Library record is resolved by RAWG id', () => {
  const existing = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const identity = resolveDiscoveryIdentity(proposed(), [existing]);

  assert.equal(identity.library?.game.id, 'lib-1');
  assert.equal(identity.library?.signal, 'rawg-id');
  assert.equal(identity.wishlist, null);
});

test('AS-09: an existing Wishlist record is resolved separately from the Library', () => {
  const wishlisted = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const identity = resolveDiscoveryIdentity(proposed(), [wishlisted]);

  assert.equal(identity.wishlist?.game.id, 'wish-1');
  assert.equal(identity.library, null);
});

test('AS-09: Library and Wishlist twins are both resolved and neither is collapsed', () => {
  const library = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const wishlist = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });

  for (const games of [[library, wishlist], [wishlist, library]]) {
    const identity = resolveDiscoveryIdentity(proposed(), games);
    assert.equal(identity.library?.game.id, 'lib-1', 'the twins resolve independently, whatever the input order');
    assert.equal(identity.wishlist?.game.id, 'wish-1');
  }
});

test('AS-09: a Steam id beats a weak title match', () => {
  const steamGame = makeLibraryGame({ id: 'steam-1', title: 'Bloodborne Remastered', platform: 'Steam', steamAppId: 42 });
  const titleTwin = makeLibraryGame({ id: 'lib-2', title: 'Bloodborne', platform: 'PS4' });
  const candidateGame: Game = { ...proposed(), steamAppId: 42 };

  const identity = resolveDiscoveryIdentity(candidateGame, [titleTwin, steamGame]);
  assert.equal(identity.library?.game.id, 'steam-1');
  assert.equal(identity.library?.signal, 'steam-app-id');
});

test('AS-09: title and platform resolve a record only when nothing stronger does', () => {
  const existing = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4' });
  const identity = resolveDiscoveryIdentity(proposed(), [existing]);

  assert.equal(identity.library?.game.id, 'lib-1');
  assert.equal(identity.library?.signal, 'title-platform');
});

test('AS-09: an ambiguous weak match resolves to nothing, so no record can be overwritten', () => {
  const first = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4' });
  const second = makeLibraryGame({ id: 'lib-2', title: 'Bloodborne', platform: 'PS4' });

  const identity = resolveDiscoveryIdentity(proposed(), [first, second]);
  assert.equal(identity.library, null, 'two records share the weak signal — picking one would be a coin flip');
  assert.equal(identity.ambiguous, true);
});

// ---------------------------------------------------------------------------
// Promotion plan
// ---------------------------------------------------------------------------

const planFor = (destination: 'library' | 'wishlist' | 'plans', games: Game[]) =>
  planDiscoveryPromotion({ candidate: makeCandidate(), destination, games, now });

test('AS-09: a new candidate is created once in the Library', () => {
  const plan = planFor('library', []);
  assert.equal(plan.outcome, 'created');
  assert.equal(plan.action.kind, 'create-library');
  assert.equal(plan.gameId, 'rawg-bloodborne');
});

test('AS-09: an owned game is not duplicated', () => {
  const owned = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const plan = planFor('library', [owned]);

  assert.equal(plan.outcome, 'already-present');
  assert.equal(plan.action.kind, 'none');
  assert.equal(plan.gameId, 'lib-1');
});

test('AS-09: a wishlisted game is promoted in place, not copied', () => {
  const wishlisted = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const plan = planFor('library', [wishlisted]);

  assert.equal(plan.outcome, 'reused');
  assert.equal(plan.action.kind, 'move-to-library');
  assert.equal(plan.gameId, 'wish-1');
});

test('AS-09: wishlisting an owned game copies it and leaves the Library record owned', () => {
  const owned = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const plan = planFor('wishlist', [owned]);

  assert.equal(plan.outcome, 'created');
  assert.equal(plan.action.kind, 'wishlist-existing', 'the twin is made FROM the owned record, which is never rewritten');
  assert.equal(plan.action.kind === 'wishlist-existing' ? plan.action.game.id : null, 'lib-1');
});

test('AS-09: an already wishlisted candidate is not wishlisted twice', () => {
  const wishlisted = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const plan = planFor('wishlist', [wishlisted]);

  assert.equal(plan.outcome, 'already-present');
  assert.equal(plan.action.kind, 'none');
  assert.equal(plan.gameId, 'wish-1');
});

test('AS-09: an ambiguous weak match creates a new record rather than adopting the wrong one', () => {
  const first = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4' });
  const second = makeLibraryGame({ id: 'lib-2', title: 'Bloodborne', platform: 'PS4' });

  const plan = planFor('library', [first, second]);
  assert.equal(plan.action.kind, 'create-library');
  assert.equal(plan.ambiguous, true);
  assert.notEqual(plan.gameId, 'lib-1');
  assert.notEqual(plan.gameId, 'lib-2');
});

test('AS-09: Plans resolves a Library-compatible record and never a synthetic id', () => {
  const created = planFor('plans', []);
  assert.equal(created.outcome, 'created');
  assert.equal(created.action.kind, 'create-library', 'a Plan entry references a real Library game');

  const owned = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const reused = planFor('plans', [owned]);
  assert.equal(reused.gameId, 'lib-1', 'the picker gets the persisted id, not rawg-bloodborne');

  const wishlisted = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const promoted = planFor('plans', [wishlisted]);
  assert.equal(promoted.action.kind, 'move-to-library');
  assert.equal(promoted.gameId, 'wish-1');
});
