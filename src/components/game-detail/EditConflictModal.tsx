import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../hooks/useScrollLock';
import type { GameEditField } from '../../lib/gameEditPatch';

const fieldLabels: Record<GameEditField, string> = {
  collectionType: 'Collection',
  coverImage: 'Cover image URL',
  favorite: 'Favorite',
  hltbCompletionistHours: 'HLTB completionist hours',
  hltbMainExtraHours: 'HLTB main + extra hours',
  hltbMainHours: 'HLTB main hours',
  metadataSearchTitle: 'Metadata search title',
  notes: 'Notes',
  platform: 'Platform',
  rating: 'Rating',
  status: 'Status',
  tags: 'Tags',
  title: 'Title',
};

export function getEditFieldLabel(field: GameEditField) {
  return fieldLabels[field];
}

type EditConflictModalProps = {
  /** The fields the user edited that also changed elsewhere while the editor was open. */
  fields: GameEditField[];
  /** Discard the user's version of the conflicting fields; the rest of the edit still saves. */
  onKeepCurrent: () => void;
  /** Save the user's version, overwriting the newer value. */
  onApplyMine: () => void;
  /** Back to the editor with the draft intact; nothing is saved. */
  onCancel: () => void;
};

/**
 * AS-08: the only thing the user has to decide when a save collides.
 *
 * Deliberately not a merge interface — it names the fields that moved under the editor and offers
 * the three answers that exist: take the newer value, take mine, or go back. Fields the user edited
 * that nobody else touched are saved either way, so the choice here is scoped to the collision.
 */
export function EditConflictModal({ fields, onApplyMine, onCancel, onKeepCurrent }: EditConflictModalProps) {
  useScrollLock();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  const fieldList = fields.map(getEditFieldLabel).join(', ');

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Resolve edit conflict"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-950 p-4 shadow-panel">
        <h3 className="text-lg font-semibold text-white">This game changed while you were editing</h3>
        <p className="mt-1 text-sm text-slate-400">
          You edited {fields.length === 1 ? 'a field that' : 'fields that'} also changed elsewhere:{' '}
          <span className="font-semibold text-slate-200">{fieldList}</span>. Your other changes save either way.
        </p>

        <div className="mt-4 grid gap-2">
          <button
            className="min-h-10 rounded-xl border border-mint/30 bg-mint/10 px-4 py-2 text-sm font-bold text-mint transition hover:bg-mint/20"
            onClick={onKeepCurrent}
            type="button"
          >
            Keep the newer {fields.length === 1 ? 'value' : 'values'}
          </button>
          <button
            className="min-h-10 rounded-xl border border-skyglass/15 bg-ink-950 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/5"
            onClick={onApplyMine}
            type="button"
          >
            Use my {fields.length === 1 ? 'edit' : 'edits'}
          </button>
          <button
            className="min-h-10 rounded-xl px-4 py-2 text-sm font-bold text-slate-400 transition hover:text-white"
            onClick={onCancel}
            type="button"
          >
            Back to editing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
