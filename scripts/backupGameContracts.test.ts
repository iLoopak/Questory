/**
 * AS-02 — Backup game identity and row contracts.
 *
 * Questory deliberately supports a Wishlist COPY of a Library game (`addToWishlist` clones the
 * record with a new id but keeps steamAppId/rawgId/title/platform). Merge identity is therefore
 * collection-aware (`lib/gameIdentity`): the explicit game id identifies a record across
 * collections, every other signal only identifies it WITHIN one collection.
 *
 * These tests started life as characterization tests for the collapse (PR #650) and now assert
 * the fixed contract: twins survive, ids are stable, rejected rows are reported, and a
 * non-empty-but-unusable games section can no longer wipe a populated library.
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
import type { QuestShelfBackup, QuestShelfBackupImportResult } from '../src/lib/backupStorage';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const { getGameDatabase } = await import('../src/lib/gameDatabase');
const { gameRepository, loadGames } = await import('../src/lib/gameStorage');
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

function makeBackup(games: unknown, overrides: Partial<QuestShelfBackup> = {}): QuestShelfBackup {
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
    ...overrides,
  };
}

/** Unwrap a successful import, failing loudly if the facade refused the backup. */
function expectImported(result: QuestShelfBackupImportResult) {
  assert.equal(result.ok, true, 'expected the backup to be imported');
  return result as Extract<QuestShelfBackupImportResult, { ok: true }>;
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

const byId = (games: Game[]) => games.map((game) => game.id).sort();

// ── Library/Wishlist twins survive a merge, in both orders ──────────────────────────

for (const identity of ['steam', 'rawg', 'title-platform'] as const) {
  test(`AS-02: a Library record and its Wishlist twin stay distinct on merge (${identity} identity)`, async () => {
    const { library, wishlist } = makeCollectionTwins(identity, { updatedAt: '2026-06-01T00:00:00.000Z' });
    await setupWithLocalGames([library]);

    // The backup holds BOTH legitimate records; the local device only has the Library one.
    const newer = '2026-07-01T00:00:00.000Z';
    const result = expectImported(
      mergeQuestShelfBackup(
        makeBackup([
          { ...library, updatedAt: newer },
          { ...wishlist, updatedAt: newer, notes: 'wishlist notes' },
        ]),
      ),
    );

    // The shared Steam/RAWG/title identity no longer makes the Wishlist row resolve to the
    // Library record: it is a different collection, so it lands as its own record.
    assert.deepEqual(byId(result.data.games), [library.id, wishlist.id].sort(), 'both records survive');

    const merged = result.data.games.find((game) => game.id === library.id)!;
    assert.equal(merged.collectionType, 'library', 'the Library record kept its collection');
    assert.equal(merged.playtimeHours, 12, 'and its playtime');

    const twin = result.data.games.find((game) => game.id === wishlist.id)!;
    assert.equal(twin.collectionType, 'wishlist');
    assert.equal(twin.notes, 'wishlist notes');
  });

  test(`AS-02: the reverse merge order gives the same result (${identity} identity)`, async () => {
    const { library, wishlist } = makeCollectionTwins(identity, { updatedAt: '2026-06-01T00:00:00.000Z' });
    // Local device has the Wishlist copy; the backup carries both, Library row first.
    await setupWithLocalGames([wishlist]);

    const newer = '2026-07-01T00:00:00.000Z';
    const result = expectImported(
      mergeQuestShelfBackup(
        makeBackup([
          { ...library, updatedAt: newer },
          { ...wishlist, updatedAt: newer },
        ]),
      ),
    );

    assert.deepEqual(byId(result.data.games), [library.id, wishlist.id].sort(), 'both records survive');
    assert.equal(
      result.data.games.find((game) => game.id === wishlist.id)?.collectionType,
      'wishlist',
      'the local Wishlist record was not turned into the Library one',
    );
    assert.equal(result.data.games.find((game) => game.id === library.id)?.collectionType, 'library');
  });
}

test('AS-02: merging both twins into an empty library keeps both', async () => {
  const { library, wishlist } = makeCollectionTwins('steam');
  await setupWithLocalGames([]);

  const result = expectImported(mergeQuestShelfBackup(makeBackup([library, wishlist])));

  assert.deepEqual(byId(result.data.games), [library.id, wishlist.id].sort());
  assert.deepEqual(
    result.data.games.map((game) => game.collectionType).sort(),
    ['library', 'wishlist'],
  );
});

test('AS-02: restore (replace) also preserves both twins', async () => {
  const { library, wishlist } = makeCollectionTwins('steam');
  await setupWithLocalGames([]);

  const result = expectImported(restoreQuestShelfBackup(makeBackup([library, wishlist])));

  assert.equal(result.data.games.length, 2, 'replace keeps both records');
  assert.deepEqual(
    result.data.games.map((game) => game.collectionType).sort(),
    ['library', 'wishlist'],
  );
});

// ── Same-collection identity: dedupe, and stable ids ────────────────────────────────

for (const identity of ['steam', 'rawg', 'title-platform'] as const) {
  test(`AS-02: within one collection, a re-identified record merges instead of duplicating (${identity})`, async () => {
    const { library } = makeCollectionTwins(identity, { updatedAt: '2026-06-01T00:00:00.000Z' });
    await setupWithLocalGames([library]);

    // The same game, backed up under a DIFFERENT id (e.g. re-imported on another device) but
    // with the same provider identity and collection. It is one record, not two.
    const backupCopy: Game = {
      ...library,
      id: 'some-other-id',
      updatedAt: '2026-07-01T00:00:00.000Z',
      notes: 'newer notes',
    };

    const result = expectImported(mergeQuestShelfBackup(makeBackup([backupCopy])));

    assert.equal(result.data.games.length, 1, 'no duplicate was created inside the collection');
    assert.equal(result.data.games[0].notes, 'newer notes', 'the newer backup row won');
    // The local record's primary key survives, so Platform Plan entries / selection / undo
    // snapshots that reference it are not orphaned.
    assert.equal(result.data.games[0].id, library.id, 'the local id is preserved');
  });
}

test('AS-02: an id match still wins across collections — a record that moved collection is not duplicated', async () => {
  // moveWishlistToLibrary flips collectionType in place and keeps the id, so the same id in a
  // different collection is the same record, not a twin.
  const wishlistCopy = makeWishlistGame({ id: 'game-1', title: 'Celeste', steamAppId: 504230 });
  await setupWithLocalGames([wishlistCopy]);

  const movedToLibrary: Game = {
    ...wishlistCopy,
    collectionType: 'library',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  const result = expectImported(mergeQuestShelfBackup(makeBackup([movedToLibrary])));

  assert.equal(result.data.games.length, 1, 'the moved record did not fork into a twin');
  assert.equal(result.data.games[0].id, 'game-1');
  assert.equal(result.data.games[0].collectionType, 'library', 'the newer collection membership applied');
});

test('AS-02: merge is idempotent — re-merging the same backup adds nothing', async () => {
  const { library, wishlist } = makeCollectionTwins('steam', { updatedAt: '2026-06-01T00:00:00.000Z' });
  await setupWithLocalGames([library, wishlist]);

  const backup = makeBackup([library, wishlist]);
  expectImported(mergeQuestShelfBackup(backup));
  const second = expectImported(mergeQuestShelfBackup(backup));

  assert.deepEqual(byId(second.data.games), [library.id, wishlist.id].sort());
});

// ── Row validation contracts ────────────────────────────────────────────────────────

test('AS-02: a games section mixing valid and invalid rows reports the rejected ones', async () => {
  await setupWithLocalGames([]);

  const result = expectImported(
    restoreQuestShelfBackup(
      makeBackup([
        makeLibraryGame({ id: 'good-1', title: 'Valid Game' }),
        ...invalidGameRows,
        makeWishlistGame({ id: 'good-2', title: 'Another Valid Game' }),
      ]),
    ),
  );

  assert.deepEqual(result.data.games.map((game) => game.id), ['good-1', 'good-2']);

  // The bad rows are still skipped (a corrupt row must not block the whole import), but they
  // are now counted and attributed, so the UI can say so instead of claiming a clean import.
  assert.equal(result.games.rowCount, invalidGameRows.length + 2);
  assert.equal(result.games.acceptedCount, 2);
  assert.equal(result.games.rejectedCount, invalidGameRows.length);
  assert.deepEqual(
    [...new Set(result.games.rejected.map((row) => row.reason))].sort(),
    ['missing-id', 'missing-title', 'not-an-object'],
  );
  // Each rejection points at its position in the original array.
  assert.deepEqual(result.games.rejected.map((row) => row.index), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('AS-02: a non-empty games section where EVERY row is invalid does not wipe the collection', async () => {
  const existing = [
    makeLibraryGame({ id: 'existing-1', title: 'Existing Game' }),
    makeLibraryGame({ id: 'existing-2', title: 'Another Existing Game' }),
  ];
  await setupWithLocalGames(existing);

  const backup = makeBackup(invalidGameRows);

  // The backup still parses as structurally valid (the section is an array), as before.
  assert.equal(parseQuestShelfBackupText(JSON.stringify(backup)).ok, true);

  const result = restoreQuestShelfBackup(backup);

  // Restore now refuses rather than replacing a populated library with zero games.
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'games-section-unusable');
  assert.equal(result.games.rowCount, invalidGameRows.length);
  assert.equal(result.games.acceptedCount, 0);

  // Nothing was written: the existing library is intact.
  assert.deepEqual(byId(loadGames()), ['existing-1', 'existing-2']);
});

test('AS-02: an all-invalid games section IS accepted when there is nothing to lose', async () => {
  await setupWithLocalGames([]);

  const result = expectImported(restoreQuestShelfBackup(makeBackup(invalidGameRows)));

  assert.deepEqual(result.data.games, [], 'an empty collection stays empty');
  assert.equal(result.games.rejectedCount, invalidGameRows.length, 'the rejected rows are still reported');
});

test('AS-02: a genuinely empty games section still clears the collection', async () => {
  await setupWithLocalGames([makeLibraryGame({ id: 'existing-1', title: 'Existing Game' })]);

  // An intentionally empty array is a real user intent ("restore this empty library"), and is
  // not the same as "every row was corrupt".
  const result = expectImported(restoreQuestShelfBackup(makeBackup([])));

  assert.deepEqual(result.data.games, [], 'the collection was cleared as asked');
  assert.equal(result.games.rowCount, 0);
  assert.equal(result.games.rejectedCount, 0);
  assert.equal(result.games.present, true);
});

test('AS-02: merge never wipes games, so an all-invalid section only reports rejections', async () => {
  await setupWithLocalGames([makeLibraryGame({ id: 'existing-1', title: 'Existing Game' })]);

  const result = expectImported(mergeQuestShelfBackup(makeBackup(invalidGameRows)));

  assert.deepEqual(byId(result.data.games), ['existing-1'], 'merge is additive, nothing was lost');
  assert.equal(result.games.rejectedCount, invalidGameRows.length);
});

// ── externalSource round-trips ──────────────────────────────────────────────────────

for (const externalSource of supportedExternalSources) {
  test(`AS-02: externalSource "${externalSource}" survives an export/restore round-trip`, async () => {
    await setupWithLocalGames([makeLibraryGame({ id: 'g1', title: 'Round Trip', externalSource })]);

    // Export normalizes every game and restore normalizes again — two chances to drop it.
    const exported = createQuestShelfBackup(false);
    const restored = expectImported(restoreQuestShelfBackup(exported));

    // `playstation-library` and `nintendo-virtual-game-cards` used to be erased here, because
    // the normalizer hard-coded four of the six valid values.
    assert.equal(restored.data.games[0].externalSource, externalSource);
  });
}

test('AS-02: an externalSource that is NOT in the type contract is still rejected', async () => {
  await setupWithLocalGames([]);

  const result = expectImported(
    restoreQuestShelfBackup(
      makeBackup([{ ...makeLibraryGame({ id: 'g1', title: 'Bogus Source' }), externalSource: 'not-a-real-source' }]),
    ),
  );

  assert.equal(result.data.games[0].externalSource, undefined, 'unknown provenance is dropped, not trusted');
});

test('AS-02: the Nintendo provenance payload and its externalSource both survive', async () => {
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

  const restored = expectImported(restoreQuestShelfBackup(createQuestShelfBackup(false)));

  // Previously the detail payload survived while the `externalSource` identifying it did not,
  // leaving the record internally inconsistent.
  assert.deepEqual(restored.data.games[0].nintendoVirtualGameCard, nintendoCard);
  assert.equal(restored.data.games[0].externalSource, 'nintendo-virtual-game-cards');
});

// ── Compatibility ───────────────────────────────────────────────────────────────────

test('AS-02: unknown/future game fields survive an export/restore round-trip', async () => {
  const gameWithFutureFields = {
    ...makeLibraryGame({ id: 'g1', title: 'Future Game' }),
    // Fields this app version knows nothing about, e.g. written by a newer build.
    futureRatingSystem: { score: 9.5, source: 'some-new-provider' },
    unknownScalar: 'keep-me',
  } as unknown as Game;

  await setupWithLocalGames([gameWithFutureFields]);

  const restored = expectImported(restoreQuestShelfBackup(createQuestShelfBackup(false)));
  const round = restored.data.games[0] as unknown as Record<string, unknown>;

  assert.deepEqual(round.futureRatingSystem, { score: 9.5, source: 'some-new-provider' });
  assert.equal(round.unknownScalar, 'keep-me');
});

test('AS-02: an older QuestShelf-branded backup still restores', async () => {
  await setupWithLocalGames([]);

  // Legacy payload: `app: "QuestShelf"`, no top-level schemaVersion, legacy status/collection
  // values, and no metadata.schemaVersion.
  const legacyText = JSON.stringify({
    app: 'QuestShelf',
    schemaVersion: questShelfBackupVersion,
    metadata: { appVersion: '0.0.9', exportedAt: '2025-01-01T00:00:00.000Z' },
    data: {
      'questshelf.games.v1': [
        { id: 'legacy-1', title: 'Legacy Game', status: 'Completed', platform: 'PC' },
        { id: 'legacy-2', title: 'Legacy Backlog', status: 'Backlog', platform: 'PC' },
      ],
    },
  });

  const parsed = parseQuestShelfBackupText(legacyText);
  assert.equal(parsed.ok, true, 'a QuestShelf-branded backup is still accepted');

  const restored = expectImported(restoreQuestShelfBackup((parsed as Extract<typeof parsed, { ok: true }>).backup));

  assert.deepEqual(byId(restored.data.games), ['legacy-1', 'legacy-2']);
  // Legacy status names still migrate to the current vocabulary.
  assert.equal(restored.data.games[0].status, 'Finished');
  assert.equal(restored.data.games[1].status, 'Want to play');
  assert.equal(restored.data.games[0].collectionType, 'library', 'a missing collectionType defaults to library');
});
