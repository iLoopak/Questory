import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { searchGameByName, RawgApiError } from '../services/rawgApi';
import type { Game } from '../types/game';
import type { RawgSearchResult } from '../types/rawg';

export function getRawgLinkSearchTitle(game: Pick<Game, 'metadataSearchTitle' | 'displayTitleOverride' | 'title'>) {
  return game.metadataSearchTitle?.trim() || game.displayTitleOverride?.trim() || game.title;
}

export function RawgLinkDialog({ game, onClose, onSelect }: { game: Game; onClose: () => void; onSelect: (result: RawgSearchResult) => void }) {
  const [query, setQuery] = useState(() => getRawgLinkSearchTitle(game));
  const [results, setResults] = useState<RawgSearchResult[]>([]);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  useScrollLock();

  async function searchRawg() {
    setIsSearching(true);
    setError('');
    try {
      setResults(await searchGameByName(query));
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof RawgApiError ? searchError.message : 'RAWG search failed.');
    } finally {
      setIsSearching(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Link RAWG game">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-950 p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Link RAWG Game</h3>
            <p className="mt-1 text-sm text-slate-400">Search RAWG and choose the exact record to save its RAWG ID.</p>
          </div>
          <button className="rounded-lg border border-white/10 px-3 py-1 text-sm text-slate-300" onClick={onClose} type="button">Close</button>
        </div>
        <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void searchRawg(); }}>
          <input className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="h-11 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-bold text-mint disabled:opacity-50" disabled={isSearching} type="submit">{isSearching ? 'Searching…' : 'Search'}</button>
        </form>
        {error ? <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
          {results.map((result) => (
            <button key={result.id} className="w-full rounded-xl border border-white/10 bg-ink-900/80 p-3 text-left transition hover:border-mint/40 hover:bg-mint/10" onClick={() => onSelect(result)} type="button">
              <div className="font-semibold text-white">{result.name}</div>
              <div className="mt-1 text-xs text-slate-400">RAWG ID {result.id}{result.released ? ` · ${result.released}` : ''}{result.slug ? ` · ${result.slug}` : ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
