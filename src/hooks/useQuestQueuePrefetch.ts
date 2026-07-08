import { useEffect, useMemo, useRef } from 'react';
import type { Game } from '../types/game';
import { getCachedScreenshots, setCachedScreenshots } from '../lib/screenshotCache';
import { fetchScreenshotsForGame } from '../lib/screenshotProviders';
import { RawgApiError } from '../services/rawgApi';
import {
  QuestQueuePrefetchQueue,
  questQueueJobKey,
  type QuestQueuePrefetchJob,
} from '../lib/questQueuePrefetchQueue';

// Keep concurrency low so background prefetch never competes with drag/swipe work
// or floods the RAWG API. Two jobs at a time is enough to stay ahead of the user.
const PREFETCH_CONCURRENCY = 2;
// Within a single Quest Queue session this effectively means "don't retry a failed
// lookup again", while still allowing a fresh attempt on a later visit.
const PREFETCH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
// Cards after the current one that get priority 2 (the "next few" the user is about to see).
const NEAR_WINDOW = 5;
// Hard cap on how many jobs we describe at once so very large batches stay cheap.
const MAX_JOBS = 60;

type UseQuestQueuePrefetchOptions = {
  enabled: boolean;
  /** Ordered upcoming cards, index 0 = the currently visible game. */
  upcomingGames: Game[];
  /** Candidates for the next batch, used only when the current batch is nearly done. */
  lookaheadGames: Game[];
  /** Silent metadata refresh (reuses the existing Quest Queue enrichment path). */
  ensureMetadata: (game: Game) => void | Promise<void>;
};

function hasPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function needsMetadata(game: Game): boolean {
  return !hasPositiveNumber(game.metacriticScore);
}

function needsScreenshots(game: Game): boolean {
  return getCachedScreenshots(game) === null;
}

function priorityForIndex(index: number): number {
  if (index === 0) return 1;
  if (index <= NEAR_WINDOW) return 2;
  return 3;
}

/**
 * Background prefetch pipeline for Quest Queue. Given the ordered batch, it prepares
 * metadata and screenshots for the current card first, then the next few, then the
 * rest — and optionally the next batch once the current one is nearly exhausted.
 * The queue lives in a ref (outside render); effects only push a fresh desired set
 * when the batch, ordering or per-game needs actually change.
 */
export function useQuestQueuePrefetch({
  enabled,
  upcomingGames,
  lookaheadGames,
  ensureMetadata,
}: UseQuestQueuePrefetchOptions): void {
  const ensureMetadataRef = useRef(ensureMetadata);
  ensureMetadataRef.current = ensureMetadata;

  // Once the RAWG key is missing/invalid, stop attempting screenshot lookups for
  // the rest of the session rather than failing 20 times in a row.
  const screenshotsUnavailableRef = useRef(false);

  const queueRef = useRef<QuestQueuePrefetchQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new QuestQueuePrefetchQueue({
      concurrency: PREFETCH_CONCURRENCY,
      cooldownMs: PREFETCH_FAILURE_COOLDOWN_MS,
      runners: {
        metadata: (game) => Promise.resolve(ensureMetadataRef.current(game)),
        screenshots: async (game) => {
          if (screenshotsUnavailableRef.current) return;
          try {
            const { urls, provider } = await fetchScreenshotsForGame(game);
            // Warms the shared localStorage cache; the card then mounts without a loading state.
            setCachedScreenshots(game, urls, provider);
          } catch (error) {
            if (
              error instanceof RawgApiError &&
              (error.code === 'missing-api-key' || error.code === 'invalid-api-key')
            ) {
              screenshotsUnavailableRef.current = true;
              return;
            }
            throw error;
          }
        },
      },
      onEvent: import.meta.env.DEV
        ? (event) => console.debug('[Quest Queue prefetch]', event.kind, event.key, event)
        : undefined,
    });
  }

  // Derive the desired jobs + a stable signature. The signature only changes when
  // the ordering, membership or per-game needs change — not on every render — so
  // the sync effect below does not re-fire from unrelated re-renders.
  const { desired, signature } = useMemo(() => {
    if (!enabled) {
      return { desired: [] as QuestQueuePrefetchJob[], signature: 'disabled' };
    }

    const jobs: QuestQueuePrefetchJob[] = [];
    const seen = new Set<string>();
    const screenshotsAvailable = !screenshotsUnavailableRef.current;

    const addJobsForGame = (game: Game, priority: number) => {
      if (jobs.length >= MAX_JOBS) return;
      if (needsMetadata(game)) {
        const key = questQueueJobKey(game.id, 'metadata');
        if (!seen.has(key)) {
          seen.add(key);
          jobs.push({ game, gameId: game.id, type: 'metadata', priority });
        }
      }
      if (screenshotsAvailable && needsScreenshots(game)) {
        const key = questQueueJobKey(game.id, 'screenshots');
        if (!seen.has(key)) {
          seen.add(key);
          jobs.push({ game, gameId: game.id, type: 'screenshots', priority });
        }
      }
    };

    upcomingGames.forEach((game, index) => addJobsForGame(game, priorityForIndex(index)));

    // Lookahead: only begin preparing the next batch once the current one is nearly done.
    if (upcomingGames.length < NEAR_WINDOW) {
      const upcomingIds = new Set(upcomingGames.map((game) => game.id));
      for (const game of lookaheadGames) {
        if (jobs.length >= MAX_JOBS) break;
        if (upcomingIds.has(game.id)) continue;
        addJobsForGame(game, 4);
      }
    }

    const signatureString = jobs
      .map((job) => `${questQueueJobKey(job.gameId, job.type)}@${job.priority}`)
      .join('|');

    return { desired: jobs, signature: signatureString };
  }, [enabled, upcomingGames, lookaheadGames]);

  const desiredRef = useRef(desired);
  desiredRef.current = desired;

  useEffect(() => {
    const queue = queueRef.current;
    if (!queue) return;
    if (!enabled) {
      queue.reset();
      return;
    }
    queue.sync(desiredRef.current);
  }, [enabled, signature]);

  // Stop all background work when Quest Queue unmounts (user navigates away).
  useEffect(() => {
    return () => {
      queueRef.current?.reset();
    };
  }, []);
}
