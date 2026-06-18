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
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  selectedGameId: string | null;
  setGames: Dispatch<SetStateAction<Game[]>>;
  setIgnoredSteamGames: Dispatch<SetStateAction<IgnoredSteamGame[]>>;
  setPlatformQueueState: Dispatch<SetStateAction<PlatformQueueState>>;
  setReviewModeState: Dispatch<SetStateAction<ReviewModeState>>;
  setSelectedGameId: Dispatch<SetStateAction<string | null>>;
};

export function useQuestShelfNotifications({
  activeNavItem,
  games,
  ignoredSteamGames,
  platformQueueState,
  reviewModeState,
  selectedGameId,
  setGames,
  setIgnoredSteamGames,
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
      expiresAt: notification.persistent ? null : createdAt + undoActionTimeoutMs,
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
      expiresAt: notification.persistent ? null : createdAt + undoActionTimeoutMs,
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
    setPlatformQueueState(action.snapshot.platformQueueState);
    setReviewModeState(action.snapshot.reviewModeState);
    setSelectedGameId(action.snapshot.selectedGameId);
    dismissToast(actionId);
  }

  function dismissToast(actionId: string) {
    setPendingUndoActions((currentActions) => {
      const nextActions = currentActions.filter((currentAction) => currentAction.id !== actionId);
      pendingUndoActionsRef.current = nextActions;
      return nextActions;
    });
  }

  function dismissAllToasts() {
    setPendingUndoActions(() => {
      pendingUndoActionsRef.current = [];
      return [];
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

    const expiringActions = pendingUndoActions.filter((action) => action.expiresAt !== null);
    if (expiringActions.length === 0) {
      return;
    }

    const now = Date.now();
    const nextExpiry = Math.max(0, Math.min(...expiringActions.map((action) => action.expiresAt as number)) - now);
    const expiryTimer = window.setTimeout(() => {
      const currentTime = Date.now();
      setPendingUndoActions((currentActions) => {
        const nextActions = currentActions.filter((action) => action.expiresAt === null || action.expiresAt > currentTime);
        pendingUndoActionsRef.current = nextActions;
        return nextActions;
      });
    }, nextExpiry + 50);

    return () => window.clearTimeout(expiryTimer);
  }, [pendingUndoActions]);

  return {
    addToastNotification,
    addUndoAction,
    createUndoSnapshot,
    dismissAllToasts,
    dismissToast,
    dismissUndoAction: dismissToast,
    pendingUndoActions,
    undoAction,
  };
}
