// AS-12 / AS-13: an older request must never overwrite newer inputs.
//
// Both defects are the same shape. The recommendation hook SKIPPED a run while another was in
// flight, so a library change during generation never got its own run — and the old run, computed
// against the pre-import library, still committed (recommending a game the user had just bought).
// The screenshot hook had the mirror problem: it started a run per selected game with no generation
// check, so game A resolving after the user navigated to game B wrote A's screenshots onto B.
//
// This is the one primitive both now use. It is deliberately small: a generation counter, an input
// key, and a queued-latest loop. It is not a request framework — it owns no state, no cache, no
// transport, and it knows nothing about what it is running.
//
// Queued-latest, precisely:
//
//   run A starts → inputs change to B → inputs change to C → A finishes but cannot commit →
//   exactly ONE more run happens, for C (never B), and only C commits.
//
// So there is never more than one request in flight, and the newest input always gets a run.

export type LatestRequestTaskContext<TKey> = {
  key: TKey;
  generation: number;
  /** True only if this run was explicitly forced (a Retry / refresh), not just scheduled. */
  force: boolean;
  /**
   * The commit guard. False as soon as a newer generation starts, the desired key moves on, or the
   * owner is disposed (unmounted) — so a late result cannot write candidates, diagnostics, errors OR
   * loading state that belongs to somebody else.
   */
  isCurrent: () => boolean;
};

export type LatestRequestTask<TKey> = (context: LatestRequestTaskContext<TKey>) => Promise<void>;

export class LatestRequestScheduler<TKey> {
  private generation = 0;
  private running = false;
  /** `null` = nothing queued. `true`/`false` = a run is queued, forced or not. */
  private queuedForce: boolean | null = null;
  private disposed = false;

  constructor(
    /** Reads the LATEST desired input key. Called at run start and at every guard check. */
    private readonly getDesiredKey: () => TKey,
    private readonly isSameKey: (a: TKey, b: TKey) => boolean = Object.is,
  ) {}

  get currentGeneration(): number {
    return this.generation;
  }

  isCurrent(generation: number, key: TKey): boolean {
    return !this.disposed && this.generation === generation && this.isSameKey(this.getDesiredKey(), key);
  }

  /** Retire whatever is running without starting anything (a Retry that supersedes an in-flight run). */
  invalidate(): void {
    this.generation += 1;
  }

  /** Unmount. Nothing that is still in flight may commit afterwards. */
  dispose(): void {
    this.disposed = true;
    this.generation += 1;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Start a run NOW, retiring whatever was running.
   *
   * For requests that are cheap and that the user is actively waiting on — the screenshots of the
   * game they just opened. Queueing there would make navigation wait on the previous game's network
   * request for no benefit. The retired run may still finish; its `isCurrent()` guard is false, so
   * it can write neither state nor cache.
   */
  async runLatest(force: boolean, task: LatestRequestTask<TKey>): Promise<void> {
    if (this.disposed) return;

    const key = this.getDesiredKey();
    const generation = ++this.generation;
    await task({ key, generation, force, isCurrent: () => this.isCurrent(generation, key) });
  }

  /**
   * Run `task` for the latest key, or queue exactly one rerun if a run is already in flight.
   *
   * For expensive work that must not fan out — the recommendation waterfall, which is dozens of
   * provider calls. Never more than one in flight, and the newest input always gets a run.
   *
   * `task` must not throw: it owns its own error handling, because whether an error may be COMMITTED
   * is a question only its `isCurrent()` guard can answer.
   */
  async schedule(force: boolean, task: LatestRequestTask<TKey>): Promise<void> {
    if (this.disposed) return;

    if (this.running) {
      // Do not start a second provider request. The loop below will pick up whatever the newest key
      // is by the time the current run finishes — that is what makes this queued-LATEST and not a
      // queue: B is simply skipped when C arrives first.
      this.queuedForce = (this.queuedForce ?? false) || force;
      return;
    }

    this.running = true;
    try {
      let nextForce = force;

      while (!this.disposed) {
        const key = this.getDesiredKey();
        const generation = ++this.generation;

        await task({ key, generation, force: nextForce, isCurrent: () => this.isCurrent(generation, key) });

        const queued = this.queuedForce;
        this.queuedForce = null;
        const keyMovedOn = !this.isSameKey(this.getDesiredKey(), key);

        // The run we just finished is the newest desired input and nobody asked for another: done.
        if (!keyMovedOn && queued === null) break;

        nextForce = queued ?? false;
      }
    } finally {
      this.running = false;
    }
  }
}
