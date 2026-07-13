import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzePersistedGameRows } from '../src/lib/gameStorage';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { clearQuestoryTables } from './testUtils/indexedDbControl';

assertTestEnvironment();

test('malformed games are quarantined while valid rows get a safe runtime view', () => {
  const raw = [
    { id: 'valid', title: 'Valid', platform: 'PC', status: 'Playing', coverImage: '', playtimeHours: 1, tags: [], lastPlayedAt: null, notes: '', collectionType: 'library', futureField: { preserved: true } },
    { id: '', title: 'Missing id' },
    { id: 'bad-values', title: 'Bad values', steamAppId: '123', rating: 12, favorite: 'yes', updatedAt: 'not-a-date', notes: 'do not log this' },
  ];
  const before = JSON.stringify(raw);
  const result = analyzePersistedGameRows(raw);
  assert.equal(result.games.length, 2, 'a malformed optional field cannot prevent safe games from rendering');
  assert.equal(result.problematicRows.length, 2);
  assert.equal(result.games[1].steamAppId, undefined);
  assert.equal(result.games[1].rating, undefined);
  assert.equal(result.games[1].favorite, undefined);
  assert.deepEqual((result.games[0] as GameWithFuture).futureField, { preserved: true });
  assert.equal(JSON.stringify(raw), before, 'inspection never rewrites the raw rows');
  assert.deepEqual(new Set(result.issues.map((issue) => issue.reason)), new Set(['invalid-id', 'malformed-steam-app-id', 'invalid-rating', 'invalid-boolean', 'invalid-date']));
});

type GameWithFuture = { futureField?: unknown };

test('integrity report counts every orphan category and exports recovery rows without mutating stores', async () => {
  resetWebStorage();
  const { getGameDatabase } = await import('../src/lib/gameDatabase');
  const { inspectDataIntegrity } = await import('../src/lib/dataIntegrityDiagnostics');
  const { getStorageAdapter } = await import('../src/lib/storageAdapter');
  const db = getGameDatabase()!;
  await clearQuestoryTables(db);
  await db.games.put({ id: 'valid', title: 'Valid', platform: 'PC', status: 'Want to play', coverImage: '', playtimeHours: 0, tags: [], lastPlayedAt: null, notes: '', collectionType: 'library' });
  const orphanActivity = { id: 'manual:played_today:missing-activity:2026-01-01', gameId: 'missing-activity', action: 'played_today' as const, type: 'played_today' as const, source: 'manual' as const, date: '2026-01-01', timestamp: '2026-01-01T12:00:00.000Z', detectedAt: '2026-01-01T12:00:00.000Z' };
  await db.playActivity.put(orphanActivity);
  getStorageAdapter().writeLocal('questshelf.platformQueues.v1', JSON.stringify({ schemaVersion: 1, activePlatforms: ['PC'], plans: [{ id: 'pc', platform: 'PC', gameIds: ['missing-plan'], items: [] }], settings: [] }));
  getStorageAdapter().writeLocal('questshelf.reviewMode.v1', JSON.stringify({ ignoredGameIds: ['missing-review'], queueOrder: ['missing-review'], reviewedGames: { 'missing-review': { reviewedAt: '2026-01-01T00:00:00.000Z' } } }));
  const { normalizePlatformQueueState } = await import('../src/lib/platformQueueStorage');
  assert.equal(normalizePlatformQueueState(JSON.parse(getStorageAdapter().readLocal('questshelf.platformQueues.v1')!)).entries.length, 1, 'legacy Plan fixture normalizes');
  const beforeActivity = JSON.stringify(await db.playActivity.toArray());
  const { report, quarantine } = await inspectDataIntegrity();
  assert.equal(report.orphans.platformPlans, 1, 'Platform Plan orphan');
  assert.equal(report.orphans.reviewState, 1, 'review-state orphan');
  assert.equal(report.orphans.playActivity, 1, 'play-activity orphan');
  assert.equal(quarantine.rawProblemRows.platformPlans.length, 1);
  assert.equal(quarantine.rawProblemRows.reviewState.length, 1);
  assert.equal(quarantine.rawProblemRows.playActivity.length, 1);
  assert.equal(JSON.stringify(await db.playActivity.toArray()), beforeActivity, 'the report performs zero raw-row writes');
});
