/**
 * AS-06 — Retro "Add to Platform Plans" actually adds to a Platform Plan.
 *
 * The action used to add a legacy `queue` tag and flip every `Want to play` game to `Playing`,
 * while never writing a `PlatformQueueEntry`. The games therefore did not appear in any Plan, and
 * their progress was silently wrong.
 *
 * It now routes the imported games through the canonical Plan command — the same one a Library
 * game goes through — and touches nothing about the games' progress.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useState } from 'react';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { actAsync, renderHook } from './testUtils/reactHarness';
import type { Game, GamePlatform } from '../src/types/game';
import type { PlatformQueueState } from '../src/lib/platformQueueStorage';

assertTestEnvironment();

const { createTranslator } = await import('../src/i18n');
const { useQueueActions } = await import('../src/hooks/useQueueActions');
const { useSliceCommands } = await import('../src/features/app/useSliceCommands');
const { useQuestShelfNotifications } = await import('../src/hooks/useQuestShelfNotifications');
const { normalizePlatformQueueState, addGameToPlatformQueue, getPlatformTag, updatePlatformQueueVisualSettings } =
  await import('../src/lib/platformQueueStorage');
const { normalizeReviewModeState } = await import('../src/lib/reviewModeStorage');
const { normalizeLoadedGames } = await import('../src/lib/gameStorage');

const t = createTranslator('en');

/** What the Retro importer produces: owned Library games that have not been started. */
const romGame = (id: string, title: string, overrides: Partial<Game> = {}): Game =>
  makeLibraryGame({
    id,
    title,
    platform: 'SNES',
    status: 'Want to play',
    externalSource: 'retro-rom',
    lastPlayedAt: null,
    ...overrides,
  });

function useRetroPlanHarness(initialGames: Game[]) {
  const [games, setGames] = useState<Game[]>(initialGames);
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<never[]>([]);
  const [platformQueueState, setPlatformQueueState] = useState<PlatformQueueState>(() =>
    normalizePlatformQueueState(undefined),
  );
  const [reviewModeState, setReviewModeState] = useState(() => normalizeReviewModeState(undefined));

  // The same command boundary AppController owns: one pure transition per action, applied here.
  const commands = useSliceCommands({ games, platformQueueState, setGames, setPlatformQueueState });

  const notifications = useQuestShelfNotifications({
    activeNavItem: 'Library',
    games,
    ignoredSteamGames,
    platformQueueState,
    reviewModeState,
    staleUndoMessage: t('toast.undoUnavailable'),
    setGames,
    setIgnoredSteamGames,
    setPlatformQueueState,
    setReviewModeState,
  });

  const queueActions = useQueueActions({
    activeQueuePlatforms: ['Retroid', 'PC'],
    addUndoAction: notifications.addUndoAction,
    markOnboardingItemComplete: () => {},
    runCrossSliceCommand: commands.runCrossSliceCommand,
    runPlanCommand: commands.runPlanCommand,
    t,
  });

  return { ...notifications, ...queueActions, games, platformQueueState, setGames, setPlatformQueueState };
}

type Harness = { current: ReturnType<typeof useRetroPlanHarness>; unmount: () => Promise<void> };

const planFor = (handle: Harness, platform: GamePlatform) =>
  handle.current.platformQueueState.entries
    .filter((entry) => entry.targetPlatform === platform)
    .map((entry) => entry.gameId);
const gameById = (handle: Harness, id: string) => handle.current.games.find((game) => game.id === id)!;

// ── The Plan entry is actually created ──────────────────────────────────────────────

test('AS-06: one imported Retro game is added to the selected Platform Plan', async () => {
  resetWebStorage();
  const game = romGame('rom-1', 'Chrono Trigger');
  const handle = await renderHook(useRetroPlanHarness, [game]);

  let summary!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    summary = handle.current.addGamesToQueue([game], 'Retroid' as GamePlatform);
  });

  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1'], 'a real Plan entry exists');
  assert.equal(summary.addedCount, 1);

  await handle.unmount();
});

test('AS-06: several imported games go into one Plan, chosen once', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid'), romGame('rom-3', 'Earthbound')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  let summary!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    summary = handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform);
  });

  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1', 'rom-2', 'rom-3']);
  assert.equal(summary.addedCount, 3);
  assert.equal(summary.alreadyInPlanCount, 0);

  // Positions are assigned by the canonical Plan command, in order, with no gaps.
  assert.deepEqual(
    handle.current.platformQueueState.entries.map((entry) => entry.queuePosition),
    [1, 2, 3],
  );

  await handle.unmount();
});

test('AS-06: the Plan entries reference the persisted game ids, and nothing else', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  const libraryIds = new Set(handle.current.games.map((game) => game.id));
  handle.current.platformQueueState.entries.forEach((entry) => {
    assert.ok(libraryIds.has(entry.gameId), `Plan entry ${entry.gameId} points at a real game`);
  });

  await handle.unmount();
});

// ── Status and timestamps are not touched ───────────────────────────────────────────

test('AS-06: adding to a Plan does not mark a Want-to-play game as Playing', async () => {
  resetWebStorage();
  const game = romGame('rom-1', 'Chrono Trigger');
  const handle = await renderHook(useRetroPlanHarness, [game]);

  await actAsync(() => handle.current.addGamesToQueue([game], 'Retroid' as GamePlatform));

  // This is the defect, and it is gone: planning a game is not the same as starting it.
  const planned = gameById(handle, 'rom-1');
  assert.equal(planned.status, 'Want to play', 'the status is untouched');
  assert.equal(planned.lastPlayedAt, null, 'no play timestamp was invented');
  assert.equal(planned.finishedAt, undefined);
  assert.equal(planned.droppedAt, undefined);
  assert.equal(planned.playtimeHours, 0);

  // Collection membership and imported metadata are unchanged too.
  assert.equal(planned.collectionType, 'library');
  assert.equal(planned.externalSource, 'retro-rom');
  assert.equal(planned.platform, 'SNES', 'the destination Plan is not the game\'s platform');

  await handle.unmount();
});

test('AS-06: a game that is already Playing stays Playing and is not planned twice', async () => {
  resetWebStorage();
  const playing = romGame('rom-1', 'Chrono Trigger', {
    status: 'Playing',
    platform: 'Retroid',
    lastPlayedAt: '2026-07-01',
  });
  const handle = await renderHook(useRetroPlanHarness, [playing]);

  let summary!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    summary = handle.current.addGamesToQueue([playing], 'Retroid' as GamePlatform);
  });

  const after = gameById(handle, 'rom-1');
  assert.equal(after.status, 'Playing', 'still Playing');
  assert.equal(after.lastPlayedAt, '2026-07-01', 'and its play timestamp was not rewritten');

  // A currently-playing game has no Plan entry by design (the Plan owner strips them), so the
  // batch reports it as skipped rather than creating a row that would vanish.
  assert.equal(summary.addedCount, 0);
  assert.equal(summary.skippedPlayingCount, 1);
  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), []);

  await handle.unmount();
});

test('AS-06: no play activity or status change is produced for any game in the batch', async () => {
  resetWebStorage();
  const roms = [
    romGame('rom-1', 'Chrono Trigger'),
    romGame('rom-2', 'Super Metroid', { status: 'Finished', finishedAt: '2026-01-01T00:00:00.000Z' }),
    romGame('rom-3', 'Earthbound', { status: 'Dropped', droppedAt: '2026-02-01T00:00:00.000Z' }),
  ];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  assert.deepEqual(
    handle.current.games.map((game) => game.status),
    ['Want to play', 'Finished', 'Dropped'],
    'every status survived exactly as it was',
  );
  assert.equal(gameById(handle, 'rom-2').finishedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(gameById(handle, 'rom-3').droppedAt, '2026-02-01T00:00:00.000Z');
  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1', 'rom-2', 'rom-3']);

  await handle.unmount();
});

// ── Duplicates and partial batches ──────────────────────────────────────────────────

test('AS-06: repeating the action is idempotent — no duplicate Plan entries', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  let second!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    second = handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform);
  });

  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1', 'rom-2'], 'still one entry each');
  assert.equal(second.addedCount, 0);
  assert.equal(second.alreadyInPlanCount, 2, 'and it says so rather than claiming success');

  await handle.unmount();
});

test('AS-06: a partially duplicated batch adds only the new games and reports both counts', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid'), romGame('rom-3', 'Earthbound')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  // rom-1 is already in the Plan (the user planned it earlier, at a chosen position).
  await actAsync(() => {
    handle.current.setPlatformQueueState((current) => addGameToPlatformQueue(current, roms[0], 'Retroid'));
  });

  let summary!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    summary = handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform);
  });

  assert.equal(summary.addedCount, 2);
  assert.equal(summary.alreadyInPlanCount, 1);
  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1', 'rom-2', 'rom-3']);

  // The pre-existing entry keeps its position rather than being re-created at the end.
  const existing = handle.current.platformQueueState.entries.find((entry) => entry.gameId === 'rom-1');
  assert.equal(existing?.queuePosition, 1);

  await handle.unmount();
});

test('AS-06: the same games can be planned on a second platform independently', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));
  await actAsync(() => handle.current.addGamesToQueue(roms, 'PC' as GamePlatform));

  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1']);
  assert.deepEqual(planFor(handle, 'PC' as GamePlatform), ['rom-1'], 'Plans are per platform');

  await handle.unmount();
});

// ── The canonical command's own rules still apply ───────────────────────────────────

test('AS-06: the destination platform becomes active, exactly as a single add does', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  assert.ok(
    handle.current.platformQueueState.activePlatforms.includes('Retroid'),
    'the Plan command owns this rule, and the batch inherits it',
  );

  await handle.unmount();
});

test("AS-06: the platform's configured tag is applied to planned games, as the canonical command does", async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => {
    handle.current.setPlatformQueueState((current) =>
      updatePlatformQueueVisualSettings(current, 'Retroid', { platformTag: 'retroid-plan' }),
    );
  });
  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  assert.equal(getPlatformTag(handle.current.platformQueueState, 'Retroid'), 'retroid-plan');
  assert.ok(gameById(handle, 'rom-1').tags.includes('retroid-plan'));

  // And still not the legacy tag.
  assert.equal(gameById(handle, 'rom-1').tags.includes('queue'), false);

  await handle.unmount();
});

test('AS-06: the batch is undoable, and undoing it removes only its Plan entries', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid')];
  const other = romGame('rom-9', 'Secret of Mana');
  const handle = await renderHook(useRetroPlanHarness, [...roms, other]);

  await actAsync(() => handle.current.addGamesToQueue([other], 'Retroid' as GamePlatform));
  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  const toast = handle.current.pendingUndoActions.find(
    (action) =>
      action.historyEntry.actionType === 'add-many-to-queue' &&
      action.historyEntry.affectedGameIds.includes('rom-1'),
  )!;
  await actAsync(() => handle.current.undoAction(toast.id));

  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-9'], 'the earlier Plan entry is untouched');
  assert.equal(gameById(handle, 'rom-1').status, 'Want to play', 'and no status was disturbed');

  await handle.unmount();
});

// ── Legacy `queue` tag ──────────────────────────────────────────────────────────────

test('AS-06: new Plan additions no longer create the legacy `queue` tag', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));

  handle.current.games.forEach((game) => {
    assert.equal(game.tags.includes('queue'), false, `${game.id} did not gain the legacy tag`);
  });

  // Plan membership is read from the Plan entries, which is now the only source of truth.
  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-1', 'rom-2']);

  await handle.unmount();
});

test('AS-06: games carrying the legacy `queue` tag still load and are left alone', async () => {
  resetWebStorage();

  // A record written by an older build. It must remain readable — nothing is migrated or stripped.
  const legacy = normalizeLoadedGames([
    { ...romGame('rom-legacy', 'Legacy ROM'), tags: ['retro', 'queue'] },
  ]);

  assert.equal(legacy.length, 1, 'the legacy record loads');
  assert.deepEqual(legacy[0].tags, ['retro', 'queue'], 'and keeps its tags');

  const handle = await renderHook(useRetroPlanHarness, legacy);
  await actAsync(() => handle.current.addGamesToQueue(legacy, 'Retroid' as GamePlatform));

  assert.ok(gameById(handle, 'rom-legacy').tags.includes('queue'), 'the old tag is not deleted either');
  assert.deepEqual(planFor(handle, 'Retroid' as GamePlatform), ['rom-legacy'], 'it gets a real Plan entry now');

  await handle.unmount();
});

// ── Failure paths ───────────────────────────────────────────────────────────────────

test('AS-06: a failing Plan persistence does not remove the imported games or change their status', async () => {
  resetWebStorage();
  const roms = [romGame('rom-1', 'Chrono Trigger'), romGame('rom-2', 'Super Metroid')];
  const handle = await renderHook(useRetroPlanHarness, roms);

  // The Plan write blows up (a full quota, a broken storage tier).
  const storagePrototype = Object.getPrototypeOf(window.localStorage) as Storage;
  const originalSetItem = storagePrototype.setItem;
  storagePrototype.setItem = function patchedSetItem(this: Storage, key: string, value: string) {
    if (key === 'questshelf.platformQueues.v1') {
      throw new Error('QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  };

  try {
    await actAsync(() => handle.current.addGamesToQueue(roms, 'Retroid' as GamePlatform));
  } finally {
    storagePrototype.setItem = originalSetItem;
  }

  // The import survives: the games are still in the library, still unplayed. Failing to plan a game
  // must never cost the user the game.
  assert.deepEqual(handle.current.games.map((game) => game.id), ['rom-1', 'rom-2']);
  assert.deepEqual(
    handle.current.games.map((game) => game.status),
    ['Want to play', 'Want to play'],
  );

  await handle.unmount();
});

test('AS-06: an empty batch does nothing and reports nothing', async () => {
  resetWebStorage();
  const handle = await renderHook(useRetroPlanHarness, [romGame('rom-1', 'Chrono Trigger')]);

  let summary!: ReturnType<typeof handle.current.addGamesToQueue>;
  await actAsync(() => {
    summary = handle.current.addGamesToQueue([], 'Retroid' as GamePlatform);
  });

  assert.equal(summary.addedCount, 0);
  assert.deepEqual(handle.current.platformQueueState.entries, []);
  assert.equal(handle.current.pendingUndoActions.length, 0, 'no toast claims a success that did not happen');

  await handle.unmount();
});
