import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { NavItem } from '../config/navigation';
import {
  getDismissAction,
  getToastDedupeKey,
  getUndoAction,
  mergeToastNotifications,
  type NotificationDraft,
} from '../lib/notifications';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import type { PlayActivityRecord } from '../lib/playActivityStorage';
import type { ReviewModeState } from '../lib/reviewModeStorage';
import type { IgnoredSteamGame } from '../lib/steamIgnoredGamesStorage';
import {
  createUndoActionId,
  loadPendingUndoActions,
  savePendingUndoActions,
  undoActionTimeoutMs,
  type PendingUndoAction,
  type UndoActionHistoryEntry,
  type UndoActionSnapshot,
} from '../lib/undoHistoryStorage';
import type { Game } from '../types/game';

type UseQuestShelfNotificationsOptions = {
  activeNavItem: NavItem;
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  playActivity: PlayActivityRecord[];
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  selectedGameId: string | null;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlayActivity: Dispatch<SetStateAction<PlayActivityRecord[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
};

export function useQuestShelfNotifications({
  activeNavItem,
  games,
  ignoredSteamGames,
  playActivity,
  platformQueueState,
  reviewModeState,
  selectedGameId,
  setGames,
  setIgnoredSteamGames,
  setPlayActivity,
  setPlatformQueueState,
  setReviewModeState,
  setSelectedGameId,
}: UseQuestShelfNotificationsOptions) {
  const [pendingUndoActions, setPendingUndoActions] = useState<PendingUndoAction[]>(() => loadPendingUndoActions());
  const pendingUndoActionsRef = useRef<PendingUndoAction[]>(pendingUndoActions);

  function createUndoSnapshot(): UndoActionSnapshot {
    return {
      games,
      ignoredSteamGames,
      playActivity,
      platformQueueState,
      reviewModeState,
      selectedGameId,
    };
  }

  function addUndoAction(
    message: string,
    historyEntry: Omit<UndoActionHistoryEntry, 'createdAt'>,
    snapshot = createUndoSnapshot(),
    notification: Partial<NotificationDraft> = {},
  ) {
    const createdAt = Date.now();
    const action: PendingUndoAction = {
      actions: notification.actions ?? [getUndoAction()],
      category: notification.category ?? 'success',
      createdAt,
      dedupeKey: notification.dedupeKey ?? (activeNavItem === 'Review Mode' ? 'quest-queue-action' : getToastDedupeKey(historyEntry.actionType, historyEntry.affectedGameIds)),
      details: notification.details,
      expiresAt: createdAt + undoActionTimeoutMs,
      historyEntry: {
        ...historyEntry,
        createdAt: new Date(createdAt).toISOString(),
      },
      id: createUndoActionId(),
      message: notification.message ?? message,
      snapshot,
    };

    setPendingUndoActions((currentActions) => {
      const scopedActions = activeNavItem === 'Review Mode' ? currentActions.filter((currentAction) => currentAction.dedupeKey !== 'quest-queue-action') : currentActions;
      const nextActions = mergeToastNotifications(scopedActions, action);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function addToastNotification(notification: NotificationDraft) {
    const createdAt = Date.now();
    const action: PendingUndoAction = {
      actions: notification.actions ?? [getDismissAction()],
      category: notification.category,
      createdAt,
      dedupeKey: notification.dedupeKey,
      details: notification.details,
      expiresAt: createdAt + undoActionTimeoutMs,
      historyEntry: {
        actionType: 'notification',
        affectedGameIds: [],
        description: notification.message,
        createdAt: new Date(createdAt).toISOString(),
      },
      id: createUndoActionId(),
      message: notification.message,
      snapshot: createUndoSnapshot(),
    };

    setPendingUndoActions((currentActions) => {
      const nextActions = mergeToastNotifications(currentActions, action);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function undoAction(actionId: string) {
    const action = pendingUndoActionsRef.current.find((currentAction) => currentAction.id === actionId);
    if (!action) {
      return;
    }

    setGames(action.snapshot.games);
    setIgnoredSteamGames(action.snapshot.ignoredSteamGames);
    setPlayActivity(action.snapshot.playActivity);
    setPlatformQueueState(action.snapshot.platformQueueState);
    setReviewModeState(action.snapshot.reviewModeState);
    setSelectedGameId(action.snapshot.selectedGameId);
    dismissUndoAction(actionId);
  }

  function dismissUndoAction(actionId: string) {
    setPendingUndoActions((currentActions) => {
      const nextActions = currentActions.filter((currentAction) => currentAction.id !== actionId);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  useEffect(() => {
    pendingUndoActionsRef.current = pendingUndoActions;
    savePendingUndoActions(pendingUndoActions);
  }, [pendingUndoActions]);

  useEffect(() => {
    if (pendingUndoActions.length === 0) {
      return;
    }

    const now = Date.now();
    const nextExpiry = Math.max(0, Math.min(...pendingUndoActions.map((action) => action.expiresAt)) - now);
    const expiryTimer = window.setTimeout(() => {
      const currentTime = Date.now();
      setPendingUndoActions((currentActions) => currentActions.filter((action) => action.expiresAt > currentTime));
    }, nextExpiry + 50);

    return () => window.clearTimeout(expiryTimer);
  }, [pendingUndoActions]);

  return {
    addToastNotification,
    addUndoAction,
    createUndoSnapshot,
    dismissUndoAction,
    pendingUndoActions,
    undoAction,
  };
}
