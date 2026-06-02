import type { Game, GamePlatform, GameStatus } from '../types/game';

export type ToastCategory = 'success' | 'warning' | 'error' | 'info';

export type ToastActionKind = 'undo' | 'open-queue' | 'view-game';

export type ToastAction = {
  gameId?: string;
  kind: ToastActionKind;
  label: 'Undo' | 'Open Queue' | 'View Game';
};

export type NotificationDraft = {
  actions?: ToastAction[];
  category: ToastCategory;
  dedupeKey?: string;
  message: string;
};

export type MergeableNotification = NotificationDraft & {
  createdAt: number;
  expiresAt: number;
  id: string;
  repeatCount?: number;
};

export const maxVisibleToastCount = 3;
export const maxPendingToastCount = 3;

export function getGameTitle(game: Pick<Game, 'title'>) {
  return game.title.trim() || 'Game';
}

export function getStatusToastMessage(game: Pick<Game, 'title'>, status: GameStatus) {
  return status === 'Finished' ? '✓ Finished' : `🚫 ${status}`;
}

export function getWishlistToastMessage(game: Pick<Game, 'title'>) {
  return '💖 Wishlisted';
}

export function getBulkWishlistToastMessage(count: number) {
  return count === 1 ? '💖 Wishlisted' : `💖 ${count} wishlisted`;
}

export function getQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return '📌 Queued';
}

export function getMoveQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return '📌 Moved to Queue';
}

export function getRemoveQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return 'Removed from Queue';
}

export function getViewGameAction(gameId: string): ToastAction {
  return { gameId, kind: 'view-game', label: 'View Game' };
}

export function getOpenQueueAction(): ToastAction {
  return { kind: 'open-queue', label: 'Open Queue' };
}

export function getUndoAction(): ToastAction {
  return { kind: 'undo', label: 'Undo' };
}

export function getToastDedupeKey(actionType: string, affectedGameIds: string[]) {
  return `${actionType}:${affectedGameIds.slice().sort().join(',')}`;
}

export function mergeToastNotifications<TNotification extends MergeableNotification>(
  currentNotifications: TNotification[],
  nextNotification: TNotification,
) {
  const duplicateIndex = nextNotification.dedupeKey
    ? currentNotifications.findIndex((notification) => notification.dedupeKey === nextNotification.dedupeKey)
    : -1;

  const nextNotifications = [...currentNotifications];

  if (duplicateIndex >= 0) {
    const existingNotification = nextNotifications[duplicateIndex];
    nextNotifications[duplicateIndex] = {
      ...existingNotification,
      actions: nextNotification.actions,
      category: nextNotification.category,
      expiresAt: nextNotification.expiresAt,
      message: nextNotification.message,
      repeatCount: (existingNotification.repeatCount ?? 1) + 1,
    };
  } else {
    nextNotifications.push(nextNotification);
  }

  return nextNotifications
    .sort((firstNotification, secondNotification) => firstNotification.createdAt - secondNotification.createdAt)
    .slice(-maxPendingToastCount);
}
