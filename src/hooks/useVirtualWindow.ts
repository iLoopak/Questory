import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';

export type VirtualRange = {
  startIndex: number;
  endIndex: number;
  visibleStartIndex: number;
  visibleEndIndex: number;
  renderedCount: number;
  offsetBefore: number;
  offsetAfter: number;
  totalSize: number;
  viewportSize: number;
};

export type VirtualWindowOptions = {
  itemCount: number;
  estimateItemSize: number;
  overscan?: number;
  horizontal?: boolean;
  scrollElementRef?: RefObject<HTMLElement | null>;
  virtualizerRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
};

const defaultOverscan = 3;

export function useVirtualWindow({
  itemCount,
  estimateItemSize,
  overscan = defaultOverscan,
  horizontal = false,
  scrollElementRef,
  virtualizerRef,
  enabled = true,
}: VirtualWindowOptions) {
  const [metrics, setMetrics] = useState({ scrollOffset: 0, viewportSize: 0 });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return undefined;
    }

    let animationFrame = 0;

    function getScrollElement() {
      return scrollElementRef?.current ?? null;
    }

    function measure() {
      const scrollElement = getScrollElement();
      const nextViewportSize = horizontal
        ? scrollElement?.clientWidth ?? window.innerWidth
        : scrollElement?.clientHeight ?? window.innerHeight;
      const rawScrollOffset = horizontal
        ? scrollElement?.scrollLeft ?? window.scrollX
        : scrollElement?.scrollTop ?? window.scrollY;
      let itemOffset = 0;

      if (!horizontal && virtualizerRef?.current) {
        if (scrollElement) {
          const itemRect = virtualizerRef.current.getBoundingClientRect();
          const scrollRect = scrollElement.getBoundingClientRect();
          itemOffset = itemRect.top - scrollRect.top + scrollElement.scrollTop;
        } else {
          itemOffset = virtualizerRef.current.getBoundingClientRect().top + window.scrollY;
        }
      }

      const nextScrollOffset = Math.max(0, rawScrollOffset - itemOffset);
      const safeItemSize = Math.max(1, estimateItemSize);

      setMetrics((currentMetrics) => {
        const currentVisibleStart = Math.floor(currentMetrics.scrollOffset / safeItemSize);
        const nextVisibleStart = Math.floor(nextScrollOffset / safeItemSize);
        const currentVisibleEnd = Math.ceil((currentMetrics.scrollOffset + currentMetrics.viewportSize) / safeItemSize);
        const nextVisibleEnd = Math.ceil((nextScrollOffset + nextViewportSize) / safeItemSize);

        if (
          currentMetrics.viewportSize === nextViewportSize &&
          currentVisibleStart === nextVisibleStart &&
          currentVisibleEnd === nextVisibleEnd
        ) {
          return currentMetrics;
        }

        return { scrollOffset: nextScrollOffset, viewportSize: nextViewportSize };
      });
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    }

    const scrollElement = getScrollElement();
    measure();
    scrollElement?.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      scrollElement?.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
    };
  }, [enabled, estimateItemSize, horizontal, scrollElementRef, virtualizerRef]);

  return useMemo<VirtualRange>(() => {
    if (!enabled || itemCount === 0) {
      return {
        startIndex: 0,
        endIndex: Math.max(0, itemCount - 1),
        visibleStartIndex: 0,
        visibleEndIndex: Math.max(0, itemCount - 1),
        renderedCount: itemCount,
        offsetBefore: 0,
        offsetAfter: 0,
        totalSize: itemCount * estimateItemSize,
        viewportSize: metrics.viewportSize,
      };
    }

    const safeItemSize = Math.max(1, estimateItemSize);
    const visibleStartIndex = Math.min(itemCount - 1, Math.max(0, Math.floor(metrics.scrollOffset / safeItemSize)));
    const visibleEndIndex = Math.min(itemCount - 1, Math.max(visibleStartIndex, Math.ceil((metrics.scrollOffset + metrics.viewportSize) / safeItemSize) - 1));
    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(itemCount - 1, visibleEndIndex + overscan);
    const renderedCount = endIndex >= startIndex ? endIndex - startIndex + 1 : 0;
    const totalSize = itemCount * safeItemSize;
    const offsetBefore = startIndex * safeItemSize;
    const offsetAfter = Math.max(0, totalSize - offsetBefore - renderedCount * safeItemSize);

    return {
      startIndex,
      endIndex,
      visibleStartIndex,
      visibleEndIndex,
      renderedCount,
      offsetBefore,
      offsetAfter,
      totalSize,
      viewportSize: metrics.viewportSize,
    };
  }, [enabled, estimateItemSize, itemCount, metrics.scrollOffset, metrics.viewportSize, overscan]);
}
