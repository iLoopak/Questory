import type { Game } from '../types/game';

// A tiny, framework-agnostic priority job queue used by Quest Queue to prepare
// metadata / screenshots for upcoming cards ahead of time. It lives outside the
// React render loop: the hook feeds it a desired set of jobs and it decides what
// to run, respecting a concurrency cap, per-job deduplication and a failure
// cooldown so a bad lookup does not retry endlessly within a session.

export type QuestQueuePrefetchJobType = 'metadata' | 'screenshots';

export type QuestQueuePrefetchJob = {
  game: Game;
  gameId: string;
  type: QuestQueuePrefetchJobType;
  /** Lower number = more urgent. 1 = current card, 2 = near, 3 = rest of batch, 4 = next-batch lookahead. */
  priority: number;
};

export type QuestQueuePrefetchEvent =
  | { kind: 'queued'; key: string; type: QuestQueuePrefetchJobType; priority: number }
  | { kind: 'skipped'; key: string; type: QuestQueuePrefetchJobType; reason: 'cooldown' | 'completed' }
  | { kind: 'started'; key: string; type: QuestQueuePrefetchJobType }
  | { kind: 'completed'; key: string; type: QuestQueuePrefetchJobType }
  | { kind: 'failed'; key: string; type: QuestQueuePrefetchJobType; reason: string };

type Runner = (game: Game) => Promise<void>;

export type QuestQueuePrefetchOptions = {
  concurrency: number;
  cooldownMs: number;
  runners: Record<QuestQueuePrefetchJobType, Runner>;
  onEvent?: (event: QuestQueuePrefetchEvent) => void;
};

export function questQueueJobKey(gameId: string, type: QuestQueuePrefetchJobType): string {
  return `${type}:${gameId}`;
}

export class QuestQueuePrefetchQueue {
  private readonly options: QuestQueuePrefetchOptions;
  private readonly pending = new Map<string, QuestQueuePrefetchJob>();
  private readonly running = new Set<string>();
  private readonly completed = new Set<string>();
  private readonly failedAt = new Map<string, number>();
  /** Bumped by reset() so results of in-flight jobs from a previous session are ignored. */
  private generation = 0;

  constructor(options: QuestQueuePrefetchOptions) {
    this.options = options;
  }

  /**
   * Reconciles the queue with the currently desired jobs: drops pending jobs that
   * are no longer wanted, (re)prioritises or adds the rest, then pumps. Running,
   * completed and cooled-down jobs are preserved so nothing is fetched twice.
   */
  sync(desired: QuestQueuePrefetchJob[]): void {
    const desiredKeys = new Set(desired.map((job) => questQueueJobKey(job.gameId, job.type)));

    for (const key of [...this.pending.keys()]) {
      if (!desiredKeys.has(key)) {
        this.pending.delete(key);
      }
    }

    const now = Date.now();
    for (const job of desired) {
      const key = questQueueJobKey(job.gameId, job.type);

      if (this.running.has(key)) continue;

      if (this.completed.has(key)) {
        this.emit({ kind: 'skipped', key, type: job.type, reason: 'completed' });
        continue;
      }

      const failedTs = this.failedAt.get(key);
      if (failedTs !== undefined && now - failedTs < this.options.cooldownMs) {
        this.emit({ kind: 'skipped', key, type: job.type, reason: 'cooldown' });
        continue;
      }

      const existing = this.pending.get(key);
      if (existing) {
        // Re-prioritise in place as the user advances through the batch.
        if (job.priority < existing.priority) {
          existing.priority = job.priority;
          existing.game = job.game;
        }
        continue;
      }

      this.pending.set(key, { ...job });
      this.emit({ kind: 'queued', key, type: job.type, priority: job.priority });
    }

    this.pump();
  }

  /** Clears everything and abandons in-flight results. Call when leaving Quest Queue. */
  reset(): void {
    this.generation += 1;
    this.pending.clear();
    this.running.clear();
    this.completed.clear();
    this.failedAt.clear();
  }

  private pump(): void {
    while (this.running.size < this.options.concurrency && this.pending.size > 0) {
      const next = this.takeHighestPriority();
      if (!next) break;
      this.startJob(next);
    }
  }

  private takeHighestPriority(): QuestQueuePrefetchJob | null {
    let bestKey: string | null = null;
    let bestJob: QuestQueuePrefetchJob | null = null;

    for (const [key, job] of this.pending) {
      if (!bestJob || job.priority < bestJob.priority) {
        bestKey = key;
        bestJob = job;
      }
    }

    if (bestKey !== null) {
      this.pending.delete(bestKey);
    }
    return bestJob;
  }

  private startJob(job: QuestQueuePrefetchJob): void {
    const key = questQueueJobKey(job.gameId, job.type);
    const generation = this.generation;
    const runner = this.options.runners[job.type];

    this.running.add(key);
    this.emit({ kind: 'started', key, type: job.type });

    Promise.resolve()
      .then(() => runner(job.game))
      .then(() => {
        if (generation !== this.generation) return;
        this.running.delete(key);
        this.completed.add(key);
        this.emit({ kind: 'completed', key, type: job.type });
        this.pump();
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.running.delete(key);
        this.failedAt.set(key, Date.now());
        this.emit({
          kind: 'failed',
          key,
          type: job.type,
          reason: error instanceof Error ? error.message : String(error),
        });
        this.pump();
      });
  }

  private emit(event: QuestQueuePrefetchEvent): void {
    this.options.onEvent?.(event);
  }
}
