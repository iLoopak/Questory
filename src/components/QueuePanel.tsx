import { useMemo, useState } from 'react';
import {
  compareQueueEntries,
  getPlatformMaxActiveGames,
  getQueuePlatforms,
  type PlatformQueueEntry,
  type PlatformQueueState,
} from '../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../types/game';

type QueuePanelProps = {
  games: Game[];
  queueState: PlatformQueueState;
  onAddGameToQueue: (game: Game, platform: GamePlatform) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onMoveEntry: (gameId: string, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string) => void;
  onStartReview: () => void;
};

export function QueuePanel({
  games,
  queueState,
  onAddGameToQueue,
  onLimitChange,
  onMoveEntry,
  onMoveEntryToPlatform,
  onOpenDetails,
  onRemoveEntry,
  onStartReview,
}: QueuePanelProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform>('Steam');
  const [selectedGameId, setSelectedGameId] = useState('');
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const queueGameIds = useMemo(() => new Set(queueState.entries.map((entry) => entry.gameId)), [queueState.entries]);
  const addableGames = games
    .filter((game) => game.collectionType === 'library' && !queueGameIds.has(game.id))
    .sort((first, second) => first.title.localeCompare(second.title));
  const queuedCount = queueState.entries.length;
  const playingCount = games.filter((game) => game.status === 'Playing').length;

  function addSelectedGame() {
    const game = gamesById.get(selectedGameId);
    if (!game) {
      return;
    }

    onAddGameToQueue(game, selectedPlatform);
    setSelectedGameId('');
  }

  return (
    <section className="qs-queue-shell min-w-0 rounded-lg border border-skyglass/15 bg-ink-900/70 p-3 sm:p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Platform Queue</div>
          <h2 className="mt-1 text-xl font-semibold text-white">What to play next</h2>
          <p className="mt-1 text-sm text-slate-400">Queue turns the full library into a realistic platform plan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QueueStat label="Playing" value={playingCount} />
          <QueueStat label="Queued" value={queuedCount} />
          <button
            className="min-h-11 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onStartReview}
            type="button"
          >
            Build Queue in Review Mode
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3 lg:grid-cols-[minmax(0,1fr)_220px_140px]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add game</span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            value={selectedGameId}
            onChange={(event) => setSelectedGameId(event.target.value)}
          >
            <option value="">Choose a Library game</option>
            {addableGames.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title} - {game.platform}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target platform</span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            value={selectedPlatform}
            onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform)}
          >
            {queuePlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <button
          className="min-h-11 self-end rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          disabled={!selectedGameId}
          onClick={addSelectedGame}
          type="button"
        >
          Add to Queue
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {queuePlatforms.map((platform) => (
          <PlatformQueueColumn
            key={platform}
            games={games}
            gamesById={gamesById}
            maxActiveGames={getPlatformMaxActiveGames(queueState, platform)}
            platform={platform}
            platformOptions={queuePlatforms}
            queueEntries={queueState.entries.filter((entry) => entry.targetPlatform === platform).sort(compareQueueEntries)}
            onLimitChange={onLimitChange}
            onMoveEntry={onMoveEntry}
            onMoveEntryToPlatform={onMoveEntryToPlatform}
            onOpenDetails={onOpenDetails}
            onRemoveEntry={onRemoveEntry}
          />
        ))}
      </div>
    </section>
  );
}

function PlatformQueueColumn({
  games,
  gamesById,
  maxActiveGames,
  platform,
  platformOptions,
  queueEntries,
  onLimitChange,
  onMoveEntry,
  onMoveEntryToPlatform,
  onOpenDetails,
  onRemoveEntry,
}: {
  games: Game[];
  gamesById: Map<string, Game>;
  maxActiveGames: number;
  platform: GamePlatform;
  platformOptions: GamePlatform[];
  queueEntries: PlatformQueueEntry[];
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onMoveEntry: (gameId: string, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string) => void;
}) {
  const currentlyPlaying = games.filter((game) => game.status === 'Playing' && game.platform === platform);

  return (
    <section className="rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{platform}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {currentlyPlaying.length} playing, {queueEntries.length} queued
          </p>
        </div>
        <label className="w-24">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Max active</span>
          <input
            className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
            min={1}
            max={10}
            type="number"
            value={maxActiveGames}
            onChange={(event) => onLimitChange(platform, Number(event.target.value))}
          />
        </label>
      </div>

      <div className="rounded-md border border-white/10 bg-ink-900/70 p-3">
        <h4 className="text-sm font-semibold text-white">Currently Playing</h4>
        <div className="mt-2 grid gap-2">
          {currentlyPlaying.length > 0 ? (
            currentlyPlaying.map((game) => (
              <QueueGameRow key={game.id} game={game} onOpenDetails={onOpenDetails} />
            ))
          ) : (
            <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-sm text-slate-500">
              No active games for this platform.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-ink-900/70 p-3">
        <h4 className="text-sm font-semibold text-white">Queue</h4>
        <div className="mt-2 grid gap-2">
          {queueEntries.length > 0 ? (
            queueEntries.map((entry) => {
              const game = gamesById.get(entry.gameId);
              if (!game) {
                return null;
              }

              return (
                <QueueEntryRow
                  key={entry.gameId}
                  entry={entry}
                  game={game}
                  platformOptions={platformOptions}
                  onMoveEntry={onMoveEntry}
                  onMoveEntryToPlatform={onMoveEntryToPlatform}
                  onOpenDetails={onOpenDetails}
                  onRemoveEntry={onRemoveEntry}
                />
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-white/10 px-3 py-2 text-sm text-slate-500">
              Queue is empty.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QueueEntryRow({
  entry,
  game,
  platformOptions,
  onMoveEntry,
  onMoveEntryToPlatform,
  onOpenDetails,
  onRemoveEntry,
}: {
  entry: PlatformQueueEntry;
  game: Game;
  platformOptions: GamePlatform[];
  onMoveEntry: (gameId: string, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string) => void;
}) {
  return (
    <article className="rounded-md border border-skyglass/15 bg-ink-950 p-3">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="grid h-9 w-9 place-items-center rounded-md border border-mint/25 bg-mint/10 text-sm font-semibold text-mint">
          {entry.queuePosition}
        </div>
        <div className="min-w-0">
          <button className="truncate text-left font-semibold text-white hover:text-mint" onClick={() => onOpenDetails(game.id)} type="button">
            {game.title}
          </button>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
            <span>{game.platform}</span>
            <span>{entry.queuePriority} priority</span>
            {entry.estimatedPlaytime ? <span>{entry.estimatedPlaytime}h est.</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, 'top')} type="button">
            Top
          </button>
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, 'up')} type="button">
            Up
          </button>
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, 'down')} type="button">
            Down
          </button>
          <button className="h-9 rounded-md border border-red-400/30 px-2 text-xs text-red-100 hover:bg-red-500/10" onClick={() => onRemoveEntry(game.id)} type="button">
            Remove
          </button>
        </div>
      </div>
      <label className="mt-2 block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Move to platform</span>
        <select
          className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
          value={entry.targetPlatform}
          onChange={(event) => onMoveEntryToPlatform(game.id, event.target.value as GamePlatform)}
        >
          {platformOptions.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

function QueueGameRow({ game, onOpenDetails }: { game: Game; onOpenDetails: (gameId: string) => void }) {
  return (
    <button
      className="min-h-11 rounded-md border border-mint/20 bg-mint/10 px-3 py-2 text-left text-sm text-mint transition hover:bg-mint/20"
      onClick={() => onOpenDetails(game.id)}
      type="button"
    >
      <span className="block truncate font-semibold">{game.title}</span>
      <span className="mt-1 block text-xs opacity-80">{game.playtimeHours}h played</span>
    </button>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-skyglass/15 bg-ink-950/80 px-3 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}
