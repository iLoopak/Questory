import { useEffect, useRef } from 'react';
import { areCanonicalCollectionWritesSuspended } from '../../lib/canonicalCollections';
import { saveGames } from '../../lib/gameStorage';
import { saveIgnoredSteamGames } from '../../lib/steamIgnoredGamesStorage';
import { savePlayActivity, type PlayActivityRecord } from '../../lib/playActivityStorage';
import { saveOnboardingState, type OnboardingState } from '../../lib/onboardingStorage';
import { savePlatformQueueState, type PlatformQueueState } from '../../lib/platformQueueStorage';
import type { Game } from '../../types/game';
import type { IgnoredSteamGame } from '../../lib/steamIgnoredGamesStorage';

type UseAppPersistenceOptions = {
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  onboardingState: OnboardingState;
  platformQueueState: PlatformQueueState;
  playActivity: PlayActivityRecord[];
};

/**
 * The single persistence writer for the slices below. AS-14: this includes Platform Plans, which
 * `usePlatformQueueController` also used to save from inside its state updater — one logical Plan
 * change now produces exactly one write, from here.
 */
export function useAppPersistence({
  games,
  ignoredSteamGames,
  onboardingState,
  platformQueueState,
  playActivity,
}: UseAppPersistenceOptions) {
  const gamesRef = useRef(games);
  gamesRef.current = games;

  const saveGamesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoredSteamGamesSnapshotRef = useRef(JSON.stringify(ignoredSteamGames));
  const playActivitySnapshotRef = useRef(JSON.stringify(playActivity));
  const onboardingStateSnapshotRef = useRef(JSON.stringify(onboardingState));
  const platformQueueStateSnapshotRef = useRef(JSON.stringify(platformQueueState));

  /**
   * AS-03. Every owner-driven save goes through here. While a destructive restore/recovery is in
   * flight (or an owner replacement has not yet re-rendered), the owner's array is stale by
   * definition — writing it would delete the data that was just recovered. Suspension is an
   * explicit contract from `canonicalCollections`, not a timing assumption, so it holds equally
   * for the debounce, the unmount flush and the visibility/unload flush.
   */
  function saveGamesUnlessSuspended() {
    if (areCanonicalCollectionWritesSuspended()) {
      return;
    }
    saveGames(gamesRef.current);
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveGamesTimerRef.current !== null) {
        clearTimeout(saveGamesTimerRef.current);
        saveGamesTimerRef.current = null;
      }
      saveGamesUnlessSuspended();
    };
  }, []);

  // Debounced save (400 ms)
  useEffect(() => {
    if (saveGamesTimerRef.current !== null) {
      clearTimeout(saveGamesTimerRef.current);
    }
    saveGamesTimerRef.current = setTimeout(() => {
      saveGamesTimerRef.current = null;
      saveGamesUnlessSuspended();
    }, 400);
  }, [games]);

  // Flush on page unload. beforeunload fires synchronously before the page tears down and is
  // the last reliable hook for location.reload() (e.g. Vite HMR full-reload) and browser
  // close. visibilitychange to 'hidden' is a second-line guard for cases (mobile, bfcache)
  // where beforeunload is suppressed.
  useEffect(() => {
    function flushPendingSave() {
      if (saveGamesTimerRef.current !== null) {
        clearTimeout(saveGamesTimerRef.current);
        saveGamesTimerRef.current = null;
        saveGamesUnlessSuspended();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    }

    window.addEventListener('beforeunload', flushPendingSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flushPendingSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (areCanonicalCollectionWritesSuspended() || !hasPersistedValueChanged(ignoredSteamGamesSnapshotRef, ignoredSteamGames)) {
      return;
    }

    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    if (areCanonicalCollectionWritesSuspended() || !hasPersistedValueChanged(playActivitySnapshotRef, playActivity)) {
      return;
    }

    savePlayActivity(playActivity);
  }, [playActivity]);

  useEffect(() => {
    if (areCanonicalCollectionWritesSuspended() || !hasPersistedValueChanged(onboardingStateSnapshotRef, onboardingState)) {
      return;
    }

    saveOnboardingState(onboardingState);
  }, [onboardingState]);

  useEffect(() => {
    if (areCanonicalCollectionWritesSuspended() || !hasPersistedValueChanged(platformQueueStateSnapshotRef, platformQueueState)) {
      return;
    }

    savePlatformQueueState(platformQueueState);
  }, [platformQueueState]);

}

function hasPersistedValueChanged<T>(snapshotRef: { current: string }, value: T) {
  // Seeded from loaded state so mount-time effects do not rewrite unchanged persisted slices.
  const nextSnapshot = JSON.stringify(value);
  if (snapshotRef.current === nextSnapshot) {
    return false;
  }

  snapshotRef.current = nextSnapshot;
  return true;
}
