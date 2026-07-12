/**
 * AS-09 — the promotion command and Inbox reconciliation, driven through the real hooks.
 *
 * The pure decision is covered in `discoveryPromotion.test.ts`. What matters here is the part that
 * only shows up with React state in play: the command must read the LATEST canonical games (not the
 * snapshot the preview closed over), must not create two records when it is invoked twice before a
 * re-render, must hand Platform Plans a persisted id or nothing at all, and must leave the Inbox
 * reconciled against whatever the library now contains.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame, makeWishlistGame } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import { addGameToPlatformQueue, getVisiblePlatformQueueEntries, normalizePlatformQueueState } from '../src/lib/platformQueueStorage';
import {
  discoveryInboxStorageKey,
  loadDiscoveryInboxState,
  reconcileDiscoveryInboxState,
  saveDiscoveryInboxState,
  type DiscoveryInboxItem,
  type DiscoveryInboxState,
} from '../src/lib/discoveryInboxStorage';
import type { DiscoveryGame } from '../src/lib/discovery';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { useDiscoveryPromotion } = await import('../src/features/app/useDiscoveryPromotion');
const { useDiscoveryController } = await import('../src/features/app/useDiscoveryController');

const now = () => new Date('2026-07-12T10:00:00.000Z');

function makeCandidate(overrides: Partial<DiscoveryGame> = {}): DiscoveryGame {
  return {
    rawgId: 3498,
    title: 'Bloodborne',
    coverUrl: null,
    metacritic: 92,
    platforms: ['PS4'],
    hasSteamVersion: false,
    genres: ['Action'],
    tags: ['souls-like'],
    released: '2015-03-24',
    slug: 'bloodborne',
    ...overrides,
  };
}

/**
 * A miniature games owner: the same contract the AppController gives the command (an `importGames`
 * that rejects duplicates and returns only what it created, a wishlist copier, a collection move),
 * so the hook is exercised against realistic collaborators rather than spies that always succeed.
 */
function createGamesOwner(initialGames: Game[] = []) {
  let games = initialGames;
  const owner = {
    get games() {
      return games;
    },
    /** Mirrors AppController.importGames: a manual RAWG duplicate of a Library game is rejected. */
    importGames(importedGames: Game[]): Game[] {
      const existingLibraryRawgIds = new Set(
        games.filter((game) => game.collectionType === 'library').map((game) => game.rawgId),
      );
      const created = importedGames.filter(
        (game) => !(game.externalSource === 'manual' && existingLibraryRawgIds.has(game.rawgId)),
      );
      games = [...games, ...created];
      return created;
    },
    addToWishlist(game: Game): string {
      const existing = games.find(
        (current) => current.collectionType === 'wishlist' && current.rawgId === game.rawgId,
      );
      if (existing) return existing.id;

      const copy: Game = { ...game, id: `wishlist-${game.id}`, collectionType: 'wishlist', status: 'Want to play' };
      games = [...games, copy];
      return copy.id;
    },
    moveWishlistToLibrary(game: Game) {
      games = games.map((current) =>
        current.id === game.id ? { ...current, collectionType: 'library' as const, status: 'Want to play' as const } : current,
      );
    },
  };

  return owner;
}

async function renderPromotion(initialGames: Game[] = []) {
  const owner = createGamesOwner(initialGames);
  const handle = await renderHook(
    (games: Game[]) =>
      useDiscoveryPromotion({
        games,
        importGames: (importedGames) => owner.importGames(importedGames),
        addToWishlist: (game) => owner.addToWishlist(game),
        moveWishlistToLibrary: (game) => owner.moveWishlistToLibrary(game),
        now,
      }),
    owner.games,
  );

  return {
    owner,
    promote: (candidate: DiscoveryGame, destination: 'library' | 'wishlist' | 'plans') =>
      handle.current.promoteDiscoveryCandidate({ candidate, destination }),
    /** Commit the owner's writes back into the hook's props, as a React re-render would. */
    settle: () => handle.rerender(owner.games),
    unmount: handle.unmount,
  };
}

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

test('AS-09: a new candidate is added to the Library exactly once, with its real platform and tags', async () => {
  const harness = await renderPromotion();

  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'library');
  });

  assert.equal(result.outcome, 'created');
  assert.equal(harness.owner.games.length, 1);
  const [created] = harness.owner.games;
  assert.equal(created.id, result.gameId);
  assert.equal(created.platform, 'PS4', 'not PC');
  assert.deepEqual(created.tags, ['souls-like']);

  await harness.unmount();
});

test('AS-09: promoting a game that is already owned reuses the record instead of duplicating it', async () => {
  const owned = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const harness = await renderPromotion([owned]);

  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'library');
  });

  assert.equal(result.outcome, 'already-present');
  assert.equal(result.gameId, 'lib-1');
  assert.equal(harness.owner.games.length, 1, 'no second record');

  await harness.unmount();
});

test('AS-09: wishlisting an owned game keeps the Library record and creates the twin', async () => {
  const owned = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const harness = await renderPromotion([owned]);

  await actAsync(() => {
    harness.promote(makeCandidate(), 'wishlist');
  });

  const library = harness.owner.games.filter((game) => game.collectionType === 'library');
  const wishlist = harness.owner.games.filter((game) => game.collectionType === 'wishlist');
  assert.equal(library.length, 1, 'the owned record is untouched');
  assert.equal(library[0].id, 'lib-1');
  assert.equal(wishlist.length, 1, 'and the wishlist twin is a separate record');

  await harness.unmount();
});

test('AS-09: adding a wishlisted candidate to the Library promotes the copy in place', async () => {
  const wishlisted = makeWishlistGame({ id: 'wish-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const harness = await renderPromotion([wishlisted]);

  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'library');
  });

  assert.equal(result.outcome, 'reused', 'the record was adopted, not created — the message must not claim otherwise');
  assert.equal(result.gameId, 'wish-1');
  assert.equal(harness.owner.games.length, 1);
  assert.equal(harness.owner.games[0].collectionType, 'library');

  await harness.unmount();
});

// ---------------------------------------------------------------------------
// Platform Plans
// ---------------------------------------------------------------------------

test('AS-09: a Plan entry is written against the created canonical id, never the synthetic one', async () => {
  const harness = await renderPromotion();

  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'plans');
  });

  assert.equal(result.outcome, 'created');
  const created = harness.owner.games[0];
  assert.equal(result.gameId, created.id);

  const planState = addGameToPlatformQueue(normalizePlatformQueueState(undefined), created, 'PS5');
  assert.deepEqual(
    getVisiblePlatformQueueEntries(planState, harness.owner.games).map((entry) => entry.gameId),
    [created.id],
    'the entry resolves to a game that exists — no orphan',
  );

  await harness.unmount();
});

test('AS-09: adding the same candidate to Plans twice is idempotent and creates no duplicate', async () => {
  const harness = await renderPromotion();

  let first!: ReturnType<typeof harness.promote>;
  let second!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    first = harness.promote(makeCandidate(), 'plans');
  });
  await harness.settle();
  await actAsync(() => {
    second = harness.promote(makeCandidate(), 'plans');
  });

  assert.equal(second.outcome, 'already-present');
  assert.equal(second.gameId, first.gameId);
  assert.equal(harness.owner.games.length, 1);

  const target = harness.owner.games[0];
  let planState = addGameToPlatformQueue(normalizePlatformQueueState(undefined), target, 'PS5');
  planState = addGameToPlatformQueue(planState, target, 'PS5');
  assert.equal(planState.entries.length, 1, 'the Plan holds one entry for one game and platform');

  await harness.unmount();
});

test('AS-09: a rejected game creates no Plan entry', async () => {
  const harness = await renderPromotion();
  // An owner that refuses every write — a failed create must not resolve to an id.
  const failing = await renderHook(
    (games: Game[]) =>
      useDiscoveryPromotion({
        games,
        importGames: () => [],
        addToWishlist: (game) => game.id,
        moveWishlistToLibrary: () => {},
        now,
      }),
    [] as Game[],
  );

  let result!: { outcome: string; gameId?: string };
  await actAsync(() => {
    result = failing.current.promoteDiscoveryCandidate({ candidate: makeCandidate(), destination: 'plans' });
  });

  assert.equal(result.outcome, 'failed');
  assert.equal(result.gameId, undefined, 'no id means the caller has nothing to write a Plan entry against');

  await failing.unmount();
  await harness.unmount();
});

// ---------------------------------------------------------------------------
// Concurrency and latest state
// ---------------------------------------------------------------------------

test('AS-09: a game imported after the preview opened is reused, not duplicated', async () => {
  const harness = await renderPromotion();

  // The preview is open against an empty library. Meanwhile the same game is imported elsewhere.
  await actAsync(() => {
    harness.owner.importGames([
      makeLibraryGame({ id: 'steam-import-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 }),
    ]);
  });
  await harness.settle();

  // The user now clicks Add to Library in the preview they opened BEFORE the import.
  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'library');
  });

  assert.equal(result.outcome, 'already-present');
  assert.equal(result.gameId, 'steam-import-1', 'the newly imported record wins');
  assert.equal(harness.owner.games.length, 1);

  await harness.unmount();
});

test('AS-09: a metadata refresh that adds a provider id before promotion is respected', async () => {
  // The record was imported by title only; enrichment then attaches the RAWG id the candidate has.
  const enriched = makeLibraryGame({ id: 'manual-1', title: 'Some Other Title', platform: 'PS4', rawgId: 3498 });
  const harness = await renderPromotion([enriched]);

  let result!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    result = harness.promote(makeCandidate(), 'library');
  });

  assert.equal(result.gameId, 'manual-1', 'the provider id identifies the record even though the titles differ');
  assert.equal(harness.owner.games.length, 1);

  await harness.unmount();
});

test('AS-09: two promotions racing in the same tick create only one record', async () => {
  const harness = await renderPromotion();

  // Both clicks land before React re-renders the command with the new games array.
  await actAsync(() => {
    harness.promote(makeCandidate(), 'library');
    harness.promote(makeCandidate(), 'library');
  });

  assert.equal(harness.owner.games.length, 1, 'the second promotion sees the record the first one just created');

  await harness.unmount();
});

// ---------------------------------------------------------------------------
// Inbox reconciliation
// ---------------------------------------------------------------------------

function makeInboxItem(overrides: Partial<DiscoveryInboxItem> = {}): DiscoveryInboxItem {
  const game = overrides.game ?? makeCandidate();
  return {
    id: `inbox-${game.rawgId}`,
    rawgId: game.rawgId,
    game,
    source: 'recommendation',
    reason: 'Because you liked Dark Souls',
    createdAt: 1,
    ...overrides,
  };
}

const seedInbox = (state: DiscoveryInboxState) => {
  resetWebStorage();
  saveDiscoveryInboxState(state);
};

async function renderInbox(games: Game[]) {
  const toasts: string[] = [];
  const handle = await renderHook(
    (currentGames: Game[]) =>
      useDiscoveryController({
        games: currentGames,
        t: ((key: string) => key) as never,
        addToastNotification: (notification) => {
          toasts.push(notification.message);
        },
      }),
    games,
  );

  return handle;
}

test('AS-09: a candidate imported elsewhere leaves the Inbox', async () => {
  const stale = makeInboxItem();
  const unrelated = makeInboxItem({ game: makeCandidate({ rawgId: 999, title: 'Hades', platforms: ['PC'] }) });
  seedInbox({ activeQueue: [stale, unrelated], nextQueue: [] });

  const imported = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 });
  const handle = await renderInbox([imported]);

  assert.deepEqual(handle.current.inboxItems.map((item) => item.rawgId), [999], 'the resolved candidate is gone');
  assert.deepEqual(
    loadDiscoveryInboxState().activeQueue.map((item) => item.rawgId),
    [999],
    'and the reconciliation is persisted',
  );

  await handle.unmount();
});

test('AS-09: reconciliation preserves the Skip/defer queue and the order of unrelated items', async () => {
  const skipped = makeInboxItem({ id: 'skipped', game: makeCandidate({ rawgId: 7, title: 'Skipped Game' }) });
  const resolved = makeInboxItem();
  const first = makeInboxItem({ id: 'a', game: makeCandidate({ rawgId: 101, title: 'A Game' }) });
  const second = makeInboxItem({ id: 'b', game: makeCandidate({ rawgId: 102, title: 'B Game' }) });
  seedInbox({ activeQueue: [first, resolved, second], nextQueue: [skipped] });

  const handle = await renderInbox([makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'PS4', rawgId: 3498 })]);

  assert.deepEqual(handle.current.inboxItems.map((item) => item.id), ['a', 'b'], 'unrelated items keep their order');
  assert.deepEqual(loadDiscoveryInboxState().nextQueue.map((item) => item.id), ['skipped'], 'the deferred item survives');

  await handle.unmount();
});

test('AS-09: promoting from the Inbox reconciles the matching item and cannot be repeated into a duplicate', async () => {
  seedInbox({ activeQueue: [makeInboxItem()], nextQueue: [] });
  const harness = await renderPromotion();

  let first!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    first = harness.promote(makeCandidate(), 'library');
  });
  await harness.settle();

  // The Inbox item is stale from this moment on: reconciliation against the new library drops it.
  const reconciled = reconcileDiscoveryInboxState(loadDiscoveryInboxState(), harness.owner.games);
  assert.deepEqual(reconciled.activeQueue, [], 'the promoted candidate no longer sits in the Inbox');

  // And even a stale item promoted a second time resolves to the record that exists.
  let second!: ReturnType<typeof harness.promote>;
  await actAsync(() => {
    second = harness.promote(makeCandidate(), 'library');
  });
  assert.equal(second.outcome, 'already-present');
  assert.equal(second.gameId, first.gameId);
  assert.equal(harness.owner.games.length, 1);

  await harness.unmount();
});

test('AS-09: a weakly matching candidate is not deleted from the Inbox on a title coincidence', async () => {
  // No RAWG id on the persisted record, and a different platform: the only thing shared is a title.
  const item = makeInboxItem({ game: makeCandidate({ rawgId: 0, platforms: ['PS4'] }) });
  seedInbox({ activeQueue: [item], nextQueue: [] });

  const differentPlatform = makeLibraryGame({ id: 'lib-1', title: 'Bloodborne', platform: 'Switch' });
  const handle = await renderInbox([differentPlatform]);

  assert.equal(handle.current.inboxItems.length, 1, 'a title-only coincidence must not delete somebody’s candidate');

  await handle.unmount();
});

test('AS-09: an empty library leaves the Inbox untouched and rewrites nothing', async () => {
  const item = makeInboxItem();
  seedInbox({ activeQueue: [item], nextQueue: [] });
  const before = window.localStorage.getItem(discoveryInboxStorageKey);

  const handle = await renderInbox([]);

  assert.equal(handle.current.inboxItems.length, 1);
  assert.equal(window.localStorage.getItem(discoveryInboxStorageKey), before);

  await handle.unmount();
});
