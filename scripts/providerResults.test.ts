/**
 * AS-10 — a provider failure is not an empty result.
 *
 * The RAWG list helpers used to `catch { return []; }`, and the services cached that `[]` as a
 * perfectly good answer: a 401, a 429, a timeout or an offline device became "no recommendations"
 * for up to 24 hours, with nothing to retry. These tests drive the real helpers and the real
 * services through a stubbed integration proxy, and pin the two properties that matter:
 *
 *   1. an empty 200 is still a SUCCESS and is still cached — emptiness is data;
 *   2. every failure is typed, is never cached as success, and falls back to the last good data.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import {
  createProviderError,
  isProviderSetupErrorKind,
  parseRetryAfterMs,
  summarizeProviderStatus,
} from '../src/lib/providerResult';
import { saveRawgSettings } from '../src/lib/rawgSettingsStorage';
import { fetchRecommendedGames, fetchSuggestedGames } from '../src/services/rawgApi';
import {
  clearReleaseCalendarCache,
  fetchPersonalizedReleaseCalendarResult,
} from '../src/services/releaseCalendarService';
import type { RawgSearchResult } from '../src/types/rawg';
import type { Game } from '../src/types/game';

assertTestEnvironment();

// ---------------------------------------------------------------------------
// A stub of the integration proxy: the same envelope `postIntegration` expects.
// ---------------------------------------------------------------------------

type ProxyReply =
  | { kind: 'ok'; results: RawgSearchResult[] }
  | { kind: 'malformed'; body: unknown }
  | { kind: 'unreadable' }
  | { kind: 'error'; status: number; code: string }
  | { kind: 'reject'; error: unknown };

const originalFetch = globalThis.fetch;
let replies: ProxyReply[] = [];
let requestCount = 0;

function stubProxy(...queued: ProxyReply[]) {
  replies = [...queued];
  requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    const reply = replies.length > 1 ? replies.shift()! : replies[0];

    if (reply.kind === 'reject') throw reply.error;

    if (reply.kind === 'error') {
      return {
        ok: false,
        status: reply.status,
        headers: new Headers(),
        json: async () => ({ code: reply.code, error: 'provider said no' }),
      } as unknown as Response;
    }

    if (reply.kind === 'unreadable') {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response;
    }

    const body = reply.kind === 'malformed' ? { response: reply.body } : { response: { results: reply.results } };
    return { ok: true, status: 200, headers: new Headers(), json: async () => body } as unknown as Response;
  }) as typeof fetch;
}

function restoreProxy() {
  globalThis.fetch = originalFetch;
}

const rawgResult = (id: number, name = `Game ${id}`): RawgSearchResult =>
  ({ id, name, slug: `game-${id}`, background_image: null, metacritic: 80, released: '2026-01-01', platforms: [{ platform: { id: 4, name: 'PC' } }], genres: [{ id: 1, name: 'Action' }], tags: [] }) as unknown as RawgSearchResult;

function withKey() {
  resetWebStorage();
  saveRawgSettings({ apiKey: 'test-key' });
}

// ---------------------------------------------------------------------------
// Provider contract
// ---------------------------------------------------------------------------

test('AS-10: a valid non-empty 200 is a success', async () => {
  withKey();
  stubProxy({ kind: 'ok', results: [rawgResult(1), rawgResult(2)] });

  const result = await fetchRecommendedGames({ pageSize: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.length, 2);
  assert.equal(result.ok && result.source, 'network');

  restoreProxy();
});

test('AS-10: a valid EMPTY 200 is a success, not a failure', async () => {
  withKey();
  stubProxy({ kind: 'ok', results: [] });

  const result = await fetchRecommendedGames({ pageSize: 10 });
  assert.equal(result.ok, true, 'RAWG genuinely knowing of nothing is an answer, and it stays one');
  assert.deepEqual(result.ok && result.data, []);

  restoreProxy();
});

test('AS-10: a missing key is a setup failure, and is not retryable', async () => {
  resetWebStorage();
  saveRawgSettings({ apiKey: '   ' });
  stubProxy({ kind: 'ok', results: [rawgResult(1)] });

  const result = await fetchRecommendedGames({});
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.kind, 'missing-key');
  assert.equal(!result.ok && result.error.retryable, false);
  assert.equal(requestCount, 0, 'and no request is made at all');

  restoreProxy();
});

test('AS-10: an invalid key is distinguished from an outage', async () => {
  withKey();
  stubProxy({ kind: 'error', status: 401, code: 'INVALID_API_KEY' });

  const result = await fetchRecommendedGames({});
  assert.equal(!result.ok && result.error.kind, 'invalid-key');
  assert.equal(!result.ok && result.error.retryable, false, 'retrying an invalid key achieves nothing');
  assert.equal(!result.ok && isProviderSetupErrorKind(result.error.kind), true);

  restoreProxy();
});

test('AS-10: a rate limit is retryable and carries its status', async () => {
  withKey();
  stubProxy({ kind: 'error', status: 429, code: 'RATE_LIMITED' });

  const result = await fetchSuggestedGames(3498);
  assert.equal(!result.ok && result.error.kind, 'rate-limited');
  assert.equal(!result.ok && result.error.retryable, true);
  assert.equal(!result.ok && result.error.status, 429);

  restoreProxy();
});

test('AS-10: Retry-After is read as milliseconds, in both encodings', () => {
  const now = Date.UTC(2026, 6, 12, 10, 0, 0);
  assert.equal(parseRetryAfterMs('30', now), 30_000);
  assert.equal(parseRetryAfterMs(new Date(now + 45_000).toUTCString(), now), 45_000);
  assert.equal(parseRetryAfterMs(null, now), undefined, 'a 429 without the header is still a 429');
  assert.equal(parseRetryAfterMs('nonsense', now), undefined);
});

test('AS-10: a provider 5xx and a timeout are separate kinds', async () => {
  withKey();
  stubProxy({ kind: 'error', status: 503, code: 'PROVIDER_UNAVAILABLE' });
  const outage = await fetchRecommendedGames({});
  assert.equal(!outage.ok && outage.error.kind, 'provider');
  assert.equal(!outage.ok && outage.error.retryable, true);

  stubProxy({ kind: 'error', status: 504, code: 'PROVIDER_TIMEOUT' });
  const timeout = await fetchRecommendedGames({});
  assert.equal(!timeout.ok && timeout.error.kind, 'timeout');

  restoreProxy();
});

test('AS-10: a network rejection is a network failure, not an empty page', async () => {
  withKey();
  stubProxy({ kind: 'reject', error: new TypeError('Failed to fetch') });

  const result = await fetchRecommendedGames({});
  assert.equal(!result.ok && result.error.kind, 'network');
  assert.equal(!result.ok && result.error.retryable, true);

  restoreProxy();
});

test('AS-10: an aborted request is not reported as an outage', async () => {
  withKey();
  const abortError = new Error('The user aborted a request.');
  abortError.name = 'AbortError';
  stubProxy({ kind: 'reject', error: abortError });

  const result = await fetchRecommendedGames({});
  assert.equal(!result.ok && result.error.kind, 'aborted');
  assert.equal(!result.ok && result.error.retryable, false, 'we cancelled it; there is nothing to retry');

  restoreProxy();
});

test('AS-10: a malformed payload is a failure, not zero results', async () => {
  withKey();
  stubProxy({ kind: 'malformed', body: { results: 'not-an-array' } });
  const malformed = await fetchRecommendedGames({});
  assert.equal(!malformed.ok && malformed.error.kind, 'malformed-response');

  stubProxy({ kind: 'unreadable' });
  const unreadable = await fetchRecommendedGames({});
  assert.equal(unreadable.ok, false, 'an unreadable body cannot become an empty success');

  restoreProxy();
});

test('AS-10: no error carries a key, a URL or a provider payload', async () => {
  withKey();
  stubProxy({ kind: 'error', status: 500, code: 'PROXY_ERROR' });

  const result = await fetchRecommendedGames({ genres: 'action' });
  assert.equal(result.ok, false);
  const serialized = JSON.stringify(!result.ok ? result.error : {});
  assert.doesNotMatch(serialized, /test-key/, 'the API key must never reach an error object');
  assert.doesNotMatch(serialized, /http/i, 'nor a request URL');
  assert.doesNotMatch(serialized, /provider said no/, 'nor the provider’s own response body');

  restoreProxy();
});

// ---------------------------------------------------------------------------
// Status summary
// ---------------------------------------------------------------------------

test('AS-10: partial, failed and ok are distinguished', () => {
  assert.equal(summarizeProviderStatus(3, 0).status, 'ok');
  assert.equal(summarizeProviderStatus(0, 0).status, 'ok', 'nothing to fetch is not a failure');
  assert.equal(summarizeProviderStatus(2, 1).status, 'partial');
  assert.equal(summarizeProviderStatus(0, 4).status, 'failed');

  const failed = summarizeProviderStatus(0, 1, { error: createProviderError('network'), stale: true });
  assert.equal(failed.error?.kind, 'network');
  assert.equal(failed.stale, true);
});

// ---------------------------------------------------------------------------
// Release calendar: cache rules and stale-if-error
// ---------------------------------------------------------------------------

const libraryGames: Game[] = Array.from({ length: 6 }, (_, index) => ({
  id: `g${index}`,
  title: `Owned ${index}`,
  platform: 'Steam',
  status: 'Finished',
  coverImage: '',
  playtimeHours: 20,
  tags: [],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  genres: ['Action'],
  rating: 5,
  finishedAt: '2026-06-01T00:00:00.000Z',
}));

async function loadCalendar(options: { forceRefresh?: boolean } = {}) {
  return fetchPersonalizedReleaseCalendarResult(libraryGames, new Set(), options);
}

test('AS-10: a successful calendar is cached, and a later failure serves it stale rather than emptying it', async () => {
  withKey();
  await clearReleaseCalendarCache();

  stubProxy({ kind: 'ok', results: [rawgResult(101, 'Upcoming One'), rawgResult(102, 'Upcoming Two')] });
  const fresh = await loadCalendar();
  assert.equal(fresh.provider.status, 'ok');
  assert.ok(fresh.candidates.length > 0);

  // The cache is a hit while it is fresh: no request is made at all.
  stubProxy({ kind: 'error', status: 500, code: 'PROVIDER_UNAVAILABLE' });
  const cached = await loadCalendar();
  assert.equal(requestCount, 0, 'a fresh cache is served without touching the provider');
  assert.equal(cached.candidates.length, fresh.candidates.length);

  // A forced refresh that fails must NOT wipe the calendar: the last good data is served, stale.
  const failed = await loadCalendar({ forceRefresh: true });
  assert.equal(failed.provider.status, 'failed');
  assert.equal(failed.provider.stale, true, 'the result announces itself as stale');
  assert.equal(failed.provider.error?.retryable, true);
  assert.equal(failed.candidates.length, fresh.candidates.length, 'the failure did not replace the data with []');

  // And a successful retry replaces the stale data with fresh results.
  stubProxy({ kind: 'ok', results: [rawgResult(103, 'Upcoming Three')] });
  const retried = await loadCalendar({ forceRefresh: true });
  assert.equal(retried.provider.status, 'ok');
  assert.equal(retried.provider.stale, false);
  assert.deepEqual(retried.candidates.map((candidate) => candidate.game.rawgId), [103]);

  restoreProxy();
});

test('AS-10: a failure with no prior success returns no candidates, but says it failed', async () => {
  withKey();
  await clearReleaseCalendarCache();
  stubProxy({ kind: 'error', status: 401, code: 'INVALID_API_KEY' });

  const result = await loadCalendar();
  assert.equal(result.candidates.length, 0);
  assert.equal(result.provider.status, 'failed', 'an empty grid and a broken key are not the same thing');
  assert.equal(result.provider.error?.kind, 'invalid-key');
  assert.equal(result.provider.stale, false);

  // Nothing was cached: the next attempt goes back to the provider rather than trusting the failure.
  stubProxy({ kind: 'ok', results: [rawgResult(201, 'Recovered')] });
  const recovered = await loadCalendar();
  assert.equal(recovered.provider.status, 'ok');
  assert.equal(recovered.candidates.length, 1, 'a failure never became a 24-hour empty cache entry');

  restoreProxy();
});

test('AS-10: a genuinely empty calendar IS cached as a success', async () => {
  withKey();
  await clearReleaseCalendarCache();
  stubProxy({ kind: 'ok', results: [] });

  const empty = await loadCalendar();
  assert.equal(empty.provider.status, 'ok');
  assert.deepEqual(empty.candidates, []);

  // Cached: the provider is not asked again while the entry is fresh.
  stubProxy({ kind: 'ok', results: [rawgResult(301)] });
  const second = await loadCalendar();
  assert.equal(requestCount, 0, 'an empty 200 is data, and data is cached');
  assert.deepEqual(second.candidates, []);

  restoreProxy();
});
