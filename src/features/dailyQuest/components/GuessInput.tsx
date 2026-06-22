import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Game } from '../../../types/game';
import { getPreferredArtworkSources } from '../../../lib/gameCoverImages';
import type { TFunction } from '../../../i18n';

interface GuessInputProps {
  games: Game[];
  guessedIds: Set<string>;
  disabled?: boolean;
  onGuess: (game: Game) => void;
  t: TFunction;
}

export function GuessInput({ games, guessedIds, disabled = false, onGuess, t }: GuessInputProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return games
      .filter((g) => !guessedIds.has(g.id) && g.title.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact prefix matches first
        const aStart = a.title.toLowerCase().startsWith(q);
        const bStart = b.title.toLowerCase().startsWith(q);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 8);
  }, [games, guessedIds, query]);

  // Re-focus input after mount (modal opens)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [filtered]);

  function commit(game: Game) {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    onGuess(game);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) {
      if (e.key === 'Escape') { setQuery(''); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = activeIndex >= 0 ? filtered[activeIndex] : filtered[0];
      if (target) commit(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const showDropdown = open && filtered.length > 0 && !disabled;

  return (
    <div className="relative" role="combobox" aria-expanded={showDropdown} aria-haspopup="listbox" aria-owns={listboxId}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={t('dailyQuest.guessPlaceholder')}
        aria-label={t('dailyQuest.guessPlaceholder')}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `dq-option-${activeIndex}` : undefined}
        className="w-full rounded-xl border border-skyglass/20 bg-ink-900 px-4 py-3 text-sm text-white placeholder-slate-500 transition focus:border-mint/50 focus:outline-none focus:ring-1 focus:ring-mint/40 disabled:opacity-40"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so click events on the dropdown fire first
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Library games"
          className="absolute bottom-full left-0 right-0 z-50 mb-1.5 max-h-64 overflow-y-auto rounded-xl border border-skyglass/20 bg-ink-900 shadow-lg"
        >
          {filtered.map((game, i) => (
            <DropdownItem
              key={game.id}
              id={`dq-option-${i}`}
              game={game}
              active={i === activeIndex}
              onSelect={() => commit(game)}
              onMouseEnter={() => setActiveIndex(i)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DropdownItem({
  id,
  game,
  active,
  onSelect,
  onMouseEnter,
}: {
  id: string;
  game: Game;
  active: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const cover = useMemo(() => getPreferredArtworkSources(game, 'micro')[0] ?? game.coverImage, [game]);

  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition ${active ? 'bg-white/[0.08] text-white' : 'text-slate-300 hover:bg-white/[0.05]'}`}
      onMouseDown={(e) => {
        // Prevent input blur before the click fires
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onMouseEnter}
    >
      <div className="h-9 w-6 shrink-0 overflow-hidden rounded">
        <img src={cover} alt="" aria-hidden="true" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{game.title}</div>
        <div className="truncate text-xs text-slate-500">{game.platform}</div>
      </div>
    </li>
  );
}
