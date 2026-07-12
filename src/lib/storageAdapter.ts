// Wave 1 persistence seam.
//
// StorageAdapter abstracts the raw two-tier key/value mechanics that Questory has
// always used: a *synchronous local tier* (localStorage, which makes the app's
// synchronous first-paint reads possible) and a *durable async tier* (Capacitor
// Preferences, the native mirror). localPersistence builds all of its JSON helpers
// on top of this interface.
//
// The point of the seam: a future IndexedDB/SQLite backend can implement the same
// interface and be swapped in via setStorageAdapter() without touching any of the
// callers that go through localPersistence. This module intentionally contains no
// JSON, normalization, or storage-issue logic — that stays in localPersistence so
// behavior is preserved exactly.

export interface StorageAdapter {
  /** Synchronous local tier read. Returns null when absent or unavailable. */
  readLocal(key: string): string | null;
  /** Synchronous local tier write. Throws on quota errors so the caller can record them. */
  writeLocal(key: string, value: string): void;
  /** Synchronous local tier delete. */
  removeLocal(key: string): void;
  /** All keys present in the local tier. */
  localKeys(): string[];
  /** Durable async tier read. Returns null when absent or no backend is available. */
  readDurable(key: string): Promise<string | null>;
  /** Durable async tier write (best-effort). */
  writeDurable(key: string, value: string): Promise<void>;
  /** Durable async tier delete (best-effort). */
  removeDurable(key: string): Promise<void>;
  /** Whether a durable backend (Capacitor Preferences) is available in this runtime. */
  hasDurableBackend(): Promise<boolean>;
}

type PreferencesPlugin = {
  Preferences: {
    get: (options: { key: string }) => Promise<{ value: string | null }>;
    remove: (options: { key: string }) => Promise<void>;
    set: (options: { key: string; value: string }) => Promise<void>;
  };
};

const isBrowser = typeof window !== 'undefined';
const preferenceModuleName = '@capacitor/preferences';

let preferencesPluginPromise: Promise<PreferencesPlugin | null> | null = null;

function getPreferencesPlugin(): Promise<PreferencesPlugin | null> {
  if (!preferencesPluginPromise) {
    preferencesPluginPromise = (async () => {
      try {
        return (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
      } catch {
        return null;
      }
    })();
  }

  return preferencesPluginPromise;
}

/**
 * Default adapter: localStorage (sync tier) mirrored to Capacitor Preferences
 * (durable tier). This preserves Questory's existing persistence behavior exactly.
 */
export const localStoragePreferencesAdapter: StorageAdapter = {
  readLocal(key) {
    if (!isBrowser) {
      return null;
    }
    return window.localStorage.getItem(key);
  },
  writeLocal(key, value) {
    if (!isBrowser) {
      return;
    }
    // Intentionally not guarded: callers translate a throw into a recorded storage issue.
    window.localStorage.setItem(key, value);
  },
  removeLocal(key) {
    if (!isBrowser) {
      return;
    }
    window.localStorage.removeItem(key);
  },
  localKeys() {
    if (!isBrowser) {
      return [];
    }
    return Object.keys(window.localStorage);
  },
  async readDurable(key) {
    const preferences = await getPreferencesPlugin();
    if (!preferences) {
      return null;
    }
    try {
      const stored = await preferences.Preferences.get({ key });
      return stored.value;
    } catch {
      return null;
    }
  },
  // writeDurable/removeDurable REJECT on a native failure. They used to swallow it, which made
  // a lost Preferences write invisible to every caller (AS-01). The optimistic callers in
  // localPersistence still ignore the rejection (they only log it), so their behavior is
  // unchanged — but the awaited restore/reset/recovery paths can now report which key failed.
  async writeDurable(key, value) {
    const preferences = await getPreferencesPlugin();
    if (!preferences) {
      return;
    }
    await preferences.Preferences.set({ key, value });
  },
  async removeDurable(key) {
    const preferences = await getPreferencesPlugin();
    if (!preferences) {
      return;
    }
    await preferences.Preferences.remove({ key });
  },
  async hasDurableBackend() {
    return (await getPreferencesPlugin()) !== null;
  },
};

let activeAdapter: StorageAdapter = localStoragePreferencesAdapter;

export function getStorageAdapter(): StorageAdapter {
  return activeAdapter;
}

/** Swap the active adapter (e.g. a future IndexedDB adapter). Returns the previous one. */
export function setStorageAdapter(adapter: StorageAdapter): StorageAdapter {
  const previous = activeAdapter;
  activeAdapter = adapter;
  return previous;
}
