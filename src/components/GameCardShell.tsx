import type { KeyboardEvent, ReactNode } from 'react';

/**
 * Pure visual shell for ShelfGameCard and any future card variant that
 * appears in a horizontal scroll strip.
 *
 * Provides the card root (border, shadow, hover lift, focus ring), the 3:4
 * cover area with gradient and two badge slots, the title area, an optional
 * secondary line, and a stopPropagation-wrapped action area.
 *
 * Callers own all state, event logic and content — this component has none.
 */

type GameCardShellProps = {
  // ── Root ─────────────────────────────────────────────────────────────────
  ariaLabel?: string;
  ariaPosinset?: number;
  ariaSelected?: boolean;
  /**
   * Border and ring state classes, plus any layout extras for the specific
   * context (e.g. "qs-shelf-card snap-center border-skyglass/18").
   * Defaults to the neutral border if omitted.
   */
  className?: string;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  refCallback?: (el: HTMLDivElement | null) => void;
  role?: string;
  tabIndex?: number;
  /** Game id exposed as data-game-id for post-navigation focus restoration. */
  dataGameId?: string;

  // ── Absolute overlays inside the root, above the cover ───────────────────
  /** Multi-select checkbox, highlight label, etc. */
  cardOverlays?: ReactNode;

  // ── Cover ────────────────────────────────────────────────────────────────
  /** <img> or fallback element rendered inside the cover span. */
  coverContent: ReactNode;
  /**
   * Row of badges rendered at bottom-left of the cover (inside the shared
   * `absolute bottom-3 left-3` wrapper). Pass bare badge elements; the
   * wrapper and gap are provided by the shell.
   */
  coverBadgesBottom?: ReactNode;
  /**
   * Single element positioned at top-right of the cover. Caller must include
   * its own `absolute right-3 top-3` (or similar) positioning classes so the
   * badge renders correctly in both contexts (play-status dot, metacritic
   * score, etc.).
   */
  coverBadgeTopRight?: ReactNode;
  /**
   * Any additional absolute overlays inside the cover span that don't fit the
   * two badge slots above (DealCoverBadges, ArtworkRecoveryButton, …).
   */
  coverOverlays?: ReactNode;

  // ── Body ─────────────────────────────────────────────────────────────────
  title: string;
  /** Small line rendered directly below the title (reason text, year, etc.). */
  secondaryLine?: ReactNode;

  // ── Action area ──────────────────────────────────────────────────────────
  /**
   * Content for the bottom action row. The shell provides the `mt-2.5 flex
   * items-center gap-2` wrapper with `onClick` stopPropagation so action
   * clicks don't bubble to the card root. Pass `null` to hide the row
   * entirely (e.g. during multi-select mode).
   */
  action?: ReactNode | null;
};

export function GameCardShell({
  ariaLabel,
  ariaPosinset,
  ariaSelected,
  className = 'border-skyglass/18',
  onClick,
  onKeyDown,
  refCallback,
  role = 'button',
  tabIndex = 0,
  dataGameId,
  cardOverlays,
  coverContent,
  coverBadgesBottom,
  coverBadgeTopRight,
  coverOverlays,
  title,
  secondaryLine,
  action,
}: GameCardShellProps) {
  return (
    <div
      ref={refCallback}
      aria-label={ariaLabel}
      aria-posinset={ariaPosinset}
      aria-selected={ariaSelected}
      className={`group relative flex w-[clamp(11rem,22vw,16rem)] shrink-0 flex-col rounded-xl border bg-ink-950/80 p-2 text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-mint/45 hover:shadow-glow focus-visible:-translate-y-1 focus-visible:border-mint/80 focus-visible:shadow-glow focus-visible:outline-none ${className}`}
      data-game-id={dataGameId}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
    >
      {cardOverlays}

      <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-ink-700">
        {coverContent}
        <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />
        {coverBadgesBottom ? (
          <span className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
            {coverBadgesBottom}
          </span>
        ) : null}
        {coverBadgeTopRight}
        {coverOverlays}
      </span>

      <span className="mt-2.5 block min-h-[2.75rem]">
        <span className="line-clamp-2 text-base font-semibold leading-6 text-white">{title}</span>
      </span>

      {secondaryLine}

      {action != null ? (
        <span className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {action}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared skeleton — same proportions as any GameCardShell card.
// ---------------------------------------------------------------------------

export function GameCardShellSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`flex w-[clamp(11rem,22vw,16rem)] shrink-0 flex-col rounded-xl border border-skyglass/18 bg-ink-950/80 p-2 shadow-panel ${className ?? ''}`}
    >
      <span className="block aspect-[3/4] animate-pulse rounded-lg bg-ink-800" />
      <span className="mt-2.5 block min-h-[2.75rem] space-y-2">
        <span className="block h-4 w-full animate-pulse rounded bg-ink-800" />
        <span className="block h-4 w-3/4 animate-pulse rounded bg-ink-800" />
      </span>
      <span className="mt-0.5 block h-3 w-1/2 animate-pulse rounded bg-ink-800" />
      <span className="mt-2.5 block h-10 animate-pulse rounded-md bg-ink-800" />
    </div>
  );
}
