import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

type BottomSheetDragOptions = {
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type DragState = {
  pointerId: number;
  startY: number;
  lastDeltaY: number;
};

export function useBottomSheetDragToClose({ panelRef, onClose }: BottomSheetDragOptions) {
  const dragStateRef = useRef<DragState | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  function releasePointerCapture(element: HTMLElement, pointerId: number) {
    if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastDeltaY: 0,
    };
    setDragOffsetY(0);

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaY = Math.max(0, event.clientY - dragState.startY);
    dragState.lastDeltaY = deltaY;
    setDragOffsetY(deltaY);

    if (deltaY > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    releasePointerCapture(event.currentTarget, event.pointerId);
    dragStateRef.current = null;

    const drawerHeight = panelRef.current?.getBoundingClientRect().height ?? window.visualViewport?.height ?? window.innerHeight;
    const closeThreshold = Math.min(120, drawerHeight * 0.25);

    if (dragState.lastDeltaY > closeThreshold) {
      onClose();
      return;
    }

    setDragOffsetY(0);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      releasePointerCapture(event.currentTarget, event.pointerId);
      dragStateRef.current = null;
      setDragOffsetY(0);
    }
  }

  const dragStyle: CSSProperties = dragOffsetY > 0
    ? { transform: `translate3d(0, ${dragOffsetY}px, 0)`, transition: 'none' }
    : { transform: undefined };

  return {
    dragHandleProps: {
      onPointerCancel: cancelDrag,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
    },
    dragStyle,
  };
}
