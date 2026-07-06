import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBottomSheetDragToClose } from '../hooks/useBottomSheetDragToClose';

type ViewportModalPlacement = 'bottom-sheet' | 'center' | 'fullscreen';

type ViewportModalProps = {
  ariaLabel: string;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  placement?: ViewportModalPlacement;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

function isModalCloseKey(event: KeyboardEvent | globalThis.KeyboardEvent) {
  return event.key === 'Escape';
}

export function ViewportModal({ ariaLabel, children, initialFocusRef, onClose, placement = 'bottom-sheet', restoreFocusRef }: ViewportModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useScrollLock();
  const { handleTrapKeyDown } = useFocusTrap(dialogRef, { initialFocusRef, restoreFocusRef });

  useEffect(() => {
    const { documentElement } = document;
    documentElement.classList.add('qs-modal-open');
    return () => documentElement.classList.remove('qs-modal-open');
  }, []);

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

  const isFullscreen = placement === 'fullscreen';
  const isCentered = placement === 'center';
  const isBottomSheet = placement === 'bottom-sheet';
  const { dragHandleProps, dragStyle } = useBottomSheetDragToClose({ panelRef: dialogRef, onClose });

  if (typeof document === 'undefined') {
    return null;
  }

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
      onKeyDown={handleTrapKeyDown}
    >
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className={panelClassName}
        onClick={isFullscreen ? undefined : (event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        style={isBottomSheet ? dragStyle : undefined}
        tabIndex={-1}
      >
        {isBottomSheet ? (
          <div className="qs-sheet-drag-region flex justify-center pb-2 pt-3 sm:hidden" {...dragHandleProps}>
            <div className="qs-sheet-handle h-1.5 w-16 rounded-full bg-skyglass/35" title="Swipe down to dismiss" />
          </div>
        ) : null}
        {children}
      </section>
    </div>,
    document.body,
  );
}
