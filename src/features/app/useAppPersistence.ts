import { useEffect, useRef } from 'react';
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

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveGamesTimerRef.current !== null) {
        clearTimeout(saveGamesTimerRef.current);
        saveGamesTimerRef.current = null;
      }
      saveGames(gamesRef.current);
    };
  }, []);

  // Debounced save (400 ms)
  useEffect(() => {
    if (saveGamesTimerRef.current !== null) {
      clearTimeout(saveGamesTimerRef.current);
    }
    saveGamesTimerRef.current = setTimeout(() => {
      saveGamesTimerRef.current = null;
      saveGames(gamesRef.current);
    }, 400);
  }, [games]);

  // Flush on tab hide (prevents data loss on mobile / browser close)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && saveGamesTimerRef.current !== null) {
        clearTimeout(saveGamesTimerRef.current);
        saveGamesTimerRef.current = null;
        saveGames(gamesRef.current);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!hasPersistedValueChanged(ignoredSteamGamesSnapshotRef, ignoredSteamGames)) {
      return;
    }

    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    if (!hasPersistedValueChanged(playActivitySnapshotRef, playActivity)) {
      return;
    }

    savePlayActivity(playActivity);
  }, [playActivity]);

  useEffect(() => {
    if (!hasPersistedValueChanged(onboardingStateSnapshotRef, onboardingState)) {
      return;
    }

    saveOnboardingState(onboardingState);
  }, [onboardingState]);

  useEffect(() => {
    if (!hasPersistedValueChanged(platformQueueStateSnapshotRef, platformQueueState)) {
      return;
    }

    savePlatformQueueState(platformQueueState);
  }, [platformQueueState]);

  return { gamesRef };
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
