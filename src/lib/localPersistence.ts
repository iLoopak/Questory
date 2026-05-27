type PreferencesPlugin = {
  Preferences: {
    get: (options: { key: string }) => Promise<{ value: string | null }>;
    set: (options: { key: string; value: string }) => Promise<void>;
  };
};

const isBrowser = typeof window !== 'undefined';
const preferenceModuleName = '@capacitor/preferences';

export async function loadPersistedJson<T>(key: string, fallback: T, normalize: (value: unknown) => T): Promise<T> {
  const localValue = loadLocalJson(key, fallback, normalize);
  const preferences = await getPreferencesPlugin();

  if (!preferences) {
    return localValue;
  }

  try {
    const storedValue = await preferences.Preferences.get({ key });

    if (storedValue.value) {
      const normalizedValue = normalize(JSON.parse(storedValue.value));
      saveLocalJson(key, normalizedValue);
      return normalizedValue;
    }

    await preferences.Preferences.set({ key, value: JSON.stringify(localValue) });
    return localValue;
  } catch {
    return localValue;
  }
}

export function loadLocalJson<T>(key: string, fallback: T, normalize: (value: unknown) => T): T {
  if (!isBrowser) {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(key);

  if (!storedValue) {
    return fallback;
  }

  try {
    return normalize(JSON.parse(storedValue));
  } catch {
    return fallback;
  }
}

export function savePersistedJson<T>(key: string, value: T) {
  saveLocalJson(key, value);
  void savePreferenceJson(key, value);
}

export async function hydrateLocalStorageFromPreferences(keys: string[]) {
  if (!isBrowser) {
    return;
  }

  const preferences = await getPreferencesPlugin();

  if (!preferences) {
    return;
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        const storedPreference = await preferences.Preferences.get({ key });
        const storedLocalValue = window.localStorage.getItem(key);

        if (storedPreference.value) {
          window.localStorage.setItem(key, storedPreference.value);
          return;
        }

        if (storedLocalValue) {
          await preferences.Preferences.set({ key, value: storedLocalValue });
        }
      } catch {
        // Best-effort hydration. Corrupted native values fall back to existing localStorage/defaults.
      }
    }),
  );
}

export function saveLocalJson<T>(key: string, value: T) {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local persistence should never block the UI if the browser storage quota is unavailable.
  }
}

async function savePreferenceJson<T>(key: string, value: T) {
  const preferences = await getPreferencesPlugin();

  if (!preferences) {
    return;
  }

  try {
    await preferences.Preferences.set({ key, value: JSON.stringify(value) });
  } catch {
    // Capacitor persistence mirrors localStorage; the app remains usable if the native write fails.
  }
}

async function getPreferencesPlugin(): Promise<PreferencesPlugin | null> {
  try {
    return (await import(/* @vite-ignore */ preferenceModuleName)) as PreferencesPlugin;
  } catch {
    return null;
  }
}
