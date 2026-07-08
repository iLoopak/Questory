import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAchievementCounters, saveAchievementCounters, type AchievementCounters } from '../../lib/achievementCounters';
import {
  getActiveQuestShelfAchievement,
  getQuestShelfAchievements,
  type QuestShelfAchievementProgress,
} from '../../lib/questShelfAchievements';
import { getSeenAchievementGhostIds, setSeenAchievementGhostIds } from '../../lib/achievementGhostStorage';
import type { QueueGhostAchievement } from '../../components/QueueGhost';
import type { Game } from '../../types/game';
import type { PlatformQueueState } from '../../lib/platformQueueStorage';
import type { ReviewModeState } from '../../lib/reviewModeStorage';

type ToastFn = (n: { category: 'success'; dedupeKey: string; message: string; details?: string }) => void;

type UseAchievementSystemParams = {
  games: Game[];
  isOnboardingComplete: boolean;
  language: string;
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  selectedActiveBadgeId: string | undefined;
};

export function useAchievementSystem({
  games,
  isOnboardingComplete,
  language,
  platformQueueState,
  reviewModeState,
  selectedActiveBadgeId,
}: UseAchievementSystemParams) {
  const [achievementCounters, setAchievementCounters] = useState<AchievementCounters>(() => loadAchievementCounters());
  const achievementCountersRef = useRef(achievementCounters);
  achievementCountersRef.current = achievementCounters;

  const [pendingAchievementGhost, setPendingAchievementGhost] = useState<QueueGhostAchievement | null>(null);
  const [isAchievementTimelineOpen, setIsAchievementTimelineOpen] = useState(false);

  // Bridge ref: AppController sets .current = addToastNotification after useToastState runs.
  // Kept as a ref (not a param) so the unlock effect never re-registers when the toast fn changes.
  const addToastRef = useRef<ToastFn | null>(null);
  const prevUnlockedIdsRef = useRef<Set<string> | null>(null);

  function updateAchievementCounters(updates: Partial<AchievementCounters>) {
    setAchievementCounters((prev) => {
      const next = { ...prev, ...updates };
      saveAchievementCounters(next);
      return next;
    });
  }

  const achievementCtx = useMemo(() => ({
    language,
    counters: achievementCounters,
    onboardingCompleted: isOnboardingComplete,
    reviewStats: reviewModeState.stats,
    reviewedGamesCount: Object.keys(reviewModeState.reviewedGames).length,
  }), [language, achievementCounters, isOnboardingComplete, reviewModeState.stats, reviewModeState.reviewedGames]);

  const questShelfAchievements = useMemo(
    () => getQuestShelfAchievements(games, platformQueueState, achievementCtx),
    [games, platformQueueState, achievementCtx],
  );

  const activeShelfAchievement = useMemo(
    () => getActiveQuestShelfAchievement(games, selectedActiveBadgeId, platformQueueState, achievementCtx),
    [games, platformQueueState, selectedActiveBadgeId, achievementCtx],
  );

  const computedShelfTitle = activeShelfAchievement ? activeShelfAchievement.title : '';

  // Daily active days + night owl / early bird — runs once on mount
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();
    const c = achievementCountersRef.current;
    const updates: Partial<AchievementCounters> = {};

    if (!c.activeDays.includes(today)) {
      updates.activeDays = [...c.activeDays, today];
    }
    if (!c.nightOwlUnlocked && hour >= 0 && hour < 5) {
      updates.nightOwlUnlocked = true;
    }
    if (!c.earlyBirdUnlocked && hour >= 5 && hour < 6) {
      updates.earlyBirdUnlocked = true;
    }
    updates.justBrowsingOpens = c.justBrowsingOpens + 1;

    if (Object.keys(updates).length > 0) {
      updateAchievementCounters(updates);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // libraryFirstCreatedAt — set once when games are first loaded
  useEffect(() => {
    const c = achievementCountersRef.current;
    if (c.libraryFirstCreatedAt) return;
    const earliest = games
      .map((g) => g.importedAt ?? g.updatedAt)
      .filter((d): d is string => typeof d === 'string')
      .sort()[0];
    if (earliest) {
      updateAchievementCounters({ libraryFirstCreatedAt: earliest });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.length]);

  // Playing streak — update when the currently-playing game changes
  useEffect(() => {
    const c = achievementCountersRef.current;
    const playing = games.filter((g) => g.collectionType === 'library' && g.status === 'Playing');
    if (playing.length === 0) {
      if (c.playingStreak !== null) {
        updateAchievementCounters({ playingStreak: null });
      }
    } else {
      const main = playing[0];
      if (c.playingStreak?.gameId !== main.id) {
        updateAchievementCounters({ playingStreak: { gameId: main.id, since: new Date().toISOString() } });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  // Unlock notification — fires a toast when a new achievement unlocks
  useEffect(() => {
    const currentUnlocked = new Set(questShelfAchievements.filter((a) => a.isUnlocked).map((a) => a.id));

    if (prevUnlockedIdsRef.current === null) {
      prevUnlockedIdsRef.current = currentUnlocked;
      return;
    }

    const notify = addToastRef.current;
    if (!notify) return;

    let firstNewNonMeta: QuestShelfAchievementProgress | undefined;

    for (const a of questShelfAchievements) {
      if (a.isUnlocked && !prevUnlockedIdsRef.current.has(a.id)) {
        notify({ category: 'success', dedupeKey: `achievement-unlock:${a.id}`, message: `Achievement unlocked: ${a.title}`, details: a.description });
        if (!firstNewNonMeta && !a.isMeta) {
          firstNewNonMeta = a;
        }
      }
    }

    if (firstNewNonMeta) {
      const seen = getSeenAchievementGhostIds();
      if (!seen.has(firstNewNonMeta.id)) {
        const allUnlocked = questShelfAchievements.filter((a) => a.isUnlocked && !a.isMeta);
        setSeenAchievementGhostIds(new Set([...seen, ...allUnlocked.map((a) => a.id)]));
        setPendingAchievementGhost({ title: firstNewNonMeta.title, icon: firstNewNonMeta.icon });
      }
    }

    prevUnlockedIdsRef.current = currentUnlocked;
  }, [questShelfAchievements]);

  function onBackupExported() {
    if (!achievementCountersRef.current.backupExportedEver) {
      updateAchievementCounters({ backupExportedEver: true });
    }
  }

  function onBackupImported() {
    if (!achievementCountersRef.current.backupImportedEver) {
      updateAchievementCounters({ backupImportedEver: true });
    }
  }

  return {
    activeShelfAchievement,
    addToastRef,
    computedShelfTitle,
    isAchievementTimelineOpen,
    onBackupExported,
    onBackupImported,
    pendingAchievementGhost,
    questShelfAchievements,
    setIsAchievementTimelineOpen,
    setPendingAchievementGhost,
  };
}
