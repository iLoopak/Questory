/**
 * AS-05 — Deterministic localStorage ↔ Capacitor Preferences persistence.
 *
 * Questory writes each KV key to localStorage synchronously and mirrors it to Preferences
 * asynchronously. Those mirror writes were fired and forgotten: they could complete out of order,
 * late, or not at all, and startup hydration then let whatever Preferences held win. An older
 * durable value could therefore resurrect over a newer local one — Platform Plans, review state,
 * taste, settings, onboarding.
 *
 * These tests pin the two mechanisms that fix it: a per-key serialized durable queue, and a per-key
 * revision (stored in a companion key, leaving every payload byte-for-byte as it was) that startup
 * reconciliation uses to choose the newest valid tier.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { createControllableStorageAdapter, type ControllableStorageAdapter } from './testUtils/controllableStorageAdapter';

assertTestEnvironment();

const { setStorageAdapter } = await import('../src/lib/storageAdapter');
const {
  getLocalStorageIssues,
  hydrateLocalStorageFromPreferences,
  loadLocalJson,
  removePersistedKeys,
  savePersistedJson,
  savePersistedJsonDurable,
} = await import('../src/lib/localPersistence');
const { whenDurableKvSettled, resetDurableKvQueues } = await import('../src/lib/kvDurableQueue');
const { getKvMetaKey, serializeKvMeta } = await import('../src/lib/kvRevisions');

// Real keys, real payload shapes — the point is that none of them had to change.
const planKey = 'questshelf.platformQueues.v1';
const reviewKey = 'questshelf.reviewMode.v1';
const tasteKey = 'questshelf.tasteProfile.v1';
const settingsKey = 'questshelf.rawgSettings.v1';

const plan = (position: number) => ({
  activePlatforms: ['PC'],
  entries: [{ gameId: 'g1', queueNotes: '', queuePosition: position, queuePriority: 'normal', queuedAt: '2026-07-01T00:00:00.000Z', targetPlatform: 'PC' }],
  schemaVersion: 2,
  settings: [],
});

function setup(options: { hasDurableBackend?: boolean } = {}): ControllableStorageAdapter {
  resetWebStorage();
  resetDurableKvQueues();
  const storage = createControllableStorageAdapter({ durableMode: 'auto', ...options });
  setStorageAdapter(storage.adapter);
  return storage;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const metaOf = (storage: ControllableStorageAdapter, tier: 'local' | 'durable', key: string) => {
  const raw = storage[tier].get(getKvMetaKey(key));
  return raw ? (JSON.parse(raw) as { rev: number; deleted?: boolean }) : null;
};

/** Simulate a native restart: the durable tier survives, the WebView's localStorage is what it is. */
async function restart(storage: ControllableStorageAdapter, keys: string[]) {
  resetDurableKvQueues();
  await hydrateLocalStorageFromPreferences(keys);
}

// ── Ordering ────────────────────────────────────────────────────────────────────────

test('AS-05: two rapid writes to the same key land in the order they were issued', async () => {
  const storage = setup();
  storage.setDurableMode('manual');

  savePersistedJson(planKey, plan(1));
  savePersistedJson(planKey, plan(2));
  await flush();

  // The second write has not even STARTED: the queue holds it until the first settles. That is
  // what makes "the older payload wins the race" impossible.
  assert.equal(storage.operationsForKey(planKey).length, 1, 'only the first write is in flight');

  storage.setDurableMode('auto');
  await storage.settleAll();
  await whenDurableKvSettled();

  const writes = storage.operationsForKey(planKey).filter((operation) => operation.kind === 'write');
  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((operation) => (JSON.parse(operation.value!) as ReturnType<typeof plan>).entries[0].queuePosition),
    [1, 2],
    'issued order is the durable order',
  );

  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 2, 'the newer value is on disk');
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 2);
  assert.equal(metaOf(storage, 'local', planKey)?.rev, 2);
});

test('AS-05: three writes cannot resolve out of order — the last one issued is the one on disk', async () => {
  const storage = setup();

  savePersistedJson(planKey, plan(1));
  savePersistedJson(planKey, plan(2));
  savePersistedJson(planKey, plan(3));
  await whenDurableKvSettled();

  assert.deepEqual(
    storage
      .operationsForKey(planKey)
      .filter((operation) => operation.kind === 'write')
      .map((operation) => (JSON.parse(operation.value!) as ReturnType<typeof plan>).entries[0].queuePosition),
    [1, 2, 3],
  );
  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 3);
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 3);
});

test('AS-05: a write followed by a remove leaves the key removed, with a tombstone', async () => {
  const storage = setup();

  savePersistedJson(planKey, plan(1));
  await removePersistedKeys([planKey]);
  await whenDurableKvSettled();

  assert.equal(storage.durable.has(planKey), false, 'the durable payload is gone');
  assert.equal(storage.local.has(planKey), false, 'and so is the local one');
  assert.deepEqual(metaOf(storage, 'durable', planKey), { rev: 2, deleted: true }, 'a tombstone, not a payload');
  assert.deepEqual(metaOf(storage, 'local', planKey), { rev: 2, deleted: true });
});

test('AS-05: a remove followed by a write leaves the key written', async () => {
  const storage = setup();

  savePersistedJson(planKey, plan(1));
  await whenDurableKvSettled();
  void removePersistedKeys([planKey]);
  savePersistedJson(planKey, plan(9));
  await whenDurableKvSettled();

  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 9);
  assert.equal(metaOf(storage, 'durable', planKey)?.deleted, undefined, 'the tombstone was superseded');
});

test('AS-05: a rejected earlier write does not break the queue for the write after it', async () => {
  const storage = setup();
  storage.failDurableKeys.add(planKey);

  savePersistedJson(planKey, plan(1));
  await whenDurableKvSettled();
  assert.equal(storage.durable.has(planKey), false, 'the first write was rejected by the platform');

  // The device recovers.
  storage.failDurableKeys.delete(planKey);
  savePersistedJson(planKey, plan(2));
  await whenDurableKvSettled();

  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 2, 'the later write still lands');
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 2);
});

test('AS-05: unrelated keys are not blocked by each other', async () => {
  const storage = setup();
  storage.setDurableMode('manual');

  savePersistedJson(planKey, plan(1));
  savePersistedJson(reviewKey, { queueOrder: ['g1'] });
  await flush();

  // Two keys, two queues: both are in flight at once. There is no global lock.
  assert.deepEqual(
    storage.pendingOperations().map((operation) => operation.key).sort(),
    [planKey, reviewKey].sort(),
  );

  storage.setDurableMode('auto');
  await storage.settleAll();
  await whenDurableKvSettled();

  assert.ok(storage.durable.has(planKey));
  assert.ok(storage.durable.has(reviewKey));
});

// ── Startup reconciliation ──────────────────────────────────────────────────────────

test('AS-05: a newer local value survives an older Preferences value', async () => {
  const storage = setup();

  // The user changed the Plan twice. The second durable write never landed (the app was killed).
  savePersistedJson(planKey, plan(1));
  await whenDurableKvSettled();
  storage.failDurableKeys.add(planKey);
  savePersistedJson(planKey, plan(2));
  await whenDurableKvSettled();
  storage.failDurableKeys.delete(planKey);

  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 1, 'disk still has the old Plan');

  await restart(storage, [planKey]);

  // This is the AS-05 defect, and it is gone: the local revision is higher, so the newer Plan wins
  // and the durable tier is brought up to date instead of overwriting it.
  assert.equal(loadLocalJson(planKey, null, (value) => value as ReturnType<typeof plan>)!.entries[0].queuePosition, 2);
  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 2, 'durable was repaired');
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 2);
});

test('AS-05: a newer Preferences value still wins over an older local one', async () => {
  const storage = setup();

  // The native tier legitimately holds newer data (e.g. the WebView cache was evicted and an older
  // local copy remains). Preferences must still be able to win — this is not "localStorage always".
  storage.local.set(planKey, JSON.stringify(plan(1)));
  storage.local.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 3 }));
  storage.durable.set(planKey, JSON.stringify(plan(7)));
  storage.durable.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 9 }));

  await restart(storage, [planKey]);

  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 7);
  assert.equal(metaOf(storage, 'local', planKey)?.rev, 9);
});

test('AS-05: identical values are left alone', async () => {
  const storage = setup();
  savePersistedJson(reviewKey, { queueOrder: ['g1'] });
  await whenDurableKvSettled();

  const before = storage.operations.length;
  await restart(storage, [reviewKey]);

  // Same value, same revision on both tiers: reconciliation has nothing to write.
  assert.equal(
    storage.operations.slice(before).filter((operation) => operation.kind === 'write').length,
    0,
    'no redundant durable writes',
  );
  assert.deepEqual(JSON.parse(storage.local.get(reviewKey)!), { queueOrder: ['g1'] });
});

test('AS-05: a corrupt durable payload does not destroy a valid local one', async () => {
  const storage = setup();

  storage.local.set(tasteKey, JSON.stringify({ genres: ['rpg'] }));
  storage.local.set(getKvMetaKey(tasteKey), serializeKvMeta({ rev: 2 }));
  // Higher revision, but the payload is truncated garbage — a half-written native value.
  storage.durable.set(tasteKey, '{"genres":["rp');
  storage.durable.set(getKvMetaKey(tasteKey), serializeKvMeta({ rev: 5 }));

  await restart(storage, [tasteKey]);

  assert.deepEqual(JSON.parse(storage.local.get(tasteKey)!), { genres: ['rpg'] }, 'the readable copy survived');
  assert.deepEqual(JSON.parse(storage.durable.get(tasteKey)!), { genres: ['rpg'] }, 'and repaired the corrupt tier');
});

test('AS-05: a corrupt local payload is repaired from the durable tier', async () => {
  const storage = setup();

  storage.local.set(tasteKey, '{"genres":');
  storage.local.set(getKvMetaKey(tasteKey), serializeKvMeta({ rev: 8 }));
  storage.durable.set(tasteKey, JSON.stringify({ genres: ['strategy'] }));
  storage.durable.set(getKvMetaKey(tasteKey), serializeKvMeta({ rev: 2 }));

  await restart(storage, [tasteKey]);

  // The local revision is higher, but an unreadable payload is not a value — the valid tier wins.
  assert.deepEqual(JSON.parse(storage.local.get(tasteKey)!), { genres: ['strategy'] });
});

test('AS-05: when both tiers are unreadable, neither is overwritten and the issue is recorded', async () => {
  const storage = setup();

  storage.local.set(tasteKey, '{oops');
  storage.durable.set(tasteKey, '{also oops');

  await restart(storage, [tasteKey]);

  assert.equal(storage.local.get(tasteKey), '{oops', 'left for a repair/restore to deal with');
  assert.equal(storage.durable.get(tasteKey), '{also oops');
  assert.ok(getLocalStorageIssues().some((issue) => issue.key === tasteKey && issue.category === 'parse'));
});

test('AS-05: legacy values with no revision on either tier — local wins, and both are upgraded', async () => {
  const storage = setup();

  // Exactly what an existing installation looks like on its first launch after this change.
  storage.local.set(planKey, JSON.stringify(plan(4)));
  storage.durable.set(planKey, JSON.stringify(plan(1)));

  await restart(storage, [planKey]);

  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 4, 'the local copy is trusted');
  assert.equal(JSON.parse(storage.durable.get(planKey)!).entries[0].queuePosition, 4);
  assert.equal(metaOf(storage, 'local', planKey)?.rev, 1, 'and both tiers are stamped revision 1');
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 1);

  // Idempotent: running it again changes nothing.
  await restart(storage, [planKey]);
  assert.equal(metaOf(storage, 'local', planKey)?.rev, 1);
  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 4);
});

test('AS-05: a versioned tier beats a legacy one regardless of which side it is', async () => {
  const storage = setup();

  // Legacy local, versioned durable → durable wins (it has a revision; legacy is revision 0).
  storage.local.set(settingsKey, JSON.stringify({ apiKey: 'old' }));
  storage.durable.set(settingsKey, JSON.stringify({ apiKey: 'new' }));
  storage.durable.set(getKvMetaKey(settingsKey), serializeKvMeta({ rev: 4 }));

  await restart(storage, [settingsKey]);

  assert.deepEqual(JSON.parse(storage.local.get(settingsKey)!), { apiKey: 'new' });
  assert.equal(metaOf(storage, 'local', settingsKey)?.rev, 4);
});

test('AS-05: malformed revision metadata degrades the key to legacy, it does not lose the payload', async () => {
  const storage = setup();

  storage.local.set(planKey, JSON.stringify(plan(6)));
  storage.local.set(getKvMetaKey(planKey), '{"rev": "not-a-number"}');
  storage.durable.set(planKey, JSON.stringify(plan(2)));
  storage.durable.set(getKvMetaKey(planKey), 'totally not json');

  await restart(storage, [planKey]);

  // Both revisions are unreadable → both read as legacy → local wins, and both are re-stamped.
  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 6, 'the payload is intact');
  assert.equal(metaOf(storage, 'local', planKey)?.rev, 1, 'and the broken metadata is replaced');
  assert.equal(metaOf(storage, 'durable', planKey)?.rev, 1);
});

test('AS-05: a newer deletion is not undone by an older surviving copy', async () => {
  const storage = setup();

  // The value was removed locally (rev 5 tombstone), but the durable remove never landed, so
  // Preferences still holds the old payload at rev 4.
  storage.local.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 5, deleted: true }));
  storage.durable.set(planKey, JSON.stringify(plan(1)));
  storage.durable.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 4 }));

  await restart(storage, [planKey]);

  assert.equal(storage.local.has(planKey), false, 'the deleted value did not come back');
  assert.equal(storage.durable.has(planKey), false, 'and the durable copy was cleaned up');
  assert.equal(metaOf(storage, 'durable', planKey)?.deleted, true);
});

test('AS-05: an older deletion does NOT erase a newer value', async () => {
  const storage = setup();

  storage.local.set(planKey, JSON.stringify(plan(3)));
  storage.local.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 7 }));
  storage.durable.set(getKvMetaKey(planKey), serializeKvMeta({ rev: 2, deleted: true }));

  await restart(storage, [planKey]);

  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 3, 'the newer write wins');
  assert.ok(storage.durable.has(planKey), 'and is pushed back to the durable tier');
});

test('AS-05: a key that exists in only one tier is copied to the other', async () => {
  const storage = setup();

  storage.local.set(reviewKey, JSON.stringify({ queueOrder: ['g1'] }));
  storage.durable.set(tasteKey, JSON.stringify({ genres: ['rpg'] }));

  await restart(storage, [reviewKey, tasteKey]);

  assert.deepEqual(JSON.parse(storage.durable.get(reviewKey)!), { queueOrder: ['g1'] }, 'local-only → durable');
  assert.deepEqual(JSON.parse(storage.local.get(tasteKey)!), { genres: ['rpg'] }, 'durable-only → local');
});

// ── Failure behavior ────────────────────────────────────────────────────────────────

test('AS-05: a rejected Preferences write is non-fatal and lands in diagnostics with safe metadata', async () => {
  const storage = setup();
  storage.failDurableKeys.add(settingsKey);

  savePersistedJson(settingsKey, { apiKey: 'super-secret-value' });
  await whenDurableKvSettled();

  // The UI keeps working: the value IS readable, from the local tier.
  assert.deepEqual(JSON.parse(storage.local.get(settingsKey)!), { apiKey: 'super-secret-value' });

  const issue = getLocalStorageIssues().find((entry) => entry.key === settingsKey);
  assert.ok(issue, 'the failure is observable');
  assert.equal(issue?.operation, 'write');
  assert.equal(issue?.tier, 'durable');
  assert.equal(issue?.category, 'write-rejected');
  assert.equal(issue?.localValuePresent, true, 'and it says the value is not lost');

  // Diagnostics are metadata only — never the payload, which here is an API key.
  assert.equal(JSON.stringify(getLocalStorageIssues()).includes('super-secret-value'), false);
});

test('AS-05: a rejected Preferences remove is reported as a remove failure', async () => {
  const storage = setup();
  savePersistedJson(planKey, plan(1));
  await whenDurableKvSettled();

  storage.failDurableKeys.add(planKey);
  await removePersistedKeys([planKey]);
  await whenDurableKvSettled();

  const issue = getLocalStorageIssues().find((entry) => entry.key === planKey);
  assert.equal(issue?.operation, 'remove');
  assert.equal(issue?.category, 'remove-rejected');
  assert.equal(issue?.localValuePresent, false, 'the local tier no longer holds it');

  // The local tombstone still outranks the surviving durable payload, so the next launch removes it
  // rather than resurrecting it.
  storage.failDurableKeys.delete(planKey);
  await restart(storage, [planKey]);
  assert.equal(storage.durable.has(planKey), false);
});

test('AS-05: an awaited write reports the durable failure to its caller', async () => {
  const storage = setup();
  storage.failDurableKeys.add(planKey);

  const result = await savePersistedJsonDurable(planKey, plan(1));

  assert.equal(result.ok, false);
  assert.equal(result.localOnly, true);
  assert.ok(result.error);
});

// ── Browser (no Capacitor plugin) ───────────────────────────────────────────────────

test('AS-05: with no durable backend, localStorage keeps working and nothing is reported', async () => {
  const storage = setup({ hasDurableBackend: false });

  savePersistedJson(planKey, plan(1));
  await whenDurableKvSettled();

  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 1);
  assert.deepEqual(getLocalStorageIssues(), [], 'a browser is not a broken device');

  // Hydration is a no-op: no durable reads, no startup delay, no errors.
  const before = storage.operations.length;
  await hydrateLocalStorageFromPreferences([planKey]);
  assert.equal(storage.operations.length, before, 'reconciliation did not touch the durable tier');
  assert.equal(JSON.parse(storage.local.get(planKey)!).entries[0].queuePosition, 1);
});

// ── Compatibility ───────────────────────────────────────────────────────────────────

test('AS-05: payloads are stored exactly as before — the revision lives in a companion key', async () => {
  const storage = setup();

  const planValue = plan(1);
  const reviewValue = { queueOrder: ['g1'], reviewedGames: {}, stats: {}, ignoredGameIds: [] };
  const tasteValue = { genres: [{ name: 'rpg', weight: 1 }] };

  savePersistedJson(planKey, planValue);
  savePersistedJson(reviewKey, reviewValue);
  savePersistedJson(tasteKey, tasteValue);
  await whenDurableKvSettled();

  // Byte-for-byte the same payload a pre-AS-05 build wrote and reads. No schema was versioned,
  // wrapped or migrated — which is what makes this safe to roll back.
  assert.equal(storage.local.get(planKey), JSON.stringify(planValue));
  assert.equal(storage.durable.get(planKey), JSON.stringify(planValue));
  assert.equal(storage.local.get(reviewKey), JSON.stringify(reviewValue));
  assert.equal(storage.local.get(tasteKey), JSON.stringify(tasteValue));

  assert.deepEqual(metaOf(storage, 'local', planKey), { rev: 1 });
});

test('AS-05: a browser-only installation (no metadata anywhere) still reads its data', async () => {
  const storage = setup({ hasDurableBackend: false });

  storage.local.set(planKey, JSON.stringify(plan(5)));

  const loaded = loadLocalJson(planKey, null, (value) => value as ReturnType<typeof plan>);
  assert.equal(loaded!.entries[0].queuePosition, 5);
});
