import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ViewportModal } from './ViewportModal';
import { parseMultiGameImportInput, nintendoVirtualGameCardsBookmarklet, playStationLibraryBookmarklet, type MultiGameImportParseResult, type MultiGameImportSummary } from '../lib/multiGameImport';

export type MultiGameImportModalProps = {
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onImport: (parsed: MultiGameImportParseResult) => MultiGameImportSummary;
};

export function MultiGameImportModal({ onClose, onImport, restoreFocusRef }: MultiGameImportModalProps) {
  const [multiImportText, setMultiImportText] = useState('');
  const [multiImportMessage, setMultiImportMessage] = useState('');
  const [clipboardMessage, setClipboardMessage] = useState('');
  const [clipboardError, setClipboardError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const multiImportParseResult = useMemo(() => parseMultiGameImportInput(multiImportText), [multiImportText]);

  async function copyNintendoBookmarklet() {
    try {
      await navigator.clipboard.writeText(nintendoVirtualGameCardsBookmarklet);
      setClipboardMessage('Nintendo Virtual Game Cards bookmarklet copied. Paste it into a browser bookmark URL.');
      setClipboardError('');
    } catch {
      setClipboardMessage('');
      setClipboardError('Could not copy bookmarklet. Select and copy the script manually.');
    }
  }

  async function copyPlayStationBookmarklet() {
    try {
      await navigator.clipboard.writeText(playStationLibraryBookmarklet);
      setClipboardMessage('PlayStation Library bookmarklet copied. Paste it into a browser bookmark URL.');
      setClipboardError('');
    } catch {
      setClipboardMessage('');
      setClipboardError('Could not copy bookmarklet. Select and copy the script manually.');
    }
  }

  function handleMultiImport() {
    const parsed = parseMultiGameImportInput(multiImportText);
    if (!parsed.ok) {
      setMultiImportMessage(parsed.error ?? 'No games were found to import.');
      return;
    }

    const summary = onImport(parsed);
    setMultiImportMessage(`${summary.importedCount} imported · ${summary.skippedDuplicates} duplicates · ${summary.updatedExisting} updated · ${summary.ambiguousCount} ambiguous · ${summary.invalidRows} skipped · source: ${summary.source === 'nintendo-virtual-game-cards' ? 'Nintendo Virtual Game Cards' : summary.source}`);
  }

  return (
    <ViewportModal
      ariaLabel="Multi Game Import"
      initialFocusRef={textareaRef}
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
      placement="center"
    >
      <div className="border-b border-skyglass/15 bg-ink-950/90 p-4">
        <h3 className="text-lg font-semibold text-white">Multi Game Import</h3>
        <p className="mt-1 text-sm text-slate-400">Paste one game title per line, or use a supported bookmarklet and paste the copied JSON.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <label className="block text-sm font-semibold text-slate-200" htmlFor="multi-game-import-input">Games to import</label>
          <textarea
            className="min-h-56 w-full resize-y rounded-lg border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-mint/50 focus:ring-2 focus:ring-mint/20"
            id="multi-game-import-input"
            onChange={(event) => {
              setMultiImportText(event.target.value);
              setMultiImportMessage('');
            }}
            placeholder={'Elden Ring\nAlan Wake 2\nNine Sols\n\n…or paste PlayStation or Nintendo JSON'}
            ref={textareaRef}
            value={multiImportText}
          />
          {multiImportText.trim() ? (
            <div className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-3 text-sm text-slate-300">
              {multiImportParseResult.ok ? (
                <span className="font-semibold text-mint">Detected {multiImportParseResult.source === 'nintendo-virtual-game-cards' ? 'Nintendo Virtual Game Cards' : multiImportParseResult.source}: {multiImportParseResult.items.length} games · {multiImportParseResult.duplicateCount} pasted duplicates · {multiImportParseResult.skippedCount} skipped rows</span>
              ) : (
                <span className="font-semibold text-amber-300">{multiImportParseResult.error}</span>
              )}
            </div>
          ) : null}
          {multiImportMessage ? <p className="text-sm font-semibold text-mint">{multiImportMessage}</p> : null}
        </section>

        <section className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-3">
          <h4 className="text-sm font-semibold uppercase tracking-caps text-mint">Nintendo Virtual Game Cards bookmarklet</h4>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
            <li>Open your Nintendo Account Virtual Game Cards page.</li>
            <li>Run the bookmarklet on that page. Nintendo may lazy-load cards, so scroll to the bottom first if needed; the bookmarklet also attempts to scroll and collect rendered cards.</li>
            <li>Paste the copied JSON above to import Nintendo Switch games. If JSON copy fails, you can still paste one title per line.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90" onClick={() => void copyNintendoBookmarklet()} type="button">Copy Nintendo bookmarklet</button>
          </div>
          <textarea className="mt-3 h-24 w-full resize-y rounded-md border border-skyglass/15 bg-ink-950/80 p-2 font-mono text-xs text-slate-300 outline-none focus:border-mint/50" readOnly value={nintendoVirtualGameCardsBookmarklet} />
        </section>

        <section className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-3">
          <h4 className="text-sm font-semibold uppercase tracking-caps text-mint">PlayStation Library bookmarklet</h4>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
            <li>Open <a className="text-mint underline" href="https://library.playstation.com/recently-purchased/1" rel="noreferrer" target="_blank">PlayStation Library recently purchased</a>.</li>
            <li>Run the bookmarklet, then choose the first and last recently-purchased pages to import.</li>
            <li>Paste the copied JSON above to import the selected page range.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90" onClick={() => void copyPlayStationBookmarklet()} type="button">Copy PlayStation bookmarklet</button>
          </div>
          <textarea className="mt-3 h-24 w-full resize-y rounded-md border border-skyglass/15 bg-ink-950/80 p-2 font-mono text-xs text-slate-300 outline-none focus:border-mint/50" readOnly value={playStationLibraryBookmarklet} />
          {clipboardMessage ? <p className="mt-3 text-sm font-semibold text-mint">{clipboardMessage}</p> : null}
          {clipboardError ? <p className="mt-3 text-sm font-semibold text-rose-300">{clipboardError}</p> : null}
        </section>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-skyglass/15 bg-ink-950/80 p-4 sm:flex-row sm:justify-end">
        <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white" onClick={onClose} type="button">Cancel</button>
        <button className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none" disabled={!multiImportParseResult.ok} onClick={handleMultiImport} type="button">Import games</button>
      </div>
    </ViewportModal>
  );
}
