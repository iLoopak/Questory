import { useEffect, useRef } from 'react';
import {
  registerCanonicalCollectionOwner,
  suspendCanonicalCollectionWrites,
} from '../../lib/canonicalCollections';
import type { PlayActivityRecord } from '../../lib/playActivityStorage';
import { playActivityRepository } from '../../lib/playActivityStorage';
import { gameRepository } from '../../lib/gameStorage';
import { getDurableKvFailures, whenDurableKvSettled } from '../../lib/kvDurableQueue';
import { isBackupRelevantStorageKey } from '../../lib/backupRevision';
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
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const playActivityRef = useRef(playActivity);
  playActivityRef.current = playActivity;

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
      prepareBackup: async () => {
        const gamesSnapshot = gamesRef.current;
        const playActivitySnapshot = playActivityRef.current;
        const [gamesResult, playActivityResult] = await Promise.all([
          gameRepository.replaceAllDurable(gamesSnapshot),
          playActivityRepository.replaceAllDurable(playActivitySnapshot),
          whenDurableKvSettled(),
        ]);
        const failures = [gamesResult, playActivityResult].filter((result) => !result.ok);
        const kvFailures = getDurableKvFailures().filter((result) => isBackupRelevantStorageKey(result.key));
        if (failures.length > 0) {
          throw new Error(failures.map((result) => result.error ?? 'Canonical collection flush failed.').join(' · '));
        }
        if (kvFailures.length > 0) {
          throw new Error(kvFailures.map((result) => `${result.key}: ${result.error ?? 'durable write failed'}`).join(' · '));
        }
        return { games: gamesSnapshot, playActivity: playActivitySnapshot };
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
