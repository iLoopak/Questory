import type { ToastAction, ToastCategory } from './notifications';
import type { UndoOperation } from './undoOperations';

// AS-04: v2 records carry a list of scoped inverse OPERATIONS instead of a copy of the whole
// application state. The key is versioned rather than migrated: a v1 record is a whole-state
// snapshot with no inverse information in it, so there is nothing to convert. Old history is
// discarded, which costs at most a few seconds of undoability across one upgrade and cannot
// resurrect a stale snapshot.
const STORAGE_KEY = 'questshelf.pendingUndoActions.v2';
const LEGACY_STORAGE_KEY = 'questshelf.pendingUndoActions.v1';

export const undoActionTimeoutMs = 8000;

export type UndoActionHistoryEntry = {
  actionType: string;
  affectedGameIds: string[];
  createdAt: string;
  description: string;
};

export type PendingUndoAction = {
  actions?: ToastAction[];
  category: ToastCategory;
  createdAt: number;
  expiresAt: number | null;
  dedupeKey?: string;
  details?: string;
  historyEntry: UndoActionHistoryEntry;
  id: string;
  message: string;
  /** The inverse of this action. Empty for a plain notification, which is not undoable. */
  operations: UndoOperation[];
  repeatCount?: number;
};

export function loadPendingUndoActions(now = Date.now()): PendingUndoAction[] {
  if (typeof window === 'undefined') {
    return [];
  }

  discardLegacyUndoHistory();

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isPendingUndoAction)
      .filter((action) => action.expiresAt === null || action.expiresAt > now)
      .map(normalizePendingUndoAction);
  } catch (error) {
    console.warn('Questory could not load pending undo actions.', error);
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
    // Non-fatal by design: a full sessionStorage costs the undo its ability to survive a reload,
    // but the toast on screen still works, and nothing the user did is at risk.
    console.warn('Questory could not save pending undo actions.', error);
  }
}

export function createUndoActionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Drop the pre-AS-04 whole-state history. Never fatal: it is only session-scoped undo. */
function discardLegacyUndoHistory() {
  try {
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // A storage that refuses removeItem is not a reason to fail startup.
  }
}

function normalizePendingUndoAction(action: PendingUndoAction): PendingUndoAction {
  return {
    ...action,
    actions: action.actions ?? [{ kind: 'undo', label: 'Undo' }],
    category: action.category ?? 'success',
    operations: action.operations ?? [],
  };
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
    (candidate.expiresAt === null || typeof candidate.expiresAt === 'number') &&
    (!candidate.details || typeof candidate.details === 'string') &&
    (!candidate.category || isToastCategory(candidate.category)) &&
    (!candidate.actions || Array.isArray(candidate.actions)) &&
    Array.isArray(candidate.operations) &&
    candidate.operations.every(isUndoOperation) &&
    Array.isArray(candidate.historyEntry?.affectedGameIds)
  );
}

/**
 * A structural check, not a full schema validation: a record whose operations are unreadable is
 * discarded rather than offered as an Undo that would then do something unpredictable.
 */
function isUndoOperation(value: unknown): value is UndoOperation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { kind?: unknown };
  return typeof candidate.kind === 'string' && undoOperationKinds.has(candidate.kind);
}

const undoOperationKinds = new Set<string>([
  'game-fields',
  'game-restore',
  'game-remove',
  'ignored-steam-add',
  'ignored-steam-remove',
  'plan-entry-restore',
  'plan-entry-remove',
  'review-queue-reinsert',
  'review-unreview',
  'review-unignore',
  'review-stats-decrement',
]);

function isToastCategory(value: unknown): value is ToastCategory {
  return value === 'success' || value === 'warning' || value === 'error' || value === 'info';
}
