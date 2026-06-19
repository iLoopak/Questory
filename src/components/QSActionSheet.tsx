import { useEffect, useRef, useState } from 'react';
import type { Game, GamePlatform, GameStatus } from '../types/game';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { Icon } from './Icon';
import { PlatformBadge } from './PlatformBadge';

export type QSActionSheetProps = {
  game: Game;
  queueState: PlatformQueueState;
  onClose: () => void;
  onOpenDetails?: (game: Game) => void;
  onPlayToday?: (game: Game) => void;
  onQuickNote?: (gameId: string, note: string) => void;
  onStatusChange?: (gameId: string, status: GameStatus) => void;
};

export function QSActionSheet({
  game,
  queueState,
  onClose,
  onOpenDetails,
  onPlayToday,
  onQuickNote,
  onStatusChange,
}: QSActionSheetProps) {
  const [noteMode, setNoteMode] = useState(false);
  const [noteDraft, setNoteDraft] = useState(game.notes ?? '');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);

  const coverSource = getGameCoverSources(game)[0];
  const platformLabel: GamePlatform =
    queueState.entries.find((e) => e.gameId === game.id)?.targetPlatform ?? game.platform;
  const playtime = game.playtimeHours > 0 ? `${Math.round(game.playtimeHours)}h played` : null;
  const isPlaying = game.status === 'Playing';
  const notePreview = noteDraft.trim()
    ? noteDraft.trim().slice(0, 48) + (noteDraft.trim().length > 48 ? '…' : '')
    : 'Tap to add a note';

  useEffect(() => {
    if (noteMode) noteRef.current?.focus();
  }, [noteMode]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (noteMode) setNoteMode(false);
        else onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [noteMode, onClose]);

  function saveNote() {
    onQuickNote?.(game.id, noteDraft);
    onClose();
  }

  return (
    <div
      className="qs-action-sheet fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Actions for ${game.title}`}
    >
      <div
        className="qs-action-sheet-backdrop absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="qs-action-sheet-panel relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        style={{ paddingBottom: 'max(1.25rem, var(--qs-safe-bottom))' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1.5 w-16 rounded-full bg-skyglass/35" title="Swipe down to dismiss" />
        </div>

        {noteMode ? (
          /* ── Note editor ─────────────────────────────────── */
          <div className="px-4 pb-2 pt-1">
            <button
              className="mb-4 flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white"
              onClick={() => setNoteMode(false)}
              type="button"
            >
              <Icon name="chevron-left" size={16} strokeWidth={2} />
              Back
            </button>
            <div className="mb-3 flex items-center gap-3">
              <Icon name="file-text" size={18} strokeWidth={2} className="shrink-0 text-mint" />
              <div>
                <h3 className="text-sm font-semibold text-white">Quick Note</h3>
                <p className="text-xs text-slate-500">{game.title}</p>
              </div>
            </div>
            <textarea
              ref={noteRef}
              className="w-full resize-none rounded-2xl border border-skyglass/20 bg-ink-900/80 p-3.5 text-sm leading-relaxed text-white placeholder-slate-600 transition focus:border-mint/50 focus:outline-none"
              rows={5}
              value={noteDraft}
              placeholder="Add a note about this game…"
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="h-11 rounded-2xl border border-skyglass/15 text-sm text-slate-300 transition hover:bg-white/5"
                onClick={() => setNoteMode(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-11 rounded-2xl bg-mint text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
                onClick={saveNote}
                type="button"
              >
                Save Note
              </button>
            </div>
          </div>
        ) : (
          /* ── Actions view ────────────────────────────────── */
          <div className="px-4 pb-2 pt-1">
            {/* Game header */}
            <div className="mb-5 flex gap-3.5">
              <div className="relative h-[72px] w-[52px] shrink-0 overflow-hidden rounded-xl border border-skyglass/15 bg-ink-800 shadow-panel">
                {coverSource ? (
                  <img alt="" className="h-full w-full object-cover" src={coverSource} />
                ) : (
                  <div className="grid h-full place-items-center text-xl font-bold text-mint/50">
                    {game.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <h3 className="line-clamp-2 text-base font-bold leading-snug text-white">{game.title}</h3>
                <div className="mt-1.5">
                  <PlatformBadge
                    className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    platform={platformLabel}
                    queueState={queueState}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <StatusDot status={game.status} />
                  <span className="text-xs text-slate-400">{getStatusLabel(game.status)}</span>
                  {playtime ? (
                    <>
                      <span className="text-slate-700">·</span>
                      <span className="text-xs text-slate-500">{playtime}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Primary action */}
            {onPlayToday ? (
              <button
                className="flex min-h-[3.5rem] w-full items-center justify-center gap-2.5 rounded-2xl bg-mint px-4 text-[0.9375rem] font-bold text-ink-950 shadow-glow transition active:scale-[0.97] hover:bg-mint/90"
                onClick={() => { onPlayToday(game); onClose(); }}
                type="button"
              >
                <Icon name="play-circle" size={20} strokeWidth={2.5} />
                Play Today
              </button>
            ) : null}

            {/* Manage group */}
            {(onQuickNote || onOpenDetails) ? (
              <div className="mt-3.5">
                <div className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Manage
                </div>
                <div className="overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60 divide-y divide-skyglass/12">
                  {onQuickNote ? (
                    <SheetAction
                      icon="file-text"
                      label="Quick Note"
                      sublabel={notePreview}
                      onClick={() => setNoteMode(true)}
                    />
                  ) : null}
                  {onOpenDetails ? (
                    <SheetAction
                      icon="external-link"
                      label="Open Details"
                      onClick={() => { onOpenDetails(game); onClose(); }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Status group */}
            {onStatusChange ? (
              <div className="mt-3.5">
                <div className="mb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Status
                </div>
                <div className="overflow-hidden rounded-2xl border border-skyglass/15 bg-ink-900/60">
                  <SheetAction
                    icon="check-circle"
                    label={isPlaying ? 'Mark Finished' : 'Mark as Playing'}
                    accent={isPlaying ? 'emerald' : 'default'}
                    onClick={() => { onStatusChange(game.id, isPlaying ? 'Finished' : 'Playing'); onClose(); }}
                  />
                </div>
              </div>
            ) : null}

            {/* Cancel */}
            <button
              className="mt-3 min-h-11 w-full rounded-2xl text-sm text-slate-500 transition hover:text-slate-300"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: GameStatus }) {
  const colorClass =
    status === 'Playing'
      ? 'bg-mint'
      : status === 'Finished'
        ? 'bg-emerald-400'
        : status === 'Dropped'
          ? 'bg-red-400'
          : 'bg-slate-600';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorClass}`} />;
}

function getStatusLabel(status: GameStatus): string {
  switch (status) {
    case 'Playing':
      return 'Currently Playing';
    case 'Finished':
      return 'Finished';
    case 'Dropped':
      return 'Dropped';
    case 'Want to play':
      return 'Want to Play';
    default:
      return status;
  }
}

function SheetAction({
  icon,
  label,
  sublabel,
  accent = 'default',
  onClick,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  accent?: 'default' | 'emerald';
  onClick: () => void;
}) {
  const labelClass = accent === 'emerald' ? 'text-emerald-400' : 'text-slate-200';
  const iconClass = accent === 'emerald' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <button
      className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition hover:bg-mint/[0.07] active:bg-mint/[0.10]"
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} size={18} strokeWidth={2} className={`shrink-0 ${iconClass}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${labelClass}`}>{label}</span>
        {sublabel ? <span className="block truncate text-xs text-slate-500">{sublabel}</span> : null}
      </span>
      <Icon name="chevron-right" size={14} strokeWidth={2} className="shrink-0 text-slate-500" />
    </button>
  );
}
