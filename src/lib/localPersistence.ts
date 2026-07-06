import { getStorageAdapter } from './storageAdapter';

const isBrowser = typeof window !== 'undefined';
const storageIssueKey = 'questshelf.storageIssues.v1';

/**
 * Fired on `window` whenever a storage parse/write/quota issue is recorded, so the UI
 * can surface it instead of it only living in a background localStorage log. Wave 0.
 */
export const storageIssueEventName = 'questshelf:storage-issue';

export type LocalStorageIssue = {
  key: string;
  message: string;
  recordedAt: string;
};

export async function loadPersistedJson<T>(key: string, fallback: T, normalize: (value: unknown) => T): Promise<T> {
  const localValue = loadLocalJson(key, fallback, normalize);
  const adapter = getStorageAdapter();

  try {
    const durableValue = await adapter.readDurable(key);

    if (durableValue !== null) {
      const normalizedValue = normalize(JSON.parse(durableValue));
      saveLocalJson(key, normalizedValue);
      return normalizedValue;
    }

    await adapter.writeDurable(key, JSON.stringify(localValue));
    return localValue;
  } catch {
    return localValue;
  }
}

export function loadLocalJson<T>(key: string, fallback: T, normalize: (value: unknown) => T): T {
  const storedValue = getStorageAdapter().readLocal(key);

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
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    recordStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    return;
  }

  saveLocalJsonStringified(key, serializedValue);
  void getStorageAdapter().writeDurable(key, serializedValue);
}

export async function hydrateLocalStorageFromPreferences(keys: string[]) {
  if (!isBrowser) {
    return;
  }

  const adapter = getStorageAdapter();

  if (!(await adapter.hasDurableBackend())) {
    return;
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        const durableValue = await adapter.readDurable(key);
        const localValue = adapter.readLocal(key);

        if (durableValue) {
          // Guard against stale Capacitor entries (e.g. {"apiKey":""}) overwriting a valid
          // localStorage value. This can happen when a previous app version wrote an empty
          // settings object to Capacitor on mount before the user had entered any key.
          // If Capacitor has an empty apiKey but localStorage has a real one, trust localStorage
          // and sync it back to Capacitor so future launches are consistent.
          if (localValue && durableValue !== localValue) {
            try {
              const capData = JSON.parse(durableValue) as Record<string, unknown>;
              const lsData = JSON.parse(localValue) as Record<string, unknown>;
              const capKey = typeof capData.apiKey === 'string' ? capData.apiKey : '';
              const lsKey = typeof lsData.apiKey === 'string' ? lsData.apiKey : '';
              if (!capKey.trim() && lsKey.trim()) {
                await adapter.writeDurable(key, localValue);
                return;
              }
            } catch {
              // Fall through: Capacitor wins by default
            }
          }
          adapter.writeLocal(key, durableValue);
          return;
        }

        if (localValue) {
          await adapter.writeDurable(key, localValue);
        }
      } catch {
        // Best-effort hydration. Corrupted native values fall back to existing localStorage/defaults.
      }
    }),
  );
}

export async function removePersistedKeys(keys: string[]) {
  const adapter = getStorageAdapter();

  keys.forEach((key) => adapter.removeLocal(key));

  if (!(await adapter.hasDurableBackend())) {
    return;
  }

  await Promise.all(keys.map((key) => adapter.removeDurable(key)));
}

export function getLocalStorageIssues(): LocalStorageIssue[] {
  return loadLocalJson(storageIssueKey, [], normalizeStorageIssues);
}

export function clearLocalStorageIssues() {
  getStorageAdapter().removeLocal(storageIssueKey);
}

export function exportRawQuestShelfLocalData() {
  return getStorageAdapter()
    .localKeys()
    .filter((key) => key.startsWith('questshelf.'))
    .sort()
    .reduce<Record<string, string>>((rawData, key) => {
      rawData[key] = getStorageAdapter().readLocal(key) ?? '';
      return rawData;
    }, {});
}

export function saveLocalJson<T>(key: string, value: T) {
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    recordStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    return;
  }

  saveLocalJsonStringified(key, serializedValue);
}

function saveLocalJsonStringified(key: string, serializedValue: string) {
  try {
    getStorageAdapter().writeLocal(key, serializedValue);
  } catch (error) {
    recordStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    // Local persistence should never block the UI if the browser storage quota is unavailable.
  }
}

function recordStorageIssue(key: string, message: string) {
  if (!isBrowser || key === storageIssueKey) {
    return;
  }

  // Wave 0: make storage failures visible instead of only living in a background log.
  console.warn(`[Questory storage] ${key}: ${message}`);
  try {
    window.dispatchEvent(new CustomEvent<LocalStorageIssue>(storageIssueEventName, {
      detail: { key, message, recordedAt: new Date().toISOString() },
    }));
  } catch {
    // Event dispatch is best-effort diagnostics; never let it break a write path.
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
    getStorageAdapter().writeLocal(storageIssueKey, JSON.stringify(nextIssues));
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
