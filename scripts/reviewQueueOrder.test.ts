import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reorderSkippedGameToPendingQueueEnd } from '../src/lib/reviewQueueOrder';

test('skipping a game appends it after the full pending queue instead of the active batch', () => {
  const pendingGameIds = Array.from({ length: 25 }, (_, index) => `game-${index + 1}`);
  const activeBatch = pendingGameIds.slice(0, 20);

  const nextOrder = reorderSkippedGameToPendingQueueEnd('game-1', pendingGameIds, activeBatch);

  assert.deepEqual(nextOrder.slice(0, 24), pendingGameIds.slice(1));
  assert.equal(nextOrder.at(-1), 'game-1');
  assert.equal(new Set(nextOrder).size, nextOrder.length);
  assert.equal(nextOrder.slice(19, 24).includes('game-1'), false);
});

test('skipping multiple games keeps each skip deferred behind non-skipped pending games', () => {
  const pendingGameIds = Array.from({ length: 23 }, (_, index) => `game-${index + 1}`);
  const afterFirstSkip = reorderSkippedGameToPendingQueueEnd('game-1', pendingGameIds, pendingGameIds);
  const afterSecondSkip = reorderSkippedGameToPendingQueueEnd('game-2', afterFirstSkip, afterFirstSkip);

  assert.deepEqual(afterSecondSkip.slice(0, 21), pendingGameIds.slice(2));
  assert.deepEqual(afterSecondSkip.slice(-2), ['game-1', 'game-2']);
  assert.equal(new Set(afterSecondSkip).size, afterSecondSkip.length);
});

test('skipped-only remaining games stay eligible after non-skipped pending games are exhausted', () => {
  const nextOrder = reorderSkippedGameToPendingQueueEnd('game-20', ['game-20'], ['game-20']);

  assert.deepEqual(nextOrder, ['game-20']);
});
