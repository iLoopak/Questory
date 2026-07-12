// AS-08: the Game Detail editor submits a PATCH of what the user changed, not a copy of the game.
//
// The editor used to keep a long-lived draft holding a full copy of the record (notes, status,
// rating, tags, HLTB hours, cover…) and, on save, submit every one of those fields. The draft only
// resynced when `game.id` or `game.tags` changed, so a note saved through the standalone notes
// field, a status change from another surface, a rating from the completion sheet or a metadata
// refresh left the draft holding STALE values — and saving an unrelated field like the platform
// wrote all of them back over the newer canonical data.
//
// Three pure pieces fix that, and they live here so they are testable without React:
//
//   1. a BASE snapshot taken when the editor opens (the draft as it was),
//   2. DIRTY fields = where the live draft differs from that base,
//   3. a PATCH built from the dirty fields only, plus CONFLICT detection for any dirty field whose
//      canonical value also moved while the editor was open.
//
// Comparison happens in draft space (the form's string representation), which sidesteps every
// formatting question: "4" vs 4, "" vs undefined, "a, b" vs ['a','b'].

import { gamePlatforms, type Game, type GameCollectionType, type GamePlatform, type GameStatus } from '../types/game';

/** The editor's form state. Strings, because that is what the inputs hold. */
export type GameEditDraft = {
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  collectionType: GameCollectionType;
  coverImage: string;
  metadataSearchTitle: string;
  notes: string;
  tags: string;
  rating: string;
  favorite: boolean;
  hltbMainHours: string;
  hltbMainExtraHours: string;
  hltbCompletionistHours: string;
};

/** Exactly the fields this editor is allowed to touch. Nothing else can reach a save. */
export type GameEditField = keyof GameEditDraft;

export const gameEditFields: GameEditField[] = [
  'title',
  'platform',
  'status',
  'collectionType',
  'coverImage',
  'metadataSearchTitle',
  'notes',
  'tags',
  'rating',
  'favorite',
  'hltbMainHours',
  'hltbMainExtraHours',
  'hltbCompletionistHours',
];

/**
 * The update the editor submits.
 *
 * A field that is absent means "unchanged" — the editor has nothing to say about it. Clearing is
 * expressed intentionally: `rating: null` clears a rating, an absent `rating` leaves it alone. No
 * field outside this shape can be submitted, so an edit can never rewrite artwork, provider ids,
 * Steam fields or any unknown/future column.
 */
export type GameEditPatch = Partial<
  Pick<
    Game,
    | 'title'
    | 'displayTitleOverride'
    | 'originalImportedTitle'
    | 'metadataSearchTitle'
    | 'platform'
    | 'status'
    | 'collectionType'
    | 'coverImage'
    | 'notes'
    | 'tags'
    | 'rating'
    | 'favorite'
    | 'hltbMainHours'
    | 'hltbMainExtraHours'
    | 'hltbCompletionistHours'
  >
>;

export function getDisplayTitle(game: Pick<Game, 'displayTitleOverride' | 'title'>) {
  return game.displayTitleOverride?.trim() || game.title;
}

export function isRetroGame(game: Game) {
  return game.externalSource === 'retro-rom' || Boolean(game.romPath || game.romFiles?.length);
}

export function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function formatOptionalNumberForInput(value: number | null | undefined) {
  return typeof value === 'number' ? String(value) : '';
}

export function parseOptionalNonNegativeNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** The canonical game, in draft space. Used both to open the editor and to re-read it on save. */
export function createEditDraft(game: Game): GameEditDraft {
  return {
    collectionType: game.collectionType,
    coverImage: game.coverImage ?? '',
    favorite: Boolean(game.favorite),
    hltbCompletionistHours: formatOptionalNumberForInput(game.hltbCompletionistHours),
    hltbMainExtraHours: formatOptionalNumberForInput(game.hltbMainExtraHours),
    hltbMainHours: formatOptionalNumberForInput(game.hltbMainHours),
    metadataSearchTitle: game.metadataSearchTitle ?? '',
    notes: game.notes ?? '',
    platform: game.platform,
    rating: formatOptionalNumberForInput(game.rating),
    status: game.status,
    tags: (game.tags ?? []).join(', '),
    title: getDisplayTitle(game),
  };
}

/** The fields the user actually touched: where the live draft differs from the base it opened with. */
export function getDirtyEditFields(base: GameEditDraft, draft: GameEditDraft): GameEditField[] {
  return gameEditFields.filter((field) => draft[field] !== base[field]);
}

/**
 * Fields the user edited that ALSO changed canonically while the editor was open.
 *
 * A canonical change to a field the user did not touch is not a conflict — it is just newer data,
 * and it survives because the patch never mentions that field. A change the user made to a field
 * nobody else touched is not a conflict either. Only the overlap is.
 */
export function detectEditConflicts(base: GameEditDraft, canonical: GameEditDraft, dirty: GameEditField[]): GameEditField[] {
  return dirty.filter((field) => canonical[field] !== base[field]);
}

/**
 * Build the patch from the dirty fields.
 *
 * `skipFields` drops fields the user chose to yield on during conflict resolution ("keep the newer
 * value"), so the rest of their edit still applies.
 */
export function buildGameEditPatch(
  game: Game,
  draft: GameEditDraft,
  dirty: GameEditField[],
  skipFields: GameEditField[] = [],
): GameEditPatch {
  const applied = new Set(dirty.filter((field) => !skipFields.includes(field)));
  const patch: GameEditPatch = {};

  if (applied.has('title')) {
    const title = draft.title.trim();
    patch.title = title;
    // The corrected title is canonical; a stale display override would keep shadowing it.
    patch.displayTitleOverride = title === game.title ? undefined : title;
    if (isRetroGame(game)) {
      // Keep the raw imported name once, for reference.
      patch.originalImportedTitle = game.originalImportedTitle ?? game.title;
    }
  }

  // The metadata search title falls back to the (possibly new) title when it is left blank — the
  // rule the old save had, but now only when one of the two fields was actually edited.
  if (applied.has('metadataSearchTitle') || applied.has('title')) {
    patch.metadataSearchTitle = draft.metadataSearchTitle.trim() || draft.title.trim();
  }

  if (applied.has('platform')) patch.platform = draft.platform;
  if (applied.has('status')) patch.status = draft.status;
  if (applied.has('collectionType')) patch.collectionType = draft.collectionType;
  if (applied.has('coverImage')) patch.coverImage = draft.coverImage.trim();
  if (applied.has('notes')) patch.notes = draft.notes;
  if (applied.has('tags')) patch.tags = parseTags(draft.tags);
  // Clearing the box clears the rating: `null` says so, rather than leaving it to a stale copy.
  if (applied.has('rating')) patch.rating = parseOptionalNonNegativeNumber(draft.rating) ?? null;
  if (applied.has('favorite')) patch.favorite = draft.favorite;
  if (applied.has('hltbMainHours')) patch.hltbMainHours = parseOptionalNonNegativeNumber(draft.hltbMainHours);
  if (applied.has('hltbMainExtraHours')) patch.hltbMainExtraHours = parseOptionalNonNegativeNumber(draft.hltbMainExtraHours);
  if (applied.has('hltbCompletionistHours')) {
    patch.hltbCompletionistHours = parseOptionalNonNegativeNumber(draft.hltbCompletionistHours);
  }

  return patch;
}

/** Apply a patch. Every field the patch does not mention survives untouched, known or not. */
export function applyGameEditPatch(game: Game, patch: GameEditPatch): Game {
  return { ...game, ...patch };
}

/** Moved verbatim from GameDetailView — the rules and the copy are unchanged. */
export function validateEditDraft(draft: GameEditDraft) {
  if (!draft.title.trim()) return 'Title cannot be empty.';
  if (!gamePlatforms.includes(draft.platform as never)) return 'Platform must be valid.';
  if (draft.coverImage.trim() && !isValidUrl(draft.coverImage.trim())) return 'Cover image must be a valid URL.';
  const rating = parseOptionalNonNegativeNumber(draft.rating);
  if (draft.rating.trim() && rating === undefined) return 'Rating must be a number between 0 and 5.';
  if (rating !== undefined && rating > 5) return 'Rating must be between 0 and 5.';
  return '';
}

function isValidUrl(value: string) {
  try { new URL(value); return true; } catch { return false; }
}
