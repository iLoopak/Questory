// AS-09: the one command that promotes a Discovery candidate into a real record.
//
// Preview promotion, Inbox promotion and the Plans path all call this. None of them decides identity
// or mapping for itself any more — `planDiscoveryPromotion` does, against the LATEST canonical games
// — and none of them ever sees a synthetic candidate id. The command reports what actually happened
// (`created` / `reused` / `already-present` / `failed`) so the caller can tell the truth in a toast
// and, for Plans, so it can pass a real persisted id to the Platform Plans command.

import { useCallback, useRef } from 'react';
import {
  planDiscoveryPromotion,
  type DiscoveryPromotionDestination,
  type DiscoveryPromotionOutcome,
} from '../../lib/discoveryPromotion';
import { getSharedGameIdentitySignal } from '../../lib/gameIdentity';
import type { DiscoveryGame } from '../../lib/discovery';
import type { Game } from '../../types/game';

export type DiscoveryPromotionResult = {
  outcome: DiscoveryPromotionOutcome;
  /** The canonical persisted id. Absent only when the promotion failed. */
  gameId?: string;
  game?: Game;
  /** Why the command resolved the way it did — diagnostics, not user copy. */
  reason?: string;
};

type UseDiscoveryPromotionOptions = {
  games: Game[];
  /** Returns the records that were actually created (a rejected duplicate returns none). */
  importGames: (games: Game[]) => Game[];
  /** Creates the Wishlist copy of a game and returns its id. */
  addToWishlist: (game: Game) => string;
  moveWishlistToLibrary: (game: Game) => void;
  /** Injectable clock, so a promotion's timestamps are testable. */
  now?: () => Date;
};

export function useDiscoveryPromotion({
  games,
  importGames,
  addToWishlist,
  moveWishlistToLibrary,
  now = () => new Date(),
}: UseDiscoveryPromotionOptions) {
  // The candidate may have been previewed minutes ago, and `games` may have changed several times
  // since — an import, a metadata refresh that added a RAWG id, another promotion. The ref is
  // written during render, so the command always reads the newest committed state rather than the
  // snapshot the preview closed over.
  const gamesRef = useRef(games);
  gamesRef.current = games;

  // Records this command created that React has not re-rendered us with yet. Two promotions in the
  // same tick would otherwise both see "no such game" and both create one.
  const pendingRef = useRef<Game[]>([]);
  pendingRef.current = pendingRef.current.filter(
    (pending) =>
      !games.some((game) => game.collectionType === pending.collectionType && getSharedGameIdentitySignal(game, pending) !== null),
  );

  const getLatestGames = useCallback(
    () => (pendingRef.current.length > 0 ? [...gamesRef.current, ...pendingRef.current] : gamesRef.current),
    [],
  );

  const promoteDiscoveryCandidate = useCallback(
    ({
      candidate,
      destination,
    }: {
      candidate: DiscoveryGame;
      destination: DiscoveryPromotionDestination;
    }): DiscoveryPromotionResult => {
      const latestGames = getLatestGames();
      const plan = planDiscoveryPromotion({ candidate, destination, games: latestGames, now: now() });

      switch (plan.action.kind) {
        case 'none':
          return {
            outcome: plan.outcome,
            gameId: plan.gameId,
            game: latestGames.find((game) => game.id === plan.gameId),
            reason: plan.reason,
          };

        case 'move-to-library': {
          const moved = { ...plan.action.game, collectionType: 'library' as const, status: 'Want to play' as const };
          moveWishlistToLibrary(plan.action.game);
          pendingRef.current = [...pendingRef.current, moved];
          return { outcome: plan.outcome, gameId: moved.id, game: moved, reason: plan.reason };
        }

        case 'create-wishlist':
        case 'wishlist-existing': {
          const wishlistId = addToWishlist(plan.action.game);
          const created: Game = { ...plan.action.game, id: wishlistId, collectionType: 'wishlist' };
          pendingRef.current = [...pendingRef.current, created];
          return { outcome: plan.outcome, gameId: wishlistId, game: created, reason: plan.reason };
        }

        case 'create-library': {
          const [created] = importGames([plan.action.game]);
          if (created) {
            pendingRef.current = [...pendingRef.current, created];
            return { outcome: plan.outcome, gameId: created.id, game: created, reason: plan.reason };
          }

          // The import layer rejected the record as a duplicate of something the plan did not see.
          // Adopt whatever it collided with rather than reporting a creation that did not happen —
          // and if nothing can be resolved, fail loudly so no Plan entry is written against a game
          // that does not exist.
          const fallback = planDiscoveryPromotion({
            candidate,
            destination,
            games: gamesRef.current,
            now: now(),
          });
          const existing =
            fallback.action.kind === 'none'
              ? gamesRef.current.find((game) => game.id === fallback.gameId)
              : undefined;

          return existing
            ? { outcome: 'reused', gameId: existing.id, game: existing, reason: 'import-rejected-duplicate' }
            : { outcome: 'failed', reason: 'import-rejected' };
        }
      }
    },
    [addToWishlist, getLatestGames, importGames, moveWishlistToLibrary, now],
  );

  return { promoteDiscoveryCandidate };
}
