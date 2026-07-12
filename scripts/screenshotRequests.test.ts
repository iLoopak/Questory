/**
 * AS-13 — screenshots belong to the game on screen, and a failure is not an empty result.
 *
 * The hook committed every result unconditionally (and `refetch` threw away its own cancellation
 * cleanup), so game A resolving after the user opened game B wrote A's screenshots onto B. And any
 * non-auth failure was stored in the seven-day cache as "no screenshots", hiding a game's images for
 * a week after one flaky request.
 *
 * These tests drive the real hook against a stubbed integration proxy whose responses are released
 * by hand, so the ordering is exact rather than hopeful.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { actAsync, renderHook } from './testUtils/reactHarness';
import { saveRawgSettings } from '../src/lib/rawgSettingsStorage';
import { getCachedScreenshots, mergeScreenshotStores } from '../src/lib/screenshotCache';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { useGameScreenshots } = await import('../src/hooks/useGameScreenshots');

// ---------------------------------------------------------------------------
// A hand-released integration proxy. Every request parks until the test lets it go.
// ---------------------------------------------------------------------------

type Pending = {
  rawgId: number;
  release: (reply: { urls?: string[]; failWith?: number }) => void;
};

const originalFetch = globalThis.fetch;
let pending: Pending[] = [];

function stubProxy() {
  pending = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { rawgId?: string };
    const rawgId = Number(body.rawgId ?? 0);

    return new Promise<Response>((resolve) => {
      pending.push({
        rawgId,
        release: (reply) => {
          if (reply.failWith) {
            resolve({
              ok: false,
              status: reply.failWith,
              headers: new Headers(),
              json: async () => ({ code: reply.failWith === 401 ? 'INVALID_API_KEY' : 'PROVIDER_UNAVAILABLE', error: 'nope' }),
            } as unknown as Response);
            return;
          }

          resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ response: { results: (reply.urls ?? []).map((image) => ({ image })) } }),
          } as unknown as Response);
        },
      });
    });
  }) as unknown as typeof fetch;
}

/** Release the parked request for a game, and let React flush what it commits. */
async function release(rawgId: number, reply: { urls?: string[]; failWith?: number }) {
  const request = pending.find((item) => item.rawgId === rawgId);
  assert.ok(request, `a request for rawgId ${rawgId} is in flight`);
  pending = pending.filter((item) => item !== request);

  await actAsync(async () => {
    request.release(reply);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const makeGame = (id: string, rawgId: number): Game => ({
  id,
  title: `Game ${rawgId}`,
  platform: 'Steam',
  status: 'Playing',
  coverImage: 'https://cdn/cover.jpg',
  playtimeHours: 1,
  tags: [],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  rawgId,
});

function setup() {
  resetWebStorage();
  saveRawgSettings({ apiKey: 'test-key' });
  stubProxy();
}

const renderScreenshots = (game: Game) => renderHook((current: Game) => useGameScreenshots(current), game);

test('AS-13: a late result for the previous game cannot overwrite the current one', async () => {
  setup();
  const gameA = makeGame('a', 101);
  const gameB = makeGame('b', 102);

  const handle = await renderScreenshots(gameA);
  // The user navigates to B while A is still in flight.
  await handle.rerender(gameB);

  // A resolves LAST, which is exactly the race that used to put A's screenshots on B's page.
  await release(102, { urls: ['https://cdn/b1.jpg'] });
  await release(101, { urls: ['https://cdn/a1.jpg'] });

  assert.deepEqual(handle.current.screenshots, ['https://cdn/b1.jpg'], 'B keeps its own screenshots');
  assert.equal(handle.current.loading, false);

  await handle.unmount();
});

test('AS-13: a forced refetch followed by navigation cannot write to the new game', async () => {
  setup();
  const gameA = makeGame('a', 201);
  const gameB = makeGame('b', 202);

  const handle = await renderScreenshots(gameA);
  await release(201, { urls: ['https://cdn/a-old.jpg'] });

  await actAsync(() => handle.current.refetch());
  // …and immediately navigate away.
  await handle.rerender(gameB);

  await release(202, { urls: ['https://cdn/b.jpg'] });
  await release(201, { urls: ['https://cdn/a-new.jpg'] });

  assert.deepEqual(handle.current.screenshots, ['https://cdn/b.jpg'], 'the abandoned refresh stays abandoned');
  assert.equal(handle.current.loading, false, 'and it does not leave the new game stuck loading');

  await handle.unmount();
});

test('AS-13: an earlier forced refetch cannot win over a later one', async () => {
  setup();
  const game = makeGame('a', 301);

  const handle = await renderScreenshots(game);
  await release(301, { urls: ['https://cdn/original.jpg'] });

  await actAsync(() => handle.current.refetch());
  await actAsync(() => handle.current.refetch());

  // The FIRST Retry resolves last. It has been superseded, so it may not speak.
  const [first, second] = pending;
  pending = [];
  await actAsync(async () => {
    second.release({ urls: ['https://cdn/second.jpg'] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await actAsync(async () => {
    first.release({ urls: ['https://cdn/first.jpg'] });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.deepEqual(handle.current.screenshots, ['https://cdn/second.jpg'], 'the newer Retry owns the result');
  assert.deepEqual(getCachedScreenshots(game), ['https://cdn/second.jpg'], 'and the superseded one wrote nothing, not even to the cache');

  await handle.unmount();
});

test('AS-13: a transient failure is not cached, and does not hide the screenshots for a week', async () => {
  setup();
  const game = makeGame('a', 401);

  const handle = await renderScreenshots(game);
  await release(401, { failWith: 503 });

  assert.equal(handle.current.error, true);
  assert.equal(handle.current.errorDetail?.kind, 'provider');
  assert.equal(handle.current.errorDetail?.retryable, true);
  assert.equal(handle.current.loading, false);
  assert.equal(getCachedScreenshots(game), null, 'the failure wrote nothing to the seven-day cache');

  // Retry, and the screenshots arrive: a failure never became a week-long "no screenshots".
  await actAsync(() => handle.current.refetch());
  await release(401, { urls: ['https://cdn/recovered.jpg'] });

  assert.deepEqual(handle.current.screenshots, ['https://cdn/recovered.jpg']);
  assert.equal(handle.current.error, false);
  assert.deepEqual(getCachedScreenshots(game), ['https://cdn/recovered.jpg']);

  await handle.unmount();
});

test('AS-13: a genuine empty success IS cached', async () => {
  setup();
  const game = makeGame('a', 501);

  const handle = await renderScreenshots(game);
  await release(501, { urls: [] });

  assert.deepEqual(handle.current.screenshots, []);
  assert.equal(handle.current.error, false);
  assert.deepEqual(getCachedScreenshots(game), [], 'RAWG having no screenshots is an answer, and it is remembered');

  await handle.unmount();
});

test('AS-13: a failed refresh keeps the screenshots that were already on screen', async () => {
  setup();
  const game = makeGame('a', 601);

  const handle = await renderScreenshots(game);
  await release(601, { urls: ['https://cdn/good.jpg'] });

  await actAsync(() => handle.current.refetch());
  await release(601, { failWith: 503 });

  assert.deepEqual(handle.current.screenshots, ['https://cdn/good.jpg'], 'a failed Retry does not blank the strip');
  assert.equal(handle.current.error, true, 'but it is reported, rather than passing off stale data as fresh');
  assert.deepEqual(getCachedScreenshots(game), ['https://cdn/good.jpg'], 'and the good cache entry survives');

  await handle.unmount();
});

test('AS-13: a missing key is a setup state, not a failure', async () => {
  setup();
  const game = makeGame('a', 701);

  const handle = await renderScreenshots(game);
  await release(701, { failWith: 401 });

  assert.equal(handle.current.missingApiKey, true);
  assert.equal(handle.current.error, false, 'an unusable key is not an outage');
  assert.equal(getCachedScreenshots(game), null);

  await handle.unmount();
});

test('AS-13: nothing is committed after unmount', async () => {
  setup();
  const game = makeGame('a', 801);

  const handle = await renderScreenshots(game);
  await handle.unmount();

  await release(801, { urls: ['https://cdn/late.jpg'] });
  // The cache is a proxy for "did the run commit": an unmounted hook writes neither state nor cache.
  assert.equal(getCachedScreenshots(game), null);
});

test('AS-13: a late cache hydration cannot overwrite newer network data', () => {
  const fresh = { 'rawg:1': { urls: ['https://cdn/new.jpg'], provider: 'rawg', cachedAt: 2_000 } };
  const hydrated = {
    'rawg:1': { urls: ['https://cdn/old.jpg'], provider: 'rawg', cachedAt: 1_000 },
    'rawg:2': { urls: ['https://cdn/other.jpg'], provider: 'rawg', cachedAt: 1_500 },
  };

  const merged = mergeScreenshotStores(fresh, hydrated);

  assert.deepEqual(merged['rawg:1'].urls, ['https://cdn/new.jpg'], 'the fresh network result survives the late read');
  assert.deepEqual(merged['rawg:2'].urls, ['https://cdn/other.jpg'], 'and the hydrated entries it does not know about are kept');
});

test('teardown', () => {
  globalThis.fetch = originalFetch;
});
