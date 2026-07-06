import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null;
  });
}

type UseFocusTrapOptions = {
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Dialog focus behaviour shared by ViewportModal and full-screen overlays:
 * focuses the first focusable element (or `initialFocusRef`) on mount,
 * restores focus to the previously focused element (or `restoreFocusRef`)
 * on unmount, and returns a keydown handler that keeps Tab cycling inside
 * the container.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { initialFocusRef, restoreFocusRef }: UseFocusTrapOptions = {},
) {
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    window.setTimeout(() => {
      const firstFocusableElement = initialFocusRef?.current ?? getFocusableElements(containerRef.current)[0];
      (firstFocusableElement ?? containerRef.current)?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.setTimeout(() => {
        const focusTarget = restoreFocusRef?.current ?? previouslyFocusedElementRef.current;
        focusTarget?.focus({ preventScroll: true });
      }, 0);
    };
    // containerRef is a stable ref object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocusRef, restoreFocusRef]);

  function handleTrapKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(containerRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      containerRef.current?.focus({ preventScroll: true });
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstFocusableElement) {
      event.preventDefault();
      lastFocusableElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && document.activeElement === lastFocusableElement) {
      event.preventDefault();
      firstFocusableElement.focus({ preventScroll: true });
    }
  }

  return { handleTrapKeyDown };
}
