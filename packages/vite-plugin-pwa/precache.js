import { createHash } from 'node:crypto';

/**
 * AS-11: which files the service worker must have before it may replace the working build.
 *
 * The old worker precached a hand-written list of icons and covers and NOTHING the app actually
 * needs to run — no hashed JS, no CSS, no lazy chunks. It then deleted the previous cache on
 * activation. An offline reload after an update could therefore load an index.html pointing at a
 * bundle that was never cached, and a first offline visit to a lazy route (Settings, Stats,
 * Metadata, Quest Runner) had nothing to load at all.
 *
 * The manifest below is derived from the real Vite output, so a new chunk is covered the day it is
 * emitted rather than the day somebody remembers to add it.
 */

/** Public files worth having offline: the shell's icons, the manifest, the bundled demo covers. */
const PRECACHED_PUBLIC_PATTERNS = [
  /^favicon\.ico$/,
  /^manifest\.webmanifest$/,
  /^icons\//,
  /^brand\//,
  /^covers\//,
];

/**
 * Never precached: the worker itself, source maps, and platform artwork — 2.8 MB of runtime media
 * that must not decide whether an update may install. It is cached at runtime instead.
 */
const EXCLUDED_PATTERNS = [
  /^sw\.js$/,
  /\.map$/,
  /^platform-artwork\//,
];

const PRECACHED_BUNDLE_EXTENSIONS = ['.js', '.css', '.html'];

export function isExcludedFromPrecache(path) {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(path));
}

export function isPrecachedPublicAsset(path) {
  return !isExcludedFromPrecache(path) && PRECACHED_PUBLIC_PATTERNS.some((pattern) => pattern.test(path));
}

export function isPrecachedBundleFile(path) {
  return !isExcludedFromPrecache(path) && PRECACHED_BUNDLE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * The required asset set for one build: every emitted bundle file (main JS/CSS, the vendor chunk and
 * every lazy route chunk), index.html, and the shell's public assets.
 *
 * `version` is a hash of that set, so a build with different output gets a different cache and two
 * builds can never share one mutable cache name.
 */
export function buildPrecacheManifest({ bundleFiles = [], publicFiles = [] } = {}) {
  const assets = new Set(['/']);

  for (const file of bundleFiles) {
    if (isPrecachedBundleFile(file)) assets.add(`/${file}`);
  }

  for (const file of publicFiles) {
    if (isPrecachedPublicAsset(file)) assets.add(`/${file}`);
  }

  const sorted = [...assets].sort();
  const version = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 12);

  return { assets: sorted, version };
}

export function renderServiceWorker(template, { assets, version }) {
  return template
    .replace('__QUESTORY_CACHE_VERSION__', version)
    .replace('__QUESTORY_PRECACHE_ASSETS__', JSON.stringify(assets, null, 2));
}
