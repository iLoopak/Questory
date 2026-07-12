import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlannedGameIds, plannedGameFingerprint } from '../src/lib/plannedGames';
import { buildTasteProfile, normalizeTasteProfile } from '../src/lib/tasteProfile';
import { buildUserProfile, getRecommendationSignalWeight, profileFingerprint } from '../src/lib/userProfile';
import { getRecommendationInputKey, selectRecommendationSeeds } from '../src/services/personalRecommendationsService';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { Game, GameStatus } from '../src/types/game';

const game = (id: string, status: GameStatus = 'Want to play'): Game => ({
  id,
  title: `Game ${id}`,
  platform: 'PC',
  status,
  coverImage: '',
  playtimeHours: 0,
  tags: [],
  rawgTags: ['turn-based'],
  genres: ['RPG'],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  rawgId: Number(id.replace(/\D/g, '')) || 1,
});

const plan = (...gameIds: string[]): PlatformQueueState => ({
  activePlatforms: ['PC'],
  entries: gameIds.map((gameId, queuePosition) => ({
    gameId,
    queueNotes: '',
    queuePosition,
    queuePriority: 'normal',
    queuedAt: '2026-07-12T00:00:00.000Z',
    targetPlatform: 'PC',
  })),
  schemaVersion: 2,
  settings: [],
});

test('AS-15: selector includes only canonical games with actual Plan entries', () => {
  const games = [game('g1'), game('g2', 'Finished')];
  const ids = getPlannedGameIds(plan('g2', 'orphan'), games);
  assert.deepEqual([...ids], ['g2']);
  assert.equal(ids.has('g1'), false, 'Want to play alone is not a Plan');
});

test('AS-15: identical libraries differ only when one has explicit Plan intent', () => {
  const games = [game('g1')];
  const withoutPlan = getPlannedGameIds(plan(), games);
  const withPlan = getPlannedGameIds(plan('g1'), games);

  assert.equal(getRecommendationSignalWeight(games[0], withoutPlan).weight, 0.12);
  assert.equal(getRecommendationSignalWeight(games[0], withPlan).weight, 1.4);
  assert.equal(getRecommendationSignalWeight(games[0], withPlan).reason, 'in a platform plan');
  assert.notDeepEqual(buildUserProfile(games, withoutPlan), buildUserProfile(games, withPlan));
});

test('AS-15: scoring constants are unchanged; only corrected intent qualification adds the plan weight', () => {
  const finished = game('g1', 'Finished');
  finished.rating = 5;
  const baseline = getRecommendationSignalWeight(finished, new Set());
  const planned = getRecommendationSignalWeight(finished, new Set(['g1']));
  assert.equal(baseline.weight, 9);
  assert.ok(Math.abs((planned.weight - baseline.weight) - 1.4) < Number.EPSILON * 4);

  const withoutPlanSeeds = selectRecommendationSeeds([game('g2')], 8, new Set()).seeds;
  const withPlanSeeds = selectRecommendationSeeds([game('g2')], 8, new Set(['g2'])).seeds;
  assert.equal(withoutPlanSeeds.length, 1, 'owned metadata remains a cold-start seed');
  assert.ok(Math.abs((withPlanSeeds[0].signalScore - withoutPlanSeeds[0].signalScore) - 1.28) < 1e-12);
});

test('AS-15: no Plans preserves cold-start profile and taste behavior', () => {
  const games = [game('g1'), game('g2', 'Playing')];
  const empty = new Set<string>();
  assert.ok(buildUserProfile(games, empty).topGenres.length > 0);
  assert.doesNotThrow(() => buildTasteProfile(games, normalizeTasteProfile(undefined), new Date('2026-07-12T00:00:00Z'), empty));
});

test('AS-15: cache inputs change on add/remove membership, not Plan metadata or ordering', () => {
  const games = [game('g1'), game('g2')];
  const none = getPlannedGameIds(plan(), games);
  const one = getPlannedGameIds(plan('g1'), games);
  const reordered = getPlannedGameIds(plan('g1', 'g1'), games);

  assert.notEqual(profileFingerprint(games, none), profileFingerprint(games, one));
  assert.equal(plannedGameFingerprint(one), plannedGameFingerprint(reordered));
  assert.notEqual(getRecommendationInputKey(games, new Set(), true, none), getRecommendationInputKey(games, new Set(), true, one));
  assert.equal(profileFingerprint(games, one), profileFingerprint(games, reordered));
});
