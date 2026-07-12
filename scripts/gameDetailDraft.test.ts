/**
 * AS-08 — Game Detail must not submit a stale copy of the record.
 *
 * These tests used to CHARACTERIZE the overwrite: the view copied the whole game into `editDraft`
 * on mount, resynced only when `[game.id, game.tags]` changed, and submitted every field on save —
 * so a note committed by `NotesField` on blur, a status change from another surface or a metadata
 * refresh was reverted the moment the user saved an unrelated field.
 *
 * They now assert the fix, driving the real component: the editor is initialized when it OPENS,
 * only dirty fields are submitted, and a field the user edited that also moved canonically raises a
 * conflict instead of silently winning.
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

/** The editor's fields are `<label><span>Label</span><input/></label>`. */
function editorField<T extends HTMLElement>(label: string): T {
  const field = [...document.querySelectorAll('label')]
    .find((node) => node.querySelector('span')?.textContent?.trim() === label)
    ?.querySelector('input, select, textarea');
  assert.ok(field, `the editor has a "${label}" field`);
  return field as T;
}

/** The standalone notes field is the only textarea with a placeholder; the editor's has none. */
const standaloneNotesField = () => document.querySelector('textarea[placeholder]') as HTMLTextAreaElement;

/**
 * Set a React-controlled field's value the way a real keystroke would.
 *
 * The value has to go through the PROTOTYPE setter: React installs its own `value` property on
 * the node to track the last-seen value, and writing through that own setter would update the
 * tracker too, leaving React with nothing to report as a change.
 */
function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const prototype =
    field.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : field.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;

  field.focus();
  valueSetter.call(field, value);
  field.dispatchEvent(new window.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

const typeIn = (field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) =>
  actAsync(() => {
    setFieldValue(field, value);
  });

/** Type into the detail Notes field and blur it, which is what commits the note. */
async function commitNote(note: string): Promise<void> {
  const notesField = standaloneNotesField();
  await typeIn(notesField, note);
  await actAsync(() => {
    // React maps onBlur to the bubbling focusout event.
    notesField.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  });
}

/**
 * Open the editor via the overflow menu, as a user does.
 *
 * The menu runs its items through `closeAndRun`, which defers the action by `setTimeout(fn, 0)` so
 * the sheet can close first — the click alone does not open the editor. Flushing that timer is what
 * makes this deterministic.
 */
async function openEditor(): Promise<void> {
  await actAsync(() => {
    buttonByText('More actions')!.click();
  });
  await actAsync(() => {
    buttonByText('Edit')!.click();
  });
  await actAsync(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

const clickButton = (text: string) =>
  actAsync(() => {
    const button = buttonByText(text);
    assert.ok(button, `the "${text}" button is on screen`);
    button.click();
  });

const saveEditor = () => clickButton('Save');
const isEditorOpen = () => Boolean(buttonByText('Save'));
const conflictDialog = () => document.querySelector('[aria-label="Resolve edit conflict"]');

const baseGame = () =>
  makeLibraryGame({
    id: 'g1',
    title: 'Celeste',
    platform: 'PC',
    notes: 'original note',
    status: 'Playing',
    rating: 3,
  });

test('AS-08: saving without changing anything submits nothing', async () => {
  resetWebStorage();
  const harness = await renderDetail(baseGame());

  await openEditor();
  await saveEditor();

  assert.deepEqual(harness.edits, [], 'a no-op save writes no patch, so it cannot bump updatedAt either');
  assert.equal(isEditorOpen(), false, 'and the editor closes');

  await harness.unmount();
});

test('AS-08: a note committed via the notes field survives an unrelated editor save', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  // 1. The user writes a note and blurs. The parent updates the canonical game.
  await commitNote('a much better note');
  assert.equal(harness.tracking.at(-1)?.tracking.notes, 'a much better note', 'the note was committed upward');
  await harness.rerenderWithGame({ ...game, notes: 'a much better note' });

  // 2. They open the editor and change only the platform.
  await openEditor();
  await typeIn(editorField<HTMLSelectElement>('Platform'), 'Switch');
  await saveEditor();

  const changes = harness.edits.at(-1)!.changes;
  assert.deepEqual(changes, { platform: 'Switch' }, 'only the platform is submitted');
  assert.equal('notes' in changes, false, 'the note the user just wrote is not in the payload at all');

  await harness.unmount();
});

test('AS-08: a title edit carries no other field with it', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await commitNote('a much better note');
  await harness.rerenderWithGame({ ...game, notes: 'a much better note' });

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Celeste (2018)');
  await saveEditor();

  const changes = harness.edits.at(-1)!.changes;
  assert.equal(changes.title, 'Celeste (2018)');
  assert.equal('notes' in changes, false, 'the stale note is not resurrected');
  assert.equal('status' in changes, false);
  assert.equal('rating' in changes, false);

  await harness.unmount();
});

test('AS-08: a canonical status and rating change while the editor is open is not reverted on save', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  // The editor is opened while the game is Playing with rating 3.
  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Celeste (2018)');

  // Meanwhile the game is finished and rated from the status bar / completion sheet.
  await harness.rerenderWithGame({ ...game, status: 'Finished', rating: 5, finishedAt: '2026-07-10T00:00:00.000Z' });

  await saveEditor();

  assert.equal(conflictDialog(), null, 'a change to fields the user did not touch is not a conflict');
  const changes = harness.edits.at(-1)!.changes;
  assert.equal(changes.title, 'Celeste (2018)', 'their edit still lands');
  assert.equal('status' in changes, false, 'the newer Finished status is untouched');
  assert.equal('rating' in changes, false, 'the newer rating is untouched');

  await harness.unmount();
});

test('AS-08: a metadata refresh while the editor is open neither reinitializes the draft nor is overwritten', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Tags'), 'platformer, indie');

  // A metadata/artwork refresh lands: new artwork, new provider data — and new tags, which the old
  // resync effect depended on and would have used to wipe the tags the user was typing.
  await harness.rerenderWithGame({
    ...game,
    tags: ['metroidvania'],
    heroImage: 'https://cdn/hero.jpg',
    rawgId: 4321,
  });

  assert.equal(editorField<HTMLInputElement>('Tags').value, 'platformer, indie', 'the in-progress edit survived');

  await saveEditor();

  // Tags moved canonically AND the user edited them, so this is a real conflict.
  assert.ok(conflictDialog(), 'the collision is surfaced rather than silently resolved');
  await clickButton('Use my edit');

  const changes = harness.edits.at(-1)!.changes;
  assert.deepEqual(changes.tags, ['platformer', 'indie']);
  assert.equal('heroImage' in changes, false, 'artwork is not in the editor form and can never be in its patch');
  assert.equal('rawgId' in changes, false);

  await harness.unmount();
});

test('AS-08: keeping the newer value still saves the rest of the edit', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Celeste (2018)');
  await typeIn(editorField<HTMLSelectElement>('Platform'), 'Switch');

  // The title is corrected elsewhere while they edit.
  await harness.rerenderWithGame({ ...game, title: 'Celeste Classic' });

  await saveEditor();
  const dialog = conflictDialog();
  assert.ok(dialog, 'the conflict is reported');
  assert.match(dialog.textContent ?? '', /Title/, 'the message names the conflicting field');
  assert.doesNotMatch(dialog.textContent ?? '', /Platform/, 'and only the conflicting field');

  await clickButton('Keep the newer value');

  const changes = harness.edits.at(-1)!.changes;
  assert.equal('title' in changes, false, 'the newer title is kept');
  assert.equal(changes.platform, 'Switch', 'the non-conflicting edit still applies');
  assert.equal(isEditorOpen(), false);

  await harness.unmount();
});

test('AS-08: cancelling a conflict returns to the editor and saves nothing', async () => {
  resetWebStorage();
  const game = baseGame();
  const harness = await renderDetail(game);

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Celeste (2018)');
  await harness.rerenderWithGame({ ...game, title: 'Celeste Classic' });
  await saveEditor();

  await clickButton('Back to editing');

  assert.equal(conflictDialog(), null);
  assert.deepEqual(harness.edits, [], 'nothing was written');
  assert.equal(isEditorOpen(), true, 'the editor is still open');
  assert.equal(editorField<HTMLInputElement>('Title').value, 'Celeste (2018)', 'with the draft intact');

  await harness.unmount();
});

test('AS-08: cancelling the editor discards the draft, and reopening starts from canonical values', async () => {
  resetWebStorage();
  const harness = await renderDetail(baseGame());

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Discarded title');
  await clickButton('Cancel');

  assert.deepEqual(harness.edits, [], 'cancel saves nothing, not even partially');

  await openEditor();
  assert.equal(editorField<HTMLInputElement>('Title').value, 'Celeste', 'the discarded draft is gone');

  await saveEditor();
  assert.deepEqual(harness.edits, [], 'and no dirty field survived the cancel');

  await harness.unmount();
});

test('AS-08: navigating to another game closes the editor and leaks no dirty fields', async () => {
  resetWebStorage();
  const harness = await renderDetail(baseGame());

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Title'), 'Celeste (2018)');

  const otherGame = makeLibraryGame({ id: 'g2', title: 'Hades', notes: 'hades note', status: 'Want to play' });
  await harness.rerenderWithGame(otherGame);

  assert.equal(isEditorOpen(), false, 'the in-progress edit is abandoned rather than carried across');
  assert.deepEqual(harness.edits, []);

  await openEditor();
  assert.equal(editorField<HTMLInputElement>('Title').value, 'Hades');
  await saveEditor();

  assert.deepEqual(harness.edits, [], 'no dirty field from the previous game survived the navigation');

  await harness.unmount();
});

test('AS-08: a notes draft still commits on unmount, exactly once', async () => {
  resetWebStorage();
  const harness = await renderDetail(baseGame());

  await typeIn(standaloneNotesField(), 'written but never blurred');

  await harness.unmount();

  const noteCommits = harness.tracking.filter((call) => call.tracking.notes === 'written but never blurred');
  assert.equal(noteCommits.length, 1, 'the unmount safety net still fires, and only once');
});

test('AS-08: clearing the rating in the editor clears it for real', async () => {
  resetWebStorage();
  const harness = await renderDetail(baseGame());

  await openEditor();
  await typeIn(editorField<HTMLInputElement>('Rating (0-5)'), '');
  await saveEditor();

  assert.deepEqual(harness.edits.at(-1)!.changes, { rating: null }, 'an intentional clear, and nothing else');

  await harness.unmount();
});
