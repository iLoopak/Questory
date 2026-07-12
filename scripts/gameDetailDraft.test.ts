/**
 * AS-08 — Game Detail can submit a stale copied record.
 *
 * `GameDetailView` copies the whole game into `editDraft` on mount, but its resync effect
 * depends only on `[game.id, game.tags]`. Any other canonical change — a note committed by
 * `NotesField` on blur, a status change, a metadata refresh — leaves the draft stale. Opening
 * the editor does NOT re-initialize it, and `getGameEditChanges` then submits EVERY field,
 * so saving an unrelated title edit writes the old notes/status/rating back over the new ones.
 *
 * These tests drive the real component and CHARACTERIZE the overwrite. No behavior is changed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestEnvironment, resetWebStorage } from './testUtils/testEnvironment';
import { makeLibraryGame } from './testUtils/gameFixtures';
import { actAsync, renderComponent } from './testUtils/reactHarness';
import type { Game } from '../src/types/game';

assertTestEnvironment();

const { GameDetailView } = await import('../src/components/GameDetailView');

type EditCall = { gameId: string; changes: Partial<Game> };
type TrackingCall = { gameId: string; tracking: Partial<Game> };

type Harness = {
  rerenderWithGame: (game: Game) => Promise<void>;
  unmount: () => Promise<void>;
  edits: EditCall[];
  tracking: TrackingCall[];
};

async function renderDetail(game: Game): Promise<Harness> {
  const edits: EditCall[] = [];
  const tracking: TrackingCall[] = [];

  const props = (currentGame: Game) => ({
    game: currentGame,
    onBack: () => {},
    onTrackingChange: (gameId: string, next: Partial<Game>) => {
      tracking.push({ gameId, tracking: next });
    },
    onGameEdit: (gameId: string, changes: Partial<Game>) => {
      edits.push({ gameId, changes });
    },
  });

  const handle = await renderComponent(GameDetailView as never, props(game) as never);

  return {
    rerenderWithGame: (nextGame: Game) => handle.rerender(props(nextGame) as never),
    unmount: handle.unmount,
    edits,
    tracking,
  };
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll('button')].find(
    (button) => (button.getAttribute('aria-label') || button.textContent || '').trim() === text,
  );

/**
 * Set a React-controlled field's value the way a real keystroke would.
 *
 * The value has to go through the PROTOTYPE setter: React installs its own `value` property on
 * the node to track the last-seen value, and writing through that own setter would update the
 * tracker too, leaving React with nothing to report as a change.
 */
function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;

  field.focus();
  valueSetter.call(field, value);
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
}

/** Type into the detail Notes field and blur it, which is what commits the note. */
async function commitNote(note: string): Promise<void> {
  const notesField = document.querySelector('textarea') as HTMLTextAreaElement;
  await actAsync(() => {
    setFieldValue(notesField, note);
  });
  await actAsync(() => {
    // React maps onBlur to the bubbling focusout event.
    notesField.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  });
}

/** Open the editor via the overflow menu, as a user does. */
async function openEditor(): Promise<void> {
  await actAsync(() => {
    buttonByText('More actions')!.click();
  });
  await actAsync(() => {
    buttonByText('Edit')!.click();
  });
}

async function saveEditor(): Promise<void> {
  await actAsync(() => {
    buttonByText('Save')!.click();
  });
}

const baseGame = () =>
  makeLibraryGame({
    id: 'g1',
    title: 'Celeste',
    notes: 'original note',
    status: 'Playing',
    rating: 3,
  });

test('AS-08: a note committed via the notes field is overwritten when the editor is saved', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  // 1. The user writes a note and blurs. The parent updates the canonical game.
  await commitNote('a much better note');
  assert.equal(harness.tracking.at(-1)?.tracking.notes, 'a much better note', 'the note was committed upward');

  const canonical: Game = { ...game, notes: 'a much better note' };
  await harness.rerenderWithGame(canonical);

  // 2. The user opens the editor. `game.id` and `game.tags` are unchanged, so the resync
  //    effect does not fire and `editDraft` still holds the note from mount time.
  await openEditor();

  // 3. They save (having changed nothing in the form).
  await saveEditor();

  // Documents unsafe current behavior: the save submits every field from the stale draft, so
  // the note the user just wrote is replaced by the one it superseded.
  const lastEdit = harness.edits.at(-1);
  assert.ok(lastEdit, 'the editor submitted changes');
  assert.equal(lastEdit.changes.notes, 'original note', 'the newer note was overwritten by the stale draft');

  await harness.unmount();
});

test('AS-08: an unrelated title edit resurrects the stale note', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await commitNote('a much better note');
  await harness.rerenderWithGame({ ...game, notes: 'a much better note' });

  await openEditor();

  // The user only intends to fix the title.
  const titleField = document.querySelector('input') as HTMLInputElement;
  await actAsync(() => {
    setFieldValue(titleField, 'Celeste (2018)');
  });
  await saveEditor();

  const changes = harness.edits.at(-1)!.changes;

  // The title edit they asked for lands...
  assert.equal(changes.title, 'Celeste (2018)');
  // Documents unsafe current behavior: ...and silently drags the old note along with it.
  assert.equal(changes.notes, 'original note', 'an unrelated edit restored the stale note');

  await harness.unmount();
});

test('AS-08: canonical status/rating changes while the editor is open are overwritten on save', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  // The editor is opened while the game is Playing with rating 3.
  await openEditor();

  // Meanwhile the canonical record changes underneath — e.g. the user marks it Finished from
  // the status bar, or a metadata refresh lands. Same id, same tags, so no resync.
  await harness.rerenderWithGame({ ...game, status: 'Finished', rating: 5, finishedAt: '2026-07-10T00:00:00.000Z' });

  await saveEditor();

  const changes = harness.edits.at(-1)!.changes;

  // Documents unsafe current behavior: the open editor still holds the pre-change values and
  // submits them, reverting the newer canonical status and rating.
  assert.equal(changes.status, 'Playing', 'the newer Finished status was overwritten');
  assert.equal(changes.rating, 3, 'the newer rating was overwritten');

  await harness.unmount();
});

test('AS-08: the draft DOES resync when tags change — the effect only tracks id and tags', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await commitNote('a much better note');

  // A tags change is one of the two dependencies, so this rerender re-initializes the draft
  // from the canonical game — and the newer note is picked up as a side effect.
  await harness.rerenderWithGame({ ...game, notes: 'a much better note', tags: ['metroidvania'] });

  await openEditor();
  await saveEditor();

  const changes = harness.edits.at(-1)!.changes;

  // This is the control case: it shows the staleness is not random, it is exactly the
  // dependency array. Whether the user loses their note depends on whether an unrelated
  // field (tags) happened to change too.
  assert.equal(changes.notes, 'a much better note', 'the draft resynced because tags changed');

  await harness.unmount();
});

test('AS-08: navigating to another game resyncs the draft (game.id is a dependency)', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  const otherGame = makeLibraryGame({ id: 'g2', title: 'Hades', notes: 'hades note', status: 'Want to play' });
  await harness.rerenderWithGame(otherGame);

  await openEditor();
  await saveEditor();

  const lastEdit = harness.edits.at(-1)!;
  assert.equal(lastEdit.gameId, 'g2');
  assert.equal(lastEdit.changes.notes, 'hades note', 'the draft follows the selected game');
  assert.equal(lastEdit.changes.title, 'Hades');

  await harness.unmount();
});
