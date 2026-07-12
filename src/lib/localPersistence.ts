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
    reportStorageIssue(key, error instanceof Error ? error.message : 'Stored JSON could not be read.');
    return fallback;
  }
}

/**
 * Optimistic KV write: localStorage synchronously, durable mirror fire-and-forget.
 *
 * Unchanged for ordinary feature saves. A durable failure is now logged as a storage issue
 * (the adapter rejects instead of swallowing), but it still does not block the caller. Restore,
 * reset and recovery must use `savePersistedJsonDurable` instead.
 */
export function savePersistedJson<T>(key: string, value: T) {
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    return;
  }

  saveLocalJsonStringified(key, serializedValue);
  void getStorageAdapter()
    .writeDurable(key, serializedValue)
    .catch((error: unknown) => {
      reportStorageIssue(key, error instanceof Error ? error.message : 'Durable storage write failed.');
    });
}

/** Outcome of an awaited KV write/remove, per key. */
export type KvWriteResult = {
  key: string;
  ok: boolean;
  /** True when localStorage was written but the durable (Preferences) mirror was not. */
  localOnly?: boolean;
  error?: string;
};

/**
 * Awaitable KV write: localStorage synchronously, then the durable mirror awaited.
 *
 * Used by backup restore/merge so a Preferences failure is reported instead of lost. There is
 * no durable backend in the browser, in which case the local write alone is the durable tier.
 */
export async function savePersistedJsonDurable<T>(key: string, value: T): Promise<KvWriteResult> {
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Value could not be serialized.';
    reportStorageIssue(key, message);
    return { key, ok: false, error: message };
  }

  try {
    getStorageAdapter().writeLocal(key, serializedValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local storage write failed.';
    reportStorageIssue(key, message);
    return { key, ok: false, error: message };
  }

  const adapter = getStorageAdapter();

  if (!(await adapter.hasDurableBackend())) {
    return { key, ok: true };
  }

  try {
    await adapter.writeDurable(key, serializedValue);
    return { key, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Durable storage write failed.';
    reportStorageIssue(key, message);
    return { key, ok: false, localOnly: true, error: message };
  }
}

/** Awaitable KV removal. Mirrors `removePersistedKeys` but reports per-key failure. */
export async function removePersistedKeysDurable(keys: string[]): Promise<KvWriteResult[]> {
  const adapter = getStorageAdapter();

  const results: KvWriteResult[] = keys.map((key) => {
    try {
      adapter.removeLocal(key);
      return { key, ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local storage remove failed.';
      reportStorageIssue(key, message);
      return { key, ok: false, error: message };
    }
  });

  if (!(await adapter.hasDurableBackend())) {
    return results;
  }

  await Promise.all(
    keys.map(async (key, index) => {
      try {
        await adapter.removeDurable(key);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Durable storage remove failed.';
        reportStorageIssue(key, message);
        results[index] = { key, ok: false, localOnly: true, error: message };
      }
    }),
  );

  return results;
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

/**
 * Optimistic KV removal. Several callers fire this without awaiting, so a durable failure is
 * logged rather than thrown. `removePersistedKeysDurable` is the reporting variant.
 */
export async function removePersistedKeys(keys: string[]) {
  const adapter = getStorageAdapter();

  keys.forEach((key) => adapter.removeLocal(key));

  if (!(await adapter.hasDurableBackend())) {
    return;
  }

  await Promise.all(
    keys.map((key) =>
      adapter.removeDurable(key).catch((error: unknown) => {
        reportStorageIssue(key, error instanceof Error ? error.message : 'Durable storage remove failed.');
      }),
    ),
  );
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
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    return;
  }

  saveLocalJsonStringified(key, serializedValue);
}

function saveLocalJsonStringified(key: string, serializedValue: string) {
  try {
    getStorageAdapter().writeLocal(key, serializedValue);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.');
    // Local persistence should never block the UI if the browser storage quota is unavailable.
  }
}

/**
 * Record a storage parse/write/quota issue: logs it, dispatches the storageIssue
 * event (so the UI can surface it), and appends it to the recovery log. Exported so
 * other storage backends (e.g. the IndexedDB game repository) report issues the same
 * visible way. Wave 0.
 */
export function reportStorageIssue(key: string, message: string) {
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
