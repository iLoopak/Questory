import type { Game, GamePlatform, GameStatus } from '../types/game';

export type ToastCategory = 'success' | 'warning' | 'error' | 'info';

export type ToastActionKind = 'dismiss' | 'open-queue' | 'open-steam-settings' | 'undo' | 'view-game';

export type ToastAction = {
  gameId?: string;
  kind: ToastActionKind;
  label: 'Dismiss' | 'Open Platforms' | 'Open Steam settings' | 'Undo' | 'View Game';
};

export type NotificationDraft = {
  actions?: ToastAction[];
  category: ToastCategory;
  dedupeKey?: string;
  message: string;
  details?: string;
};

export type MergeableNotification = NotificationDraft & {
  createdAt: number;
  expiresAt: number;
  id: string;
  repeatCount?: number;
};

export const maxVisibleToastCount = 3;
export const maxPendingToastCount = 3;
export const defaultToastGameTitleMaxLength = 20;

export function truncateGameTitle(title: string, maxLength = defaultToastGameTitleMaxLength) {
  const trimmedTitle = title.trim().replace(/\s+/g, ' ');
  const safeMaxLength = Math.max(2, maxLength);

  if (trimmedTitle.length <= safeMaxLength) {
    return trimmedTitle;
  }

  const ellipsis = '…';
  const availableLength = safeMaxLength - ellipsis.length;
  const candidate = trimmedTitle.slice(0, availableLength).trimEnd();
  const lastSpaceIndex = candidate.lastIndexOf(' ');
  const shouldUseWordBoundary = lastSpaceIndex >= Math.floor(availableLength * 0.45);
  const truncatedTitle = shouldUseWordBoundary ? candidate.slice(0, lastSpaceIndex).trimEnd() : candidate;

  return `${truncatedTitle || candidate}${ellipsis}`;
}

export function formatToastGameTitle(title: string, maxLength = defaultToastGameTitleMaxLength) {
  return truncateGameTitle(title, maxLength) || 'Game';
}

export function formatGameToastMessage(template: string, game: Pick<Game, 'title'>) {
  return template.replace('{game}', formatToastGameTitle(game.title));
}

export function getGameTitle(game: Pick<Game, 'title'>) {
  return game.title.trim() || 'Game';
}

export function getStatusToastMessage(game: Pick<Game, 'title'>, status: GameStatus) {
  if (status === 'Playing') {
    return `${formatToastGameTitle(game.title)} marked as Playing Now`;
  }

  if (status === 'Finished') {
    return `${formatToastGameTitle(game.title)} marked as Finished`;
  }

  if (status === 'Dropped') {
    return `${formatToastGameTitle(game.title)} dropped`;
  }

  return `${formatToastGameTitle(game.title)} marked as ${status}`;
}

export function getWishlistToastMessage(game: Pick<Game, 'title'>) {
  return `${formatToastGameTitle(game.title)} added to Wishlist`;
}

export function getBulkWishlistToastMessage(count: number, game?: Pick<Game, 'title'>) {
  return count === 1 && game ? getWishlistToastMessage(game) : `${count} games added to Wishlist`;
}

export function getQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return `${formatToastGameTitle(game.title)} added to Platforms`;
}

export function getMoveQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return `${formatToastGameTitle(game.title)} moved to ${platform}`;
}

export function getRemoveQueueToastMessage(game: Pick<Game, 'title'>, platform: GamePlatform) {
  return `${formatToastGameTitle(game.title)} removed from Platforms`;
}

export function getViewGameAction(gameId: string): ToastAction {
  return { gameId, kind: 'view-game', label: 'View Game' };
}

export function getOpenQueueAction(): ToastAction {
  return { kind: 'open-queue', label: 'Open Platforms' };
}

export function getOpenSteamSettingsAction(): ToastAction {
  return { kind: 'open-steam-settings', label: 'Open Steam settings' };
}

export function getDismissAction(): ToastAction {
  return { kind: 'dismiss', label: 'Dismiss' };
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
      ...nextNotification,
      createdAt: existingNotification.createdAt,
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
