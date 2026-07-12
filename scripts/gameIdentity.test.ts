/**
 * The canonical game identity contract (AS-02).
 *
 * These are pure-function tests for `lib/gameIdentity` — the rules that backup merge relies on.
 * The end-to-end merge behavior lives in backupGameContracts.test.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  areRelatedAcrossCollections,
  findGameRecordIndex,
  getSharedGameIdentitySignal,
  isGameExternalSource,
} from '../src/lib/gameIdentity';
import { gameExternalSources } from '../src/types/game';
import { makeCollectionTwins, makeLibraryGame, makeWishlistGame, supportedExternalSources } from './testUtils/gameFixtures';

test('every value in the Game.externalSource contract passes the guard', () => {
  for (const source of supportedExternalSources) {
    assert.equal(isGameExternalSource(source), true, `${source} must be preserved`);
  }

  // The fixture list and the type contract must not drift apart.
  assert.deepEqual([...supportedExternalSources].sort(), [...gameExternalSources].sort());
});

test('the guard rejects anything outside the contract', () => {
  for (const value of ['', 'steam-library', 'playstation', 'STEAM', null, undefined, 7, {}]) {
    assert.equal(isGameExternalSource(value), false);
  }
});

test('identity signals are reported in priority order', () => {
  const base = makeLibraryGame({ id: 'a', title: 'Celeste', platform: 'PC' });

  assert.equal(getSharedGameIdentitySignal(base, { ...base, id: 'a' }), 'id');
  assert.equal(
    getSharedGameIdentitySignal(
      { ...base, steamAppId: 504230 },
      { ...base, id: 'b', title: 'Different', steamAppId: 504230 },
    ),
    'steam-app-id',
  );
  assert.equal(
    getSharedGameIdentitySignal({ ...base, rawgId: 42 }, { ...base, id: 'b', title: 'Different', rawgId: 42 }),
    'rawg-id',
  );
  assert.equal(
    getSharedGameIdentitySignal(
      { ...base, romPath: '/roms/Game.sfc' },
      { ...base, id: 'b', title: 'Different', romPath: '/ROMS/game.sfc' },
    ),
    'rom-path',
    'ROM paths compare case/whitespace-insensitively',
  );
  assert.equal(
    getSharedGameIdentitySignal(base, { ...base, id: 'b', title: 'CELESTE' }),
    'title-platform',
    'the title fallback is case-insensitive',
  );
  assert.equal(
    getSharedGameIdentitySignal(
      makeLibraryGame({ id: 'a', title: 'Celeste: Farewell' }),
      makeLibraryGame({ id: 'b', title: 'Celeste Farewell' }),
    ),
    'title-platform',
    'and collapses punctuation to whitespace',
  );
  assert.equal(getSharedGameIdentitySignal(base, makeLibraryGame({ id: 'b', title: 'Hades' })), null);
});

test('the title fallback keeps its pre-existing normalization exactly', () => {
  // Carried over unchanged from backupStorage's getTitlePlatformKey: punctuation becomes a
  // space and is NOT trimmed, so a trailing "!" does not match. Preserved deliberately —
  // loosening it here would silently merge records that never merged before.
  const base = makeLibraryGame({ id: 'a', title: 'Celeste' });
  assert.equal(getSharedGameIdentitySignal(base, makeLibraryGame({ id: 'b', title: 'Celeste!' })), null);
});

test('a different platform breaks the title fallback', () => {
  const pc = makeLibraryGame({ id: 'a', title: 'Celeste', platform: 'PC' });
  const switchCopy = makeLibraryGame({ id: 'b', title: 'Celeste', platform: 'Switch' });

  assert.equal(getSharedGameIdentitySignal(pc, switchCopy), null);
  assert.equal(findGameRecordIndex([pc], switchCopy), -1, 'the same game on two platforms is two records');
});

for (const identity of ['steam', 'rawg', 'title-platform'] as const) {
  test(`a Wishlist twin never resolves to its Library original (${identity})`, () => {
    const { library, wishlist } = makeCollectionTwins(identity);

    // They ARE related — the shared signal is real...
    assert.notEqual(getSharedGameIdentitySignal(library, wishlist), null);
    assert.equal(areRelatedAcrossCollections(library, wishlist), true);

    // ...but they are not the same persisted record, in either direction.
    assert.equal(findGameRecordIndex([library], wishlist), -1);
    assert.equal(findGameRecordIndex([wishlist], library), -1);
  });
}

test('within one collection the provider fallbacks still identify a record', () => {
  const local = makeLibraryGame({ id: 'library-1', title: 'Celeste', steamAppId: 504230 });
  const sameGameOtherId = makeLibraryGame({ id: 'reimported-9', title: 'Celeste Deluxe', steamAppId: 504230 });

  assert.equal(findGameRecordIndex([local], sameGameOtherId), 0);
});

test('an id match wins across collections, because a record can change collection', () => {
  const wishlist = makeWishlistGame({ id: 'game-1', title: 'Celeste' });
  const movedToLibrary = makeLibraryGame({ id: 'game-1', title: 'Celeste' });

  assert.equal(findGameRecordIndex([wishlist], movedToLibrary), 0);
  assert.equal(areRelatedAcrossCollections(wishlist, movedToLibrary), false, 'same id is not a twin relationship');
});
