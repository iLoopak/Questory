import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type ViewportModalProps = {
  ariaLabel: string;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
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
  if (event.key === 'Escape' || event.key === 'GamepadB') {
    return true;
  }

  return event.key.toLowerCase() === 'b' && !isEditableElement(event.target);
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null;
  });
}

export function ViewportModal({ ariaLabel, children, initialFocusRef, onClose, restoreFocusRef }: ViewportModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const { body, documentElement } = document;
    const previousBodyStyle = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
      width: body.style.width,
    };
    const previousDocumentOverflow = documentElement.style.overflow;

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    documentElement.classList.add('qs-modal-open');

    window.setTimeout(() => {
      const firstFocusableElement = initialFocusRef?.current ?? getFocusableElements(dialogRef.current)[0];
      firstFocusableElement?.focus({ preventScroll: true });
    }, 0);

    return () => {
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.right = previousBodyStyle.right;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      documentElement.style.overflow = previousDocumentOverflow;
      documentElement.classList.remove('qs-modal-open');
      window.scrollTo(scrollX, scrollY);

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

  return createPortal(
    <div
      className="qs-viewport-modal fixed inset-0 flex items-end justify-center bg-black/45 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className="qs-filter-drawer qs-glass w-full max-w-4xl overflow-hidden rounded-t-2xl border shadow-panel sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
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
