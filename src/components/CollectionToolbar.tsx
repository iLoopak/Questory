import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';

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
  moreFiltersButtonRef?: Ref<HTMLButtonElement>;
  onClearFilters?: () => void;
  onMoreFiltersClick?: () => void;
  onSearchChange?: (value: string) => void;
  primaryAction?: ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  selects?: ToolbarSelect[];
  title: string;
  viewMode?: ToolbarViewMode;
};

export function CollectionToolbar({
  actionMenu,
  children,
  moreFiltersActiveCount = 0,
  moreFiltersOpen = false,
  moreFiltersButtonRef,
  onClearFilters,
  onMoreFiltersClick,
  onSearchChange,
  primaryAction,
  searchPlaceholder = 'Search',
  searchValue,
  selects = [],
  title,
  viewMode,
}: CollectionToolbarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange;
  const hasMoreFilters = Boolean(onMoreFiltersClick);
  const selectedViewLabel = viewMode?.value.replace(' View', '') ?? 'View';
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDetailsElement | null>(null);
  const actionsMenuRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    setIsViewMenuOpen(false);
    setIsActionsMenuOpen(false);
  }, [title]);

  useEffect(() => {
    if (!isViewMenuOpen && !isActionsMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Node && (viewMenuRef.current?.contains(target) || actionsMenuRef.current?.contains(target))) {
        return;
      }

      setIsViewMenuOpen(false);
      setIsActionsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setIsViewMenuOpen(false);
      setIsActionsMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActionsMenuOpen, isViewMenuOpen]);

  return (
    <div className="qs-collection-toolbar mb-2 min-w-0 rounded-md border border-skyglass/15 bg-ink-950/70 p-1.5">
      <div className="qs-collection-toolbar-row">
        {hasSearch ? (
          <label className="qs-collection-toolbar-search min-w-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              className="mt-1 h-9 w-full min-w-0 rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint focus:shadow-glow"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchValue}
            />
          </label>
        ) : null}

        {selects.map((select) => (
          <label key={select.label} className="qs-collection-toolbar-select min-w-0">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{select.label}</span>
            <select
              aria-label={select.label}
              className="mt-1 h-9 w-full min-w-0 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none transition focus:border-mint"
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
            ref={moreFiltersButtonRef}
            className={`qs-collection-toolbar-button qs-filters-button h-9 rounded-md border px-3 text-sm font-semibold transition ${
              moreFiltersOpen || moreFiltersActiveCount > 0
                ? 'border-mint/40 bg-mint/15 text-mint shadow-glow'
                : 'border-skyglass/15 bg-ink-900/70 text-slate-200 hover:bg-mint/10 hover:text-white'
            }`}
            onClick={onMoreFiltersClick}
            type="button"
          >
            <span className="qs-wide-label">More Filters</span>
            <span className="qs-short-label">Filters</span>
            {moreFiltersActiveCount > 0 ? ` (${moreFiltersActiveCount})` : ''}
          </button>
        ) : null}

        {viewMode ? (
          <details
            ref={viewMenuRef}
            className="qs-toolbar-menu qs-view-menu"
            open={isViewMenuOpen}
            onToggle={(event) => setIsViewMenuOpen(event.currentTarget.open)}
          >
            <summary
              aria-label={`${viewMode.label ?? 'View mode'}: ${selectedViewLabel}`}
              className="qs-collection-toolbar-button grid h-9 cursor-pointer place-items-center rounded-md border border-skyglass/15 bg-ink-900/70 px-3 text-sm font-semibold text-slate-200 hover:bg-mint/10 hover:text-white"
            >
              <span>
                View <span aria-hidden="true">▾</span>
              </span>
            </summary>
            <div className="qs-toolbar-menu-panel" role="menu" aria-label={viewMode.label ?? 'View mode'}>
              {viewMode.options.map((mode) => {
                const isActive = viewMode.value === mode;
                const modeLabel = mode.replace(' View', '');

                return (
                  <button
                    key={mode}
                    aria-checked={isActive}
                    className={`h-9 rounded-md px-3 text-left text-sm font-semibold transition ${
                      isActive ? 'bg-mint text-ink-950 shadow-glow' : 'text-slate-200 hover:bg-mint/10 hover:text-white'
                    }`}
                    onClick={() => {
                      viewMode.onChange(mode);
                      setIsViewMenuOpen(false);
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    {modeLabel}
                  </button>
                );
              })}
            </div>
          </details>
        ) : null}

        {primaryAction ? <div className="qs-collection-primary-action min-w-0">{primaryAction}</div> : null}

        {actionMenu ? (
          <details
            ref={actionsMenuRef}
            className="qs-toolbar-menu qs-actions-menu"
            open={isActionsMenuOpen}
            onToggle={(event) => setIsActionsMenuOpen(event.currentTarget.open)}
          >
            <summary className="qs-collection-toolbar-button grid h-9 cursor-pointer place-items-center rounded-md border border-skyglass/15 bg-ink-900/70 px-3 text-sm font-semibold text-slate-200 hover:bg-mint/10 hover:text-white">
              <span>
                Actions <span aria-hidden="true">▾</span>
              </span>
            </summary>
            <div className="qs-toolbar-menu-panel" role="menu" aria-label={`${title} actions`}>
              {actionMenu}
              {onClearFilters ? (
                <button
                  className="h-9 rounded-md border border-skyglass/15 px-3 text-left text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                  onClick={onClearFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </details>
        ) : null}

        {!actionMenu && onClearFilters ? (
          <button
            className="qs-collection-toolbar-button h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClearFilters}
            type="button"
          >
            Clear
          </button>
        ) : null}

        {children ? <div className="qs-collection-toolbar-extra min-w-0">{children}</div> : null}
      </div>
    </div>
  );
}
