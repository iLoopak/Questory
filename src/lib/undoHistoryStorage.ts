import type { PlatformQueueState } from './platformQueueStorage';
import type { ReviewModeState } from './reviewModeStorage';
import type { IgnoredSteamGame } from './steamIgnoredGamesStorage';
import type { Game } from '../types/game';

const STORAGE_KEY = 'questshelf.pendingUndoActions.v1';
export const undoActionTimeoutMs = 8000;

export type UndoActionSnapshot = {
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  platformQueueState: PlatformQueueState;
  reviewModeState: ReviewModeState;
  selectedGameId: string | null;
};

export type UndoActionHistoryEntry = {
  actionType: string;
  affectedGameIds: string[];
  createdAt: string;
  description: string;
};

export type PendingUndoAction = {
  createdAt: number;
  expiresAt: number;
  historyEntry: UndoActionHistoryEntry;
  id: string;
  message: string;
  snapshot: UndoActionSnapshot;
};

export function loadPendingUndoActions(now = Date.now()): PendingUndoAction[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(isPendingUndoAction).filter((action) => action.expiresAt > now);
  } catch (error) {
    console.warn('QuestShelf could not load pending undo actions.', error);
    return [];
  }
}

export function savePendingUndoActions(actions: PendingUndoAction[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  } catch (error) {
    console.warn('QuestShelf could not save pending undo actions.', error);
  }
}

export function createUndoActionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPendingUndoAction(value: unknown): value is PendingUndoAction {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as PendingUndoAction;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.expiresAt === 'number' &&
    Boolean(candidate.snapshot) &&
    Array.isArray(candidate.snapshot.games) &&
    Array.isArray(candidate.snapshot.ignoredSteamGames) &&
    Boolean(candidate.snapshot.platformQueueState) &&
    Array.isArray(candidate.snapshot.platformQueueState.entries) &&
    Array.isArray(candidate.snapshot.platformQueueState.settings) &&
    Boolean(candidate.snapshot.reviewModeState) &&
    Array.isArray(candidate.historyEntry?.affectedGameIds)
  );
}
