/**
 * AS-12 / AS-13 — the queued-latest scheduler, without React.
 *
 * Both hooks used to let an old request win. The recommendation hook SKIPPED a run while one was in
 * flight, so a library change during generation never got its own run and the pre-change result
 * committed anyway; the screenshot hook committed every result unconditionally, so game A resolving
 * after the user opened game B wrote A's screenshots onto B.
 *
 * This scheduler is the shared answer, and it is small enough to pin exactly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment } from './testUtils/testEnvironment';
import { LatestRequestScheduler } from '../src/lib/latestRequest';

assertTestEnvironment();

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

test('AS-12: a run for stale inputs cannot commit, and the latest inputs get their own run', async () => {
  let desired = 'A';
  const scheduler = new LatestRequestScheduler(() => desired);
  const gate = deferred();
  const started: string[] = [];
  const committed: string[] = [];

  const task = async ({ key, isCurrent }: { key: string; isCurrent: () => boolean }) => {
    started.push(key);
    if (key === 'A') await gate.promise;
    if (isCurrent()) committed.push(key);
  };

  const running = scheduler.schedule(false, task);

  // The inputs move on while A is in flight — an import, a status change, an Inbox update.
  desired = 'B';
  await scheduler.schedule(false, task);

  gate.resolve();
  await running;

  assert.deepEqual(started, ['A', 'B'], 'B got its own run rather than being skipped');
  assert.deepEqual(committed, ['B'], 'A finished, but its result belonged to inputs nobody is looking at');
});

test('AS-12: A → B → C during one run reruns only C, never B', async () => {
  let desired = 'A';
  const scheduler = new LatestRequestScheduler(() => desired);
  const gate = deferred();
  const started: string[] = [];
  const committed: string[] = [];

  const task = async ({ key, isCurrent }: { key: string; isCurrent: () => boolean }) => {
    started.push(key);
    if (key === 'A') await gate.promise;
    if (isCurrent()) committed.push(key);
  };

  const running = scheduler.schedule(false, task);

  desired = 'B';
  void scheduler.schedule(false, task);
  desired = 'C';
  void scheduler.schedule(false, task);

  gate.resolve();
  await running;

  assert.deepEqual(started, ['A', 'C'], 'exactly one rerun, for the newest input — B is obsolete before it starts');
  assert.deepEqual(committed, ['C']);
});

test('AS-12: only one request is ever in flight', async () => {
  let desired = 0;
  const scheduler = new LatestRequestScheduler(() => desired);
  let concurrent = 0;
  let peak = 0;
  const gates = [deferred(), deferred(), deferred()];

  const task = async ({ key }: { key: number }) => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await gates[Math.min(key, gates.length - 1)].promise;
    concurrent -= 1;
  };

  const running = scheduler.schedule(false, task);
  desired = 1;
  void scheduler.schedule(false, task);
  desired = 2;
  void scheduler.schedule(false, task);

  gates.forEach((gate) => gate.resolve());
  await running;

  assert.equal(peak, 1, 'a burst of input changes must not fan out into parallel provider requests');
});

test('AS-12: a forced rerun requested during a run happens exactly once, and is marked forced', async () => {
  const scheduler = new LatestRequestScheduler(() => 'A');
  const gate = deferred();
  const forcedFlags: boolean[] = [];

  const task = async ({ force }: { force: boolean }) => {
    forcedFlags.push(force);
    if (forcedFlags.length === 1) await gate.promise;
  };

  const running = scheduler.schedule(false, task);
  void scheduler.schedule(true, task);
  void scheduler.schedule(true, task);

  gate.resolve();
  await running;

  assert.deepEqual(forcedFlags, [false, true], 'two rapid Retries collapse into one rerun, and it is forced');
});

test('AS-13: runLatest starts immediately and retires the run it supersedes', async () => {
  let desired = 'A';
  const scheduler = new LatestRequestScheduler(() => desired);
  const gateA = deferred();
  const gateB = deferred();
  const started: string[] = [];
  const committed: string[] = [];

  const task = async ({ key, isCurrent }: { key: string; isCurrent: () => boolean }) => {
    started.push(key);
    await (key === 'A' ? gateA.promise : gateB.promise);
    if (isCurrent()) committed.push(key);
  };

  const runningA = scheduler.runLatest(false, task);
  // The user opened another game: B must not wait for A's network request to come back.
  desired = 'B';
  const runningB = scheduler.runLatest(false, task);

  assert.deepEqual(started, ['A', 'B'], 'B starts at once');

  gateB.resolve();
  gateA.resolve();
  await Promise.all([runningA, runningB]);

  assert.deepEqual(committed, ['B'], 'A resolving late cannot write onto the game the user is looking at');
});

test('AS-13: nothing commits after dispose', async () => {
  const scheduler = new LatestRequestScheduler(() => 'A');
  const gate = deferred();
  let committed = false;

  const running = scheduler.schedule(false, async ({ isCurrent }) => {
    await gate.promise;
    if (isCurrent()) committed = true;
  });

  scheduler.dispose(); // unmount
  gate.resolve();
  await running;

  assert.equal(committed, false, 'an unmounted owner has no state to write to');
});

test('AS-13: an explicit invalidate retires the running generation', async () => {
  const scheduler = new LatestRequestScheduler(() => 'A');
  const gate = deferred();
  let committed = false;

  const running = scheduler.schedule(false, async ({ isCurrent }) => {
    await gate.promise;
    if (isCurrent()) committed = true;
  });

  scheduler.invalidate();
  gate.resolve();
  await running;

  assert.equal(committed, false, 'the superseded run may finish, but it may not speak');
});
