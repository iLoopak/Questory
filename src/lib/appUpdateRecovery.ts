/**
 * AS-11: recovering from a bad update, without touching a single byte of the user's data.
 *
 * Both actions here are about DELIVERY: the service worker and the caches Questory itself wrote.
 * IndexedDB, localStorage and Capacitor Preferences are never cleared — a chunk-load error means the
 * app was updated underneath an open tab, not that the library is corrupt.
 */

const QUESTORY_CACHE_PREFIXES = ['questory-precache-', 'questory-runtime', 'questshelf-app-shell-'];

export function isQuestoryAppCache(cacheName: string): boolean {
  return QUESTORY_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

/** Activate the worker that is waiting (its precache is complete by definition), then reload onto it. */
export async function reloadWithNewestServiceWorker(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update().catch(() => undefined);
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // Recovery must not fail on the thing it is recovering from.
  }

  window.location.reload();
}

/** Drop Questory's own caches — and only those — so the next load rebuilds them from the network. */
export async function clearQuestoryAppCaches(): Promise<string[]> {
  if (typeof caches === 'undefined') return [];

  try {
    const names = await caches.keys();
    const ours = names.filter(isQuestoryAppCache);
    await Promise.all(ours.map((name) => caches.delete(name)));
    return ours;
  } catch {
    return [];
  }
}
