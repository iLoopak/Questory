import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendDiscoveryInboxRecommendations, deferDiscoveryInboxItemForFutureSession, removeDiscoveryInboxItemForSession, restoreDeferredDiscoveryInboxItem, startDiscoveryInboxRun, type DiscoveryInboxItem } from '../src/lib/discoveryInboxStorage';

function makeItem(id: string, rawgId: number): DiscoveryInboxItem {
  return {
    id,
    rawgId,
    createdAt: rawgId,
    source: 'recommendation',
    reason: 'Recommended for testing',
    game: {
      rawgId,
      title: id,
      coverUrl: null,
      released: null,
      genres: [],
      platforms: [],
      metacritic: null,
      tags: [],
      slug: null,
      hasSteamVersion: false,
    },
  };
}

test('skipping a Discovery Inbox item removes it without appending it to the active queue', () => {
  const items = [makeItem('A', 1), makeItem('B', 2), makeItem('C', 3), makeItem('D', 4), makeItem('E', 5)];

  const afterFirstSkip = removeDiscoveryInboxItemForSession(items, 'B');
  const afterSecondSkip = removeDiscoveryInboxItemForSession(afterFirstSkip, 'D');

  assert.deepEqual(afterFirstSkip.map((item) => item.id), ['A', 'C', 'D', 'E']);
  assert.deepEqual(afterSecondSkip.map((item) => item.id), ['A', 'C', 'E']);
});

test('skipping the final Discovery Inbox item exhausts the active queue', () => {
  const items = [makeItem('B', 2)];

  assert.deepEqual(removeDiscoveryInboxItemForSession(items, 'B'), []);
});


test('skipping a Discovery Inbox item persists it in the next queue', () => {
  const state = {
    activeQueue: [makeItem('A', 1), makeItem('B', 2), makeItem('C', 3)],
    nextQueue: [makeItem('old-skip', 9)],
  };

  const updated = deferDiscoveryInboxItemForFutureSession(state, 'B');

  assert.deepEqual(updated.activeQueue.map((item) => item.id), ['A', 'C']);
  assert.deepEqual(updated.nextQueue.map((item) => item.id), ['old-skip', 'B']);
});

test('restoring a deferred Discovery Inbox item moves it into the next active queue', () => {
  const deferredItem = makeItem('B', 2);
  const state = {
    activeQueue: [makeItem('A', 1), makeItem('C', 3)],
    nextQueue: [deferredItem],
  };

  const updated = restoreDeferredDiscoveryInboxItem(state, 2);

  assert.deepEqual(updated.activeQueue.map((item) => item.id), ['A', 'C', 'B']);
  assert.deepEqual(updated.nextQueue, []);
});


test('starting a new Discovery Inbox run promotes the explicit next queue', () => {
  const state = {
    activeQueue: [],
    nextQueue: [makeItem('B', 2), makeItem('D', 4)],
  };

  const updated = startDiscoveryInboxRun(state);

  assert.deepEqual(updated.activeQueue.map((item) => item.id), ['B', 'D']);
  assert.deepEqual(updated.nextQueue, []);
});

test('starting a run does not merge skipped games into an unfinished active queue', () => {
  const state = {
    activeQueue: [makeItem('A', 1), makeItem('C', 3)],
    nextQueue: [makeItem('B', 2)],
  };

  assert.equal(startDiscoveryInboxRun(state), state);
});


test('appending recommendations creates an active queue when the inbox is empty', () => {
  const recs = Array.from({ length: 12 }, (_, i) => ({ game: makeItem(`R${i + 1}`, i + 1).game }));

  const updated = appendDiscoveryInboxRecommendations({ activeQueue: [], nextQueue: [] }, recs.slice(0, 10));

  assert.equal(updated.addedItems.length, 10);
  assert.deepEqual(updated.state.activeQueue.map((item) => item.rawgId), [1,2,3,4,5,6,7,8,9,10]);
});

test('appending recommendations preserves existing active queue order', () => {
  const state = { activeQueue: [makeItem('A', 1), makeItem('B', 2)], nextQueue: [] };

  const updated = appendDiscoveryInboxRecommendations(state, [3,4].map((id) => ({ game: makeItem(`R${id}`, id).game })));

  assert.deepEqual(updated.state.activeQueue.map((item) => item.rawgId), [1,2,3,4]);
});

test('appending recommendations keeps pending skipped games first for the next run', () => {
  const state = { activeQueue: [], nextQueue: [makeItem('skip', 9)] };

  const updated = appendDiscoveryInboxRecommendations(state, [10,11].map((id) => ({ game: makeItem(`R${id}`, id).game })));

  assert.deepEqual(updated.state.activeQueue, []);
  assert.deepEqual(updated.state.nextQueue.map((item) => item.rawgId), [9,10,11]);
});

test('appending recommendations filters duplicate stable identities', () => {
  const duplicateTitle = makeItem('duplicate-title', 0).game;
  duplicateTitle.title = 'Same Game';
  duplicateTitle.platforms = ['PC'];
  const duplicateTitleAgain = { ...duplicateTitle, rawgId: 0, title: ' same   game ', platforms: ['PC'] };

  const updated = appendDiscoveryInboxRecommendations(
    { activeQueue: [makeItem('A', 1)], nextQueue: [makeItem('B', 2)] },
    [{ game: makeItem('A duplicate', 1).game }, { game: makeItem('B duplicate', 2).game }, { game: duplicateTitle }, { game: duplicateTitleAgain }],
  );

  assert.deepEqual(updated.state.activeQueue.map((item) => item.game.title), ['A', 'Same Game']);
  assert.equal(updated.addedItems.length, 1);
});

test('appending recommendations adds fewer than ten when only fewer valid games are supplied', () => {
  const updated = appendDiscoveryInboxRecommendations({ activeQueue: [], nextQueue: [] }, [1,2,3,3].map((id) => ({ game: makeItem(`R${id}`, id).game })));

  assert.equal(updated.addedItems.length, 3);
  assert.deepEqual(updated.state.activeQueue.map((item) => item.rawgId), [1,2,3]);
});
