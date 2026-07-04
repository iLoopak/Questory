import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAchievementTimeline, countTimelineStats, groupEventsByYearMonth } from '../../lib/achievementTimeline';
import { GameCoverImage } from '../../components/GameCoverImage';
import { Icon } from '../../components/Icon';
import type { Game } from '../../types/game';
import type { TimelineEvent, TimelineYear } from '../../types/timeline';

const INITIAL_COUNT = 60;
const PAGE_SIZE = 60;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
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
      {/* Header */}
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

        {/* Filter placeholder — wired up in a future iteration */}
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      </header>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {allEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-6">
            {groups.map((yearGroup) => (
              <YearGroup key={yearGroup.year} yearGroup={yearGroup} gameMap={gameMap} />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="py-8 flex justify-center">
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
          </div>
        )}
      </div>
    </div>
  );
}

function YearGroup({ yearGroup, gameMap }: { yearGroup: TimelineYear; gameMap: Map<string, Game> }) {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-2xl font-bold text-white">{yearGroup.year}</h2>
        <div className="flex-1 h-px bg-skyglass/20" />
      </div>

      {yearGroup.months.map((monthGroup) => (
        <div key={`${yearGroup.year}-${monthGroup.month}`} className="mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-500">
            {MONTH_NAMES[monthGroup.month]}
          </h3>

          {/* Timeline line + entries */}
          <div className="relative pl-4 border-l-2 border-slate-800/70 space-y-1">
            {monthGroup.events.map((event, index) => (
              <TimelineEntry
                key={event.id}
                event={event}
                game={gameMap.get(event.gameId)}
                isLast={index === monthGroup.events.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineEntry({ event, game, isLast }: { event: TimelineEvent; game: Game | undefined; isLast: boolean }) {
  const d = new Date(event.timestamp * 1000);

  const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className={`relative flex gap-3 py-2 ${!isLast ? 'border-b border-skyglass/8' : ''}`}>
      {/* Timeline dot */}
      <span
        className="absolute -left-[5px] top-[18px] h-2 w-2 shrink-0 rounded-full bg-mint/80 ring-2 ring-ink-950"
        aria-hidden="true"
      />

      {/* Achievement icon */}
      <div className="shrink-0 mt-0.5">
        {event.achievement.iconUrl ? (
          <img
            alt=""
            aria-hidden="true"
            className="h-10 w-10 rounded-lg object-cover"
            loading="lazy"
            src={event.achievement.iconUrl}
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
            {event.achievement.displayName}
          </p>
          <span className="shrink-0 text-xs text-slate-600 whitespace-nowrap pt-0.5">
            {dateLabel} · {timeLabel}
          </span>
        </div>

        {event.achievement.description ? (
          <p className="text-xs text-slate-500 line-clamp-2 leading-snug">
            {event.achievement.description}
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
