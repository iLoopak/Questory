import { useEffect, useState } from 'react';
import {
  getDismissAction,
  maxVisibleToastCount,
  type ToastAction,
  type ToastCategory,
} from '../lib/notifications';
import { useI18n } from '../i18n';
import type { PendingUndoAction } from '../lib/undoHistoryStorage';

type UndoToastStackProps = {
  actions: PendingUndoAction[];
  onDismiss: (actionId: string) => void;
  onOpenQueue: () => void;
  onOpenSteamSettings: () => void;
  onUndo: (actionId: string) => void;
  onViewGame: (gameId: string) => void;
};

export function UndoToastStack({ actions, onDismiss, onOpenQueue, onOpenSteamSettings, onUndo, onViewGame }: UndoToastStackProps) {
  const { t } = useI18n();
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeActionIds = new Set(actions.map((action) => action.id));
    setExpandedDetailIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((actionId) => activeActionIds.has(actionId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, [actions]);

  if (actions.length === 0) {
    return null;
  }

  const visibleActions = actions.slice(-maxVisibleToastCount).reverse();

  function runToastAction(actionId: string, toastAction: ToastAction) {
    if (toastAction.kind === 'dismiss') {
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'undo') {
      onUndo(actionId);
      return;
    }

    if (toastAction.kind === 'open-queue') {
      onOpenQueue();
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'open-steam-settings') {
      onOpenSteamSettings();
      onDismiss(actionId);
      return;
    }

    if (toastAction.kind === 'view-game' && toastAction.gameId) {
      onViewGame(toastAction.gameId);
      onDismiss(actionId);
    }
  }

  function toggleToastDetails(actionId: string) {
    setExpandedDetailIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(actionId)) {
        nextIds.delete(actionId);
      } else {
        nextIds.add(actionId);
      }

      return nextIds;
    });
  }

  return (
    <aside
      aria-label={t('app.questShelfNotifications')}
      aria-live="polite"
      className="qs-toast-stack pointer-events-none fixed top-[calc(3.25rem+max(0px,var(--qs-safe-top)))] z-[1300] grid justify-items-stretch gap-2 overflow-visible sm:top-[calc(3.75rem+max(0px,var(--qs-safe-top)))] sm:justify-items-end"
      role="status"
    >
      {visibleActions.map((action) => {
        const category = action.category ?? 'success';
        const categoryStyles = getToastCategoryStyles(category);
        const toastActions = action.actions?.length ? action.actions : [getDismissAction()];
        const hasDetails = Boolean(action.details?.trim());
        const isDetailsExpanded = expandedDetailIds.has(action.id);

        return (
          <div
            key={action.id}
            className={`qs-toast pointer-events-auto flex w-full max-w-full translate-x-0 flex-col gap-2 overflow-hidden rounded-2xl border px-3 py-2 shadow-glow ${categoryStyles.container}`}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="qs-toast-message min-w-0 flex-1 text-sm font-semibold leading-5 text-white sm:text-[0.95rem]">
                {action.message}
              </span>
              {action.repeatCount && action.repeatCount > 1 ? (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300">
                  ×{action.repeatCount}
                </span>
              ) : null}
            </div>
            {hasDetails ? (
              <div className="min-w-0">
                <button
                  aria-expanded={isDetailsExpanded}
                  className="max-w-full rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
                  onClick={() => toggleToastDetails(action.id)}
                  type="button"
                >
                  {isDetailsExpanded ? t('app.hideDetails') : t('app.showDetails')}
                </button>
                {isDetailsExpanded ? (
                  <div className="qs-toast-details mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-black/15 p-2 text-xs leading-5 text-slate-100">
                    {action.details}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {toastActions.map((toastAction) => (
                <button
                  key={`${action.id}-${toastAction.kind}-${toastAction.gameId ?? toastAction.label}`}
                  className={getToastButtonClass(toastAction.kind)}
                  onClick={() => runToastAction(action.id, toastAction)}
                  type="button"
                >
                  {getLocalizedToastActionLabel(toastAction.label, t)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

function getToastCategoryStyles(category: ToastCategory) {
  if (category === 'warning') {
    return {
      container: 'border-amber-300/35 bg-amber-950/90 text-amber-50 ring-1 ring-amber-300/15',
    };
  }

  if (category === 'error') {
    return {
      container: 'border-red-400/40 bg-red-950/90 text-red-50 ring-1 ring-red-400/15',
    };
  }

  if (category === 'info') {
    return {
      container: 'border-skyglass/35 bg-ink-900/92 text-sky-50 ring-1 ring-skyglass/10',
    };
  }

  return {
    container: 'border-mint/35 bg-ink-950/92 text-mint ring-1 ring-mint/15',
  };
}

function getToastButtonClass(kind: ToastAction['kind']) {
  const baseClass = 'min-h-0 max-w-full whitespace-normal break-words rounded-full px-3 py-1 text-xs font-bold leading-tight transition focus-visible:translate-y-0 sm:text-sm';

  if (kind === 'undo') {
    return `${baseClass} bg-mint text-ink-950 shadow-glow hover:bg-mint/90`;
  }

  return `${baseClass} border border-skyglass/20 bg-white/5 text-slate-100 hover:border-mint/40 hover:bg-mint/10 hover:text-white`;
}


function getLocalizedToastActionLabel(label: ToastAction['label'], t: ReturnType<typeof useI18n>['t']) {
  if (label === 'Dismiss') {
    return t('app.dismiss');
  }

  if (label === 'Open Platform Plans' || label === 'Open Platforms') {
    return t('app.openPlatforms');
  }

  if (label === 'Open Steam settings') {
    return t('app.openSteamSettings');
  }

  if (label === 'Undo') {
    return t('app.undo');
  }

  if (label === 'View Game') {
    return t('app.viewGame');
  }

  return label;
}
