/**
 * AS-02 — Backup game identity and row contracts are not canonical.
 *
 * Questory deliberately supports a Wishlist COPY of a Library game (`addToWishlist` clones
 * the record with a new id but keeps steamAppId/rawgId/title/platform). `mergeGames` in
 * backupStorage.ts matches on the FIRST of id / steamAppId / rawgId / romPath /
 * title+platform and never looks at `collectionType`, so those two legitimate records can
 * collapse into one.
 *
 * These tests CHARACTERIZE that. Nothing here is a fix — the assertions marked
 * "documents unsafe current behavior" encode the defect so the follow-up PR must invert them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter } from './testUtils/controllableStorageAdapter';
import { clearQuestoryTables } from './testUtils/indexedDbControl';
import {
  invalidGameRows,
  makeCollectionTwins,
  makeLibraryGame,
  makeWishlistGame,
  supportedExternalSources,
} from './testUtils/gameFixtures';
import type { QuestShelfBackup } from '../src/lib/backupStorage';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository } = await import('../src/lib/gameStorage');
const { playActivityRepository } = await import('../src/lib/playActivityStorage');
const { rawgMetadataCacheRepository } = await import('../src/lib/rawgMetadataCache');
const {
  createQuestShelfBackup,
  mergeQuestShelfBackup,
  parseQuestShelfBackupText,
  restoreQuestShelfBackup,
  questShelfAppVersion,
  questShelfBackupVersion,
} = await import('../src/lib/backupStorage');

const database = getGameDatabase()!;

function makeBackup(games: unknown): QuestShelfBackup {
  return {
    app: 'Questory',
    schemaVersion: questShelfBackupVersion,
    metadata: {
      appVersion: questShelfAppVersion,
      exportedAt: '2026-07-01T00:00:00.000Z',
      includesIntegrationSettings: false,
      includesSecrets: false,
      schemaVersion: questShelfBackupVersion,
    },
    data: { 'questshelf.games.v1': games },
  };
}

/** Fresh stores, immediate durable writes; these tests read the returned snapshot. */
async function setupWithLocalGames(localGames: Game[]): Promise<void> {
  resetWebStorage();
  const storage = createControllableStorageAdapter({ durableMode: 'auto' });
  setStorageAdapter(storage.adapter);

  await gameRepository.ready();
  await playActivityRepository.ready();
  await rawgMetadataCacheRepository.ready();
  await gameRepository.clear();
  await clearQuestoryTables(database);

  gameRepository.replaceAll(localGames);
}

// ── Library/Wishlist twins collapsing on merge ──────────────────────────────────────

for (const identity of ['steam', 'rawg', 'title-platform'] as const) {
  test(`AS-02: a Wishlist twin in the backup overwrites the local Library record (${identity} identity)`, async () => {
    const { library, wishlist } = makeCollectionTwins(identity, { updatedAt: '2026-06-01T00:00:00.000Z' });
    await setupWithLocalGames([library]);

    // The backup holds BOTH legitimate records; the local device only has the Library one.
    const newer = '2026-07-01T00:00:00.000Z';
    const result = mergeQuestShelfBackup(
      makeBackup([
        { ...library, updatedAt: newer },
        { ...wishlist, updatedAt: newer },
      ]),
    );

    // Documents unsafe current behavior: `areGamesMatching` sees the shared identity and
    // ignores collectionType, so the Wishlist row matches the LIBRARY record and is merged
    // *into* it. Because the merge spreads the whole backup row (`{...local, ...backup}`),
    // even the `id` is overwritten — so the Library record does not just change collection,
    // it ceases to exist, and anything referencing its id (e.g. a Platform Plan entry) is
    // left dangling.
    assert.equal(result.games.length, 1, 'the two records collapsed into one');
    assert.equal(result.games[0].id, wishlist.id, 'the Library id was replaced by the Wishlist id');
    assert.equal(result.games[0].collectionType, 'wishlist', 'the owned Library record is gone');
    assert.equal(result.games[0].playtimeHours, 0, 'and its playtime went with it');
  });

  test(`AS-02: the reverse merge order collapses them too (${identity} identity)`, async () => {
    const { library, wishlist } = makeCollectionTwins(identity, { updatedAt: '2026-06-01T00:00:00.000Z' });
    // Local device has the Wishlist copy; the backup carries both, Library row first.
    await setupWithLocalGames([wishlist]);

    const newer = '2026-07-01T00:00:00.000Z';
    const result = mergeQuestShelfBackup(
      makeBackup([
        { ...library, updatedAt: newer },
        { ...wishlist, updatedAt: newer },
      ]),
    );

    // Documents unsafe current behavior: symmetric collapse — now the Library row is merged
    // into the local Wishlist record, so the owned Library game is lost instead.
    assert.equal(result.games.length, 1, 'the two records collapsed into one');
    assert.equal(result.games[0].id, wishlist.id, 'the surviving row keeps the Wishlist id');
    assert.equal(result.games[0].collectionType, 'wishlist', 'the Library membership was not preserved');
  });
}

test('AS-02: merging both twins into an EMPTY library still collapses them, silently dropping one', async () => {
  // Neither fixture carries a timestamp, so `isBackupGameNewer` is false and the matched row
  // is left untouched — the Wishlist twin is simply never added.
  const { library, wishlist } = makeCollectionTwins('steam');
  await setupWithLocalGames([]);

  const result = mergeQuestShelfBackup(makeBackup([library, wishlist]));

  // Documents unsafe current behavior: a backup holding two legitimate records restores as
  // one. Which twin survives depends only on array order and timestamps.
  assert.equal(result.games.length, 1, 'one of the two backed-up records was dropped');
  assert.equal(result.games[0].id, library.id);
  assert.equal(result.games[0].collectionType, 'library', 'the Wishlist copy never made it back');
});

test('AS-02: restore (replace) preserves both twins — only merge collapses them', async () => {
  const { library, wishlist } = makeCollectionTwins('steam');
  await setupWithLocalGames([]);

  // restore does not run mergeGames; it normalizes and replaces wholesale.
  const result = restoreQuestShelfBackup(makeBackup([library, wishlist]));

  assert.equal(result.games.length, 2, 'replace keeps both records');
  assert.deepEqual(
    result.games.map((game) => game.collectionType).sort(),
    ['library', 'wishlist'],
  );
});

// ── Row validation contracts ────────────────────────────────────────────────────────

test('AS-02: a games section mixing valid and invalid rows silently drops the invalid ones', async () => {
  await setupWithLocalGames([]);

  const result = restoreQuestShelfBackup(
    makeBackup([
      makeLibraryGame({ id: 'good-1', title: 'Valid Game' }),
      ...invalidGameRows,
      makeWishlistGame({ id: 'good-2', title: 'Another Valid Game' }),
    ]),
  );

  // Documents unsafe current behavior: `normalizeLoadedGames` filters the bad rows out and
  // restore returns no per-row report, so the user is told the import succeeded with no
  // indication that 8 rows were discarded.
  assert.deepEqual(result.games.map((game) => game.id), ['good-1', 'good-2']);
  assert.equal(invalidGameRows.length, 8, 'all 8 malformed rows vanished without a report');
});

test('AS-02: a non-empty games section where EVERY row is invalid wipes the collection', async () => {
  await setupWithLocalGames([
    makeLibraryGame({ id: 'existing-1', title: 'Existing Game' }),
    makeLibraryGame({ id: 'existing-2', title: 'Another Existing Game' }),
  ]);

  const backup = makeBackup(invalidGameRows);

  // Validation only checks `Array.isArray`, so this passes as a well-formed backup.
  const parsed = parseQuestShelfBackupText(JSON.stringify(backup));
  assert.equal(parsed.ok, true, 'an all-invalid games array is accepted as valid');

  const result = restoreQuestShelfBackup(backup);

  // Documents unsafe current behavior: a non-empty games section that normalizes to zero rows
  // replaces a populated collection with nothing, with no confirmation and no way back.
  assert.deepEqual(result.games, [], 'the existing library was destroyed');
});

// ── externalSource round-trips ──────────────────────────────────────────────────────

for (const externalSource of supportedExternalSources) {
  const isStripped = externalSource === 'playstation-library' || externalSource === 'nintendo-virtual-game-cards';

  test(`AS-02: externalSource "${externalSource}" ${isStripped ? 'is STRIPPED by' : 'survives'} an export/restore round-trip`, async () => {
    await setupWithLocalGames([makeLibraryGame({ id: 'g1', title: 'Round Trip', externalSource })]);

    // Export normalizes every game, then restore normalizes again — two chances to drop it.
    const exported = createQuestShelfBackup(false);
    const restored = restoreQuestShelfBackup(exported as QuestShelfBackup);

    if (isStripped) {
      // Documents unsafe current behavior: `normalizeExternalSource` (gameStorage.ts) only
      // allows manual/steam/steam-wishlist/retro-rom, so PS and Nintendo provenance — which
      // `Game.externalSource` permits and multiGameImport writes — is silently erased.
      assert.equal(restored.games[0].externalSource, undefined, 'provenance was lost');
    } else {
      assert.equal(restored.games[0].externalSource, externalSource);
    }
  });
}

test('AS-02: the Nintendo provenance payload survives even though its externalSource does not', async () => {
  const nintendoCard = {
    source: 'nintendo-virtual-game-cards' as const,
    version: 1 as const,
    vgcId: 'vgc-123',
    cardType: 'game',
  };
  await setupWithLocalGames([
    makeLibraryGame({
      id: 'g1',
      title: 'Nintendo Game',
      externalSource: 'nintendo-virtual-game-cards',
      nintendoVirtualGameCard: nintendoCard,
    }),
  ]);

  const restored = restoreQuestShelfBackup(createQuestShelfBackup(false) as QuestShelfBackup);

  // The record is left in an inconsistent state: the detail payload is preserved (it rides
  // along on the unknown-field spread) while the `externalSource` that identifies it is not.
  assert.deepEqual(restored.games[0].nintendoVirtualGameCard, nintendoCard);
  assert.equal(restored.games[0].externalSource, undefined);
});

// ── Unknown-field preservation (an existing compatibility guarantee) ────────────────

test('AS-02: unknown/future game fields survive an export/restore round-trip', async () => {
  const gameWithFutureFields = {
    ...makeLibraryGame({ id: 'g1', title: 'Future Game' }),
    // Fields this app version knows nothing about, e.g. written by a newer build.
    futureRatingSystem: { score: 9.5, source: 'some-new-provider' },
    unknownScalar: 'keep-me',
  } as unknown as Game;

  await setupWithLocalGames([gameWithFutureFields]);

  const restored = restoreQuestShelfBackup(createQuestShelfBackup(false) as QuestShelfBackup);
  const round = restored.games[0] as unknown as Record<string, unknown>;

  // `normalizeLoadedGame` spreads the whole record before repairing known fields, which is
  // what makes forward compatibility work. This test locks that guarantee in.
  assert.deepEqual(round.futureRatingSystem, { score: 9.5, source: 'some-new-provider' });
  assert.equal(round.unknownScalar, 'keep-me');
});
