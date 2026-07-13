import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SerializedPersistenceCoordinator, type PersistenceWriteResult } from '../src/lib/gamePersistenceLifecycle';
import { createDeferred } from './testUtils/deferred';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(predicate: () => boolean, timeoutMs = 250) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for persistence state.');
    await wait(1);
  }
}

test('PR-09: rapid edits to one game serialize and persist the newest intent last', async () => {
  const first = createDeferred<PersistenceWriteResult>();
  const writes: string[][] = [];
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: [],
    serialize: JSON.stringify,
    write: async (value) => {
      writes.push(value);
      if (writes.length === 1) return first.promise;
      return { ok: true };
    },
  });

  coordinator.save(['game:title-a']);
  coordinator.save(['game:title-b']);
  await wait();
  assert.deepEqual(writes, [['game:title-a']], 'the newer write cannot start ahead of the delayed older write');

  first.resolve({ ok: true });
  await coordinator.flush();
  assert.deepEqual(writes, [['game:title-a'], ['game:title-b']]);
  assert.equal(coordinator.getState().phase, 'saved');
  coordinator.dispose();
});

test('PR-09: rapid edits to different games retain both changes in the latest snapshot', async () => {
  const writes: Array<Record<string, string>> = [];
  const coordinator = new SerializedPersistenceCoordinator<Record<string, string>>({
    initialValue: {},
    serialize: JSON.stringify,
    write: async (value) => { writes.push({ ...value }); return { ok: true }; },
  });
  coordinator.save({ first: 'edited' });
  coordinator.save({ first: 'edited', second: 'edited' });
  await coordinator.flush();
  assert.deepEqual(writes.at(-1), { first: 'edited', second: 'edited' });
  coordinator.dispose();
});

test('PR-09: export-style flush waits for the pending game save', async () => {
  const gate = createDeferred<PersistenceWriteResult>();
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: [], serialize: JSON.stringify, write: () => gate.promise,
  });
  coordinator.save(['imported-immediately']);
  let settled = false;
  const flush = coordinator.flush().then(() => { settled = true; });
  await wait();
  assert.equal(settled, false);
  assert.equal(coordinator.getState().phase, 'saving');
  gate.resolve({ ok: true });
  await flush;
  assert.equal(settled, true);
  coordinator.dispose();
});

test('PR-09: temporary IndexedDB rejection is observable, then retry preserves the fallback-authority path', async () => {
  let attempts = 0;
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: [],
    retryDelaysMs: [0, 0],
    serialize: JSON.stringify,
    write: async () => (++attempts === 1
      ? { ok: false, error: 'temporary quota rejection', persistedToLegacy: true }
      : { ok: true, persistedToLegacy: true }),
  });
  coordinator.save(['latest']);
  await assert.rejects(coordinator.flush(), /temporary quota rejection/);
  await waitUntil(() => attempts === 2 && coordinator.getState().phase === 'saved');
  assert.equal(attempts, 2);
  assert.equal(coordinator.getState().phase, 'saved');
  coordinator.dispose();
});

test('PR-09: permanent rejection stops after the bounded retry budget and remains failed', async () => {
  let attempts = 0;
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: [], retryDelaysMs: [0, 0], serialize: JSON.stringify,
    write: async () => { attempts += 1; return { ok: false, error: 'storage unavailable' }; },
  });
  coordinator.save(['latest']);
  await assert.rejects(coordinator.flush(), /storage unavailable/);
  await waitUntil(() => attempts === 3 && coordinator.getState().phase === 'failed');
  assert.equal(attempts, 3, 'initial attempt plus two bounded retries');
  assert.equal(coordinator.getState().phase, 'failed');
  assert.equal(coordinator.getState().error, 'storage unavailable');
  coordinator.dispose();
});

test('PR-09: unchanged data produces no unnecessary writes', async () => {
  let writes = 0;
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: ['same'], serialize: JSON.stringify,
    write: async () => { writes += 1; return { ok: true }; },
  });
  assert.equal(coordinator.save(['same']), false);
  await coordinator.flush(['same']);
  assert.equal(writes, 0);
  coordinator.dispose();
});

test('PR-09: dispose cancels background retry on unmount/navigation', async () => {
  let attempts = 0;
  const coordinator = new SerializedPersistenceCoordinator<string[]>({
    initialValue: [], retryDelaysMs: [25], serialize: JSON.stringify,
    write: async () => { attempts += 1; return { ok: false, error: 'offline' }; },
  });
  coordinator.save(['latest']);
  await assert.rejects(coordinator.flush(), /offline/);
  coordinator.dispose();
  await wait(35);
  assert.equal(attempts, 1);
});

test('PR-09: unmount and background handlers start the same serialized save without pretending to await unload', () => {
  const source = readFileSync('src/features/app/useAppPersistence.ts', 'utf8');
  assert.match(source, /return \(\) => \{[\s\S]*saveGamesUnlessSuspended\(\)/);
  assert.match(source, /visibilityState === 'hidden'[\s\S]*flushPendingSave\(\)/);
  assert.match(source, /addEventListener\('beforeunload', flushPendingSave\)/);
  assert.doesNotMatch(source, /async function flushPendingSave|await saveGames/);
});
