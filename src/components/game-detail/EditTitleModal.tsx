import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../hooks/useScrollLock';
import { Icon } from '../Icon';

type EditTitleModalProps = {
  /** Current display title, used to seed the input. */
  initialTitle: string;
  /** Raw imported title, shown as a reference hint when it differs from the current title. */
  originalImportedTitle?: string;
  onCancel: () => void;
  onSave: (title: string) => void;
};

/**
 * Lightweight, single-field title editor. Built for correcting messy imported
 * wishlist titles (e.g. a captured price like "AC Resyncedh 59,99") quickly,
 * without opening the full game edit form. Trims whitespace and blocks empty
 * titles; it never strips digits, so legitimate numbers survive.
 */
export function EditTitleModal({ initialTitle, originalImportedTitle, onCancel, onSave }: EditTitleModalProps) {
  const [value, setValue] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useScrollLock();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, []);

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

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const isUnchanged = trimmed === initialTitle.trim();
  const canSave = !isEmpty && !isUnchanged;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSave(trimmed);
  }

  if (typeof document === 'undefined') return null;

  const showOriginalHint = Boolean(originalImportedTitle?.trim()) && originalImportedTitle!.trim() !== initialTitle.trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Edit title"
    >
      <form
        className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-950 p-4 shadow-panel"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Edit title</h3>
            <p className="mt-1 text-sm text-slate-400">
              Fix an imported title so metadata, artwork and screenshots match correctly.
            </p>
          </div>
          <button
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white"
            onClick={onCancel}
            type="button"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="qs-label-caps text-slate-400">Title</span>
          <input
            ref={inputRef}
            className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
        </label>

        {showOriginalHint ? (
          <p className="mt-2 text-xs text-slate-500">
            Imported as: <span className="text-slate-400">{originalImportedTitle!.trim()}</span>
          </p>
        ) : null}

        {isEmpty ? (
          <p className="mt-2 text-xs text-red-300">Title cannot be empty.</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="min-h-10 rounded-xl border border-skyglass/15 bg-ink-950 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/5"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-10 rounded-xl border border-mint/30 bg-mint/10 px-4 py-2 text-sm font-bold text-mint transition hover:bg-mint/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            type="submit"
          >
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
