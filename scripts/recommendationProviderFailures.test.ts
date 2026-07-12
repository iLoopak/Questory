/**
 * AS-10 — the recommendation waterfall under provider failure.
 *
 * The pipeline runs many RAWG calls across several stages. They used to return `[]` on error, so a
 * total outage produced an empty candidate pool that was indistinguishable from "we found nothing"
 * — and `writeStoredCache` then stored that emptiness for 24 hours, which is what could leave a user
 * with no recommendations until the TTL expired.
 *
 * Scoring, filtering and final selection are NOT touched by this PR; these tests only pin what the
 * pipeline reports and what it caches.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { saveRawgSettings } from '../src/lib/rawgSettingsStorage';
import {
  clearPersonalRecommendationCaches,
  fetchPersonalRecommendationsResult,
} from '../src/services/personalRecommendationsService';
import type { RawgSearchResult } from '../src/types/rawg';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const originalFetch = globalThis.fetch;

type ProxyBehavior = 'ok' | 'fail' | 'empty' | 'flaky';

let behavior: ProxyBehavior = 'ok';
let call = 0;

const rawgResult = (id: number): RawgSearchResult =>
  ({
    id,
    name: `Candidate ${id}`,
    slug: `candidate-${id}`,
    background_image: `https://media.rawg.io/${id}.jpg`,
    metacritic: 85,
    rating: 4.4,
    ratings_count: 900,
    released: '2025-05-05',
    platforms: [{ platform: { id: 4, name: 'PC' } }],
    genres: [{ id: 1, name: 'Action' }],
    tags: [{ id: 1, name: 'Souls-like', slug: 'souls-like' }],
  }) as unknown as RawgSearchResult;

function stubProxy(nextBehavior: ProxyBehavior) {
  behavior = nextBehavior;
  call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    const fails = behavior === 'fail' || (behavior === 'flaky' && call % 2 === 1);

    if (fails) {
      return {
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ code: 'PROVIDER_UNAVAILABLE', error: 'RAWG is down' }),
      } as unknown as Response;
    }

    const results = behavior === 'empty' ? [] : Array.from({ length: 6 }, (_, index) => rawgResult(1000 + call * 10 + index));
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ response: { results } }) } as unknown as Response;
  }) as typeof fetch;
}

/** A library rich enough to pass the cold-start readiness gate, so the pipeline actually runs. */
const games: Game[] = Array.from({ length: 8 }, (_, index) => ({
  id: `g${index}`,
  title: `Finished Game ${index}`,
  platform: 'Steam',
  status: 'Finished',
  coverImage: '',
  playtimeHours: 30,
  tags: [],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  rating: 5,
  rawgId: 500 + index,
  genres: ['Action'],
  rawgTags: ['souls-like'],
  finishedAt: '2026-06-01T00:00:00.000Z',
}));

async function generate(options: { forceRefresh?: boolean } = {}) {
  return fetchPersonalRecommendationsResult(games, new Set(), options);
}

async function reset() {
  resetWebStorage();
  saveRawgSettings({ apiKey: 'test-key' });
  await clearPersonalRecommendationCaches();
}

test('AS-10: when every provider call fails, the run reports failure instead of an empty success', async () => {
  await reset();
  stubProxy('fail');

  const result = await generate();

  assert.equal(result.provider.status, 'failed');
  assert.equal(result.provider.successCount, 0);
  assert.ok(result.provider.failureCount > 0, 'the failures are counted, not swallowed');
  assert.equal(result.provider.error?.kind, 'provider');
  assert.equal(result.provider.error?.retryable, true);

  globalThis.fetch = originalFetch;
});

test('AS-10: a failure-only empty pool is never stored as a valid result', async () => {
  await reset();
  stubProxy('fail');
  await generate();

  // If the failure had been cached, this run would serve it and never call the provider again.
  stubProxy('ok');
  const recovered = await generate();

  assert.ok(call > 0, 'the next run goes back to the provider rather than trusting a cached failure');
  assert.equal(recovered.provider.status, 'ok');
  assert.ok(recovered.candidates.length > 0, 'and the user gets recommendations as soon as RAWG answers');

  globalThis.fetch = originalFetch;
});

test('AS-10: a total failure after a previous success serves the previous picks, marked stale', async () => {
  await reset();
  stubProxy('ok');
  const fresh = await generate();
  assert.ok(fresh.candidates.length > 0);

  // Force a regeneration (bypassing the fresh cache) while RAWG is down.
  stubProxy('fail');
  const stale = await generate({ forceRefresh: true });

  assert.equal(stale.provider.status, 'failed');
  assert.equal(stale.provider.stale, true, 'the result says it is stale rather than pretending to be current');
  assert.ok(stale.candidates.length > 0, 'the user keeps their last good picks instead of losing them to an outage');

  globalThis.fetch = originalFetch;
});

test('AS-10: partial failure keeps the candidates the successful stages produced', async () => {
  await reset();
  stubProxy('flaky');

  const result = await generate();

  assert.equal(result.provider.status, 'partial');
  assert.ok(result.provider.failureCount > 0);
  assert.ok(result.provider.successCount > 0);
  assert.ok(result.candidates.length > 0, 'one failing stage must not discard what the others found');

  globalThis.fetch = originalFetch;
});

test('AS-10: a provider that answers with nothing is a success, and its empty pool is cached', async () => {
  await reset();
  stubProxy('empty');

  const result = await generate();

  assert.equal(result.provider.status, 'ok', 'RAWG answering "nothing matches" is a real answer');
  assert.equal(result.provider.failureCount, 0);
  assert.deepEqual(result.candidates, []);

  // The empty success IS cached: the next run is served from it without calling the provider.
  const callsBefore = call;
  const second = await generate();
  assert.equal(call, callsBefore, 'an empty 200 is data, and data is cached');
  assert.deepEqual(second.candidates, []);

  globalThis.fetch = originalFetch;
});

test('AS-10: a successful run is cached and its candidates survive the cache round trip', async () => {
  await reset();
  stubProxy('ok');

  const first = await generate();
  const callsBefore = call;
  const second = await generate();

  assert.equal(call, callsBefore, 'the second run is a cache hit');
  assert.equal(second.provider.status, 'ok');
  assert.deepEqual(
    second.candidates.map((candidate) => candidate.game.rawgId),
    first.candidates.map((candidate) => candidate.game.rawgId),
    'and the cached pool is the pool the scoring produced — unchanged',
  );

  globalThis.fetch = originalFetch;
});
