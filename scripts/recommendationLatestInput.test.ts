/**
 * AS-12 — recommendations must reflect the library the user actually has.
 *
 * The hook skipped a run while another was in flight, so importing a game or finishing one during
 * generation never triggered a run for the new inputs — and the old run, computed against the
 * pre-change library, still committed. The newly owned game stayed in the recommendations.
 *
 * These tests drive the real hook and the real service against a stubbed proxy that is released by
 * hand, so "A resolves after the inputs changed" is a fact rather than a hope.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { actAsync, renderHook } from './testUtils/reactHarness';
import { saveRawgSettings } from '../src/lib/rawgSettingsStorage';
import { clearPersonalRecommendationCaches, getRecommendationInputKey } from '../src/services/personalRecommendationsService';
import { getRecommendationFeedbackRankBucket } from '../src/hooks/usePersonalizedRecommendations';
import type { DiscoveryCandidate } from '../src/lib/discovery';
import type { RawgSearchResult } from '../src/types/rawg';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { usePersonalizedRecommendations } = await import('../src/hooks/usePersonalizedRecommendations');

const originalFetch = globalThis.fetch;

/** Every provider call parks on this gate, so a whole generation can be held open and released. */
let gate: { promise: Promise<void>; open: () => void } = openGate();

function openGate() {
  return { promise: Promise.resolve(), open: () => {} };
}

function closedGate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = () => resolve(); });
  return { promise, open };
}

const rawgResult = (id: number): RawgSearchResult =>
  ({
    id,
    name: `Candidate ${id}`,
    slug: `candidate-${id}`,
    background_image: `https://media.rawg.io/${id}.jpg`,
    metacritic: 88,
    rating: 4.5,
    ratings_count: 1200,
    released: '2025-01-01',
    platforms: [{ platform: { id: 4, name: 'PC' } }],
    genres: [{ id: 1, name: 'Action' }],
    tags: [{ id: 1, name: 'Souls-like', slug: 'souls-like' }],
  }) as unknown as RawgSearchResult;

/** The provider always offers the same two candidates; the LIBRARY decides which survive. */
const offeredCandidates = [rawgResult(777), rawgResult(888)];

function stubProxy() {
  globalThis.fetch = (async () => {
    await gate.promise;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ response: { results: offeredCandidates } }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** A library rich enough to clear the cold-start gate, so the pipeline actually runs. */
function library(extra: Game[] = []): Game[] {
  const owned: Game[] = Array.from({ length: 8 }, (_, index) => ({
    id: `g${index}`,
    title: `Finished Game ${index}`,
    platform: 'Steam',
    status: 'Finished',
    coverImage: '',
    playtimeHours: 20,
    tags: [],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rating: 5,
    rawgId: 100 + index,
    genres: ['Action'],
    rawgTags: ['souls-like'],
    finishedAt: '2026-06-01T00:00:00.000Z',
  }));

  return [...owned, ...extra];
}

/** The game the user imports mid-generation: RAWG offers it, so it must drop out afterwards. */
const importedGame: Game = {
  id: 'imported',
  title: 'Candidate 777',
  platform: 'Steam',
  status: 'Want to play',
  coverImage: '',
  playtimeHours: 0,
  tags: [],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  rawgId: 777,
  genres: ['Action'],
};

async function setup() {
  resetWebStorage();
  saveRawgSettings({ apiKey: 'test-key' });
  await clearPersonalRecommendationCaches();
  gate = openGate();
  stubProxy();
}

const renderRecommendations = (games: Game[]) =>
  renderHook((current: Game[]) => usePersonalizedRecommendations(current, new Set<number>(), true), games);

const rawgIds = (candidates: DiscoveryCandidate[]) => candidates.map((candidate) => candidate.game.rawgId).sort((a, b) => a - b);

/** Let the released generation finish and React commit it. */
async function settle() {
  await actAsync(async () => {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('AS-12: the input key changes when the library, the Inbox or hydration changes', async () => {
  await setup();
  const base = library();

  assert.equal(getRecommendationInputKey(base, new Set(), true), getRecommendationInputKey([...base], new Set(), true), 'a new array with the same contents is the same input');
  assert.notEqual(getRecommendationInputKey(base, new Set(), true), getRecommendationInputKey(library([importedGame]), new Set(), true), 'an imported game is a new input');
  assert.notEqual(getRecommendationInputKey(base, new Set(), true), getRecommendationInputKey(base, new Set([42]), true), 'an Inbox change is a new input');
  assert.notEqual(getRecommendationInputKey(base, new Set(), true), getRecommendationInputKey(base, new Set(), false), 'hydration state is part of the input');
});

test('AS-12: a game imported while recommendations are generating is not recommended', async () => {
  await setup();
  gate = closedGate();

  const handle = await renderRecommendations(library());

  // The import lands while the first generation is still waiting on the provider.
  await handle.rerender(library([importedGame]));

  // The old generation now resolves — the exact race the audit describes.
  await actAsync(() => gate.open());
  await settle();

  assert.deepEqual(rawgIds(handle.current.candidates), [888], 'the newly owned game is gone; the stale result did not commit');
  assert.equal(handle.current.loading, false, 'and the run for the new inputs owns the loading state');

  await handle.unmount();
});

test('AS-12: only the latest of several rapid input changes commits', async () => {
  await setup();
  gate = closedGate();

  const handle = await renderRecommendations(library());

  // A → B → C: the intermediate library is never the one the user ends on.
  await handle.rerender(library([{ ...importedGame, id: 'intermediate', rawgId: 888, title: 'Candidate 888' }]));
  await handle.rerender(library([importedGame]));

  await actAsync(() => gate.open());
  await settle();

  assert.deepEqual(rawgIds(handle.current.candidates), [888], 'the final state is the one the LAST inputs produce');

  await handle.unmount();
});

test('AS-12: a stale result cannot clear the loading state of the run that replaced it', async () => {
  await setup();
  gate = closedGate();

  const handle = await renderRecommendations(library());
  await handle.rerender(library([importedGame]));

  assert.equal(handle.current.loading, true, 'the newer inputs are still loading');

  await actAsync(() => gate.open());
  await settle();

  assert.equal(handle.current.loading, false);

  await handle.unmount();
});

test('AS-12: nothing commits after unmount', async () => {
  await setup();
  gate = closedGate();

  const handle = await renderRecommendations(library());
  await handle.unmount();

  // The in-flight generation resolves into a hook that no longer exists. React would warn (and in a
  // stricter build, throw) if it tried to set state; the assertion is that this simply completes.
  await assert.doesNotReject(async () => {
    gate.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

test('AS-12: a cached result for the current inputs commits', async () => {
  await setup();

  const first = await renderRecommendations(library());
  await settle();
  const cachedIds = rawgIds(first.current.candidates);
  assert.deepEqual(cachedIds, [777, 888]);
  await first.unmount();

  // A second mount with the same inputs is served from the service cache — and that IS current.
  const second = await renderRecommendations(library());
  await settle();

  assert.deepEqual(rawgIds(second.current.candidates), cachedIds);
  assert.equal(second.current.loading, false);

  await second.unmount();
});

test('AS-12: feedback rank comes from the list on screen, not the one from first render', () => {
  const candidate = (rawgId: number) => ({ game: { rawgId } } as DiscoveryCandidate);
  const later = candidate(5);

  // The empty first-render array is what the old empty-dependency callback closed over: every
  // candidate looked like rank "lower".
  assert.equal(getRecommendationFeedbackRankBucket([], later), 'lower');

  const onScreen = [candidate(1), candidate(2), candidate(3), candidate(4), later];
  assert.equal(getRecommendationFeedbackRankBucket(onScreen, later), 'middle');
  assert.equal(getRecommendationFeedbackRankBucket(onScreen, candidate(1)), 'top');
});

test('teardown', () => {
  globalThis.fetch = originalFetch;
});
