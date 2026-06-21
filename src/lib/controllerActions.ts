import { useEffect, useRef } from 'react';

export type LogicalAction =
  | 'confirm'
  | 'cancel'
  | 'back'
  | 'openMenu'
  | 'openSearch'
  | 'openSettings'
  | 'openHome'
  | 'openQuestQueue'
  | 'focusUp'
  | 'focusDown'
  | 'focusLeft'
  | 'focusRight'
  | 'scrollUp'
  | 'scrollDown'
  | 'pageUp'
  | 'pageDown'
  | 'pagePrev'
  | 'pageNext'
  | 'nextTab'
  | 'previousTab'
  | 'qqPrimary'
  | 'qqSkip'
  | 'qqUndo'
  | 'closeDetail';

export const controllerActionEvent = 'questshelf:controller-action';

export function dispatchControllerAction(action: LogicalAction): void {
  window.dispatchEvent(new CustomEvent<LogicalAction>(controllerActionEvent, { detail: action }));
}

export function useControllerAction(
  action: LogicalAction | LogicalAction[],
  callback: () => void,
  options?: { enabled?: boolean },
): void {
  const enabled = options?.enabled ?? true;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const actions = Array.isArray(action) ? action : [action];

    function handleAction(event: Event) {
      const detail = (event as CustomEvent<LogicalAction>).detail;
      if (actions.includes(detail)) {
        callbackRef.current();
      }
    }

    window.addEventListener(controllerActionEvent, handleAction);
    return () => window.removeEventListener(controllerActionEvent, handleAction);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...(Array.isArray(action) ? action : [action])]);
}
