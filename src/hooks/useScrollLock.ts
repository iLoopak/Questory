import { useEffect } from 'react';

/**
 * Prevents document-level scroll while a modal or overlay is mounted.
 *
 * Previous implementation used `body.style.position = 'fixed'` with
 * `window.scrollTo()` on cleanup (the "fixed-body" technique). That approach
 * is designed for apps where the *window* is the scroll container. In
 * QuestShelf the window never scrolls — all scrolling happens inside the inner
 * `.qs-game-list-shell` / `.qs-content-panel` element. Fixing the body on
 * Android WebView interrupts the WebView's native momentum/fling state for
 * inner scroll containers, and the subsequent `window.scrollTo(0, 0)` call in
 * cleanup triggers a compositing cycle that prevents the browser from resuming
 * scroll momentum — causing the "sticky scroll" bug after card actions.
 *
 * Replacement: set `overflow: hidden` on both `<html>` and `<body>` only.
 * - Does not touch `position` or `top` — inner container scroll state is
 *   completely undisturbed.
 * - Does not call `window.scrollTo()` on cleanup.
 * - Background touch events are already blocked by the overlay backdrop's
 *   `touch-action: none` + `z-index`; wheel events from a portal-rendered
 *   backdrop do not propagate to the inner scroll container because the
 *   container is not an ancestor of the portal.
 *
 * Safe to nest: each mount captures current overflow and restores on unmount,
 * so correctly stacked overlays work (outer lock active while inner is also
 * active, outer restores last).
 *
 * TODO: remove console.debug lines once scroll stability is confirmed.
 */

const SCROLL_CONTAINER_SELECTOR = '.qs-game-list-shell, .qs-content-panel, .qs-queue-shell';

function findActiveScrollContainer(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(SCROLL_CONTAINER_SELECTOR));
  return candidates.find((el) => el.scrollTop > 0) ?? candidates[0] ?? null;
}

export function useScrollLock() {
  useEffect(() => {
    const { body, documentElement } = document;
    const container = findActiveScrollContainer();

    console.debug('[useScrollLock] mount', {
      windowScrollY: window.scrollY,
      activeContainer: container?.classList[0] ?? '(none)',
      containerScrollTop: container?.scrollTop ?? 0,
    });

    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;

      console.debug('[useScrollLock] cleanup', {
        windowScrollY: window.scrollY,
        activeContainer: container?.classList[0] ?? '(none)',
        containerScrollTop: container?.scrollTop ?? 0,
      });
    };
  }, []);
}
