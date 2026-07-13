import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { backupMergePolicies, mergeGamesWithIdentityMap, prepareBackupMerge } from '../src/lib/backupMerge';
import { normalizePlatformQueueState } from '../src/lib/platformQueueStorage';
import { normalizeReviewModeState } from '../src/lib/reviewModeStorage';
import { makeLibraryGame, makePlayActivityRecord, makeWishlistGame } from './testUtils/gameFixtures';

const emptyPlan = () => normalizePlatformQueueState({ activePlatforms: [], entries: [], settings: [] });
const emptyReview = () => normalizeReviewModeState(undefined);

function prepare(overrides: Partial<Parameters<typeof prepareBackupMerge>[0]> = {}) {
  return prepareBackupMerge({
    backupGames: [],
    backupIgnoredSteamGames: [],
    backupPlayActivity: [],
    backupPlatformQueues: emptyPlan(),
    backupReviewMode: emptyReview(),
    localGames: [],
    localIgnoredSteamGames: [],
    localPlayActivity: [],
    localPlatformQueues: emptyPlan(),
    localReviewMode: emptyReview(),
    presentKeys: new Set(),
    ...overrides,
  });
}

test('merge policy table covers every schema-v1 backup section exactly once', () => {
  const expectedKeys = [
    'questshelf.achievementCounters.v1', 'questshelf.games.v1', 'questshelf.rawgMetadataCache.v1',
    'questshelf.recommendationFeedback.v1', 'questshelf.recommendationPreferences.v1', 'questshelf.tasteProfile.v1',
    'questshelf.steamIgnoredGames.v1', 'questshelf.libraryFilters.v1', 'questshelf.wishlistFilters.v1',
    'questshelf.onboarding.v1', 'questshelf.platformQueues.v1', 'questshelf.playActivity.v1',
    'questshelf.reviewMode.v1', 'questshelf.rawgSettings.v1', 'questshelf.steamGridDbSettings.v1',
    'questshelf.isThereAnyDealSettings.v1', 'questshelf.steamSettings.v1', 'questshelf.appPersonalization.v1',
    'questshelf.shelfIdentity.v1',
  ];
  assert.deepEqual(backupMergePolicies.map((entry) => entry.key).sort(), expectedKeys.sort());
  assert.equal(new Set(backupMergePolicies.map((entry) => entry.key)).size, expectedKeys.length);
});

for (const identity of ['rawg', 'steam', 'title-platform'] as const) {
  test(`${identity} identity maps a different backup ID to the canonical local ID`, () => {
    const provider = identity === 'rawg' ? { rawgId: 42 } : identity === 'steam' ? { steamAppId: 730 } : {};
    const local = makeLibraryGame({ id: 'local-id', title: 'Portal 2', platform: 'PC', updatedAt: '2026-01-01T00:00:00Z', ...provider });
    const backup = { ...local, id: 'backup-id', notes: 'new', updatedAt: '2026-02-01T00:00:00Z' };
    const result = mergeGamesWithIdentityMap([local], [backup]);
    assert.equal(result.idMap.get('backup-id'), 'local-id');
    assert.equal(result.games.length, 1);
    assert.equal(result.games[0].id, 'local-id');
    assert.equal(result.games[0].notes, 'new');
    assert.deepEqual({ added: result.added, updated: result.updated }, { added: 0, updated: 1 });
  });
}

test('Library and Wishlist twins are not collapsed', () => {
  const localLibrary = makeLibraryGame({ id: 'library-local', title: 'Twin', steamAppId: 9 });
  const localWishlist = makeWishlistGame({ id: 'wishlist-local', title: 'Twin', steamAppId: 9 });
  const backupWishlist = { ...localWishlist, id: 'wishlist-backup', updatedAt: '2026-02-01T00:00:00Z' };
  const result = mergeGamesWithIdentityMap([localLibrary, localWishlist], [backupWishlist]);
  assert.equal(result.games.length, 2);
  assert.equal(result.idMap.get('wishlist-backup'), 'wishlist-local');
});

test('multiple weak title/platform candidates remain ambiguous and are never arbitrarily attached', () => {
  const first = makeLibraryGame({ id: 'first', title: 'Same Name', platform: 'PC' });
  const second = makeLibraryGame({ id: 'second', title: 'Same Name', platform: 'PC' });
  const incoming = makeLibraryGame({ id: 'incoming', title: 'Same Name', platform: 'PC' });
  const result = mergeGamesWithIdentityMap([first, second], [incoming]);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.games.length, 3, 'ambiguous incoming record is retained separately');
  assert.equal(result.identities[0].status, 'ambiguous');
});

test('ignored Steam IDs are unioned and local-only IDs survive', () => {
  const result = prepare({
    localIgnoredSteamGames: [{ steamAppId: 1, ignoredAt: '2026-01-01', title: 'Local' }],
    backupIgnoredSteamGames: [
      { steamAppId: 1, ignoredAt: '2026-02-01', title: 'Backup duplicate' },
      { steamAppId: 2, ignoredAt: '2026-02-01', title: 'Backup only' },
    ],
    presentKeys: new Set(['questshelf.steamIgnoredGames.v1']),
  });
  assert.deepEqual(result.ignoredSteamGames.map((record) => record.steamAppId), [1, 2]);
  assert.equal(result.ignoredSteamGames[0].title, 'Local');
});

test('play activity remaps game IDs, unions records, and dedupes stable IDs', () => {
  const localGame = makeLibraryGame({ id: 'local-game', title: 'Activity Game', rawgId: 5 });
  const backupGame = { ...localGame, id: 'backup-game' };
  const duplicate = makePlayActivityRecord({ gameId: 'local-game', date: '2026-07-01' });
  const incomingDuplicate = makePlayActivityRecord({ gameId: 'backup-game', date: '2026-07-01' });
  const incomingNew = makePlayActivityRecord({ gameId: 'backup-game', date: '2026-07-02' });
  const result = prepare({
    localGames: [localGame], backupGames: [backupGame],
    localPlayActivity: [duplicate], backupPlayActivity: [incomingDuplicate, incomingNew],
    presentKeys: new Set(['questshelf.games.v1', 'questshelf.playActivity.v1']),
  });
  assert.equal(result.playActivity.length, 2);
  assert.ok(result.playActivity.every((record) => record.gameId === 'local-game'));
});

test('Platform Plans remap IDs, preserve local-only platforms, notes, order, artwork, and local conflicts', () => {
  const localGame = makeLibraryGame({ id: 'local-game', title: 'Plan Game', steamAppId: 8 });
  const backupGame = { ...localGame, id: 'backup-game' };
  const localPlan = normalizePlatformQueueState({
    activePlatforms: ['PC'],
    entries: [{ gameId: 'local-game', targetPlatform: 'PC', queueNotes: 'local notes', queuePosition: 1, queuePriority: 'high', queuedAt: '2026-01-01T00:00:00Z' }],
    settings: [{ platform: 'PC', maxActiveGames: 4, artworkUrl: 'local-art' }],
  });
  const backupOnly = makeLibraryGame({ id: 'backup-only', title: 'Other' });
  const backupPlan = normalizePlatformQueueState({
    activePlatforms: ['PC', 'PS5'],
    entries: [
      { gameId: 'backup-game', targetPlatform: 'PC', queueNotes: 'backup conflict', queuePosition: 1, queuePriority: 'low', queuedAt: '2026-02-01T00:00:00Z' },
      { gameId: 'backup-only', targetPlatform: 'PS5', queueNotes: 'backup note', queuePosition: 1, queuePriority: 'normal', queuedAt: '2026-02-01T00:00:00Z' },
    ],
    settings: [{ platform: 'PC', maxActiveGames: 1, artworkUrl: 'backup-art' }, { platform: 'PS5', maxActiveGames: 2, artworkUrl: 'ps5-art' }],
  });
  const result = prepare({ localGames: [localGame], backupGames: [backupGame, backupOnly], localPlatformQueues: localPlan, backupPlatformQueues: backupPlan, presentKeys: new Set(['questshelf.games.v1', 'questshelf.platformQueues.v1']) });
  assert.deepEqual(result.platformQueues.activePlatforms, ['PC', 'PS5']);
  assert.equal(result.platformQueues.entries.length, 2);
  assert.equal(result.platformQueues.entries.find((entry) => entry.gameId === 'local-game')?.queueNotes, 'local notes');
  assert.equal(result.platformQueues.settings.find((setting) => setting.platform === 'PC')?.artworkUrl, 'local-art');
  assert.equal(result.platformQueues.settings.find((setting) => setting.platform === 'PS5')?.artworkUrl, 'ps5-art');
});

test('review queues, ignored IDs, and history are remapped and merged conservatively', () => {
  const localGame = makeLibraryGame({ id: 'local', title: 'Review', rawgId: 10 });
  const backupGame = { ...localGame, id: 'backup' };
  const localReview = normalizeReviewModeState({ ignoredGameIds: ['local-only'], queueOrder: ['local'], reviewedGames: { local: { reviewedAt: '2026-02-01' } }, lastSource: 'manual', stats: { reviewed: 4 } });
  const backupReview = normalizeReviewModeState({ ignoredGameIds: ['backup'], queueOrder: ['backup'], reviewedGames: { backup: { reviewedAt: '2026-01-01' } }, lastSource: 'steam', stats: { reviewed: 2 } });
  const result = prepare({ localGames: [localGame], backupGames: [backupGame], localReviewMode: localReview, backupReviewMode: backupReview, presentKeys: new Set(['questshelf.games.v1', 'questshelf.reviewMode.v1']) });
  assert.deepEqual(result.reviewMode.queueOrder, ['local']);
  assert.ok(result.reviewMode.ignoredGameIds.includes('local-only'));
  assert.ok(result.reviewMode.ignoredGameIds.includes('local'));
  assert.equal(result.reviewMode.reviewedGames.local.reviewedAt, '2026-02-01');
  assert.equal(result.reviewMode.lastSource, 'manual');
  assert.equal(result.reviewMode.stats.reviewed, 4);
});

test('unknown dependent references are retained and explicitly reported', () => {
  const result = prepare({
    backupPlayActivity: [makePlayActivityRecord({ gameId: 'missing' })],
    backupPlatformQueues: normalizePlatformQueueState({ activePlatforms: ['PC'], entries: [{ gameId: 'missing', targetPlatform: 'PC', queueNotes: '', queuePosition: 1, queuePriority: 'normal', queuedAt: '2026-01-01' }], settings: [] }),
    backupReviewMode: normalizeReviewModeState({ ignoredGameIds: ['missing'], queueOrder: ['missing'], reviewedGames: { missing: { reviewedAt: '2026-01-01' } } }),
    presentKeys: new Set(['questshelf.playActivity.v1', 'questshelf.platformQueues.v1', 'questshelf.reviewMode.v1']),
  });
  assert.equal(result.playActivity[0].gameId, 'missing');
  assert.equal(result.platformQueues.entries[0].gameId, 'missing');
  assert.ok(result.reviewMode.queueOrder.includes('missing'));
  assert.deepEqual(new Set(result.preview.unresolvedGameReferences.map((reference) => reference.section)), new Set(['Play activity', 'Platform Plans', 'Quest Queue review state']));
});

test('preview reports counts, preserves singleton values by default, and marks explicit backup-wins sections', () => {
  const local = makeLibraryGame({ id: 'local', title: 'Existing', rawgId: 1, updatedAt: '2026-01-01' });
  const updated = { ...local, id: 'backup', updatedAt: '2026-02-01' };
  const added = makeLibraryGame({ id: 'added', title: 'Added' });
  const presentKeys = new Set(['questshelf.games.v1', 'questshelf.appPersonalization.v1', 'questshelf.rawgSettings.v1']);
  const conservative = prepare({ localGames: [local], backupGames: [updated, added], presentKeys });
  assert.deepEqual(conservative.preview.games, { added: 1, ambiguous: 0, unchanged: 0, updated: 1 });
  assert.ok(conservative.preview.sections.filter((section) => section.policy === 'requires-explicit-user-choice').every((section) => !section.willReplace));
  const backupWins = prepare({ localGames: [local], backupGames: [updated, added], presentKeys, useBackupSingletons: true });
  assert.ok(backupWins.preview.sections.filter((section) => section.policy === 'requires-explicit-user-choice').every((section) => section.willReplace));
});

test('legacy and secret-free backups preview only sections actually present', () => {
  const legacy = prepare({ backupGames: [makeLibraryGame({ id: 'one', title: 'One' })], presentKeys: new Set(['questshelf.games.v1']) });
  assert.deepEqual(legacy.preview.sections.map((section) => section.key), ['questshelf.games.v1']);
  assert.equal(legacy.preview.sections.some((section) => section.key.includes('Settings')), false);
});

test('repeating the same merge plan is idempotent and preserves referential integrity', () => {
  const local = makeLibraryGame({ id: 'local', title: 'Repeat', rawgId: 77 });
  const backup = { ...local, id: 'backup' };
  const backupPlan = normalizePlatformQueueState({ activePlatforms: ['PC'], entries: [{ gameId: 'backup', targetPlatform: 'PC', queueNotes: 'note', queuePosition: 1, queuePriority: 'normal', queuedAt: '2026-01-01' }], settings: [] });
  const first = prepare({ localGames: [local], backupGames: [backup], backupPlatformQueues: backupPlan, presentKeys: new Set(['questshelf.games.v1', 'questshelf.platformQueues.v1']) });
  const second = prepare({ localGames: first.games.games, backupGames: [backup], localPlatformQueues: first.platformQueues, backupPlatformQueues: backupPlan, presentKeys: new Set(['questshelf.games.v1', 'questshelf.platformQueues.v1']) });
  assert.deepEqual(second.games.games, first.games.games);
  assert.deepEqual(second.platformQueues, first.platformQueues);
  const gameIds = new Set(second.games.games.map((game) => game.id));
  assert.ok(second.platformQueues.entries.every((entry) => gameIds.has(entry.gameId)));
});

test('merge preview and cancellation path cannot write or replace the recovery snapshot', () => {
  const source = readFileSync(resolve('src/components/DataManagementPanel.tsx'), 'utf8');
  assert.match(source, /setMergePreview\(previewQuestShelfBackupMerge/);
  assert.match(source, /onClose=\{\(\) => setIsRestoreModalOpen\(false\)\}/);
  const storageSource = readFileSync(resolve('src/lib/backupStorage.ts'), 'utf8');
  const previewBody = storageSource.slice(storageSource.indexOf('export function previewQuestShelfBackupMerge'), storageSource.indexOf('/** Merge-restore.'));
  assert.doesNotMatch(previewBody, /saveRecoverySnapshot|writeKvSections|replaceAllDurable/);
});
