import type { ReactNode } from 'react';

type ToolbarOption = string;

type ToolbarSelect = {
  label: string;
  onChange: (value: string) => void;
  options: readonly ToolbarOption[];
  value: string;
};

type ToolbarViewMode = {
  label?: string;
  onChange: (value: string) => void;
  options: readonly ToolbarOption[];
  value: string;
};

type CollectionToolbarProps = {
  actionMenu?: ReactNode;
  children?: ReactNode;
  moreFiltersActiveCount?: number;
  moreFiltersOpen?: boolean;
  onClearFilters?: () => void;
  onMoreFiltersClick?: () => void;
  onSearchChange?: (value: string) => void;
  primaryAction?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  selects?: ToolbarSelect[];
  summary?: ReactNode;
  title: string;
  viewMode?: ToolbarViewMode;
};

export function CollectionToolbar({
  actionMenu,
  children,
  moreFiltersActiveCount = 0,
  moreFiltersOpen = false,
  onClearFilters,
  onMoreFiltersClick,
  onSearchChange,
  primaryAction,
  searchPlaceholder = 'Search',
  searchValue,
  selects = [],
  summary,
  title,
  viewMode,
}: CollectionToolbarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange;
  const hasMoreFilters = Boolean(onMoreFiltersClick);

  return (
    <div className="qs-collection-toolbar mb-2 rounded-md border border-skyglass/15 bg-ink-950/70 p-1.5">
      <div className="flex flex-nowrap items-end gap-1.5 overflow-x-auto pb-0.5">
        <div className="min-w-[5.5rem] shrink-0 pb-1">
          <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
          {summary ? <div className="mt-0.5 text-[0.7rem] text-slate-400">{summary}</div> : null}
        </div>

        {hasSearch ? (
          <label className="min-w-[10rem] flex-[1.25]">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:shadow-glow"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchValue}
            />
          </label>
        ) : null}

        {selects.map((select) => (
          <label key={select.label} className="min-w-[8.25rem] flex-1">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{select.label}</span>
            <select
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none transition focus:border-mint"
              onChange={(event) => select.onChange(event.target.value)}
              value={select.value}
            >
              {select.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ))}

        {hasMoreFilters ? (
          <button
            aria-expanded={moreFiltersOpen}
            className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition ${
              moreFiltersOpen || moreFiltersActiveCount > 0
                ? 'border-mint/40 bg-mint/15 text-mint shadow-glow'
                : 'border-skyglass/15 bg-ink-900/70 text-slate-200 hover:bg-mint/10 hover:text-white'
            }`}
            onClick={onMoreFiltersClick}
            type="button"
          >
            More Filters{moreFiltersActiveCount > 0 ? ` (${moreFiltersActiveCount})` : ''}
          </button>
        ) : null}

        {viewMode ? (
          <div className="shrink-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {viewMode.label ?? 'View'}
            </span>
            <div className="mt-1 grid grid-flow-col overflow-hidden rounded-md border border-skyglass/15 bg-ink-900/70" role="group" aria-label={viewMode.label ?? 'View mode'}>
              {viewMode.options.map((mode) => {
                const isActive = viewMode.value === mode;

                return (
                  <button
                    key={mode}
                    aria-pressed={isActive}
                    className={`h-9 border-r border-skyglass/10 px-2.5 text-xs font-semibold transition last:border-r-0 ${
                      isActive ? 'bg-mint text-ink-950 shadow-glow' : 'text-slate-300 hover:bg-mint/10 hover:text-white'
                    }`}
                    onClick={() => viewMode.onChange(mode)}
                    type="button"
                  >
                    {mode.replace(' View', '')}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {primaryAction ? <div className="shrink-0">{primaryAction}</div> : null}

        {actionMenu ? (
          <details className="shrink-0">
            <summary className="grid h-9 cursor-pointer place-items-center rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 hover:bg-mint/10 hover:text-white">
              Actions
            </summary>
            <div className="mt-2 grid min-w-48 gap-2 rounded-md border border-skyglass/15 bg-ink-950 p-2 shadow-panel">
              {actionMenu}
            </div>
          </details>
        ) : null}

        {onClearFilters ? (
          <button
            className="h-9 shrink-0 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClearFilters}
            type="button"
          >
            Clear
          </button>
        ) : null}

        {children}
      </div>
    </div>
  );
}
