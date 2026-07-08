import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAchievementTimeline, countTimelineStats, groupEventsByYearMonth } from '../../lib/achievementTimeline';
import { GameCoverImage } from '../../components/GameCoverImage';
import { Icon } from '../../components/Icon';
import type { Game } from '../../types/game';
import type { SteamAchievementSyncState } from '../../types/steam';
import type { TimelineEvent, TimelineMonth, TimelineYear } from '../../types/timeline';

const INITIAL_COUNT = 60;
const PAGE_SIZE = 60;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Deterministic sticky heights — month header top must match year header height.
const YEAR_HEADER_H = 32; // px (h-8)
const MONTH_HEADER_TOP = YEAR_HEADER_H;

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
  steamAchievementSyncState?: SteamAchievementSyncState;
  onSyncFullHistory?: () => void;
};

export function AchievementTimelineView({ games, onClose, steamAchievementSyncState, onSyncFullHistory }: Props) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const allEvents = useMemo(() => buildAchievementTimeline(games), [games]);
  const stats = useMemo(() => countTimelineStats(allEvents), [allEvents]);
  const visibleEvents = useMemo(() => allEvents.slice(0, visibleCount), [allEvents, visibleCount]);
  const groups = useMemo(() => groupEventsByYearMonth(visibleEvents), [visibleEvents]);
  const hasMore = visibleCount < allEvents.length;

  // How many Steam library games have never had achievements fetched and are not marked unsupported.
  // This drives the "complete your history" prompt.
  const unsyncedCount = useMemo(
    () =>
      games.filter(
        (g) =>
          g.collectionType === 'library' &&
          typeof g.steamAppId === 'number' &&
          !Array.isArray(g.steamAchievements) &&
          g.steamAchievementsUnsupported !== true,
      ).length,
    [games],
  );

  const isSyncing = steamAchievementSyncState?.status === 'loading';
  const syncProgress = isSyncing ? steamAchievementSyncState?.progress : undefined;

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

        {/* Filter slot — reserved for a future iteration */}
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      </header>

      {/* ── Scrollable timeline ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {allEvents.length === 0 ? (
          <EmptyState
            unsyncedCount={unsyncedCount}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            onSyncFullHistory={onSyncFullHistory}
          />
        ) : (
          <>
            <div className="h-4" aria-hidden="true" />

            {/* Partial-history banner — shown when some library games haven't been synced */}
            {unsyncedCount > 0 && onSyncFullHistory ? (
              <SyncHistoryBanner
                unsyncedCount={unsyncedCount}
                isSyncing={isSyncing}
                syncProgress={syncProgress}
                onSync={onSyncFullHistory}
              />
            ) : null}

            {groups.map((yearGroup) => (
              <TimelineYearGroup key={yearGroup.year} yearGroup={yearGroup} gameMap={gameMap} />
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

            <div className="h-8" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

// ── Sync history banner (partial data) ────────────────────────────────────

function SyncHistoryBanner({
  unsyncedCount,
  isSyncing,
  syncProgress,
  onSync,
}: {
  unsyncedCount: number;
  isSyncing: boolean;
  syncProgress: { completed: number; total: number } | undefined;
  onSync: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-4">
      <div className="flex items-center gap-3 rounded-xl border border-skyglass/15 bg-ink-900/60 px-4 py-3">
        <Icon name="steam" size={14} className="shrink-0 text-slate-600" />
        <p className="min-w-0 flex-1 text-xs text-slate-500">
          <span className="font-medium text-slate-300">{unsyncedCount} game{unsyncedCount !== 1 ? 's' : ''}</span> not yet included
        </p>
        <button
          type="button"
          disabled={isSyncing}
          onClick={onSync}
          className="shrink-0 rounded-lg border border-skyglass/15 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSyncing && syncProgress
            ? `Syncing… ${syncProgress.completed} / ${syncProgress.total}`
            : 'Complete timeline'}
        </button>
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
      <div className="sticky top-0 z-20 h-8 w-full flex items-center" style={yearStickyStyle}>
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
      <div className="sticky z-10 w-full flex items-center" style={monthStickyStyle}>
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

      <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
        <div className="relative pl-4 border-l-2 border-slate-800/60 space-y-0">
          {monthGroup.events.map((event) => (
            <TimelineEntry key={event.id} event={event} game={gameMap.get(event.gameId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Individual event card ───────────────────────────────────────────────────

function TimelineEntry({ event, game }: { event: TimelineEvent; game: Game | undefined }) {
  const d = new Date(event.timestamp * 1000);
  const dateLabel = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

  if (event.type !== 'achievement') return null;
  const { achievement } = event;

  return (
    <div className="relative flex gap-3 py-2">
      <span
        className="absolute -left-[5px] top-[18px] h-2 w-2 shrink-0 rounded-full bg-mint/80 ring-2 ring-ink-950"
        aria-hidden="true"
      />

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

function EmptyState({
  unsyncedCount,
  isSyncing,
  syncProgress,
  onSyncFullHistory,
}: {
  unsyncedCount: number;
  isSyncing: boolean;
  syncProgress: { completed: number; total: number } | undefined;
  onSyncFullHistory?: () => void;
}) {
  // Two variants: library has unsynced Steam games → prompt to build history.
  // Otherwise → generic "no data" message.
  const canSync = unsyncedCount > 0 && Boolean(onSyncFullHistory);

  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-skyglass/20 bg-ink-900 text-slate-600">
        <Icon name="trophy" size={28} />
      </div>

      {canSync ? (
        <>
          <div className="space-y-2 max-w-xs">
            <p className="text-base font-semibold text-slate-200">Build your achievement history</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              Sync your full Steam library to populate the timeline — including games you haven't played in years.
            </p>
          </div>
          <button
            type="button"
            disabled={isSyncing}
            onClick={onSyncFullHistory}
            className="flex items-center gap-2 rounded-xl border border-skyglass/20 bg-ink-900/80 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="steam" size={15} className="shrink-0 text-slate-500" />
            {isSyncing && syncProgress
              ? `Syncing… ${syncProgress.completed} / ${syncProgress.total}`
              : `Sync full history (${unsyncedCount} game${unsyncedCount !== 1 ? 's' : ''})`}
          </button>
        </>
      ) : (
        <div className="space-y-2 max-w-xs">
          <p className="text-base font-semibold text-slate-300">No achievement history yet</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sync Steam achievements from the Home screen to see your unlocks here.
          </p>
        </div>
      )}
    </div>
  );
}
