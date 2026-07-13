/**
 * AS-11 — an update may not take the working version away.
 *
 * The old worker precached a hand-written list of icons and covers — no hashed JS, no CSS, no lazy
 * chunks — then called skipWaiting, deleted every other cache and claimed the clients. So a new
 * deploy could delete the cache of the build that worked while its own cache held nothing that could
 * run the app: an offline reload got an index.html pointing at a bundle nobody had, and the first
 * offline visit to Settings, Stats, Metadata or Quest Runner had no chunk to load at all.
 *
 * These tests run the REAL worker (rendered from the shipped template) against a fake network and a
 * fake CacheStorage, and they run the REAL manifest builder against the emitted build output.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { buildPrecacheManifest, isPrecachedBundleFile, isExcludedFromPrecache } from '../packages/vite-plugin-pwa/precache.js';
import { createServiceWorker, FakeCacheStorage, response, type FakeResponse } from './testUtils/serviceWorkerHarness';

// ════════════════════════════════════════════════════════════════════════════════════
// The build manifest
// ════════════════════════════════════════════════════════════════════════════════════

const bundleFiles = [
  'index.html',
  'assets/index-abc123.js',
  'assets/index-def456.css',
  'assets/vendor-react-aaa111.js',
  'assets/SettingsView-bbb222.js',
  'assets/StatsPanel-ccc333.js',
  'assets/MetadataEnrichmentPanel-ddd444.js',
  'assets/QuestRunnerGame-eee555.js',
  'assets/ArtworkRoute-fff666.js',
  'assets/DiscoveryInboxRoute-ggg777.js',
  'assets/DiscoveryRoute-hhh888.js',
  'assets/QuestQueueRoute-iii999.js',
  'assets/ReviewModeRoute-jjj000.js',
  'assets/TasteProfileRoute-kkk111.js',
  'assets/index-abc123.js.map',
];

const publicFiles = ['favicon.ico', 'manifest.webmanifest', 'icons/questshelf-icon-192.png', 'platform-artwork/steam.png'];

test('AS-11: the precache manifest is the real build output — bundles, CSS and every lazy chunk', () => {
  const { assets, version } = buildPrecacheManifest({ bundleFiles, publicFiles });

  assert.ok(assets.includes('/assets/index-abc123.js'), 'the main bundle');
  assert.ok(assets.includes('/assets/index-def456.css'), 'the stylesheet');
  assert.ok(assets.includes('/assets/vendor-react-aaa111.js'), 'the vendor chunk');
  assert.ok(assets.includes('/index.html'));
  assert.ok(assets.includes('/'), 'the start URL');

  for (const chunk of ['SettingsView', 'StatsPanel', 'MetadataEnrichmentPanel', 'QuestRunnerGame', 'ArtworkRoute', 'DiscoveryInboxRoute', 'DiscoveryRoute', 'QuestQueueRoute', 'ReviewModeRoute', 'TasteProfileRoute']) {
    assert.ok(
      assets.some((asset) => asset.includes(chunk)),
      `${chunk} is a lazy route: without its chunk, the first OFFLINE visit to that route fails`,
    );
  }

  assert.equal(assets.includes('/assets/index-abc123.js.map'), false, 'source maps are not shipped to users offline');
  assert.equal(assets.includes('/platform-artwork/steam.png'), false, '2.8 MB of runtime artwork must not decide whether an update can install');
  assert.equal(assets.some((asset) => asset.startsWith('/api/')), false, 'API responses are never precached');
  assert.match(version, /^[0-9a-f]{12}$/);
});

test('AS-11: a different build is a different cache — no mutable name shared by two versions', () => {
  const first = buildPrecacheManifest({ bundleFiles, publicFiles });
  const second = buildPrecacheManifest({ bundleFiles: [...bundleFiles.slice(0, -1), 'assets/index-999999.js'], publicFiles });

  assert.notEqual(first.version, second.version);
  assert.equal(buildPrecacheManifest({ bundleFiles, publicFiles }).version, first.version, 'and the same build is deterministic');
});

test('AS-11: the emitted dist worker and manifest cover every chunk the build produced', { skip: !existsSync('dist/precache-manifest.json') && 'run npm run build first' }, () => {
  const manifest = JSON.parse(readFileSync('dist/precache-manifest.json', 'utf8')) as { assets: string[]; version: string };
  const emitted = readdirSync('dist/assets').filter((file) => isPrecachedBundleFile(file) && !isExcludedFromPrecache(file));

  for (const file of emitted) {
    assert.ok(manifest.assets.includes(`/assets/${file}`), `dist/assets/${file} is emitted but not precached`);
  }

  const worker = readFileSync('dist/sw.js', 'utf8');
  assert.ok(worker.includes(manifest.version), 'the worker carries the version of the manifest it was built with');
  assert.ok(worker.includes('/index.html'), 'the worker precaches the shell');
  assert.match(worker, /pathname\.startsWith\('\/api\/'\)/, 'the API bypass is preserved');
});

// ════════════════════════════════════════════════════════════════════════════════════
// Install and activate
// ════════════════════════════════════════════════════════════════════════════════════

const buildOne = ['/', '/index.html', '/assets/index-v1.js', '/assets/app-v1.css', '/assets/SettingsView-v1.js'];
const buildTwo = ['/', '/index.html', '/assets/index-v2.js', '/assets/app-v2.css', '/assets/SettingsView-v2.js'];

function serverFor(assets: string[], overrides: Record<string, FakeResponse | 'error'> = {}) {
  const server = new Map<string, FakeResponse | 'error'>();
  for (const asset of assets) server.set(asset, response(`${asset} body`));
  for (const [path, value] of Object.entries(overrides)) server.set(path, value);
  return server;
}

test('AS-11: a complete install caches every required asset, and only then takes over', async () => {
  const worker = createServiceWorker({ assets: buildOne, server: serverFor(buildOne) });

  await worker.install();
  await worker.activate();

  const cache = worker.caches.caches.get(worker.cacheName);
  assert.ok(cache);
  for (const asset of buildOne) assert.ok(cache.entries.has(asset), `${asset} was not cached`);
  assert.equal(worker.skipWaitingCalls, 1, 'skipWaiting happens only after the precache is complete');
  assert.equal(worker.claimCalls, 1);
});

test('AS-11: one missing asset fails the install and leaves the working version untouched', async () => {
  const cacheStorage = new FakeCacheStorage();

  // The build that works today.
  const installed = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await installed.install();
  await installed.activate();

  // The new build's lazy chunk 404s — a partial deploy, or a CDN that has not caught up.
  const updated = createServiceWorker({
    assets: buildTwo,
    server: serverFor(buildTwo, { '/assets/SettingsView-v2.js': response('not found', { status: 404 }) }),
    caches: cacheStorage,
  });

  await assert.rejects(() => updated.install(), /SettingsView-v2\.js/, 'the install must fail loudly rather than half-succeed');

  assert.equal(cacheStorage.caches.has(updated.cacheName), false, 'the partial cache is thrown away');
  assert.ok(cacheStorage.caches.has(installed.cacheName), 'the working build keeps its cache');
  assert.equal(updated.skipWaitingCalls, 0, 'and the broken version never takes over');

  // The old worker still serves the old app, offline and complete.
  const shell = await installed.fetch({ url: '/index.html', mode: 'navigate' });
  assert.equal(shell?.body, '/index.html body');
});

test('AS-11: activation keeps the previous build and deletes the ones before it', async () => {
  const cacheStorage = new FakeCacheStorage();
  // A cache from the pre-AS-11 worker, plus two of ours.
  await cacheStorage.open('questshelf-app-shell-v8');

  const first = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await first.install();
  await first.activate();

  const second = createServiceWorker({ assets: buildTwo, server: serverFor(buildTwo), caches: cacheStorage });
  await second.install();
  await second.activate();

  const names = await cacheStorage.keys();
  assert.deepEqual(
    names.filter((name) => name.startsWith('questory-precache-') || name.startsWith('questshelf-app-shell-')).sort(),
    [first.cacheName, second.cacheName].sort(),
    'exactly two versions are retained: the current one and the one it replaced',
  );
  assert.equal(names.includes('questshelf-app-shell-v8'), false, 'the stale pre-AS-11 cache is gone');
});

test('AS-11: an unrelated application\'s cache is never deleted', async () => {
  const cacheStorage = new FakeCacheStorage();
  await cacheStorage.open('some-other-app-v1');

  const worker = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await worker.install();
  await worker.activate();

  assert.ok((await cacheStorage.keys()).includes('some-other-app-v1'));
});

// ════════════════════════════════════════════════════════════════════════════════════
// Offline
// ════════════════════════════════════════════════════════════════════════════════════

const offline = new Map<string, FakeResponse | 'error'>();

test('AS-11: cold offline start serves the shell and its own bundles', async () => {
  const cacheStorage = new FakeCacheStorage();
  const online = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await online.install();
  await online.activate();

  // Restart the worker with no network at all.
  const cold = createServiceWorker({ assets: buildOne, server: offline, caches: cacheStorage });

  const shell = await cold.fetch({ url: '/index.html', mode: 'navigate' });
  assert.equal(shell?.body, '/index.html body', 'the navigation falls back to the cached shell');

  const bundle = await cold.fetch({ url: '/assets/index-v1.js' });
  assert.equal(bundle?.body, '/assets/index-v1.js body', 'and the bundle that shell references is there');
});

test('AS-11: the first OFFLINE visit to a lazy route loads its chunk', async () => {
  const cacheStorage = new FakeCacheStorage();
  const online = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await online.install();
  await online.activate();

  // The user never opened Settings while online. Under the old worker its chunk was not cached, and
  // this is exactly where the app used to break.
  const cold = createServiceWorker({ assets: buildOne, server: offline, caches: cacheStorage });
  const chunk = await cold.fetch({ url: '/assets/SettingsView-v1.js' });

  assert.equal(chunk?.body, '/assets/SettingsView-v1.js body');
});

test('AS-11: an open tab on the old build still gets the old build\'s chunks after an update', async () => {
  const cacheStorage = new FakeCacheStorage();
  const first = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await first.install();
  await first.activate();

  const second = createServiceWorker({ assets: buildTwo, server: serverFor(buildTwo), caches: cacheStorage });
  await second.install();
  await second.activate();

  // The tab is still running build one and now asks for a build-one chunk it has not loaded yet. The
  // server no longer has it; the retained previous cache does. No mixed-version runtime, no crash.
  const staleChunk = await second.fetch({ url: '/assets/SettingsView-v1.js' });
  assert.equal(staleChunk?.body, '/assets/SettingsView-v1.js body');

  // …and a fresh navigation gets build two's shell, whose chunks are build two's.
  const offlineSecond = createServiceWorker({ assets: buildTwo, server: offline, caches: cacheStorage });
  const shell = await offlineSecond.fetch({ url: '/index.html', mode: 'navigate' });
  assert.equal(shell?.body, '/index.html body');
  const newChunk = await offlineSecond.fetch({ url: '/assets/index-v2.js' });
  assert.equal(newChunk?.body, '/assets/index-v2.js body');
});

// ════════════════════════════════════════════════════════════════════════════════════
// Runtime media, the API, and recovery
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-11: a failing runtime image cannot damage the shell cache', async () => {
  const cacheStorage = new FakeCacheStorage();
  const server = serverFor(buildOne, { '/platform-artwork/steam.png': 'error' });
  const worker = createServiceWorker({ assets: buildOne, server, caches: cacheStorage });
  await worker.install();
  await worker.activate();

  await assert.rejects(() => worker.fetch({ url: '/platform-artwork/steam.png' }));

  const shellCache = cacheStorage.caches.get(worker.cacheName);
  assert.equal(shellCache?.entries.size, buildOne.length, 'the precache is untouched by the failure');
  assert.equal((await cacheStorage.keys()).includes('questory-runtime-v1'), false, 'nothing was cached for a request that failed');

  // A successful one is cached — in the RUNTIME cache, never in the shell's.
  const okWorker = createServiceWorker({ assets: buildOne, server: serverFor([...buildOne, '/platform-artwork/steam.png']), caches: cacheStorage });
  await okWorker.fetch({ url: '/platform-artwork/steam.png' });
  assert.ok((await cacheStorage.keys()).includes('questory-runtime-v1'));
  assert.equal(shellCache?.entries.has('/platform-artwork/steam.png'), false);
});

test('AS-11: API requests are neither cached nor answered from a cache', async () => {
  const worker = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: new FakeCacheStorage() });
  await worker.install();

  const handled = await worker.fetch({ url: '/api/telemetry' });
  assert.equal(handled, undefined, 'the worker does not respond to API requests at all');

  const posted = await worker.fetch({ url: '/assets/index-v1.js', method: 'POST' });
  assert.equal(posted, undefined, 'and it never handles a non-GET request');
});

test('AS-11: recovery drops only Questory\'s caches', async () => {
  const cacheStorage = new FakeCacheStorage();
  await cacheStorage.open('some-other-app-v1');

  const worker = createServiceWorker({ assets: buildOne, server: serverFor(buildOne), caches: cacheStorage });
  await worker.install();
  await worker.activate();
  await cacheStorage.open('questory-runtime-v1');

  await worker.message({ type: 'QUESTORY_CLEAR_APP_CACHES' });

  assert.deepEqual(await cacheStorage.keys(), ['some-other-app-v1'], 'ours are gone, the other origin\'s app is not');
});
