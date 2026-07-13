import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import type { CollectionViewMode } from '../config/collection';
import type { GameCollectionType } from '../types/game';

export type CollectionDetailAnchor = {
  requestId?: number;
  collectionType?: GameCollectionType;
  collectionKey?: string;
  viewMode?: CollectionViewMode;
  gameId: string;
  itemIndex: number;
  previousGameId?: string;
  nextGameId?: string;
  virtualIndex: number;
  itemSize: number;
  columns: number;
  axis: 'horizontal' | 'vertical';
  cardOffset: number;
  scrollOffset: number;
  virtualizerOffset: number;
};

type CaptureCollectionAnchorOptions = {
  axis: CollectionDetailAnchor['axis'];
  columns: number;
  gameId: string;
  itemIndex: number;
  itemSize: number;
  scrollElement: HTMLElement | null;
  virtualIndex: number;
  virtualizerElement: HTMLElement | null;
};

export function captureCollectionDetailAnchor(options: CaptureCollectionAnchorOptions): CollectionDetailAnchor {
  const { axis, columns, gameId, itemIndex, itemSize, scrollElement, virtualIndex, virtualizerElement } = options;
  const card = scrollElement?.querySelector<HTMLElement>(`[data-game-id="${escapeSelectorValue(gameId)}"]`) ?? null;
  const scrollRect = scrollElement?.getBoundingClientRect();
  const cardRect = card?.getBoundingClientRect();
  const scrollOffset = axis === 'horizontal' ? scrollElement?.scrollLeft ?? 0 : scrollElement?.scrollTop ?? 0;
  const cardOffset = axis === 'horizontal'
    ? (cardRect?.left ?? scrollRect?.left ?? 0) - (scrollRect?.left ?? 0)
    : (cardRect?.top ?? scrollRect?.top ?? 0) - (scrollRect?.top ?? 0);
  const virtualizerRect = virtualizerElement?.getBoundingClientRect();
  const virtualizerOffset = axis === 'horizontal'
    ? (virtualizerRect?.left ?? scrollRect?.left ?? 0) - (scrollRect?.left ?? 0) + scrollOffset
    : (virtualizerRect?.top ?? scrollRect?.top ?? 0) - (scrollRect?.top ?? 0) + scrollOffset;

  return {
    gameId,
    itemIndex,
    virtualIndex,
    itemSize,
    columns,
    axis,
    cardOffset,
    scrollOffset,
    virtualizerOffset,
  };
}

export function resolveCollectionRestorationIndex(anchor: CollectionDetailAnchor, gameIds: string[]): number {
  const exactIndex = gameIds.indexOf(anchor.gameId);
  if (exactIndex >= 0) return exactIndex;
  const previousIndex = anchor.previousGameId ? gameIds.indexOf(anchor.previousGameId) : -1;
  if (previousIndex >= 0) return previousIndex;
  const nextIndex = anchor.nextGameId ? gameIds.indexOf(anchor.nextGameId) : -1;
  if (nextIndex >= 0) return nextIndex;
  return gameIds.length === 0 ? -1 : Math.min(Math.max(0, anchor.itemIndex), gameIds.length - 1);
}

type UseCollectionAnchorRestorationOptions = {
  anchor?: CollectionDetailAnchor | null;
  axis: CollectionDetailAnchor['axis'];
  collectionKey: string;
  columns: number;
  gameIds: string[];
  itemSize: number;
  onComplete?: (requestId: number) => void;
  scrollElementRef: RefObject<HTMLElement | null>;
  virtualizerRef: RefObject<HTMLElement | null>;
};

const restorationTolerancePx = 1;

export function useCollectionAnchorRestoration({
  anchor,
  axis,
  collectionKey,
  columns,
  gameIds,
  itemSize,
  onComplete,
  scrollElementRef,
  virtualizerRef,
}: UseCollectionAnchorRestorationOptions): void {
  useLayoutEffect(() => {
    if (!anchor || anchor.requestId == null || anchor.axis !== axis) return undefined;
    const scrollElement = scrollElementRef.current;
    if (!scrollElement) return undefined;
    const targetIndex = resolveCollectionRestorationIndex(anchor, gameIds);
    if (targetIndex < 0) {
      onComplete?.(anchor.requestId);
      return undefined;
    }

    const targetGameId = gameIds[targetIndex];
    const targetVirtualIndex = axis === 'horizontal' ? targetIndex : Math.floor(targetIndex / Math.max(1, columns));
    const sameView = anchor.collectionKey === collectionKey && anchor.columns === columns;
    const estimatedOffset = sameView
      ? anchor.scrollOffset
      : anchor.virtualizerOffset + targetVirtualIndex * itemSize - anchor.cardOffset;
    setScrollOffset(scrollElement, axis, Math.max(0, estimatedOffset));

    let animationFrame = 0;
    let stableFrames = 0;
    let attempts = 0;
    let cancelled = false;

    const settle = () => {
      if (cancelled) return;
      attempts += 1;
      const card = scrollElement.querySelector<HTMLElement>(`[data-game-id="${escapeSelectorValue(targetGameId)}"]`);
      if (!card) {
        setScrollOffset(scrollElement, axis, Math.max(0, anchor.virtualizerOffset + targetVirtualIndex * itemSize - anchor.cardOffset));
        if (attempts < 45) animationFrame = window.requestAnimationFrame(settle);
        else onComplete?.(anchor.requestId as number);
        return;
      }

      const cardRect = card.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const currentOffset = axis === 'horizontal' ? cardRect.left - scrollRect.left : cardRect.top - scrollRect.top;
      const delta = currentOffset - anchor.cardOffset;
      if (Math.abs(delta) > restorationTolerancePx) {
        addScrollOffset(scrollElement, axis, delta);
        stableFrames = 0;
      } else {
        stableFrames += 1;
      }

      if (stableFrames >= 3 || attempts >= 45) {
        card.focus({ preventScroll: true });
        onComplete?.(anchor.requestId as number);
        return;
      }
      animationFrame = window.requestAnimationFrame(settle);
    };

    animationFrame = window.requestAnimationFrame(settle);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [anchor, axis, collectionKey, columns, gameIds, itemSize, onComplete, scrollElementRef, virtualizerRef]);
}

function setScrollOffset(element: HTMLElement, axis: CollectionDetailAnchor['axis'], value: number): void {
  if (axis === 'horizontal') element.scrollTo({ left: value, behavior: 'auto' });
  else element.scrollTo({ top: value, behavior: 'auto' });
}

function addScrollOffset(element: HTMLElement, axis: CollectionDetailAnchor['axis'], delta: number): void {
  if (axis === 'horizontal') element.scrollTo({ left: element.scrollLeft + delta, behavior: 'auto' });
  else element.scrollTo({ top: element.scrollTop + delta, behavior: 'auto' });
}

function escapeSelectorValue(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
