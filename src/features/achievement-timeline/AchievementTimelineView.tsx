import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAchievementTimeline, countTimelineStats, groupEventsByYearMonth } from '../../lib/achievementTimeline';
import { GameCoverImage } from '../../components/GameCoverImage';
import { Icon } from '../../components/Icon';
import type { Game } from '../../types/game';
import type { TimelineEvent, TimelineMonth, TimelineYear } from '../../types/timeline';

const INITIAL_COUNT = 60;
const PAGE_SIZE = 60;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Deterministic sticky heights — month header top must match year header height.
const YEAR_HEADER_H = 32; // px  (h-8 in Tailwind)
const MONTH_HEADER_TOP = YEAR_HEADER_H; // px

// Shared inline styles reused across sticky headers so they share CSS layout
const yearStickyStyle: React.CSSProperties = {
  background: 'rgb(var(--ink-950-rgb) / 0.96)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 1px 0 0 rgb(255 255 255 / 0.04), 0 6px 20px -4px rgb(0 0 0 / 0.65)',
};

const monthStickyStyle: React.CSSProperties = {
  top: MONTH_HEADER_TOP,
  background: 'rgb(var(--ink-950-rgb) / 0.90)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  boxShadow: '0 1px 0 0 rgb(255 255 255 / 0.03), 0 4px 16px -4px rgb(0 0 0 / 0.55)',
};

type Props = {
  games: Game[];
  onClose: () => void;
};

export function AchievementTimelineView({ games, onClose }: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const allEvents = useMemo(() => buildAchievementTimeline(games), [games]);
  const stats = useMemo(() => countTimelineStats(allEvents), [allEvents]);
  const visibleEvents = useMemo(() => allEvents.slice(0, visibleCount), [allEvents, visibleCount]);
  const groups = useMemo(() => groupEventsByYearMonth(visibleEvents), [visibleEvents]);
  const hasMore = visibleCount < allEvents.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: '300px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Achievement Timeline"
    >
      {/* ── App header ─────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 border-b border-skyglass/15 px-4 py-3 bg-ink-950/95 backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-skyglass/20 text-slate-400 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70"
          aria-label="Back"
        >
          <Icon name="arrow-left" size={17} />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-white leading-tight truncate">Achievement Timeline</h1>
          {stats.totalEvents > 0 && (
            <p className="text-xs text-slate-500 leading-tight mt-0.5">
              {stats.totalEvents.toLocaleString()} achievement{stats.totalEvents !== 1 ? 's' : ''} across {stats.uniqueGames} game{stats.uniqueGames !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Filter slot — wired up in a future iteration */}
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      </header>

      {/* ── Scrollable timeline ─────────────────────────────────────────── */}
      {/*
        Sticky headers are full-bleed direct children of this container so that
        position:sticky works relative to this single scrolling ancestor.
        Inner content is centered via mx-auto max-w-2xl px-4 in each section.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {allEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Initial top spacing — header not sticky until user starts scrolling */}
            <div className="h-4" aria-hidden="true" />

            {groups.map((yearGroup) => (
              <TimelineYearGroup
                key={yearGroup.year}
                yearGroup={yearGroup}
                gameMap={gameMap}
              />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="mx-auto max-w-2xl px-4 py-8 flex justify-center">
                <span className="text-sm text-slate-600">Loading more…</span>
              </div>
            )}

            {!hasMore && allEvents.length > 0 && (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-700">
                  {allEvents.length.toLocaleString()} achievement{allEvents.length !== 1 ? 's' : ''} total
                </p>
              </div>
            )}

            {/* Bottom breathing room */}
            <div className="h-8" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

// ── Year group ──────────────────────────────────────────────────────────────

function TimelineYearGroup({
  yearGroup,
  gameMap,
}: {
  yearGroup: TimelineYear;
  gameMap: Map<string, Game>;
}) {
  return (
    <div>
      {/*
        Sticky year label — compact, muted. Acts as the outermost sticky layer.
        Height is exactly YEAR_HEADER_H (h-8 = 32px) so the month header can
        anchor at top: MONTH_HEADER_TOP without overlap.
      */}
      <div
        className="sticky top-0 z-20 h-8 w-full flex items-center"
        style={yearStickyStyle}
      >
        <div className="mx-auto w-full max-w-2xl px-4 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600 select-none">
            {yearGroup.year}
          </span>
          <div className="flex-1 h-px bg-skyglass/10" aria-hidden="true" />
        </div>
      </div>

      {yearGroup.months.map((monthGroup) => (
        <TimelineMonthGroup
          key={`${yearGroup.year}-${monthGroup.month}`}
          monthGroup={monthGroup}
          gameMap={gameMap}
        />
      ))}

      {/* Spacing between year groups */}
      <div className="h-4" aria-hidden="true" />
    </div>
  );
}

// ── Month group ─────────────────────────────────────────────────────────────

function TimelineMonthGroup({
  monthGroup,
  gameMap,
}: {
  monthGroup: TimelineMonth;
  gameMap: Map<string, Game>;
}) {
  return (
    <div>
      {/*
        Sticky month header — sits immediately below the year header.
        `top` is set via inline style (= YEAR_HEADER_H px) to match precisely.
      */}
      <div
        className="sticky z-10 w-full flex items-center"
        style={monthStickyStyle}
      >
        <div className="mx-auto w-full max-w-2xl px-4 flex items-center gap-3 py-2">
          <h3 className="text-sm font-semibold text-slate-200 shrink-0">
            {MONTH_NAMES[monthGroup.month]}
          </h3>
          <div className="flex-1 h-px bg-skyglass/15" aria-hidden="true" />
          <span className="text-[10px] font-medium text-slate-700 shrink-0 tabular-nums">
            {monthGroup.events.length}
          </span>
        </div>
      </div>

      {/* Timeline entries */}
      <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
        <div className="relative pl-4 border-l-2 border-slate-800/60 space-y-0">
          {monthGroup.events.map((event) => (
            <TimelineEntry
              key={event.id}
              event={event}
              game={gameMap.get(event.gameId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Individual event card ───────────────────────────────────────────────────

function TimelineEntry({
  event,
  game,
}: {
  event: TimelineEvent;
  game: Game | undefined;
}) {
  const d = new Date(event.timestamp * 1000);
  const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

  // Type guard — ready for future event types (completed game, etc.)
  if (event.type !== 'achievement') return null;
  const { achievement } = event;

  return (
    <div className="relative flex gap-3 py-2">
      {/* Timeline dot */}
      <span
        className="absolute -left-[5px] top-[18px] h-2 w-2 shrink-0 rounded-full bg-mint/80 ring-2 ring-ink-950"
        aria-hidden="true"
      />

      {/* Achievement icon */}
      <div className="shrink-0 mt-0.5">
        {achievement.iconUrl ? (
          <img
            alt=""
            aria-hidden="true"
            className="h-10 w-10 rounded-lg object-cover"
            loading="lazy"
            src={achievement.iconUrl}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-skyglass/20 bg-ink-900 text-slate-600">
            <Icon name="trophy" size={18} />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
            {achievement.displayName}
          </p>
          <span className="shrink-0 text-xs text-slate-600 whitespace-nowrap pt-0.5 tabular-nums">
            {dateLabel} · {timeLabel}
          </span>
        </div>

        {achievement.description ? (
          <p className="text-xs text-slate-500 line-clamp-2 leading-snug">
            {achievement.description}
          </p>
        ) : null}

        {/* Game row */}
        <div className="flex items-center gap-1.5 pt-1">
          {game ? (
            <div className="h-5 w-4 shrink-0 overflow-hidden rounded">
              <GameCoverImage game={game} usage="portrait" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <p className="text-xs text-slate-400 truncate">{event.gameTitle}</p>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-skyglass/20 bg-ink-900 text-slate-700">
        <Icon name="trophy" size={28} />
      </div>
      <div className="space-y-2">
        <p className="text-base font-semibold text-slate-300">No achievement history yet</p>
        <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
          Sync Steam achievements from the Home screen to see your unlocks here.
        </p>
      </div>
    </div>
  );
}
