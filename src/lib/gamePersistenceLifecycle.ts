export type PersistencePhase = 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';

export type PersistenceState = {
  error: string | null;
  lastSavedAt: string | null;
  pendingWrites: number;
  phase: PersistencePhase;
};

export type PersistenceWriteResult = {
  error?: string;
  ok: boolean;
};

type CoordinatorOptions<T> = {
  initialValue: T;
  retryDelaysMs?: readonly number[];
  serialize: (value: T) => string;
  write: (value: T) => Promise<PersistenceWriteResult>;
};

type ScheduledWrite = {
  promise: Promise<PersistenceWriteResult>;
  sequence: number;
};

/**
 * Serializes optimistic persistence intents without owning application state.
 *
 * React remains the immediate source for rendering. This coordinator only guarantees that
 * durable write N settles before N+1 starts, so a delayed older transaction cannot land last.
 */
export class SerializedPersistenceCoordinator<T> {
  private readonly listeners = new Set<() => void>();
  private readonly retryDelaysMs: readonly number[];
  private chain: Promise<unknown> = Promise.resolve();
  private desiredSignature: string;
  private desiredValue: T;
  private desiredSequence = 0;
  private lastFailedSequence = 0;
  private lastSuccessfulSequence = 0;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private state: PersistenceState = { error: null, lastSavedAt: null, pendingWrites: 0, phase: 'idle' };

  constructor(private readonly options: CoordinatorOptions<T>) {
    this.desiredValue = options.initialValue;
    this.desiredSignature = options.serialize(options.initialValue);
    this.retryDelaysMs = options.retryDelaysMs ?? [250, 1_000, 2_500];
  }

  getState = (): PersistenceState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Queue a distinct latest intent. Returns false when nothing changed. */
  save(value: T): boolean {
    const signature = this.options.serialize(value);
    if (signature === this.desiredSignature) return false;

    this.cancelRetry();
    this.retryAttempt = 0;
    this.desiredValue = value;
    this.desiredSignature = signature;
    this.schedule(value, false);
    return true;
  }

  /**
   * Await durability for the supplied canonical value (or the latest queued value).
   * The failure of the write this flush waited for is observable even when a background retry
   * has already been scheduled; exporters must not download and call that attempt successful.
   */
  async flush(value?: T): Promise<void> {
    let scheduled: ScheduledWrite | null = null;
    if (typeof value !== 'undefined') {
      const signature = this.options.serialize(value);
      if (signature !== this.desiredSignature) {
        this.cancelRetry();
        this.retryAttempt = 0;
        this.desiredValue = value;
        this.desiredSignature = signature;
        scheduled = this.schedule(value, false);
      }
    }

    const targetSequence = scheduled?.sequence ?? this.desiredSequence;
    const outcome = scheduled ? await scheduled.promise : await this.waitForSequence(targetSequence);
    if (outcome && !outcome.ok) {
      throw new Error(outcome.error ?? 'Game persistence failed.');
    }
    if (this.lastFailedSequence >= targetSequence && this.lastSuccessfulSequence < targetSequence) {
      throw new Error(this.state.error ?? 'Game persistence failed.');
    }
  }

  /** Test/unmount seam: timers do not own the process or outlive the app owner. */
  dispose() {
    this.cancelRetry();
    this.listeners.clear();
  }

  private schedule(value: T, retrying: boolean): ScheduledWrite {
    const sequence = ++this.desiredSequence;
    this.setState({
      ...this.state,
      error: retrying ? this.state.error : null,
      pendingWrites: this.state.pendingWrites + 1,
      phase: retrying ? 'retrying' : 'saving',
    });

    const promise = this.chain.then(async () => {
      try {
        return await this.options.write(value);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Game persistence failed.' };
      }
    });
    this.chain = promise.then(() => undefined, () => undefined);

    void promise.then((outcome) => this.finish(sequence, outcome));
    return { promise, sequence };
  }

  private finish(sequence: number, outcome: PersistenceWriteResult) {
    const pendingWrites = Math.max(0, this.state.pendingWrites - 1);
    if (outcome.ok) {
      this.lastSuccessfulSequence = Math.max(this.lastSuccessfulSequence, sequence);
      if (sequence === this.desiredSequence) this.retryAttempt = 0;
      this.setState({
        error: sequence === this.desiredSequence ? null : this.state.error,
        lastSavedAt: new Date().toISOString(),
        pendingWrites,
        phase: pendingWrites > 0 ? 'saving' : 'saved',
      });
      return;
    }

    this.lastFailedSequence = Math.max(this.lastFailedSequence, sequence);
    const error = outcome.error ?? 'Game persistence failed.';
    this.setState({ ...this.state, error, pendingWrites, phase: 'failed' });

    if (sequence === this.desiredSequence) this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.retryTimer || this.retryAttempt >= this.retryDelaysMs.length) return;
    const delay = this.retryDelaysMs[this.retryAttempt];
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.schedule(this.desiredValue, true);
    }, delay);
  }

  private async waitForSequence(sequence: number): Promise<PersistenceWriteResult | null> {
    if (sequence === 0 || this.lastSuccessfulSequence >= sequence) return null;
    await this.chain;
    if (this.lastSuccessfulSequence >= sequence) return null;
    return { ok: false, error: this.state.error ?? 'Game persistence failed.' };
  }

  private cancelRetry() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setState(next: PersistenceState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
}
