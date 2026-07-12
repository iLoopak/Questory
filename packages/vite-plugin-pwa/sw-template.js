/* eslint-disable */
// Questory service worker. GENERATED at build time from packages/vite-plugin-pwa/sw-template.js —
// the asset list and the cache version below are injected from the real Vite output.
//
// AS-11: the previous worker precached a hand-written list of icons, skipped waiting, deleted every
// other cache on activation and claimed clients. So a new deploy could delete the working build's
// cache while its own was still a stub: an offline reload then loaded an index.html pointing at a
// hashed bundle nobody had cached, and a first offline visit to a lazy route had nothing to load.
//
// The contract now: a new version installs into its OWN cache, install fails (and cleans up after
// itself) if any required asset cannot be stored, the previous version's cache is kept until the new
// one is complete and active, and a page still running the old build keeps being served the old
// build's chunks. No request is ever answered with a mix of the two.

const CACHE_VERSION = '__QUESTORY_CACHE_VERSION__';
const PRECACHE_ASSETS = __QUESTORY_PRECACHE_ASSETS__;

const PRECACHE_PREFIX = 'questory-precache-';
const PRECACHE_NAME = `${PRECACHE_PREFIX}${CACHE_VERSION}`;
const RUNTIME_CACHE = 'questory-runtime-v1';
/** Caches written by the pre-AS-11 worker. Ours, superseded, but not deleted while a client may use them. */
const LEGACY_PRECACHE_PREFIX = 'questshelf-app-shell-';

const precachedPaths = new Set(PRECACHE_ASSETS);

function isOurCache(name) {
  return name.startsWith(PRECACHE_PREFIX) || name.startsWith(LEGACY_PRECACHE_PREFIX);
}

// ── Install: all of it, or none of it ─────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(installPrecache());
});

async function installPrecache() {
  const cache = await caches.open(PRECACHE_NAME);

  try {
    // `cache: 'reload'` so an update is never assembled out of the HTTP cache's copy of the old build.
    await Promise.all(PRECACHE_ASSETS.map(async (asset) => {
      const response = await fetch(new Request(asset, { cache: 'reload' }));
      if (!response || !response.ok) {
        throw new Error(`Questory update aborted: ${asset} could not be fetched (${response ? response.status : 'no response'}).`);
      }
      await cache.put(asset, response);
    }));
  } catch (error) {
    // A half-downloaded build is not a build. Throw the partial cache away and fail the install: the
    // worker that is running now keeps running, with its cache intact.
    await caches.delete(PRECACHE_NAME);
    throw error;
  }

  // The contract is satisfied — every asset this build needs is stored — so it is safe to take over.
  await self.skipWaiting();
}

// ── Activate: keep the previous version, drop the ones before it ───────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(activatePrecache());
});

async function activatePrecache() {
  // Never delete anything on the word of an incomplete cache.
  if (!(await isPrecacheComplete())) {
    return;
  }

  const names = await caches.keys();
  // caches.keys() is in creation order, so the last of ours is the build we are replacing. It stays:
  // a tab still running that build must keep being able to load its chunks.
  const ours = names.filter((name) => isOurCache(name) && name !== PRECACHE_NAME);
  const previous = ours[ours.length - 1];

  await Promise.all(
    ours
      .filter((name) => name !== previous)
      .map((name) => caches.delete(name)),
  );

  await self.clients.claim();
}

async function isPrecacheComplete() {
  const cache = await caches.open(PRECACHE_NAME);
  const cached = await cache.keys();
  const cachedPaths = new Set(cached.map((request) => new URL(request.url).pathname));
  return PRECACHE_ASSETS.every((asset) => cachedPaths.has(asset));
}

// ── Fetch ─────────────────────────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The API is never cached, and never answered from a cache. Unchanged.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Provider images and other cross-origin requests are left entirely alone: they may not fill our
  // caches, and a failing one may not affect the shell.
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleSameOriginAsset(request, url));
});

/**
 * Online: the network, so a deploy is picked up. Offline: THIS build's index.html — the one whose
 * hashed chunks are in the same cache. A shell is never handed out with another build's scripts.
 */
async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(PRECACHE_NAME);
    const shell = await cache.match('/index.html');
    if (shell) return shell;

    // This worker's own cache is unusable; let the browser report the failure rather than serve a
    // shell from a build whose chunks we may no longer have.
    return Response.error();
  }
}

async function handleSameOriginAsset(request, url) {
  // A build asset: cache-first, from this build's cache.
  if (precachedPaths.has(url.pathname)) {
    const cache = await caches.open(PRECACHE_NAME);
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    return fetch(request);
  }

  // Not part of THIS build. It may still belong to the build a still-open tab is running — the
  // previous cache is retained for exactly this, so an update never breaks a page mid-session with a
  // chunk-load error.
  const fromRetainedBuild = await caches.match(request);
  if (fromRetainedBuild) return fromRetainedBuild;

  // Runtime media (platform artwork). Cached separately, so a failed image can never damage the
  // shell cache or an installation.
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;

  // Only ever sent to a worker that has finished installing, which means its precache is complete.
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }

  // Recovery: drop OUR caches so the next load rebuilds them from the network. User data (IndexedDB,
  // localStorage, Preferences) is never touched.
  if (data.type === 'QUESTORY_CLEAR_APP_CACHES') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => isOurCache(name) || name === RUNTIME_CACHE).map((name) => caches.delete(name)));
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
    })());
  }
});
