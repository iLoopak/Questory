import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { useFocusTrap } from '../../hooks/useFocusTrap';

type FullscreenGameShellProps = {
  ariaLabel: string;
  children: ReactNode;
  /** Rendered as a direct child of the fullscreen root, outside the scroll
   * column — for absolutely positioned decorations like the queue ghost. */
  floating?: ReactNode;
  onClose: () => void;
  /** Attached to the dialog root; lets callers re-anchor focus when the shown
   * game changes in place (recommendation carousel). */
  dialogRef?: RefObject<HTMLDivElement | null>;
  /** Attached to the scroll container so callers can reset scroll position. */
  scrollRef?: RefObject<HTMLDivElement | null>;
};

/**
 * Shared fullscreen presentation for the Game page — Discovery Preview and
 * the Library Game Hub are two modes of this one shell, so they read as the
 * same focused experience. Covers the app shell (hiding the main navigation)
 * and owns the scroll container, scroll lock, focus trap/restoration and
 * Escape-to-back. Inner dialogs that handle Escape themselves must stop
 * propagation, as ViewportModal already does.
 */
export function FullscreenGameShell({ ariaLabel, children, floating, onClose, dialogRef, scrollRef }: FullscreenGameShellProps) {
  const localDialogRef = useRef<HTMLDivElement | null>(null);
  const resolvedDialogRef = dialogRef ?? localDialogRef;

  useScrollLock();
  const { handleTrapKeyDown } = useFocusTrap(resolvedDialogRef);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    handleTrapKeyDown(event);
  }

  return (
    <div
      ref={resolvedDialogRef}
      aria-label={ariaLabel}
      aria-modal="true"
      className="fixed inset-0 z-50 bg-ink-950"
      onKeyDown={handleKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      {floating}
      <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
        <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">{children}</div>
      </div>
    </div>
  );
}
