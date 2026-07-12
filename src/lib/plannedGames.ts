import type { PlatformQueueState } from './platformQueueStorage';
import type { Game } from '../types/game';

/**
 * AS-15: what "the user planned this" actually means.
 *
 * Questory has two different ideas that were being treated as one. A game's STATUS can be
 * `Want to play` — which an import sets on an entire backlog by default, and which means little more
 * than "owned, not started yet". Explicit intent is a Platform Plan ENTRY: the user chose this game,
 * for this platform, in this order. The recommendation and profile code read the status, so a user
 * who imported 800 Steam games was telling the engine they had planned 800 games.
 *
 * This selector is the canonical answer, derived from the Plan state itself.
 */
export type PlannedGameIds = ReadonlySet<string>;

/** No Platform Plans. Cold start, and the only honest default when Plan state is not available. */
export const noPlannedGameIds: PlannedGameIds = new Set<string>();

/**
 * The games the user has explicitly planned.
 *
 * `PlatformQueueState.entries` IS the plan: an entry exists because the user put it there. Entries
 * for a game that is currently being played are stripped by the Plan owner (a game being played is
 * no longer planned work), so playing is not counted here — it already carries its own, stronger
 * signal.
 *
 * Orphans — entries whose game no longer resolves — are dropped rather than counted: an id that
 * matches nothing cannot be evidence of intent.
 */
export function getPlannedGameIds(platformQueueState: PlatformQueueState, games: Game[]): PlannedGameIds {
  const knownGameIds = new Set(games.map((game) => game.id));
  const planned = new Set<string>();

  for (const entry of platformQueueState.entries) {
    if (knownGameIds.has(entry.gameId)) planned.add(entry.gameId);
  }

  return planned;
}

/**
 * The part of the Plan that can change a recommendation: WHICH games are planned. The platform, the
 * order, the per-platform limit and any Plan note do not affect scoring, so moving an entry between
 * platforms or reordering it must not invalidate a cached recommendation run.
 */
export function plannedGameFingerprint(plannedGameIds: PlannedGameIds): string {
  return [...plannedGameIds].sort().join(',');
}
