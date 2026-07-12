import { enqueueDurableKv, whenDurableKvSettled, type DurableKvOutcome } from './kvDurableQueue';
import {
  getKvMetaKey,
  legacyRevision,
  nextKvRevision,
  parseKvMeta,
  readLocalKvMeta,
  writeLocalKvMeta,
  type KvMeta,
} from './kvRevisions';
import { getStorageAdapter } from './storageAdapter';

const isBrowser = typeof window !== 'undefined';
const storageIssueKey = 'questshelf.storageIssues.v1';

/**
 * Fired on `window` whenever a storage parse/write/quota issue is recorded, so the UI
 * can surface it instead of it only living in a background localStorage log. Wave 0.
 */
export const storageIssueEventName = 'questshelf:storage-issue';

/** What the app was doing when a storage issue was recorded (AS-05 diagnostics). */
export type StorageIssueOperation = 'read' | 'write' | 'remove' | 'hydrate';
export type StorageIssueTier = 'local' | 'durable';
export type StorageIssueCategory =
  | 'parse'
  | 'serialize'
  | 'quota'
  | 'write-rejected'
  | 'remove-rejected'
  | 'unavailable';

export type StorageIssueDetails = {
  operation?: StorageIssueOperation;
  tier?: StorageIssueTier;
  category?: StorageIssueCategory;
  /** Whether the local tier still holds a value for the key — i.e. whether anything was lost. */
  localValuePresent?: boolean;
};

/**
 * A recorded storage problem.
 *
 * Deliberately metadata only: the key, what was attempted, why it failed, and whether the local
 * tier still holds the value. Never the value itself — several of these keys hold API secrets.
 */
export type LocalStorageIssue = StorageIssueDetails & {
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
    reportStorageIssue(key, error instanceof Error ? error.message : 'Stored JSON could not be read.', {
      operation: 'read',
      tier: 'local',
      category: 'parse',
    });
    return fallback;
  }
}

/**
 * Optimistic KV write: localStorage synchronously, durable mirror queued.
 *
 * AS-05: the write is stamped with the key's next revision and handed to that key's serialized
 * durable queue, so it cannot be overtaken by an earlier write of the same key and cannot be
 * resurrected over by one. The caller is still never blocked on the durable tier.
 */
export function savePersistedJson<T>(key: string, value: T) {
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.', {
      operation: 'write',
      category: 'serialize',
    });
    return;
  }

  const revision = commitLocalKvWrite(key, serializedValue);
  if (revision === null) {
    return;
  }

  void enqueueDurableKv(key, { kind: 'set', revision, value: serializedValue }).then(reportDurableOutcome);
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
 * Used by backup restore/merge so a Preferences failure is reported instead of lost. It shares the
 * per-key queue with the optimistic path, so an awaited restore write and an ordinary feature save
 * of the same key still land in the order they were issued.
 */
export async function savePersistedJsonDurable<T>(key: string, value: T): Promise<KvWriteResult> {
  let serializedValue: string;

  try {
    serializedValue = JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Value could not be serialized.';
    reportStorageIssue(key, message, { operation: 'write', category: 'serialize' });
    return { key, ok: false, error: message };
  }

  const revision = commitLocalKvWrite(key, serializedValue);
  if (revision === null) {
    return { key, ok: false, error: 'Local storage write failed.' };
  }

  return toKvWriteResult(await enqueueDurableKv(key, { kind: 'set', revision, value: serializedValue }));
}

/** Awaitable KV removal. Mirrors `removePersistedKeys` but reports per-key failure. */
export async function removePersistedKeysDurable(keys: string[]): Promise<KvWriteResult[]> {
  return Promise.all(
    keys.map(async (key) => {
      const revision = commitLocalKvRemove(key);
      if (revision === null) {
        return { key, ok: false, error: 'Local storage remove failed.' };
      }

      return toKvWriteResult(await enqueueDurableKv(key, { kind: 'remove', revision }));
    }),
  );
}

/**
 * Optimistic KV removal. Several callers fire this without awaiting, so a durable failure is
 * logged rather than thrown. `removePersistedKeysDurable` is the reporting variant.
 */
export async function removePersistedKeys(keys: string[]) {
  await Promise.all(
    keys.map(async (key) => {
      const revision = commitLocalKvRemove(key);
      if (revision === null) {
        return;
      }

      reportDurableOutcome(await enqueueDurableKv(key, { kind: 'remove', revision }));
    }),
  );
}

/**
 * Startup reconciliation (AS-05).
 *
 * Preferences used to win by default, which is exactly how an older durable value resurrected over
 * a newer local one. Each key is now resolved by revision:
 *
 *   1. the tier with the higher revision wins;
 *   2. a tombstone that wins is honored — a removed key stays removed rather than being rebuilt
 *      from the older copy still sitting in the other tier;
 *   3. a winning payload that will not parse is refused in favor of the other tier's valid payload,
 *      so a corrupt tier can never destroy a readable one;
 *   4. when NEITHER tier carries a revision — legacy data, i.e. every existing installation on its
 *      first launch after this change — and both hold a value, the LOCAL value wins. That is the
 *      conservative reading of the defect: local is written synchronously, while durable is the
 *      tier whose write may have been lost, delayed or reordered, so a difference between them
 *      means local is the copy that is up to date. Both tiers are then stamped revision 1, which
 *      makes the migration idempotent: the next launch resolves this key by revision like any
 *      other.
 *
 * A key present in only one tier is copied to the other, revision included.
 */
export async function hydrateLocalStorageFromPreferences(keys: string[]) {
  if (!isBrowser) {
    return;
  }

  const adapter = getStorageAdapter();

  if (!(await adapter.hasDurableBackend())) {
    // Ordinary browser: localStorage IS the durable tier. Nothing to reconcile, and nothing that
    // could delay or fail at boot.
    return;
  }

  await Promise.all(keys.map((key) => reconcileKey(key)));
  await whenDurableKvSettled();
}

async function reconcileKey(key: string) {
  const adapter = getStorageAdapter();

  try {
    const [durableValue, durableMetaValue] = await Promise.all([
      adapter.readDurable(key),
      adapter.readDurable(getKvMetaKey(key)),
    ]);
    const localValue = adapter.readLocal(key);
    const local = describeTier(localValue, readLocalKvMeta(key));
    const durable = describeTier(durableValue, parseKvMeta(durableMetaValue));

    if (!local.present && !durable.present) {
      return;
    }

    const winner = chooseWinner(local, durable);

    if (winner.tier === 'none') {
      // Both tiers hold an unparseable payload. Overwriting either with the other's garbage would
      // help nobody, so leave them where they are and record it.
      reportStorageIssue(key, 'Both the local and the durable copy of this key are unreadable.', {
        operation: 'hydrate',
        category: 'parse',
        localValuePresent: localValue !== null,
      });
      return;
    }

    // Legacy tiers both read as revision 0, so the reconciled value starts life at revision 1.
    const revision = Math.max(local.revision, durable.revision, 1);

    if (winner.deleted) {
      if (localValue !== null) {
        adapter.removeLocal(key);
      }
      writeLocalKvMeta(key, { rev: revision, deleted: true });

      if (durableValue !== null || durable.revision < revision) {
        await enqueueDurableKv(key, { kind: 'remove', revision });
      }
      return;
    }

    const winningValue = winner.value as string;

    if (localValue !== winningValue) {
      try {
        adapter.writeLocal(key, winningValue);
      } catch (error) {
        reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.', {
          operation: 'hydrate',
          tier: 'local',
          category: 'quota',
          localValuePresent: localValue !== null,
        });
        return;
      }
    }

    writeLocalKvMeta(key, { rev: revision });

    if (durableValue !== winningValue || durable.revision !== revision) {
      await enqueueDurableKv(key, { kind: 'set', revision, value: winningValue });
    }
  } catch (error) {
    // Reconciliation is best-effort: a failure here must never stop the app from starting with the
    // local value it already has.
    reportStorageIssue(key, error instanceof Error ? error.message : 'Storage reconciliation failed.', {
      operation: 'hydrate',
      category: 'unavailable',
    });
  }
}

type TierState = {
  present: boolean;
  value: string | null;
  revision: number;
  deleted: boolean;
  valid: boolean;
};

function describeTier(value: string | null, meta: KvMeta | null): TierState {
  return {
    present: value !== null || meta !== null,
    value,
    // Malformed or absent metadata reads as legacy rather than making the payload unusable.
    revision: meta?.rev ?? legacyRevision,
    deleted: meta?.deleted === true && value === null,
    valid: value !== null && isParseable(value),
  };
}

type Winner = { tier: 'local' | 'durable' | 'none'; value: string | null; deleted: boolean };

function chooseWinner(local: TierState, durable: TierState): Winner {
  const usable = ([
    { tier: 'local', state: local },
    { tier: 'durable', state: durable },
  ] as const).filter(({ state }) => state.deleted || state.valid);

  if (usable.length === 0) {
    return { tier: 'none', value: null, deleted: false };
  }

  // Highest revision wins; a tie goes to local, which also settles the legacy 0-vs-0 case.
  const [best] = [...usable].sort((first, second) =>
    first.state.revision !== second.state.revision
      ? second.state.revision - first.state.revision
      : first.tier === 'local'
        ? -1
        : 1,
  );

  return { tier: best.tier, value: best.state.value, deleted: best.state.deleted };
}

function isParseable(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** Write payload + new revision to the local tier. Returns the revision, or null if it failed. */
function commitLocalKvWrite(key: string, serializedValue: string): number | null {
  const revision = nextKvRevision(key);

  try {
    getStorageAdapter().writeLocal(key, serializedValue);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.', {
      operation: 'write',
      tier: 'local',
      category: 'quota',
      localValuePresent: getStorageAdapter().readLocal(key) !== null,
    });
    return null;
  }

  writeLocalKvMeta(key, { rev: revision });
  return revision;
}

/** Remove the payload from the local tier and leave a tombstone at the next revision. */
function commitLocalKvRemove(key: string): number | null {
  const revision = nextKvRevision(key);

  try {
    getStorageAdapter().removeLocal(key);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage remove failed.', {
      operation: 'remove',
      tier: 'local',
      localValuePresent: true,
    });
    return null;
  }

  writeLocalKvMeta(key, { rev: revision, deleted: true });
  return revision;
}

function toKvWriteResult(outcome: DurableKvOutcome): KvWriteResult {
  if (outcome.ok) {
    return { key: outcome.key, ok: true };
  }

  reportDurableOutcome(outcome);
  return { key: outcome.key, ok: false, localOnly: true, error: outcome.error };
}

/** A durable failure is non-fatal for the running UI, but it must not be invisible. */
function reportDurableOutcome(outcome: DurableKvOutcome) {
  if (outcome.ok) {
    return;
  }

  reportStorageIssue(outcome.key, outcome.error ?? 'Durable storage operation failed.', {
    operation: outcome.category === 'remove-rejected' ? 'remove' : 'write',
    tier: 'durable',
    category: outcome.category,
    localValuePresent: getStorageAdapter().readLocal(outcome.key) !== null,
  });
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
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.', {
      operation: 'write',
      category: 'serialize',
    });
    return;
  }

  saveLocalJsonStringified(key, serializedValue);
}

function saveLocalJsonStringified(key: string, serializedValue: string) {
  try {
    getStorageAdapter().writeLocal(key, serializedValue);
  } catch (error) {
    reportStorageIssue(key, error instanceof Error ? error.message : 'Local storage write failed.', {
      operation: 'write',
      tier: 'local',
      category: 'quota',
    });
    // Local persistence should never block the UI if the browser storage quota is unavailable.
  }
}

/**
 * Record a storage parse/write/quota issue: logs it, dispatches the storageIssue
 * event (so the UI can surface it), and appends it to the recovery log. Exported so
 * other storage backends (e.g. the IndexedDB game repository) report issues the same
 * visible way. Wave 0.
 *
 * `details` carries the AS-05 diagnostics: which operation, which tier, why it failed, and whether
 * the local tier still holds the value. Metadata only — never the stored payload, several of these
 * keys hold API secrets.
 */
export function reportStorageIssue(key: string, message: string, details: StorageIssueDetails = {}) {
  if (!isBrowser || key === storageIssueKey) {
    return;
  }

  const issue: LocalStorageIssue = { ...details, key, message, recordedAt: new Date().toISOString() };

  // Wave 0: make storage failures visible instead of only living in a background log.
  console.warn(`[Questory storage] ${key}: ${message}`);
  try {
    window.dispatchEvent(new CustomEvent<LocalStorageIssue>(storageIssueEventName, { detail: issue }));
  } catch {
    // Event dispatch is best-effort diagnostics; never let it break a write path.
  }

  const issues = getLocalStorageIssues();
  const nextIssues = [...issues.filter((existing) => existing.key !== key), issue].slice(-12);

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
