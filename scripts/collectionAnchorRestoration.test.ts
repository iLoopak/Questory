import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actAsync, renderHook } from './testUtils/reactHarness';
import {
  captureCollectionDetailAnchor,
  resolveCollectionRestorationIndex,
  useCollectionAnchorRestoration,
  type CollectionDetailAnchor,
} from '../src/hooks/useCollectionAnchorRestoration';

const baseAnchor: CollectionDetailAnchor = {
  requestId: 1,
  collectionType: 'library',
  collectionKey: 'library:grid',
  viewMode: 'Grid View',
  gameId: 'game-5',
  itemIndex: 5,
  previousGameId: 'game-4',
  nextGameId: 'game-6',
  virtualIndex: 2,
  itemSize: 200,
  columns: 2,
  axis: 'vertical',
  cardOffset: 100,
  scrollOffset: 900,
  virtualizerOffset: 0,
};

test('restoration target is exact, then previous, next, retained index, then empty', () => {
  assert.equal(resolveCollectionRestorationIndex(baseAnchor, ['game-4', 'game-5', 'game-6']), 1);
  assert.equal(resolveCollectionRestorationIndex(baseAnchor, ['game-4', 'game-6']), 0);
  assert.equal(resolveCollectionRestorationIndex({ ...baseAnchor, previousGameId: undefined }, ['game-6']), 0);
  assert.equal(resolveCollectionRestorationIndex({ ...baseAnchor, previousGameId: undefined, nextGameId: undefined }, ['a', 'b', 'c']), 2);
  assert.equal(resolveCollectionRestorationIndex(baseAnchor, []), -1);
});

for (const collectionType of ['library', 'wishlist'] as const) {
  for (const itemIndex of [0, 50, 99]) {
    test(`${collectionType} restores the logical item at index ${itemIndex}`, () => {
      const gameIds = Array.from({ length: 100 }, (_, index) => `${collectionType}-${index}`);
      const anchor = { ...baseAnchor, collectionType, gameId: gameIds[itemIndex], itemIndex };
      assert.equal(resolveCollectionRestorationIndex(anchor, gameIds), itemIndex);
    });
  }
}

test('capture records logical index, visual offset and scroll geometry', () => {
  const scrollElement = document.createElement('div');
  const virtualizer = document.createElement('div');
  const card = document.createElement('button');
  card.dataset.gameId = 'game-5';
  virtualizer.appendChild(card);
  scrollElement.appendChild(virtualizer);
  scrollElement.scrollTop = 900;
  scrollElement.getBoundingClientRect = () => ({ top: 10 } as DOMRect);
  virtualizer.getBoundingClientRect = () => ({ top: -890 } as DOMRect);
  card.getBoundingClientRect = () => ({ top: 110 } as DOMRect);

  const captured = captureCollectionDetailAnchor({ axis: 'vertical', columns: 2, gameId: 'game-5', itemIndex: 5, itemSize: 200, scrollElement, virtualIndex: 2, virtualizerElement: virtualizer });
  assert.equal(captured.cardOffset, 100);
  assert.equal(captured.scrollOffset, 900);
  assert.equal(captured.virtualizerOffset, 0);
});

test('detail return restores the same visual offset and focuses without a second scroll', async () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 0);
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);

  const scrollElement = document.createElement('div');
  const virtualizer = document.createElement('div');
  const card = document.createElement('button');
  card.dataset.gameId = 'game-5';
  virtualizer.appendChild(card);
  scrollElement.appendChild(virtualizer);
  document.body.appendChild(scrollElement);
  scrollElement.scrollTop = 780;
  scrollElement.scrollTo = ({ top }: ScrollToOptions) => { if (typeof top === 'number') scrollElement.scrollTop = top; };
  scrollElement.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
  virtualizer.getBoundingClientRect = () => ({ top: -scrollElement.scrollTop } as DOMRect);
  let geometryReads = 0;
  card.getBoundingClientRect = () => {
    geometryReads += 1;
    const delayedGeometryAdjustment = geometryReads < 3 ? 8 : 0;
    return { top: 1000 - scrollElement.scrollTop + delayedGeometryAdjustment } as DOMRect;
  };
  let focusOptions: FocusOptions | undefined;
  card.focus = (options?: FocusOptions) => { focusOptions = options; };
  const completed: number[] = [];
  const gameIds = ['game-0', 'game-1', 'game-2', 'game-3', 'game-4', 'game-5', 'game-6'];
  const handle = await renderHook(
    () => useCollectionAnchorRestoration({
      anchor: baseAnchor,
      axis: 'vertical',
      collectionKey: 'library:grid',
      columns: 2,
      gameIds,
      itemSize: 200,
      onComplete: (requestId) => completed.push(requestId),
      scrollElementRef: { current: scrollElement },
      virtualizerRef: { current: virtualizer },
    }),
    undefined,
  );
  await actAsync(() => new Promise((resolve) => setTimeout(resolve, 100)));

  assert.ok(Math.abs(scrollElement.scrollTop - 900) <= 1);
  assert.deepEqual(focusOptions, { preventScroll: true });
  assert.deepEqual(completed, [1]);
  const settledScroll = scrollElement.scrollTop;
  await actAsync(() => new Promise((resolve) => setTimeout(resolve, 10)));
  assert.equal(scrollElement.scrollTop, settledScroll, 'focus does not cause a second jump');

  await handle.unmount();
  scrollElement.remove();
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
});

test('responsive column changes use the current virtual row while preserving the anchor offset', () => {
  const changed = { ...baseAnchor, collectionKey: 'old', columns: 4, itemIndex: 8, gameId: 'game-8', cardOffset: 75, virtualizerOffset: 50 };
  const currentIndex = resolveCollectionRestorationIndex(changed, Array.from({ length: 12 }, (_, index) => `game-${index}`));
  const currentVirtualIndex = Math.floor(currentIndex / 2);
  const estimatedScroll = changed.virtualizerOffset + currentVirtualIndex * 200 - changed.cardOffset;
  assert.equal(estimatedScroll, 775);
});

test('an unmounted collection cancels a pending restoration', async () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 20);
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
  const scrollElement = document.createElement('div');
  scrollElement.scrollTo = () => {};
  const completed: number[] = [];
  const handle = await renderHook(
    () => useCollectionAnchorRestoration({
      anchor: baseAnchor,
      axis: 'vertical',
      collectionKey: 'library:grid',
      columns: 2,
      gameIds: ['game-5'],
      itemSize: 200,
      onComplete: (requestId) => completed.push(requestId),
      scrollElementRef: { current: scrollElement },
      virtualizerRef: { current: scrollElement },
    }),
    undefined,
  );
  await handle.unmount();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(completed, []);
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
});
