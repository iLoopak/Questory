/**
 * AS-08 — the patch contract, tested without React.
 *
 * `gameEditPatch` is the whole safety property of the Game Detail editor: a save carries only the
 * fields the user touched, a conflict is only the overlap between what they touched and what moved
 * canonically, and a patch can never name a field outside the editor's own form. Those three rules
 * are pure functions, so they are checked here directly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import {
  applyGameEditPatch,
  buildGameEditPatch,
  createEditDraft,
  detectEditConflicts,
  getDirtyEditFields,
  validateEditDraft,
} from '../src/lib/gameEditPatch';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const baseGame = (overrides: Partial<Game> = {}): Game =>
  makeLibraryGame({
    id: 'g1',
    title: 'Celeste',
    platform: 'PC',
    status: 'Playing',
    notes: 'original note',
    rating: 3,
    tags: ['platformer'],
    ...overrides,
  });

test('a title-only edit produces a title-only patch', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste (2018)' };

  const dirty = getDirtyEditFields(base, draft);
  assert.deepEqual(dirty, ['title']);

  const patch = buildGameEditPatch(game, draft, dirty);
  assert.equal(patch.title, 'Celeste (2018)');
  // The old save shipped every field; nothing the user did not touch may appear now.
  assert.equal('notes' in patch, false);
  assert.equal('status' in patch, false);
  assert.equal('rating' in patch, false);
  assert.equal('tags' in patch, false);
  assert.equal('platform' in patch, false);
});

test('a platform-only edit produces a platform-only patch', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, platform: 'Switch' as const };

  const patch = buildGameEditPatch(game, draft, getDirtyEditFields(base, draft));
  assert.deepEqual(patch, { platform: 'Switch' });
});

test('a tags-only edit produces a tags-only patch, parsed and de-duplicated', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, tags: 'platformer, indie , indie' };

  const patch = buildGameEditPatch(game, draft, getDirtyEditFields(base, draft));
  assert.deepEqual(patch, { tags: ['platformer', 'indie'] });
});

test('clearing the rating box is an intentional clear, not an omission', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, rating: '' };

  const patch = buildGameEditPatch(game, draft, getDirtyEditFields(base, draft));
  assert.equal(patch.rating, null, 'an explicit null clears the rating');
  assert.equal('rating' in patch, true);
});

test('a save that changes nothing produces an empty patch', () => {
  const game = baseGame();
  const base = createEditDraft(game);

  assert.deepEqual(getDirtyEditFields(base, base), []);
  assert.deepEqual(buildGameEditPatch(game, base, []), {});
});

test('manual cover changes record and clear the user artwork override', () => {
  const game = baseGame({ coverImage: 'provider.jpg', artworkSource: 'rawg', artworkUpdatedAt: '2025-01-01T00:00:00.000Z' });
  const base = createEditDraft(game);
  const setPatch = buildGameEditPatch(game, { ...base, coverImage: 'https://cdn/custom.jpg' }, ['coverImage']);
  assert.equal(setPatch.artworkSource, 'user');
  assert.match(setPatch.artworkUpdatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
  const cleared = buildGameEditPatch({ ...game, ...setPatch }, { ...base, coverImage: '' }, ['coverImage']);
  assert.equal(cleared.coverImage, '');
  assert.equal(cleared.artworkSource, undefined);
  assert.equal(cleared.artworkUpdatedAt, undefined);
  assert.equal('artworkSource' in cleared, true, 'the clear is explicit');
});

test('a patch never touches metadata, artwork or provider fields', () => {
  const game = baseGame({
    heroImage: 'https://cdn/hero.jpg',
    logoImage: 'https://cdn/logo.png',
    artworkSource: 'steamgriddb',
    rawgId: 4321,
    steamAppId: 504230,
    finishedAt: '2026-01-01T00:00:00.000Z',
  });
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste (2018)', notes: 'new note', favorite: true };

  const patch = buildGameEditPatch(game, draft, getDirtyEditFields(base, draft));
  const applied = applyGameEditPatch(game, patch);

  assert.equal(applied.heroImage, game.heroImage);
  assert.equal(applied.logoImage, game.logoImage);
  assert.equal(applied.artworkSource, game.artworkSource);
  assert.equal(applied.rawgId, game.rawgId);
  assert.equal(applied.steamAppId, game.steamAppId);
  assert.equal(applied.finishedAt, game.finishedAt);
  // …and the fields the user did edit are the ones that moved.
  assert.equal(applied.title, 'Celeste (2018)');
  assert.equal(applied.notes, 'new note');
  assert.equal(applied.favorite, true);
});

test('a canonical change to a field the user did not touch is not a conflict', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste (2018)' };
  const dirty = getDirtyEditFields(base, draft);

  // Somebody finished the game and rated it while the editor was open.
  const canonical = createEditDraft({ ...game, status: 'Finished', rating: 5 });

  assert.deepEqual(detectEditConflicts(base, canonical, dirty), [], 'unrelated newer data must not block the save');

  const patch = buildGameEditPatch(game, draft, dirty);
  assert.equal('status' in patch, false, 'and the newer status is not in the payload to be reverted');
  assert.equal('rating' in patch, false);
});

test('a conflict is the overlap: the user edited a field that also changed canonically', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste (2018)', platform: 'Switch' as const };
  const dirty = getDirtyEditFields(base, draft);

  const canonical = createEditDraft({ ...game, title: 'Celeste Classic', notes: 'note from elsewhere' });

  // notes moved canonically but the user did not touch it; platform is the user's alone.
  assert.deepEqual(detectEditConflicts(base, canonical, dirty), ['title']);
});

test('keeping the newer value still saves the rest of the edit', () => {
  const game = baseGame();
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste (2018)', platform: 'Switch' as const };
  const dirty = getDirtyEditFields(base, draft);
  const conflicts = detectEditConflicts(base, createEditDraft({ ...game, title: 'Celeste Classic' }), dirty);

  const patch = buildGameEditPatch(game, draft, dirty, conflicts);

  assert.equal('title' in patch, false, 'the conflicting field is yielded');
  assert.equal(patch.platform, 'Switch', 'the non-conflicting edit still lands');
});

test('a corrected title clears a stale display override and keeps the imported name for retro games', () => {
  const game = baseGame({
    externalSource: 'retro-rom',
    romPath: '/roms/celeste.gb',
    displayTitleOverride: 'Celeste',
    title: 'celeste (usa) [!]',
  });
  const base = createEditDraft(game);
  const draft = { ...base, title: 'Celeste' };
  const patchNoChange = buildGameEditPatch(game, draft, getDirtyEditFields(base, draft));
  assert.deepEqual(patchNoChange, {}, 'the draft opened with the display title, so this is not an edit');

  const corrected = { ...base, title: 'Celeste Classic' };
  const patch = buildGameEditPatch(game, corrected, getDirtyEditFields(base, corrected));
  assert.equal(patch.title, 'Celeste Classic');
  assert.equal(patch.displayTitleOverride, 'Celeste Classic');
  assert.equal(patch.metadataSearchTitle, 'Celeste Classic', 'metadata lookups follow the corrected title');
  assert.equal(patch.originalImportedTitle, 'celeste (usa) [!]', 'the raw imported name is kept once');
});

test('validation rules are unchanged', () => {
  const base = createEditDraft(baseGame());

  assert.equal(validateEditDraft(base), '');
  assert.equal(validateEditDraft({ ...base, title: '   ' }), 'Title cannot be empty.');
  assert.equal(validateEditDraft({ ...base, platform: 'Dreamcast' as never }), 'Platform must be valid.');
  assert.equal(validateEditDraft({ ...base, coverImage: 'not-a-url' }), 'Cover image must be a valid URL.');
  assert.equal(validateEditDraft({ ...base, rating: 'nine' }), 'Rating must be a number between 0 and 5.');
  assert.equal(validateEditDraft({ ...base, rating: '9' }), 'Rating must be between 0 and 5.');
  assert.equal(validateEditDraft({ ...base, coverImage: 'https://cdn/cover.jpg' }), '');
});
