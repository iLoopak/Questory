import { useEffect, useRef } from 'react';
import {
  registerCanonicalCollectionOwner,
  suspendCanonicalCollectionWrites,
} from '../../lib/canonicalCollections';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import type { Game } from '../../types/game';

type UseCanonicalCollectionOwnerOptions = {
  games: Game[];
  playActivity: PlayActivityRecord[];
  setGames: (games: Game[]) => void;
  setPlayActivity: (records: PlayActivityRecord[]) => void;
};

/**
 * Registers the mounted owner (AppController) as the target for canonical collection
 * replacement, so storage recovery can hand a recovered snapshot back to React instead of being
 * overwritten by it (AS-03).
 *
 * The suspension is released only once the owner has RE-RENDERED with the replacement. That
 * matters: `useAppPersistence` keeps its save refs in sync during render, so releasing any
 * earlier would leave a window in which a pending debounce or an unmount flush could still write
 * the pre-recovery array.
 */
export function useCanonicalCollectionOwner({
  games,
  playActivity,
  setGames,
  setPlayActivity,
}: UseCanonicalCollectionOwnerOptions) {
  const releaseRef = useRef<(() => void) | null>(null);
  const awaitingRenderRef = useRef(false);

  useEffect(() => {
    function beginReplacement() {
      if (!releaseRef.current) {
        releaseRef.current = suspendCanonicalCollectionWrites();
      }
      awaitingRenderRef.current = true;
    }

    return registerCanonicalCollectionOwner({
      replaceGames: (nextGames) => {
        beginReplacement();
        setGames(nextGames);
      },
      replacePlayActivity: (nextPlayActivity) => {
        beginReplacement();
        setPlayActivity(nextPlayActivity);
      },
    });
  }, [setGames, setPlayActivity]);

  useEffect(() => {
    if (!awaitingRenderRef.current) {
      return;
    }

    awaitingRenderRef.current = false;
    releaseRef.current?.();
    releaseRef.current = null;
  }, [games, playActivity]);

  // A replacement that is still in flight when the owner unmounts must not leave saves frozen.
  useEffect(() => () => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);
}
