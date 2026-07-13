import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContinuePlayingPreview, homeContinuePlayingPreviewLimit } from '../src/components/HomePanel';
import { initialCollectionFilters, type CollectionFilters } from '../src/config/collection';
import { openPlayingLibrary } from '../src/features/app/routes/HomeRoute';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';
import type { Game } from '../src/types/game';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { actAsync, renderComponent } from './testUtils/reactHarness';

assertTestEnvironment();

const queueState: PlatformQueueState = { activePlatforms: [], entries: [], schemaVersion: 2, settings: [] };

function makeGames(count: number): Game[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `playing-${index}`,
    title: `Playing ${String(index).padStart(3, '0')}`,
    platform: 'Steam',
    status: 'Playing',
    coverImage: '',
    playtimeHours: index,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
  }));
}

async function renderPreview(count: number) {
  resetWebStorage();
  const selected: string[] = [];
  const games = makeGames(count);
  const handle = await renderComponent(ContinuePlayingPreview, {
    games,
    onSelectGame: (game) => selected.push(game.id),
    playActivity: [],
    queueState,
  });
  const cards = [...document.querySelectorAll('[data-home-continue-playing-grid="true"] > button')];
  return { cards, games, handle, selected };
}

for (const count of [0, 1, homeContinuePlayingPreviewLimit - 1, homeContinuePlayingPreviewLimit, homeContinuePlayingPreviewLimit + 50]) {
  test(`Continue Playing mounts the bounded preview for ${count} games`, async () => {
    const { cards, handle } = await renderPreview(count);
    assert.equal(cards.length, Math.min(count, homeContinuePlayingPreviewLimit));
    await handle.unmount();
  });
}

test('Continue Playing retains the existing ordered input and keeps card actions', async () => {
  const { cards, games, handle, selected } = await renderPreview(homeContinuePlayingPreviewLimit + 5);
  assert.deepEqual(
    cards.map((card) => card.textContent?.match(/Playing \d{3}/)?.[0]),
    games.slice(0, homeContinuePlayingPreviewLimit).map((game) => game.title),
  );

  await actAsync(() => (cards[3] as HTMLButtonElement).click());
  assert.deepEqual(selected, ['playing-3']);
  await handle.unmount();
});

test('View all Playing opens Library with the Playing status filter and preserves other filters', () => {
  let filters: CollectionFilters = { ...initialCollectionFilters, platform: 'Steam', searchTerm: 'quest' };
  let selectedGameId: string | null = 'open-game';
  let activeNavItem = 'Home';

  openPlayingLibrary(
    ((updater: CollectionFilters | ((current: CollectionFilters) => CollectionFilters)) => {
      filters = typeof updater === 'function' ? updater(filters) : updater;
    }) as never,
    ((id: string | null) => { selectedGameId = id; }) as never,
    ((item: string) => { activeNavItem = item; }) as never,
  );

  assert.equal(filters.status, 'Playing');
  assert.equal(filters.platform, 'Steam');
  assert.equal(filters.searchTerm, 'quest');
  assert.equal(selectedGameId, null);
  assert.equal(activeNavItem, 'Library');
});
