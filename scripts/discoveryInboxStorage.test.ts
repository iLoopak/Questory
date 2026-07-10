import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removeDiscoveryInboxItemForSession, type DiscoveryInboxItem } from '../src/lib/discoveryInboxStorage';

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
