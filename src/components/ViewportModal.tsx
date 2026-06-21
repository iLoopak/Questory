import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';

type ViewportModalPlacement = 'bottom-sheet' | 'center' | 'fullscreen';

type ViewportModalProps = {
  ariaLabel: string;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  placement?: ViewportModalPlacement;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isEditableElement(element: EventTarget | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.isContentEditable;
}

function isModalCloseKey(event: KeyboardEvent | globalThis.KeyboardEvent) {
  return event.key === 'Escape';
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null;
  });
}

export function ViewportModal({ ariaLabel, children, initialFocusRef, onClose, placement = 'bottom-sheet', restoreFocusRef }: ViewportModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useScrollLock();

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { documentElement } = document;
    documentElement.classList.add('qs-modal-open');

    window.setTimeout(() => {
      const firstFocusableElement = initialFocusRef?.current ?? getFocusableElements(dialogRef.current)[0];
      firstFocusableElement?.focus({ preventScroll: true });
    }, 0);

    return () => {
      documentElement.classList.remove('qs-modal-open');

      window.setTimeout(() => {
        const focusTarget = restoreFocusRef?.current ?? previouslyFocusedElementRef.current;
        focusTarget?.focus({ preventScroll: true });
      }, 0);
    };
  }, [initialFocusRef, restoreFocusRef]);

  useEffect(() => {
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (!isModalCloseKey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    document.addEventListener('keydown', handleDocumentKeyDown, true);

    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus({ preventScroll: true });
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

  if (typeof document === 'undefined') {
    return null;
  }

  const isFullscreen = placement === 'fullscreen';
  const isCentered = placement === 'center';

  const backdropClassName = isFullscreen
    ? 'qs-viewport-modal qs-viewport-modal-fullscreen fixed inset-0 overflow-y-auto'
    : isCentered
      ? 'qs-viewport-modal qs-viewport-modal-center fixed inset-0 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-4'
      : 'qs-viewport-modal fixed inset-0 flex items-end justify-center bg-black/45 p-2 backdrop-blur-sm sm:items-center sm:p-4';

  const panelClassName = isFullscreen
    ? 'w-full min-h-full'
    : isCentered
      ? 'qs-filter-drawer qs-glass flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-panel'
      : 'qs-filter-drawer qs-glass w-full max-w-4xl overflow-hidden rounded-t-2xl border shadow-panel sm:rounded-2xl';

  return createPortal(
    <div
      className={backdropClassName}
      onClick={isFullscreen ? undefined : onClose}
      onKeyDown={handleKeyDown}
    >
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className={panelClassName}
        onClick={isFullscreen ? undefined : (event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
