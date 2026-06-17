import { useEffect } from 'react';

/**
 * Locks body scroll while the calling component is mounted.
 * Uses the same fixed-position technique as ViewportModal so scroll position
 * is preserved even when window.scrollY is non-zero.
 * Safe to nest: each mount captures the current body state and restores it
 * on unmount, so multiple overlays stacking/unstacking work correctly.
 */
export function useScrollLock() {
  useEffect(() => {
    const { body, documentElement } = document;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
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

    return () => {
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.right = previousBodyStyle.right;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      documentElement.style.overflow = previousDocumentOverflow;
      window.scrollTo(scrollX, scrollY);
    };
  }, []);
}
