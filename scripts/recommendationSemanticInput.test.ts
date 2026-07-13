import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRecommendationInputKey,
  getRecommendationPreparationMetrics,
  prepareRecommendationInput,
  resetRecommendationPreparationCache,
} from '../src/services/personalRecommendationsService';
import { defaultRecommendationPreferences, recordRecommendationFeedback, saveRecommendationPreferences } from '../src/lib/recommendationFeedback';
import { loadTasteProfile, saveTasteProfile } from '../src/lib/tasteProfile';
import type { Game, GameStatus } from '../src/types/game';
import { resetWebStorage } from './testUtils/testEnvironment';

function game(index: number, changes: Partial<Game> = {}): Game {
  return {
    id: `game-${index}`,
    title: `Game ${index}`,
    platform: 'Steam',
    status: 'Finished',
    coverImage: '',
    playtimeHours: 10 + index,
    tags: ['story-rich'],
    rawgTags: ['story-rich'],
    genres: ['RPG'],
    developers: ['Studio'],
    lastPlayedAt: null,
    notes: '',
    collectionType: 'library',
    rating: 4,
    rawgId: 1000 + index,
    ...changes,
  };
}

function setup() {
  resetWebStorage();
  resetRecommendationPreparationCache();
}

test('Home and Discover share one prepared profile for unchanged semantic inputs', () => {
  setup();
  const games = Array.from({ length: 20 }, (_, index) => game(index));
  const planned = new Set<string>(['game-2']);
  const home = prepareRecommendationInput(games, planned);
  const discover = prepareRecommendationInput(games, planned);
  const equivalentCanonicalArray = prepareRecommendationInput([...games], new Set(planned));

  assert.equal(discover, home);
  assert.equal(equivalentCanonicalArray.semanticKey, home.semanticKey);
  assert.equal(getRecommendationPreparationMetrics().profileBuilds, 1);

  saveRecommendationPreferences(defaultRecommendationPreferences);
  assert.equal(prepareRecommendationInput(games, planned), home, 'saving identical preferences is not a semantic invalidation');
  assert.equal(getRecommendationPreparationMetrics().profileBuilds, 1);
});

test('semantic invalidation ignores title-only/no-op changes and rebuilds relevant inputs once', () => {
  setup();
  const base = Array.from({ length: 20 }, (_, index) => game(index));
  const first = prepareRecommendationInput(base);
  const noOp = prepareRecommendationInput(base.map((entry) => ({ ...entry })));
  const titleOnly = prepareRecommendationInput(base.map((entry, index) => index === 0 ? { ...entry, title: 'Corrected title' } : entry));
  assert.equal(noOp.semanticKey, first.semanticKey);
  assert.equal(titleOnly.semanticKey, first.semanticKey);
  assert.equal(getRecommendationPreparationMetrics().profileBuilds, 1);

  const relevantCases: Array<[string, (entry: Game) => Game]> = [
    ['genre', (entry) => ({ ...entry, genres: ['Strategy'] })],
    ['rating', (entry) => ({ ...entry, rating: 5 })],
    ['finished/drop', (entry) => ({ ...entry, status: 'Dropped' as GameStatus })],
    ['Wishlist/Library', (entry) => ({ ...entry, collectionType: 'wishlist' })],
  ];
  for (const [label, update] of relevantCases) {
    const changed = base.map((entry, index) => index === 0 ? update(entry) : entry);
    assert.notEqual(prepareRecommendationInput(changed).semanticKey, first.semanticKey, label);
  }
  assert.equal(getRecommendationPreparationMetrics().profileBuilds, 1 + relevantCases.length);
});

test('Plans, preferences, feedback/taste revision, Inbox, hydration and engine version invalidate explicitly', () => {
  setup();
  const games = Array.from({ length: 20 }, (_, index) => game(index));
  const none = prepareRecommendationInput(games, new Set());
  const planned = prepareRecommendationInput(games, new Set(['game-1']));
  assert.notEqual(planned.semanticKey, none.semanticKey);

  saveRecommendationPreferences({ ...defaultRecommendationPreferences, preferShorterGames: true });
  const preferred = prepareRecommendationInput(games, new Set(['game-1']));
  assert.notEqual(preferred.semanticKey, planned.semanticKey);

  recordRecommendationFeedback({
    game: { rawgId: 9999, title: 'Candidate', slug: 'candidate', coverImage: '', wideCoverImage: '', genres: ['RPG'], tags: ['story-rich'], rating: 4, metacritic: 80, released: '2026-01-01', platforms: ['PC'] },
    libraryStatus: null,
    inboxStatus: false,
    excluded: false,
    exclusionReason: null,
    score: 10,
  }, 'not_interested', 'home');
  const feedbackChanged = prepareRecommendationInput(games, new Set(['game-1']));
  assert.notEqual(feedbackChanged.semanticKey, preferred.semanticKey);

  const taste = loadTasteProfile();
  saveTasteProfile({ ...taste, lastUpdatedAt: '2026-07-13T12:00:00.000Z' });
  const tasteChanged = prepareRecommendationInput(games, new Set(['game-1']));
  assert.notEqual(tasteChanged.semanticKey, feedbackChanged.semanticKey);

  assert.notEqual(getRecommendationInputKey(games, new Set([55]), true), getRecommendationInputKey(games, new Set(), true));
  assert.notEqual(getRecommendationInputKey(games, new Set(), false), getRecommendationInputKey(games, new Set(), true));
  assert.match(tasteChanged.semanticKey, /engine:5\.0\.0:scoring:5\.0\.0/);
});

test('unchanged 1,000-game preparation check is sub-millisecond-scale and does no profile work', () => {
  setup();
  const games = Array.from({ length: 1000 }, (_, index) => game(index));
  const planned = new Set<string>();
  prepareRecommendationInput(games, planned);
  const builds = getRecommendationPreparationMetrics().profileBuilds;
  const startedAt = performance.now();
  for (let index = 0; index < 200; index += 1) prepareRecommendationInput(games, planned);
  const averageMs = (performance.now() - startedAt) / 200;
  assert.equal(getRecommendationPreparationMetrics().profileBuilds, builds);
  assert.ok(averageMs < 2, `unchanged check averaged ${averageMs.toFixed(3)} ms`);
});

test('deterministic recommendation preparation measurements retain one build per fixture', () => {
  const measurements: Array<{ games: number; rebuildMs: number; unchangedCheckMs: number; profileBuilds: number }> = [];
  for (const size of [20, 200, 1000, 1400]) {
    setup();
    const games = Array.from({ length: size }, (_, index) => game(index));
    const planned = new Set<string>();
    const rebuildStartedAt = performance.now();
    prepareRecommendationInput(games, planned);
    const rebuildMs = performance.now() - rebuildStartedAt;
    const unchangedStartedAt = performance.now();
    for (let index = 0; index < 100; index += 1) prepareRecommendationInput(games, planned);
    const unchangedCheckMs = (performance.now() - unchangedStartedAt) / 100;
    const profileBuilds = getRecommendationPreparationMetrics().profileBuilds;
    assert.equal(profileBuilds, 1);
    measurements.push({ games: size, rebuildMs, unchangedCheckMs, profileBuilds });
  }
  console.info('[Recommendation preparation benchmark]', measurements);
});
