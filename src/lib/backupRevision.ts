import { storageKeyRegistry } from './storageRegistry';

const excludedDefaultKeys = new Set(['questshelf.rawgMetadataCache.v1']);
const backupRelevantKeys = new Set<string>(
  storageKeyRegistry
    .filter((entry) => entry.backup === 'default' && !excludedDefaultKeys.has(entry.key))
    .map((entry) => entry.key),
);

let revision = 0;
const listeners = new Set<() => void>();

/** Monotonic process-local revision for canonical data included in a normal backup. */
export function getBackupRevision(): number {
  return revision;
}

export function subscribeBackupRevision(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called only after an owner successfully changes its canonical local snapshot. */
export function markBackupRelevantChange(key: string): void {
  if (!backupRelevantKeys.has(key)) return;
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function isBackupRelevantStorageKey(key: string): boolean {
  return backupRelevantKeys.has(key);
}

/** Test seam. */
export function resetBackupRevision(): void {
  revision = 0;
}

export class AutoBackupScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private latestRevision = 0;
  private completedRevision = 0;

  constructor(
    private readonly run: () => Promise<boolean>,
    private readonly delayMs = 1200,
  ) {}

  schedule(nextRevision: number): void {
    if (nextRevision <= this.latestRevision) return;
    this.latestRevision = nextRevision;
    if (this.inFlight) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    if (this.inFlight || this.completedRevision >= this.latestRevision) return;
    this.inFlight = true;
    const runningRevision = this.latestRevision;
    const succeeded = await this.run();
    this.inFlight = false;
    if (succeeded) this.completedRevision = runningRevision;
    if (this.latestRevision > runningRevision) {
      await this.drain();
    }
  }
}
