import { useEffect, useMemo, useState } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { PlatformQueueSummary } from '../lib/platformQueueStorage';
import type { Game } from '../types/game';
import { useI18n } from '../i18n';
import { getQuestShelfStats, statsScopeOptions, type QuestShelfStats, type StatsBarItem, type StatsScope } from '../utils/stats';

type StatsPanelProps = {
  games: Game[];
  queueSummary: PlatformQueueSummary;
  onOpenDetails: (gameId: string) => void;
};

export function StatsPanel({ games, queueSummary, onOpenDetails }: StatsPanelProps) {
  const { t } = useI18n();
  const [scope, setScope] = useState<StatsScope>('library');
  const stats = useMemo(() => getQuestShelfStats(games, scope), [games, scope]);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink-900/70 lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-white/10 bg-ink-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">{t('stats.title')}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {t('stats.subtitle')}
              </p>
            </div>

            <div className="flex gap-1 overflow-x-auto rounded-md border border-white/10 bg-ink-900 p-1">
              {statsScopeOptions.map((option) => (
                <button
                  key={option}
                  className={`h-9 shrink-0 rounded px-3 text-sm font-medium capitalize transition ${
                    option === scope ? 'bg-mint text-ink-950 shadow-glow' : 'text-slate-300 hover:bg-mint/10 hover:text-white'
                  }`}
                  onClick={() => setScope(option)}
                  type="button"
                >
                  {option === 'all' ? 'All' : `${option} only`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="qs-scroll-panel min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {stats.scopedGames.length > 0 ? (
            <div className="space-y-4">
              <SummaryGrid stats={stats} />
              <QueueStatsPanel queueSummary={queueSummary} />
              <ProgressGrid stats={stats} />

              <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownPanel
                  items={stats.platformBreakdown}
                  label={t('common.games')}
                  secondaryLabel="hours"
                  title={t('stats.platformBreakdown')}
                />
                <BreakdownPanel items={stats.statusBreakdown} label={t('common.games')} title={t('stats.statusBreakdown')} />
                <BreakdownPanel items={stats.sourceBreakdown} label={t('common.games')} title={t('stats.sourceBreakdown')} />
                <EnrichmentPanel stats={stats} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <GameListPanel
                  emptyText="No tracked playtime yet."
                  games={stats.topPlayedGames}
                  metric={(game) => `${game.playtimeHours}h`}
                  onOpenDetails={onOpenDetails}
                  title={t('stats.topPlayed')}
                />
                <GameListPanel
                  emptyText="No recent play dates yet."
                  games={stats.recentlyPlayedGames}
                  metric={(game) => formatDate(game.lastPlayedAt)}
                  onOpenDetails={onOpenDetails}
                  title={t('stats.recentlyPlayed')}
                />
                <GameListPanel
                  emptyText="No paused games in this scope."
                  games={stats.longestPausedGames}
                  metric={(game) => formatDate(game.lastPlayedAt) || 'No play date'}
                  onOpenDetails={onOpenDetails}
                  title={t('stats.longestPaused')}
                />
                <GameListPanel
                  emptyText="No import timestamps yet."
                  games={stats.recentlyImportedGames}
                  metric={(game) => formatDate(game.importedAt ?? game.wishlistImportedAt ?? game.wishlistSyncedAt)}
                  onOpenDetails={onOpenDetails}
                  title={t('stats.recentlyImported')}
                />
                <GameListPanel
                  emptyText="All games in this scope are enriched or manually managed."
                  games={stats.gamesMissingMetadata}
                  metric={(game) => game.platform}
                  onOpenDetails={onOpenDetails}
                  title={t('stats.missingMetadata')}
                />
              </div>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-white/15 bg-ink-950/50 p-8 text-center">
              <div>
                <h3 className="text-lg font-semibold text-white">{t('stats.noStats')}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                  Add games, import Steam titles, or switch the scope to see available local data.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QueueStatsPanel({ queueSummary }: { queueSummary: PlatformQueueSummary }) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-white">Platforms planning</h3>
          <p className="mt-1 text-sm text-slate-400">Platforms is the focused layer above the full Library.</p>
        </div>
        <span className="rounded-md border border-mint/30 bg-mint/10 px-2.5 py-1 text-sm font-semibold text-mint">
          {queueSummary.queuedCount} planned
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Total planned games" value={queueSummary.queuedCount.toString()} compact />
        <MetricCard label="Estimated planned hours" value={`${queueSummary.estimatedBacklogHours}h`} compact />
        <MetricCard label="Average plan age" value={`${queueSummary.averageQueueAgeDays}d`} compact />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {queueSummary.platformSizes.slice(0, 8).map((item) => (
          <MetricCard key={item.platform} label={item.platform} value={item.count.toString()} compact />
        ))}
      </div>
    </section>
  );
}

function SummaryGrid({ stats }: { stats: QuestShelfStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total games in Library" value={stats.libraryTotal.toString()} />
      <MetricCard label="Total Wishlist items" value={stats.wishlistTotal.toString()} />
      <MetricCard label="Playing Now" value={stats.statusCounts.Playing.toString()} />
      <MetricCard label="Paused" value={stats.statusCounts.Paused.toString()} />
      <MetricCard label="Finished" value={stats.statusCounts.Finished.toString()} />
      <MetricCard label="Dropped" value={stats.statusCounts.Dropped.toString()} />
      <MetricCard label="Want to play" value={stats.statusCounts['Want to play'].toString()} />
      <MetricCard label="Total tracked playtime" value={`${stats.totalTrackedPlaytime}h`} />
    </div>
  );
}

function ProgressGrid({ stats }: { stats: QuestShelfStats }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <ProgressCard label="Finished percentage" value={`${stats.finishedPercent}%`} percent={stats.finishedPercent} />
      <MetricCard label="Active Queue" value={stats.activeBacklogCount.toString()} />
      <MetricCard label="Played but not finished" value={stats.gamesWithPlaytimeNotFinished.toString()} />
      <MetricCard label="Never played" value={stats.gamesNeverPlayed.toString()} />
    </div>
  );
}

function EnrichmentPanel({ stats }: { stats: QuestShelfStats }) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">RAWG enrichment</h3>
          <p className="mt-1 text-sm text-slate-400">Metadata coverage in the selected scope.</p>
        </div>
        <span className="rounded-md border border-mint/30 bg-mint/10 px-2.5 py-1 text-sm font-semibold text-mint">
          {stats.enrichmentCompletionPercent}%
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-mint shadow-glow" style={{ width: `${stats.enrichmentCompletionPercent}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <MetricCard label="RAWG enriched" value={stats.rawgEnrichedCount.toString()} compact />
        <MetricCard label="Missing metadata" value={stats.missingMetadataCount.toString()} compact />
      </div>
    </section>
  );
}

type BreakdownPanelProps = {
  items: StatsBarItem[];
  label: string;
  secondaryLabel?: string;
  title: string;
};

function BreakdownPanel({ items, label, secondaryLabel, title }: BreakdownPanelProps) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-200">{item.label}</span>
                <span className="shrink-0 text-slate-400">
                  {item.count} {label}
                  {secondaryLabel && typeof item.hours === 'number' ? ` / ${item.hours} ${secondaryLabel}` : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-mint/80" style={{ width: `${Math.max((item.count / maxCount) * 100, 4)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No data in this scope.</p>
        )}
      </div>
    </section>
  );
}

type GameListPanelProps = {
  emptyText: string;
  games: Game[];
  metric: (game: Game) => string;
  onOpenDetails: (gameId: string) => void;
  title: string;
};

function GameListPanel({ emptyText, games, metric, onOpenDetails, title }: GameListPanelProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      {games.length > 0 ? (
        <div className="mt-3 divide-y divide-white/10">
          {games.map((game, index) => (
            <DashboardGameRow
              key={game.id}
              game={game}
              metric={metric(game)}
              rank={index + 1}
              onOpenDetails={() => onOpenDetails(game.id)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-white/15 bg-black/20 p-4 text-sm text-slate-400">
          {emptyText}
        </p>
      )}
    </section>
  );
}

type DashboardGameRowProps = {
  game: Game;
  metric: string;
  onOpenDetails: () => void;
  rank: number;
};

function DashboardGameRow({ game, metric, onOpenDetails, rank }: DashboardGameRowProps) {
  return (
    <button
      className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-left transition hover:text-mint focus:outline-none focus:ring-2 focus:ring-mint/50"
      onClick={onOpenDetails}
      type="button"
    >
      <span className="grid h-7 w-7 place-items-center rounded-md border border-skyglass/15 bg-ink-900 text-xs font-semibold text-slate-400">
        {rank}
      </span>
      <GameThumbnail game={game} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white" title={game.title}>
          {game.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {game.platform} - {game.status}
        </span>
      </span>
      <span className="max-w-[7rem] shrink-0 truncate text-right text-sm text-slate-400" title={metric}>
        {metric}
      </span>
    </button>
  );
}

function GameThumbnail({ game }: { game: Game }) {
  const coverSources = useMemo(() => getGameCoverSources(game), [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  return (
    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-skyglass/15 bg-ink-900">
      {activeCoverSource ? (
        <>
          {!isCoverLoaded ? <span className="absolute inset-0 animate-pulse bg-white/5" /> : null}
          <img
            alt=""
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              isCoverLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            decoding="async"
            loading="lazy"
            onError={() => {
              setIsCoverLoaded(false);
              setCoverSourceIndex((currentIndex) => currentIndex + 1);
            }}
            onLoad={() => setIsCoverLoaded(true)}
            src={activeCoverSource}
          />
        </>
      ) : (
        <span className="grid h-full w-full place-items-center text-xs font-semibold text-mint/80">
          {game.title.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

type MetricCardProps = {
  compact?: boolean;
  label: string;
  value: string;
};

function MetricCard({ compact = false, label, value }: MetricCardProps) {
  return (
    <div className={`rounded-lg border border-skyglass/15 bg-ink-950/80 ${compact ? 'p-3' : 'p-4'} qs-inset-highlight`}>
      <div className={`${compact ? 'text-xl' : 'text-2xl'} font-semibold text-white`}>{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

type ProgressCardProps = {
  label: string;
  percent: number;
  value: string;
};

function ProgressCard({ label, percent, value }: ProgressCardProps) {
  return (
    <div className="rounded-lg border border-mint/20 bg-mint/10 p-4">
      <div className="text-2xl font-semibold text-mint">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-950">
        <div className="h-full rounded-full bg-mint shadow-glow" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
