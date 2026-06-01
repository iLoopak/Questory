type PreferencesPlugin = {
  Preferences: {
    get: (options: { key: string }) => Promise<{ value: string | null }>;
    remove: (options: { key: string }) => Promise<void>;
    set: (options: { key: string; value: string }) => Promise<void>;
  };
};

const isBrowser = typeof window !== 'undefined';
const preferenceModuleName = '@capacitor/preferences';
const storageIssueKey = 'questshelf.storageIssues.v1';

export type LocalStorageIssue = {
  key: string;
  message: string;
  recordedAt: string;
};

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
    const parsedValue = JSON.parse(storedValue);
    return normalize(parsedValue);
  } catch (error) {
    recordStorageIssue(key, error instanceof Error ? error.message : 'Stored JSON could not be read.');
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

export async function removePersistedKeys(keys: string[]) {
  if (isBrowser) {
    keys.forEach((key) => window.localStorage.removeItem(key));
  }

  const preferences = await getPreferencesPlugin();

  if (!preferences) {
    return;
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        await preferences.Preferences.remove({ key });
      } catch {
        // Reset is best-effort across browser and native storage.
      }
    }),
  );
}

export function getLocalStorageIssues(): LocalStorageIssue[] {
  return loadLocalJson(storageIssueKey, [], normalizeStorageIssues);
}

export function clearLocalStorageIssues() {
  if (!isBrowser) {
    return;
  }

  window.localStorage.removeItem(storageIssueKey);
}

export function exportRawQuestShelfLocalData() {
  if (!isBrowser) {
    return {};
  }

  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith('questshelf.'))
    .sort()
    .reduce<Record<string, string>>((rawData, key) => {
      rawData[key] = window.localStorage.getItem(key) ?? '';
      return rawData;
    }, {});
}

export function saveLocalJson<T>(key: string, value: T) {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    recordStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    // Local persistence should never block the UI if the browser storage quota is unavailable.
  }
}

function recordStorageIssue(key: string, message: string) {
  if (!isBrowser || key === storageIssueKey) {
    return;
  }

  const issues = getLocalStorageIssues();
  const nextIssues = [
    ...issues.filter((issue) => issue.key !== key),
    {
      key,
      message,
      recordedAt: new Date().toISOString(),
    },
  ].slice(-12);

  try {
    window.localStorage.setItem(storageIssueKey, JSON.stringify(nextIssues));
  } catch {
    // If even issue tracking cannot be written, keep the app usable and rely on safe defaults.
  }
}

function normalizeStorageIssues(value: unknown): LocalStorageIssue[] {
  return Array.isArray(value)
    ? value.filter((issue): issue is LocalStorageIssue => {
        if (!issue || typeof issue !== 'object') {
          return false;
        }

        const parsedIssue = issue as Partial<LocalStorageIssue>;
        return (
          typeof parsedIssue.key === 'string' &&
          typeof parsedIssue.message === 'string' &&
          typeof parsedIssue.recordedAt === 'string'
        );
      })
    : [];
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
