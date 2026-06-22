import { useEffect, useRef, useState } from 'react';
import {
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
  onLinkRawgGame: (gameId: string, retryMode?: 'metadata' | 'artwork') => void;
  onUndo: (actionId: string) => void;
  onViewGame: (gameId: string) => void;
};

const swipeDismissThresholdPx = 72;

export function UndoToastStack({ actions, onDismiss, onOpenQueue, onOpenSteamSettings, onLinkRawgGame, onUndo, onViewGame }: UndoToastStackProps) {
  const { t } = useI18n();
  const [expandedDetailIds, setExpandedDetailIds] = useState<Set<string>>(new Set());
  const [runningActionKeys, setRunningActionKeys] = useState<Set<string>>(new Set());
  const [failedActionIds, setFailedActionIds] = useState<Set<string>>(new Set());
  const swipeStartXByToastId = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const activeActionIds = new Set(actions.map((action) => action.id));
    setExpandedDetailIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((actionId) => activeActionIds.has(actionId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
    setRunningActionKeys((currentKeys) => {
      const nextKeys = new Set([...currentKeys].filter((key) => activeActionIds.has(key.split(':')[0])));
      return nextKeys.size === currentKeys.size ? currentKeys : nextKeys;
    });
    setFailedActionIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((actionId) => activeActionIds.has(actionId)));
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, [actions]);

  if (actions.length === 0) {
    return null;
  }

  const visibleActions = actions.slice(-maxVisibleToastCount).reverse();

  async function runToastAction(actionId: string, toastAction: ToastAction, actionKey: string) {
    if (runningActionKeys.has(actionKey)) {
      return;
    }

    setRunningActionKeys((currentKeys) => new Set(currentKeys).add(actionKey));
    setFailedActionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(actionId);
      return nextIds;
    });

    try {
      if (toastAction.onClick) {
        await toastAction.onClick();
      } else {
        runBuiltInToastAction(actionId, toastAction);
      }

      onDismiss(actionId);
    } catch (error) {
      console.warn('QuestShelf toast action failed.', error);
      setFailedActionIds((currentIds) => new Set(currentIds).add(actionId));
    } finally {
      setRunningActionKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        nextKeys.delete(actionKey);
        return nextKeys;
      });
    }
  }

  function runBuiltInToastAction(actionId: string, toastAction: ToastAction) {
    if (toastAction.kind === 'undo') {
      onUndo(actionId);
      return;
    }

    if (toastAction.kind === 'open-queue') {
      onOpenQueue();
      return;
    }

    if (toastAction.kind === 'open-steam-settings') {
      onOpenSteamSettings();
      return;
    }

    if (toastAction.kind === 'link-rawg-game' && toastAction.gameId) {
      onLinkRawgGame(toastAction.gameId, toastAction.rawgRetryMode);
      return;
    }

    if (toastAction.kind === 'view-game' && toastAction.gameId) {
      onViewGame(toastAction.gameId);
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
      role="region"
    >
      {visibleActions.map((action) => {
        const category = action.category ?? 'success';
        const categoryStyles = getToastCategoryStyles(category);
        const toastActions = (action.actions ?? []).filter((toastAction) => !isGenericDismissToastAction(toastAction));
        const hasDetails = Boolean(action.details?.trim());
        const isDetailsExpanded = expandedDetailIds.has(action.id);
        const hasActionError = failedActionIds.has(action.id);

        return (
          <div
            key={action.id}
            className={`qs-toast pointer-events-auto flex w-full max-w-full touch-pan-y translate-x-0 flex-col gap-2 overflow-hidden rounded-2xl border px-3 py-2 shadow-glow ${categoryStyles.container}`}
            onPointerDown={(event) => swipeStartXByToastId.current.set(action.id, event.clientX)}
            onPointerUp={(event) => {
              const startX = swipeStartXByToastId.current.get(action.id);
              swipeStartXByToastId.current.delete(action.id);
              if (startX !== undefined && Math.abs(event.clientX - startX) >= swipeDismissThresholdPx) {
                onDismiss(action.id);
              }
            }}
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="qs-toast-message min-w-0 flex-1 text-sm font-semibold leading-5 text-white">
                {action.message}
              </span>
              {action.repeatCount && action.repeatCount > 1 ? (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-xs font-bold text-slate-300">
                  ×{action.repeatCount}
                </span>
              ) : null}
              <button
                aria-label={t('app.dismiss')}
                className="qs-toast-close shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-sm font-black leading-5 text-slate-100 transition hover:border-mint/40 hover:bg-mint/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
                onClick={() => onDismiss(action.id)}
                type="button"
              >
                ×
              </button>
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
            {hasActionError ? (
              <p className="m-0 rounded-xl border border-red-300/30 bg-red-950/35 px-2 py-1 text-xs font-semibold text-red-100">
                {t('app.actionFailedTryAgain')}
              </p>
            ) : null}
            {toastActions.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {toastActions.map((toastAction, index) => {
                  const actionKey = `${action.id}:${toastAction.kind ?? toastAction.label}:${toastAction.gameId ?? ''}:${toastAction.rawgRetryMode ?? ''}:${index}`;
                  const isRunning = runningActionKeys.has(actionKey);

                  return (
                    <button
                      key={actionKey}
                      className={getToastButtonClass(toastAction)}
                      disabled={isRunning}
                      onClick={() => void runToastAction(action.id, toastAction, actionKey)}
                      type="button"
                    >
                      {getLocalizedToastActionLabel(toastAction.label, t)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}

function isGenericDismissToastAction(action: ToastAction) {
  return action.kind === 'dismiss' || (action.label === 'Dismiss' && !action.onClick);
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

function getToastButtonClass(action: ToastAction) {
  const baseClass = 'min-h-0 max-w-full whitespace-normal break-words rounded-full px-3 py-1 text-xs font-bold leading-tight transition focus-visible:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';

  if (action.variant === 'danger') {
    return `${baseClass} bg-red-400 text-ink-950 shadow-glow hover:bg-red-300`;
  }

  if (action.variant === 'primary' || action.kind === 'undo') {
    return `${baseClass} bg-mint text-ink-950 shadow-glow hover:bg-mint/90`;
  }

  return `${baseClass} border border-skyglass/20 bg-white/5 text-slate-100 hover:border-mint/40 hover:bg-mint/10 hover:text-white`;
}

function getLocalizedToastActionLabel(label: ToastAction['label'], t: ReturnType<typeof useI18n>['t']) {
  if (label === 'Dismiss') {
    return t('app.dismiss');
  }

  if (label === 'Link RAWG Game') {
    return 'Link RAWG Game';
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
