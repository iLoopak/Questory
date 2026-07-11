import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUserProfile, isGenericPreferenceTag, toSlug } from '../src/lib/userProfile';
import {
  buildTasteProfile,
  createOppositeTasteSignal,
  getActiveTasteSignals,
  getTasteProfileForGames,
  loadTasteProfile,
  normalizeTasteProfile,
  recomputeAndSaveTasteProfile,
  rejectTasteSignal,
  resetAllTasteProfile,
  resetObservedTasteProfile,
  saveTasteProfile,
  tasteProfileStorageKey,
} from '../src/lib/tasteProfile';
import { getStorageAdapter, setStorageAdapter, type StorageAdapter } from '../src/lib/storageAdapter';
import { getRecommendationState } from '../src/lib/recommendationState';
import { recommendationBenchmarkProfiles } from '../src/lib/recommendationBenchmarks';
import { normalizeRecommendationFeedbackRecords } from '../src/lib/recommendationFeedback';
import { buildDiscoveryCandidates } from '../src/services/discoveryService';
import { generateRecommendationReasonForTest, scorePersonalRecommendationCandidate, selectFinalRecommendationCandidates, selectRecommendationSeeds, validatePersonalRecommendationCacheEntry } from '../src/services/personalRecommendationsService';
import { scoreContextualTagOverlapForTest } from '../src/services/contextualRecommendationsService';
import { getUpcomingDateRange, ignoreReleaseCalendarGame, getIgnoredReleaseRawgIds, rankReleaseCalendarResults } from '../src/services/releaseCalendarService';
import type { Game } from '../src/types/game';
import type { DiscoveryGame } from '../src/lib/discovery';
import type { RawgSearchResult } from '../src/types/rawg';

function game(overrides: Partial<Game>): Game {
  return {
    id: overrides.id ?? 'g',
    title: overrides.title ?? 'Game',
    platform: overrides.platform ?? 'Steam',
    status: overrides.status ?? 'Want to play',
    coverImage: '',
    playtimeHours: overrides.playtimeHours ?? 0,
    rating: overrides.rating,
    tags: overrides.tags ?? [],
    rawgTags: overrides.rawgTags,
    genres: overrides.genres,
    developers: overrides.developers,
    lastPlayedAt: null,
    notes: '',
    collectionType: overrides.collectionType ?? 'library',
    rawgId: overrides.rawgId,
    rawgSlug: overrides.rawgSlug,
    rawgTitle: overrides.rawgTitle,
  };
}

function rawg(overrides: Partial<RawgSearchResult>): RawgSearchResult {
  return {
    id: overrides.id ?? 100,
    name: overrides.name ?? 'Candidate',
    background_image: null,
    metacritic: overrides.metacritic ?? null,
    rating: overrides.rating,
    ratings_count: overrides.ratings_count,
    platforms: overrides.platforms ?? [{ platform: { id: 4, name: 'PC', slug: 'pc' } }],
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    developers: overrides.developers,
    released: overrides.released ?? null,
    slug: overrides.slug ?? null,
  };
}

function scoredCandidate(overrides: {
  id: number;
  name: string;
  score?: number;
  source?: string;
  genre?: string;
  tag?: string;
  developer?: string;
  slug?: string;
  seedKey?: string;
  image?: string | null;
}) {
  const result = rawg({
    id: overrides.id,
    name: overrides.name,
    slug: overrides.slug ?? toSlug(overrides.name),
    background_image: overrides.image === undefined ? 'cover.jpg' : overrides.image,
    genres: overrides.genre ? [{ id: 1, name: overrides.genre, slug: toSlug(overrides.genre) }] : [],
    tags: overrides.tag ? [{ id: 1, name: overrides.tag, slug: toSlug(overrides.tag) }] : [],
    developers: overrides.developer ? [{ id: 1, name: overrides.developer, slug: toSlug(overrides.developer) }] : [],
  });
  return {
    result,
    score: {
      genreMatch: 20,
      tagMatch: overrides.tag ? 20 : 0,
      developerMatch: overrides.developer ? 8 : 0,
      franchiseMatch: 0,
      platformMatch: 0,
      seedSimilarity: overrides.seedKey ? 12 : 0,
      qualityMatch: 8,
      recencyMatch: 0,
      negativeMatch: 0,
      sourceAdjustment: 0,
      metacriticMatch: 0,
      ownershipPenalty: 0,
      positiveGenres: overrides.genre ? [overrides.genre] : [],
      positiveTags: overrides.tag ? [toSlug(overrides.tag)] : [],
      positiveDevelopers: overrides.developer ? [overrides.developer] : [],
      positiveFranchises: [],
      negativeGenres: [],
      negativeTags: [],
      negativeDevelopers: [],
      negativeFranchises: [],
      total: overrides.score ?? 40,
    },
    reason: 'test reason',
    source: overrides.source ?? 'affinity-strict',
    seed: overrides.seedKey ? { stableKey: overrides.seedKey, tags: [], genres: [], franchiseKey: null } : undefined,
  } as any;
}

function discovery(overrides: Partial<DiscoveryGame>): DiscoveryGame {
  return {
    rawgId: overrides.rawgId ?? 100,
    title: overrides.title ?? 'Candidate',
    coverUrl: null,
    metacritic: null,
    platforms: [],
    hasSteamVersion: false,
    genres: overrides.genres ?? [],
    tags: overrides.tags ?? [],
    released: null,
    slug: null,
  };
}

function installMemoryStorage() {
  const store = new Map<string, string>();
  const previousAdapter = getStorageAdapter();
  const memoryAdapter: StorageAdapter = {
    readLocal: (key) => store.get(key) ?? null,
    writeLocal: (key, value) => { store.set(key, value); },
    removeLocal: (key) => { store.delete(key); },
    localKeys: () => [...store.keys()],
    readDurable: async () => null,
    writeDurable: async () => {},
    removeDurable: async () => {},
    hasDurableBackend: async () => false,
  };
  setStorageAdapter(memoryAdapter);
  return {
    store,
    restore: () => setStorageAdapter(previousAdapter),
  };
}


test('contextual recommendations rank niche gameplay overlap above generic tag overlap', () => {
  const current = ['roguelite', 'deckbuilder', 'singleplayer', 'indie', '2d', 'controller'];
  const niche = scoreContextualTagOverlapForTest(['roguelite', 'deckbuilder'], current);
  const generic = scoreContextualTagOverlapForTest(['singleplayer', 'indie', '2d', 'controller', 'pixel-graphics', '3d'], current);

  assert.ok(niche.score > generic.score);
  assert.ok(niche.meaningfulMatches >= 2);
  assert.equal(generic.meaningfulMatches, 0);
});

test('shared recommendation state treats RAWG configuration and cold-start consistently', () => {
  const coldGames = [
    game({ id: '1', title: 'Cold One', status: 'Backlog', collectionType: 'library', genres: ['Action'] }),
  ];
  const readyGames = Array.from({ length: 8 }, (_, index) => game({ id: `ready-${index}`, title: `Ready ${index}`, status: 'Finished', collectionType: 'library', genres: ['RPG'], rating: 4 }));

  assert.equal(getRecommendationState({ games: readyGames, hydrationReady: true, isRawgConfigured: false }).status, 'notConfigured');
  assert.equal(getRecommendationState({ games: readyGames, hydrationReady: false, isRawgConfigured: true }).status, 'hydrating');
  assert.equal(getRecommendationState({ games: coldGames, hydrationReady: true, isRawgConfigured: true }).status, 'coldStart');
  assert.equal(getRecommendationState({ games: readyGames, hydrationReady: true, isRawgConfigured: true, loading: true }).status, 'loading');
  assert.equal(getRecommendationState({ games: readyGames, hydrationReady: true, isRawgConfigured: true, hasResults: true, isPartial: true }).status, 'partial');
  assert.equal(getRecommendationState({ games: readyGames, hydrationReady: true, isRawgConfigured: true, hasResults: true }).status, 'ready');
});

test('personal recommendation cache validation rejects incompatible or malformed payloads', () => {
  const now = Date.now();
  const validCandidate = {
    game: discovery({ rawgId: 7, title: 'Valid Pick' }),
    libraryStatus: null,
    inboxStatus: false,
    excluded: false,
    exclusionReason: null,
    score: 42,
    reason: 'test',
    source: 'affinity-strict',
  };

  const valid = validatePersonalRecommendationCacheEntry({ version: 3, fingerprint: 'abc', fetchedAt: now - 100, expiresAt: now + 1000, candidates: [validCandidate] }, now);
  assert.equal(valid?.candidates.length, 1);

  assert.equal(validatePersonalRecommendationCacheEntry({ version: 2, fingerprint: 'abc', fetchedAt: now, expiresAt: now + 1000, candidates: [validCandidate] }, now), null);
  assert.equal(validatePersonalRecommendationCacheEntry({ version: 3, fingerprint: 'abc', fetchedAt: now, expiresAt: now - 1, candidates: [validCandidate] }, now), null);
  assert.equal(validatePersonalRecommendationCacheEntry({ version: 3, fingerprint: 'abc', fetchedAt: now, expiresAt: now + 1000, candidates: [{ ...validCandidate, score: Number.NaN }] }, now), null);
});

test('recommendation feedback storage normalizes distinct feedback semantics', () => {
  const records = normalizeRecommendationFeedbackRecords([
    { rawgId: 10, normalizedTitle: 'Hidden Game', feedbackType: 'hide', createdAt: 100, surface: 'discover', metadata: { tags: ['soulslike'], genres: ['Action'], developers: ['Studio'], franchise: 'hidden-game' } },
    { rawgId: 11, normalizedTitle: 'Less Game', feedbackType: 'less_like_this', createdAt: 101, surface: 'home', metadata: { tags: ['deckbuilding'], genres: ['Strategy'] } },
    { rawgId: 12, normalizedTitle: 'Bad', feedbackType: 'unknown', createdAt: 102 },
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[0].feedbackType, 'hide');
  assert.equal(records[1].feedbackType, 'less_like_this');
  assert.deepEqual(records[0].metadata.tags, ['soulslike']);
});

test('synthetic recommendation benchmark profiles produce expected profile signals', () => {
  assert.equal(recommendationBenchmarkProfiles.length >= 14, true);
  for (const benchmark of recommendationBenchmarkProfiles) {
    const profile = buildUserProfile(benchmark.games);
    if (benchmark.expected.minPositiveTags) assert.ok(profile.topTags.length >= benchmark.expected.minPositiveTags, benchmark.id);
    if (benchmark.expected.hasNegativeSignals) assert.ok(profile.negativeGenres.length + profile.negativeTags.length + profile.negativeFranchises.length > 0, benchmark.id);
    if (benchmark.expected.minReadyGames) assert.ok(benchmark.games.length >= benchmark.expected.minReadyGames, benchmark.id);
  }
});

test('taste profile infers explainable observed loves and bounded dislikes', () => {
  const profile = buildTasteProfile([
    game({ id: 'tactics-a', title: 'Tactics A', status: 'Finished', rating: 5, genres: ['RPG', 'Strategy'], rawgTags: ['tactical-rpg', 'turn-based-combat'], playtimeHours: 45 }),
    game({ id: 'tactics-b', title: 'Tactics B', status: 'Finished', rating: 4, genres: ['RPG'], rawgTags: ['tactical-rpg'], playtimeHours: 30 }),
    game({ id: 'sports-one', title: 'Sports One', status: 'Dropped', rating: 1, genres: ['Sports'], rawgTags: ['competitive'] }),
    game({ id: 'sports-two', title: 'Sports Two', status: 'Dropped', genres: ['Sports'], rawgTags: ['competitive'] }),
  ], normalizeTasteProfile(undefined), new Date('2026-07-11T00:00:00Z'));

  const loved = getActiveTasteSignals(profile, 'love');
  const avoided = getActiveTasteSignals(profile, 'avoid');
  assert.ok(loved.some((signal) => signal.label === 'Tactical RPG' && signal.evidence.explanation.includes('Tactical RPG')));
  assert.ok(avoided.some((signal) => signal.label === 'Sports' && signal.supportingGameCount >= 2));
  assert.ok(!avoided.some((signal) => signal.supportingGameCount === 1));
});

test('taste profile normalization preserves explicit and temporary layers', () => {
  const normalized = normalizeTasteProfile({
    observed: [],
    explicit: [{ kind: 'tag', key: 'deckbuilding', label: 'Deckbuilding', sentiment: 'love', confidence: 1, evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
    temporary: [{ kind: 'tag', key: 'co-op', label: 'Co-op', sentiment: 'love', confidence: 1, evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }],
    lastComputedFingerprint: 'abc',
    lastUpdatedAt: '2026-07-11T00:00:00Z',
  });

  assert.equal(normalized.explicit[0].origin, 'explicit');
  assert.equal(normalized.temporary[0].origin, 'temporary');
  assert.equal(getActiveTasteSignals(normalized, 'love').length, 2);
});

test('taste profile consumes repeated recommendation feedback as observed taste evidence', () => {
  const { store, restore } = installMemoryStorage();
  try {
    store.set('questshelf.recommendationFeedback.v1', JSON.stringify([
      { rawgId: 10, normalizedTitle: 'battle one', feedbackType: 'less_like_this', createdAt: 1, surface: 'discover', metadata: { genres: ['sports'], tags: ['competitive'], developers: [], franchise: null } },
      { rawgId: 11, normalizedTitle: 'battle two', feedbackType: 'not_interested', createdAt: 2, surface: 'home', metadata: { genres: ['sports'], tags: ['competitive'], developers: [], franchise: null } },
    ]));

    const profile = buildTasteProfile([], normalizeTasteProfile(undefined), new Date('2026-07-11T00:00:00Z'));
    const avoided = getActiveTasteSignals(profile, 'avoid');

    assert.ok(avoided.some((signal) => signal.label === 'Sports' && signal.supportingGameCount === 2));
  } finally {
    restore();
  }
});

test('rejecting an observed taste signal suppresses it without creating an opposite preference', () => {
  const { restore } = installMemoryStorage();
  try {
    const profile = buildTasteProfile([
      game({ id: 'deck-a', title: 'Deck A', status: 'Finished', rating: 5, rawgTags: ['deckbuilding'], playtimeHours: 30 }),
      game({ id: 'deck-b', title: 'Deck B', status: 'Finished', rating: 5, rawgTags: ['deckbuilding'], playtimeHours: 25 }),
    ], normalizeTasteProfile(undefined), new Date('2026-07-11T00:00:00Z'));
    saveTasteProfile(profile);

    const source = getActiveTasteSignals(profile, 'love').find((signal) => signal.key === 'deckbuilding');
    assert.ok(source);

    const rejected = rejectTasteSignal(source.id);
    assert.equal(rejected.explicit.length, 0);
    assert.equal(rejected.observed.find((signal) => signal.id === source.id)?.hidden, true);
    assert.ok(getActiveTasteSignals(rejected, 'love').every((signal) => signal.key !== 'deckbuilding'));
  } finally {
    restore();
  }
});

test('explicit opposite correction is separate from a plain taste rejection', () => {
  const { restore } = installMemoryStorage();
  try {
    const profile = buildTasteProfile([
      game({ id: 'sports-a', title: 'Sports A', status: 'Dropped', rating: 1, genres: ['Sports'] }),
      game({ id: 'sports-b', title: 'Sports B', status: 'Dropped', rating: 1, genres: ['Sports'] }),
    ], normalizeTasteProfile(undefined), new Date('2026-07-11T00:00:00Z'));
    saveTasteProfile(profile);

    const source = getActiveTasteSignals(profile, 'avoid').find((signal) => signal.key === 'sports');
    assert.ok(source);

    const corrected = createOppositeTasteSignal(source.id);
    const explicit = corrected.explicit.find((signal) => signal.kind === source.kind && signal.key === source.key);
    assert.equal(explicit?.sentiment, 'love');
    assert.equal(explicit?.origin, 'explicit');
    assert.equal(explicit?.pinned, true);
    assert.equal(corrected.observed.find((signal) => signal.id === source.id)?.hidden, true);
  } finally {
    restore();
  }
});

test('clearing inferred taste pauses automatic recompute until explicitly recomputed', () => {
  const { restore } = installMemoryStorage();
  try {
    const games = [
      game({ id: 'tactics-a', title: 'Tactics A', status: 'Finished', rating: 5, rawgTags: ['tactical-rpg'], playtimeHours: 30 }),
      game({ id: 'tactics-b', title: 'Tactics B', status: 'Finished', rating: 5, rawgTags: ['tactical-rpg'], playtimeHours: 22 }),
    ];
    saveTasteProfile(normalizeTasteProfile({
      explicit: [{ kind: 'tag', key: 'deckbuilding', label: 'Deckbuilding', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
      temporary: [{ kind: 'tag', key: 'cozy', label: 'Cozy', sentiment: 'love', confidence: 1, strength: 'moderate', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }],
    }));
    saveTasteProfile(buildTasteProfile(games, loadTasteProfile(), new Date('2026-07-11T00:00:00Z')));

    const cleared = resetObservedTasteProfile();
    assert.equal(cleared.observed.length, 0);
    assert.ok(cleared.prompt.inferencePausedAt);

    const stillPaused = getTasteProfileForGames(games);
    assert.equal(stillPaused.observed.length, 0);
    assert.equal(stillPaused.explicit.length, 1);
    assert.equal(stillPaused.temporary.length, 1);

    const recomputed = recomputeAndSaveTasteProfile(games, new Date('2026-07-11T00:01:00Z'));
    assert.ok(recomputed.observed.length > 0);
    assert.equal(recomputed.prompt.inferencePausedAt, undefined);
    assert.equal(recomputed.explicit.length, 1);
    assert.equal(recomputed.temporary.length, 1);
  } finally {
    restore();
  }
});

test('reset all Taste Profile clears every layer and prompt state', () => {
  const { store, restore } = installMemoryStorage();
  try {
    saveTasteProfile(normalizeTasteProfile({
      observed: [{ kind: 'tag', key: 'soulslike', label: 'Soulslike', sentiment: 'love', confidence: 0.8, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
      explicit: [{ kind: 'genre', key: 'sports', label: 'Sports', sentiment: 'avoid', confidence: 1, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
      temporary: [{ kind: 'tag', key: 'co-op', label: 'Co-op', sentiment: 'love', confidence: 1, strength: 'moderate', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' }],
      prompt: { firstReadyAt: '2026-07-11T00:00:00Z', inferencePausedAt: '2026-07-11T00:00:00Z' },
    }));

    const reset = resetAllTasteProfile();
    assert.equal(reset.observed.length, 0);
    assert.equal(reset.explicit.length, 0);
    assert.equal(reset.temporary.length, 0);
    assert.equal(Object.values(reset.prompt).some(Boolean), false);
    assert.ok(store.has(tasteProfileStorageKey));
  } finally {
    restore();
  }
});

test('hidden or rejected taste signals do not affect recommendation scoring', () => {
  const userProfile = buildUserProfile([]);
  const tasteProfile = normalizeTasteProfile({
    observed: [],
    explicit: [
      { kind: 'tag', key: 'deckbuilding', label: 'Deckbuilding', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, hidden: true, lastUpdatedAt: '2026-07-11T00:00:00Z' },
      { kind: 'tag', key: 'roguelite', label: 'Roguelite', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, rejectedAt: '2026-07-11T00:00:00Z', lastUpdatedAt: '2026-07-11T00:00:00Z' },
    ],
    temporary: [],
  });

  const hiddenMatch = scorePersonalRecommendationCandidate(rawg({ tags: [{ id: 1, name: 'Deckbuilding', slug: 'deckbuilding' }] }), userProfile, 0, { tasteProfile });
  const rejectedMatch = scorePersonalRecommendationCandidate(rawg({ tags: [{ id: 2, name: 'Roguelite', slug: 'roguelite' }] }), userProfile, 0, { tasteProfile });

  assert.equal(hiddenMatch.tasteProfileMatch, 0);
  assert.equal(rejectedMatch.tasteProfileMatch, 0);
});

test('highly rated finished games raise matching candidate scores', () => {
  const profile = buildUserProfile([game({ id: 'hades', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['roguelite'] })]);
  const matching = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 1, name: 'Action', slug: 'action' }], tags: [{ id: 1, name: 'Roguelite', slug: 'roguelite' }] }), profile);
  const unrelated = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 2, name: 'Puzzle', slug: 'puzzle' }], tags: [] }), profile);
  assert.ok(matching.total > unrelated.total);
});

test('taste profile contributes to recommendation scoring independently of user profile inference', () => {
  const userProfile = buildUserProfile([]);
  const tasteProfile = normalizeTasteProfile({
    explicit: [{ kind: 'tag', key: 'deckbuilding', label: 'Deckbuilding', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
    observed: [],
    temporary: [],
  });
  const matching = scorePersonalRecommendationCandidate(rawg({ tags: [{ id: 1, name: 'Deckbuilding', slug: 'deckbuilding' }] }), userProfile, 0, { tasteProfile });
  const unrelated = scorePersonalRecommendationCandidate(rawg({ tags: [{ id: 2, name: 'Fishing', slug: 'fishing' }] }), userProfile, 0, { tasteProfile });

  assert.ok(matching.tasteProfileMatch > 0);
  assert.ok(matching.total > unrelated.total);
});

test('low-rated finished games reduce matching candidate scores', () => {
  const profile = buildUserProfile([game({ id: 'bad', status: 'Finished', rating: 1, genres: ['Shooter'], rawgTags: ['military'] })]);
  const disliked = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 1, name: 'Shooter', slug: 'shooter' }], tags: [{ id: 1, name: 'Military', slug: 'military' }] }), profile);
  assert.ok(disliked.total < 0);
});

test('dropped, owned, finished, and wishlist games are filtered from discovery candidates', () => {
  const userGames = [
    game({ id: 'owned', rawgId: 1, status: 'Playing' }),
    game({ id: 'finished', rawgId: 2, status: 'Finished' }),
    game({ id: 'dropped', rawgId: 3, status: 'Dropped' }),
    game({ id: 'wish', rawgId: 4, collectionType: 'wishlist' }),
  ];
  const candidates = buildDiscoveryCandidates([1, 2, 3, 4, 5].map((rawgId) => discovery({ rawgId })), userGames);
  assert.deepEqual(candidates.map((c) => c.game.rawgId), [5]);
});

test('home profile changes when ratings change', () => {
  const fiveStar = buildUserProfile([game({ id: 'rpg', status: 'Finished', rating: 5, genres: ['RPG'] })]);
  const oneStar = buildUserProfile([game({ id: 'rpg', status: 'Finished', rating: 1, genres: ['RPG'] })]);
  assert.equal(fiveStar.topGenres[0]?.name, 'RPG');
  assert.equal(oneStar.topGenres.length, 0);
  assert.equal(oneStar.negativeGenres[0]?.name, 'RPG');
});

test('profile uses RAWG slugs for multi-word tags and genre mappings', () => {
  const profile = buildUserProfile([
    game({ id: 'tag', status: 'Finished', rating: 5, genres: ['RPG', 'Action'], rawgTags: ['Turn Based Tactics', 'Steam Achievements'] }),
  ]);

  assert.equal(profile.topGenres.find((genre) => genre.name === 'RPG')?.slug, 'role-playing-games-rpg');
  assert.equal(profile.topGenres.find((genre) => genre.name === 'Action')?.slug, 'action');
  assert.ok(profile.topTags.includes('turn-based-tactics'));
  assert.ok(!profile.topTags.includes('steam-achievements'));
});

test('slug fallback normalizes missing RAWG slugs for candidate scoring', () => {
  const profile = buildUserProfile([
    game({ id: 'liked', status: 'Finished', rating: 5, genres: ['Strategy'], rawgTags: ['Turn Based Tactics'] }),
  ]);
  const scored = scorePersonalRecommendationCandidate(rawg({
    genres: [{ id: 1, name: 'Strategy', slug: 'strategy' }],
    tags: [{ id: 1, name: 'Turn Based Tactics' }],
  }), profile);

  assert.equal(toSlug('Turn Based Tactics'), 'turn-based-tactics');
  assert.ok(scored.tagMatch > 0);
});

test('storefront and app metadata never become recommendation taste tags', () => {
  const profile = buildUserProfile([
    game({
      id: 'steam-meta',
      status: 'Finished',
      rating: 5,
      genres: ['Action'],
      rawgTags: ['imported', 'steam', 'steam achievements', 'steam cloud', 'full controller support', 'workshop', 'Roguelite'],
      tags: ['partial controller support', 'cloud saves', 'Deckbuilding'],
    }),
  ]);

  assert.equal(isGenericPreferenceTag('steam achievements'), true);
  assert.deepEqual(profile.topTags.sort(), ['deckbuilding', 'roguelite'].sort());
});

test('personal recommendation score dimensions stay within configured caps', () => {
  const profile = buildUserProfile([
    game({ id: 'a', title: 'Dragon Quest Alpha', rawgId: 1, rawgSlug: 'dragon-quest-alpha', status: 'Finished', rating: 5, genres: ['RPG', 'Strategy'], rawgTags: ['turn-based-combat', 'tactical-rpg'], developers: ['Studio A'], playtimeHours: 90 }),
    game({ id: 'b', title: 'Dragon Quest Beta', rawgId: 2, rawgSlug: 'dragon-quest-beta', status: 'Finished', rating: 5, genres: ['RPG'], rawgTags: ['turn-based-combat'], developers: ['Studio A'], playtimeHours: 60 }),
  ]);
  const score = scorePersonalRecommendationCandidate(rawg({
    name: 'Dragon Quest Gamma',
    slug: 'dragon-quest-gamma',
    metacritic: 95,
    rating: 4.8,
    ratings_count: 5000,
    released: '2026-01-01',
    genres: [{ id: 1, name: 'RPG', slug: 'role-playing-games-rpg' }, { id: 2, name: 'Strategy', slug: 'strategy' }],
    tags: [{ id: 1, name: 'Turn-Based Combat', slug: 'turn-based-combat' }, { id: 2, name: 'Tactical RPG', slug: 'tactical-rpg' }],
    developers: [{ id: 1, name: 'Studio A', slug: 'studio-a' }],
  }), profile, 0, { source: 'liked-game-series' });

  assert.ok(score.genreMatch <= 50);
  assert.ok(score.tagMatch <= 36);
  assert.ok(score.developerMatch <= 18);
  assert.ok(score.franchiseMatch <= 18);
  assert.ok(score.platformMatch <= 10);
  assert.ok(score.seedSimilarity <= 24);
  assert.ok(score.qualityMatch <= 12);
  assert.ok(score.recencyMatch <= 4);
  assert.ok(score.negativeMatch >= -40);
});

test('distinctive tag matches beat many broad or generic matches', () => {
  const profile = buildUserProfile([
    game({ id: 'liked', status: 'Finished', rating: 5, genres: ['Strategy'], rawgTags: ['deckbuilding', 'roguelite'] }),
    ...Array.from({ length: 25 }, (_, index) => game({ id: `owned-${index}`, status: 'Want to play', genres: ['Action'], rawgTags: ['open world', 'singleplayer'], collectionType: 'library' })),
  ]);
  const distinctive = scorePersonalRecommendationCandidate(rawg({ genres: [{ id: 1, name: 'Strategy', slug: 'strategy' }], tags: [{ id: 1, name: 'Deckbuilding', slug: 'deckbuilding' }] }), profile);
  const broad = scorePersonalRecommendationCandidate(rawg({
    genres: [{ id: 2, name: 'Action', slug: 'action' }, { id: 3, name: 'Adventure', slug: 'adventure' }],
    tags: ['Open World', 'Singleplayer', 'Multiplayer', 'Sandbox'].map((name, id) => ({ id, name, slug: toSlug(name) })),
  }), profile);

  assert.ok(distinctive.total > broad.total);
  assert.ok(distinctive.tagMatch > broad.tagMatch);
});

test('highly rated games outweigh hundreds of weak owned backlog items', () => {
  const backlog = Array.from({ length: 250 }, (_, index) => game({ id: `weak-${index}`, title: `Weak ${index}`, status: 'Want to play', genres: ['Action'], rawgTags: ['open world'], rawgId: index + 1000 }));
  const profile = buildUserProfile([
    ...backlog,
    game({ id: 'strong-a', status: 'Finished', rating: 5, genres: ['Strategy'], rawgTags: ['deckbuilding'], playtimeHours: 70 }),
    game({ id: 'strong-b', status: 'Finished', rating: 4, genres: ['Strategy'], rawgTags: ['roguelite'], playtimeHours: 55 }),
  ]);

  assert.equal(profile.topGenres[0]?.name, 'Strategy');
  assert.ok(profile.topTags.includes('deckbuilding'));
});

test('low-rated and dropped games create bounded negative overlap', () => {
  const oneBad = buildUserProfile([game({ id: 'bad', status: 'Finished', rating: 1, genres: ['Shooter'], rawgTags: ['military'] })]);
  const repeatedBad = buildUserProfile([
    game({ id: 'bad-a', status: 'Finished', rating: 1, genres: ['Shooter'], rawgTags: ['military'] }),
    game({ id: 'bad-b', status: 'Dropped', genres: ['Shooter'], rawgTags: ['military'] }),
  ]);
  const candidate = rawg({ genres: [{ id: 1, name: 'Shooter', slug: 'shooter' }], tags: [{ id: 1, name: 'Military', slug: 'military' }] });
  const oneScore = scorePersonalRecommendationCandidate(candidate, oneBad);
  const repeatedScore = scorePersonalRecommendationCandidate(candidate, repeatedBad);

  assert.ok(oneScore.negativeMatch < 0);
  assert.ok(repeatedScore.negativeMatch <= oneScore.negativeMatch);
  assert.ok(repeatedScore.negativeMatch >= -40);
  assert.deepEqual(repeatedScore.negativeTags, ['military']);
});

test('one disliked broad genre does not suppress several liked distinctive signals', () => {
  const profile = buildUserProfile([
    game({ id: 'liked-a', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['soulslike'] }),
    game({ id: 'liked-b', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['metroidvania'] }),
    game({ id: 'bad', status: 'Dropped', genres: ['Action'], rawgTags: ['open world'] }),
  ]);
  const score = scorePersonalRecommendationCandidate(rawg({
    genres: [{ id: 1, name: 'Action', slug: 'action' }],
    tags: [{ id: 1, name: 'Soulslike', slug: 'soulslike' }, { id: 2, name: 'Metroidvania', slug: 'metroidvania' }],
  }), profile);

  assert.ok(score.total > 0);
  assert.ok(score.tagMatch > Math.abs(score.negativeMatch));
});

test('mixed liked and disliked evidence remains transparent in score breakdown', () => {
  const profile = buildUserProfile([
    game({ id: 'liked', status: 'Finished', rating: 5, genres: ['Strategy'], rawgTags: ['tactical-rpg'] }),
    game({ id: 'bad', status: 'Dropped', genres: ['Strategy'], rawgTags: ['military'] }),
  ]);
  const score = scorePersonalRecommendationCandidate(rawg({
    genres: [{ id: 1, name: 'Strategy', slug: 'strategy' }],
    tags: [{ id: 1, name: 'Tactical RPG', slug: 'tactical-rpg' }, { id: 2, name: 'Military', slug: 'military' }],
  }), profile);

  assert.ok(score.positiveTags.includes('tactical-rpg'));
  assert.ok(score.negativeTags.includes('military'));
  assert.ok(score.total > score.negativeMatch);
});

test('seed selection is deterministic, tie-broken by rating and playtime, and excludes low-rated games', () => {
  const games = [
    game({ id: 'low', title: 'Low Rated', rawgId: 1, status: 'Finished', rating: 1, genres: ['Action'], rawgTags: ['soulslike'] }),
    game({ id: 'playtime', title: 'Playtime Pick', rawgId: 2, status: 'Finished', rating: 4, playtimeHours: 120, genres: ['Action'], rawgTags: ['soulslike'] }),
    game({ id: 'rating', title: 'Rating Pick', rawgId: 3, status: 'Finished', rating: 5, playtimeHours: 10, genres: ['Strategy'], rawgTags: ['deckbuilding'] }),
  ];
  const first = selectRecommendationSeeds(games, 3).seeds.map((seed) => seed.game.id);
  const second = selectRecommendationSeeds([...games].reverse(), 3).seeds.map((seed) => seed.game.id);

  assert.deepEqual(first, second);
  assert.equal(first[0], 'rating');
  assert.ok(!first.includes('low'));
});

test('seed selection diversifies across meaningful taste clusters and stays bounded', () => {
  const games = [
    game({ id: 'deck-a', rawgId: 1, status: 'Finished', rating: 5, rawgTags: ['deckbuilding'], genres: ['Strategy'] }),
    game({ id: 'deck-b', rawgId: 2, status: 'Finished', rating: 5, rawgTags: ['deckbuilding'], genres: ['Strategy'] }),
    game({ id: 'soul-a', rawgId: 3, status: 'Finished', rating: 5, rawgTags: ['soulslike'], genres: ['Action'] }),
    game({ id: 'rpg-a', rawgId: 4, status: 'Finished', rating: 5, rawgTags: ['turn-based-combat'], genres: ['RPG'] }),
  ];
  const { seeds } = selectRecommendationSeeds(games, 3);

  assert.equal(seeds.length, 3);
  assert.equal(new Set(seeds.map((seed) => seed.cluster)).size, 3);
});

test('developer affinity is bounded and supports positive and negative evidence', () => {
  const likedProfile = buildUserProfile([
    game({ id: 'dev-a', status: 'Finished', rating: 5, developers: ['Studio Good'], rawgTags: ['roguelite'], genres: ['Action'] }),
    game({ id: 'dev-b', status: 'Finished', rating: 4, developers: ['Studio Good'], rawgTags: ['deckbuilding'], genres: ['Strategy'] }),
  ]);
  const dislikedProfile = buildUserProfile([
    game({ id: 'dev-bad', status: 'Dropped', developers: ['Studio Bad'], rawgTags: ['military'], genres: ['Shooter'] }),
  ]);
  const liked = scorePersonalRecommendationCandidate(rawg({ developers: [{ id: 1, name: 'Studio Good', slug: 'studio-good' }] }), likedProfile);
  const disliked = scorePersonalRecommendationCandidate(rawg({ developers: [{ id: 2, name: 'Studio Bad', slug: 'studio-bad' }] }), dislikedProfile);

  assert.ok(liked.developerMatch > 0);
  assert.ok(liked.developerMatch <= 18);
  assert.ok(disliked.negativeDevelopers.includes('Studio Bad'));
  assert.ok(disliked.negativeMatch < 0);
});

test('franchise affinity requires repeated profile evidence and remains bounded', () => {
  const repeated = buildUserProfile([
    game({ id: 'series-a', title: 'Sky Saga 1', rawgSlug: 'sky-saga-1', status: 'Finished', rating: 5, genres: ['RPG'] }),
    game({ id: 'series-b', title: 'Sky Saga 2', rawgSlug: 'sky-saga-2', status: 'Finished', rating: 4, genres: ['RPG'] }),
  ]);
  const single = buildUserProfile([
    game({ id: 'solo', title: 'Moon Saga 1', rawgSlug: 'moon-saga-1', status: 'Finished', rating: 5, genres: ['RPG'] }),
  ]);
  const repeatedScore = scorePersonalRecommendationCandidate(rawg({ name: 'Sky Saga 3', slug: 'sky-saga-3' }), repeated);
  const singleScore = scorePersonalRecommendationCandidate(rawg({ name: 'Moon Saga 2', slug: 'moon-saga-2' }), single);

  assert.ok(repeatedScore.franchiseMatch > 0);
  assert.ok(repeatedScore.franchiseMatch <= 18);
  assert.equal(singleScore.franchiseMatch, 0);
});

test('recommendation reasons reference actual strongest non-generic score signals', () => {
  const profile = buildUserProfile([
    game({ id: 'liked', status: 'Finished', rating: 5, rawgTags: ['deckbuilding'], genres: ['Strategy'] }),
  ]);
  const candidate = rawg({ tags: [{ id: 1, name: 'Deckbuilding', slug: 'deckbuilding' }] });
  const score = scorePersonalRecommendationCandidate(candidate, profile);
  const reason = generateRecommendationReasonForTest(candidate, score, profile, 'affinity-strict');

  assert.match(reason, /Deckbuilding/);
  assert.doesNotMatch(reason, /steam|imported|controller/i);
});

test('final selection respects primary genre hard cap when alternatives exist', () => {
  const names = ['Amber', 'Beryl', 'Cobalt', 'Dawn', 'Ember', 'Fable', 'Grove', 'Harbor'];
  const sources = ['affinity-strict', 'liked-game-similar', 'plans-wishlist', 'affinity-relaxed'] as const;
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => scoredCandidate({ id: index + 1, name: `${names[index]} Action`, score: 80 - index, source: sources[index % sources.length], genre: 'Action', tag: 'soulslike', seedKey: sources[index % sources.length] === 'liked-game-similar' ? `seed-a-${index}` : undefined })),
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 20, name: `${names[index]} Strategy`, score: 70 - index, source: sources[(index + 1) % sources.length], genre: 'Strategy', tag: 'deckbuilding', seedKey: sources[(index + 1) % sources.length] === 'liked-game-similar' ? `seed-s-${index}` : undefined })),
    ...Array.from({ length: 4 }, (_, index) => scoredCandidate({ id: index + 40, name: `${names[index]} Puzzle`, score: 62 - index, source: sources[(index + 2) % sources.length], genre: 'Puzzle', tag: 'puzzle-platformer', seedKey: sources[(index + 2) % sources.length] === 'liked-game-similar' ? `seed-p-${index}` : undefined })),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 10);

  assert.ok((diagnostics.primaryGenreCountsAfter.action ?? 0) <= 4);
  assert.equal(diagnostics.selectedCount, 10);
});

test('final selection does not replace a very strong candidate with a weak candidate solely for genre variety', () => {
  const names = ['Amber', 'Beryl', 'Cobalt', 'Dawn'];
  const candidates = [
    ...Array.from({ length: 4 }, (_, index) => scoredCandidate({ id: index + 1, name: `${names[index]} Strong`, score: 100 - index, genre: 'Action', tag: 'soulslike' })),
    scoredCandidate({ id: 99, name: 'Weak Puzzle', score: 2, genre: 'Puzzle', tag: 'puzzle-platformer' }),
  ];
  const { selected } = selectFinalRecommendationCandidates(candidates, 5);

  assert.equal(selected.length, 4);
  assert.ok(!selected.some((item) => item.result.id === 99));
});

test('franchise and developer caps prevent one series or studio from filling the shelf', () => {
  const candidates = [
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 1, name: `Sky Saga ${index + 1}`, slug: `sky-saga-${index + 1}`, score: 90 - index, genre: 'RPG', tag: 'turn-based-combat', developer: 'Studio One' })),
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 20, name: `Moon Tactics ${index + 1}`, slug: `moon-tactics-${index + 1}`, score: 82 - index, genre: 'Strategy', tag: 'tactical-rpg', developer: `Studio ${index + 2}` })),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 10);

  assert.ok((diagnostics.franchiseCountsAfter['sky-saga'] ?? 0) <= 3);
  assert.ok((diagnostics.developerCountsAfter['Studio One'] ?? 0) <= 3);
});

test('reduced franchise repetition preference tightens final franchise caps', () => {
  const candidates = [
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 1, name: `Sky Saga ${index + 1}`, slug: `sky-saga-${index + 1}`, score: 90 - index, genre: 'RPG', tag: 'turn-based-combat', developer: `Studio ${index}` })),
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 20, name: `Moon Tactics ${index + 1}`, slug: `moon-tactics-${index + 1}`, score: 82 - index, genre: 'Strategy', tag: 'tactical-rpg', developer: `Moon Studio ${index}` })),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 10, { reduceFranchiseRepetition: true });

  assert.ok((diagnostics.franchiseCountsAfter['sky-saga'] ?? 0) <= 2);
});

test('unknown franchise and developer metadata does not group unrelated games', () => {
  const candidates = [
    scoredCandidate({ id: 1, name: 'North Star', score: 60, genre: 'Puzzle' }),
    scoredCandidate({ id: 2, name: 'South Star', score: 59, genre: 'Puzzle' }),
    scoredCandidate({ id: 3, name: 'East Star', score: 58, genre: 'Puzzle' }),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 3);

  assert.equal(diagnostics.franchiseCountsAfter['star'], undefined);
  assert.equal(diagnostics.selectedCount, 3);
});

test('source and seed balancing cap overrepresentation when alternatives exist', () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => scoredCandidate({ id: index + 1, name: `Seed Pick ${index + 1}`, score: 90 - index, source: 'liked-game-similar', genre: index < 4 ? 'Action' : 'Strategy', tag: index < 4 ? 'soulslike' : 'deckbuilding', seedKey: 'seed-a' })),
    ...Array.from({ length: 6 }, (_, index) => scoredCandidate({ id: index + 20, name: `Affinity Pick ${index + 1}`, score: 78 - index, source: 'affinity-strict', genre: 'RPG', tag: 'turn-based-combat', seedKey: `seed-${index + 2}` })),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 10);

  assert.ok((diagnostics.sourceCountsAfter.seed ?? 0) <= 7);
  assert.ok(diagnostics.candidates.filter((candidate) => candidate.selected && candidate.seedKey === 'seed-a').length <= 3);
});

test('fallback candidates are capped and broad fallback is labeled', () => {
  const names = ['Amber', 'Beryl', 'Cobalt', 'Dawn', 'Ember', 'Fable', 'Grove', 'Harbor'];
  const genres = ['Strategy', 'RPG', 'Puzzle', 'Simulation', 'Racing', 'Platformer', 'Shooter', 'Fighting'];
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => scoredCandidate({ id: index + 1, name: `${names[index]} Personal`, score: 80 - index, source: index % 2 ? 'liked-game-similar' : 'affinity-strict', genre: genres[index], tag: index % 2 ? 'turn-based-combat' : 'deckbuilding', seedKey: index % 2 ? `seed-${index}` : undefined })),
    ...Array.from({ length: 8 }, (_, index) => scoredCandidate({ id: index + 20, name: `${names[index]} Fallback`, score: 60 - index, source: 'trending', genre: 'Action' })),
  ];
  const { diagnostics } = selectFinalRecommendationCandidates(candidates, 10);

  assert.ok((diagnostics.fallbackTierCountsAfter['tier3-broad'] ?? 0) <= 3);
  assert.ok((diagnostics.fallbackTierCountsAfter['tier0-personalized'] ?? 0) + (diagnostics.fallbackTierCountsAfter['tier1-taste-quality'] ?? 0) >= 7);
});

test('near-duplicate editions collapse but sequels remain separate', () => {
  const candidates = [
    scoredCandidate({ id: 1, name: 'Aurora Quest', score: 60, genre: 'RPG', tag: 'turn-based-combat', image: null }),
    scoredCandidate({ id: 2, name: 'Aurora Quest Definitive Edition', score: 65, genre: 'RPG', tag: 'turn-based-combat' }),
    scoredCandidate({ id: 3, name: 'Aurora Quest 2', score: 58, genre: 'RPG', tag: 'turn-based-combat' }),
  ];
  const { selected, diagnostics } = selectFinalRecommendationCandidates(candidates, 3);

  assert.ok(selected.some((item) => item.result.id === 2));
  assert.ok(selected.some((item) => item.result.id === 3));
  assert.ok(!selected.some((item) => item.result.id === 1));
  assert.equal(diagnostics.nearDuplicateSuppressions.length, 1);
});

test('final selection is deterministic for identical inputs independent of input order', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => scoredCandidate({ id: index + 1, name: `Pick ${index + 1}`, score: 70 - (index % 3), genre: index % 2 ? 'Action' : 'Strategy', tag: index % 2 ? 'soulslike' : 'deckbuilding' }));
  const first = selectFinalRecommendationCandidates(candidates, 10).selected.map((item) => item.result.id);
  const second = selectFinalRecommendationCandidates([...candidates].reverse(), 10).selected.map((item) => item.result.id);

  assert.deepEqual(first, second);
});


test('release calendar builds an upcoming date range from today through the selected window', () => {
  assert.equal(getUpcomingDateRange(30, new Date('2026-07-08T12:00:00Z')), '2026-07-08,2026-08-07');
  assert.equal(getUpcomingDateRange(90, new Date('2026-07-08T12:00:00Z')), '2026-07-08,2026-10-06');
});

test('release calendar ignored games are persisted as RAWG ids', () => {
  const store = new Map<string, string>();
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } as Storage;
  ignoreReleaseCalendarGame(1234);
  assert.deepEqual([...getIgnoredReleaseRawgIds()], [1234]);
});


test('release calendar relaxes thresholds to keep a healthy upcoming pool', () => {
  const userGames = [
    game({ id: 'liked', title: 'Loved Action', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['roguelite'], platform: 'Steam' }),
    game({ id: 'plan', title: 'Planned RPG', status: 'Want to play', genres: ['RPG'], rawgTags: ['party'], platform: 'Steam' }),
  ];
  const results = [
    rawg({ id: 1, name: 'Strong Action', genres: [{ id: 1, name: 'Action', slug: 'action' }], tags: [{ id: 1, name: 'Roguelite', slug: 'roguelite' }], rating: 4.2, ratings_count: 900 }),
    rawg({ id: 2, name: 'RPG Plan', genres: [{ id: 2, name: 'RPG', slug: 'role-playing-games-rpg' }], tags: [{ id: 2, name: 'Party', slug: 'party' }] }),
    rawg({ id: 3, name: 'Puzzle North', genres: [{ id: 3, name: 'Puzzle', slug: 'puzzle' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 4, name: 'Strategy East', genres: [{ id: 4, name: 'Strategy', slug: 'strategy' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 5, name: 'Adventure South', genres: [{ id: 5, name: 'Adventure', slug: 'adventure' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 6, name: 'Simulation West', genres: [{ id: 6, name: 'Simulation', slug: 'simulation' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 7, name: 'Racing Nova', genres: [{ id: 7, name: 'Racing', slug: 'racing' }], rating: 4.1, ratings_count: 1200 }),
    rawg({ id: 8, name: 'Sports Orbit', genres: [{ id: 8, name: 'Sports', slug: 'sports' }], platforms: [], rating: 4.1, ratings_count: 1200 }),
  ];
  const ranked = rankReleaseCalendarResults(results, userGames);
  assert.equal(ranked.length, 8);
  assert.equal(ranked[0].result.id, 1);
  assert.ok(ranked.some((item) => item.pass === 'general'));
});

test('release calendar diversity avoids one genre or franchise taking over', () => {
  const userGames = [game({ id: 'liked', status: 'Finished', rating: 5, genres: ['Action'], rawgTags: ['soulslike'], platform: 'Steam' })];
  const results = Array.from({ length: 8 }, (_, index) => rawg({
    id: index + 10,
    name: `Dragon Quest ${index + 1}`,
    slug: `dragon-quest-${index + 1}`,
    genres: [{ id: 1, name: 'Action', slug: 'action' }],
    tags: [{ id: 1, name: 'Soulslike', slug: 'soulslike' }],
    rating: 4.5,
    ratings_count: 2000,
  })).concat([
    rawg({ id: 30, name: 'Puzzle Star', genres: [{ id: 2, name: 'Puzzle', slug: 'puzzle' }], rating: 4.2, ratings_count: 1000 }),
    rawg({ id: 31, name: 'Strategy Moon', genres: [{ id: 3, name: 'Strategy', slug: 'strategy' }], rating: 4.2, ratings_count: 1000 }),
  ]);
  const ranked = rankReleaseCalendarResults(results, userGames);
  assert.ok(ranked.filter((item) => item.result.name.startsWith('Dragon Quest')).length <= 2);
  assert.ok(new Set(ranked.map((item) => item.result.genres?.[0]?.name)).size > 1);
});

test('release calendar uses Taste Profile as a ranking signal', () => {
  const userGames = [game({ id: 'neutral', status: 'Want to play', genres: ['Action'], platform: 'Steam' })];
  const tasteProfile = normalizeTasteProfile({
    observed: [],
    explicit: [{ kind: 'tag', key: 'deckbuilding', label: 'Deckbuilding', sentiment: 'love', confidence: 1, strength: 'strong', evidence: {}, lastUpdatedAt: '2026-07-11T00:00:00Z' }],
    temporary: [],
  });
  const ranked = rankReleaseCalendarResults([
    rawg({ id: 1, name: 'Deck Future', genres: [{ id: 1, name: 'Strategy', slug: 'strategy' }], tags: [{ id: 1, name: 'Deckbuilding', slug: 'deckbuilding' }] }),
    rawg({ id: 2, name: 'Generic Future', genres: [{ id: 2, name: 'Action', slug: 'action' }], tags: [] }),
  ], userGames, tasteProfile);

  assert.equal(ranked[0].result.id, 1);
  assert.match(ranked[0].reason, /Taste Profile|liked/);
});
