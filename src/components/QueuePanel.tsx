import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  initialPlatform?: GamePlatform;
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
  initialPlatform,
  queueState,
  onAddGameToQueue,
  onLimitChange,
  onMoveEntry,
  onMoveEntryToPlatform,
  onOpenDetails,
  onRemoveEntry,
  onStartReview,
}: QueuePanelProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform>(initialPlatform ?? 'Steam');
  const platformRefs = useRef(new Map<GamePlatform, HTMLElement>());
  const [selectedGameId, setSelectedGameId] = useState('');
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const queueGameIds = useMemo(() => new Set(queueState.entries.map((entry) => entry.gameId)), [queueState.entries]);
  const displayedQueuePlatforms = useMemo(() => {
    if (!initialPlatform) {
      return queuePlatforms;
    }

    return [initialPlatform, ...queuePlatforms.filter((platform) => platform !== initialPlatform)];
  }, [initialPlatform, queuePlatforms]);

  const addableGames = games
    .filter((game) => game.collectionType === 'library' && !queueGameIds.has(game.id))
    .sort((first, second) => first.title.localeCompare(second.title));

  useEffect(() => {
    if (!initialPlatform) {
      return;
    }

    setSelectedPlatform(initialPlatform);
    window.requestAnimationFrame(() => {
      platformRefs.current.get(initialPlatform)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [initialPlatform]);

  function addSelectedGame() {
    const game = gamesById.get(selectedGameId);
    if (!game) {
      return;
    }

    onAddGameToQueue(game, selectedPlatform);
    setSelectedGameId('');
  }

  return (
    <section className="qs-queue-shell min-w-0 rounded-lg border border-skyglass/15 bg-ink-900/70 p-2 sm:p-3 lg:h-[calc(100vh-74px)] lg:overflow-y-auto">
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Queue</h2>
        </div>
        <button
          className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20"
          onClick={onStartReview}
          type="button"
        >
          Build in Review Mode
        </button>
      </div>

      <div className="mb-2 grid gap-2 rounded-md border border-skyglass/15 bg-ink-950/70 p-2 lg:grid-cols-[minmax(0,1fr)_220px_110px]">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add game</span>
          <select
            className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
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
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</span>
          <select
            className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
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
          className="h-9 self-end rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          disabled={!selectedGameId}
          onClick={addSelectedGame}
          type="button"
        >
          Add
        </button>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        {displayedQueuePlatforms.map((platform) => (
          <PlatformQueueColumn
            key={platform}
            games={games}
            gamesById={gamesById}
            maxActiveGames={getPlatformMaxActiveGames(queueState, platform)}
            isHighlighted={platform === initialPlatform}
            platform={platform}
            platformOptions={queuePlatforms}
            setPlatformRef={(element) => {
              if (element) {
                platformRefs.current.set(platform, element);
              } else {
                platformRefs.current.delete(platform);
              }
            }}
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
  isHighlighted,
  platform,
  platformOptions,
  setPlatformRef,
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
  isHighlighted: boolean;
  platform: GamePlatform;
  platformOptions: GamePlatform[];
  setPlatformRef: (element: HTMLElement | null) => void;
  queueEntries: PlatformQueueEntry[];
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onMoveEntry: (gameId: string, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string) => void;
}) {
  const currentlyPlaying = games.filter((game) => game.status === 'Playing' && game.platform === platform);

  return (
    <section ref={setPlatformRef} className={`rounded-lg border bg-ink-950/80 p-3 ${isHighlighted ? 'border-mint/50 shadow-glow' : 'border-skyglass/15'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{platform}</h3>
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">
            Options
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-skyglass/15 bg-ink-950 p-3 shadow-panel">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active limit</span>
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
        </details>
      </div>

      {currentlyPlaying.length > 0 ? (
        <div className="mb-3 grid gap-2">
          {currentlyPlaying.map((game) => (
            <QueueGameRow key={game.id} game={game} onOpenDetails={onOpenDetails} />
          ))}
        </div>
      ) : null}

      <div className="grid gap-2">
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
          <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
            No queued games. Add one above or use Review Mode.
          </div>
        )}
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
  function handleQueueEntryKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      onOpenDetails(game.id);
      return;
    }

    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault();
      onMoveEntry(game.id, 'up');
      return;
    }

    if (event.key === 'y' || event.key === 'Y') {
      event.preventDefault();
      onMoveEntry(game.id, 'down');
    }
  }

  return (
    <article
      aria-label={`${game.title} queue entry. A opens details, X moves up, Y moves down.`}
      className="rounded-md border border-skyglass/15 bg-ink-950 p-2"
      onKeyDown={handleQueueEntryKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="grid h-9 w-9 place-items-center rounded-md border border-mint/25 bg-mint/10 text-sm font-semibold text-mint">
          {entry.queuePosition}
        </div>
        <div className="min-w-0">
          <button className="truncate text-left font-semibold text-white hover:text-mint" onClick={() => onOpenDetails(game.id)} type="button">
            {game.title}
          </button>
          <div className="mt-1 text-xs text-slate-500">{game.platform}</div>
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
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Move platform</summary>
        <select
          className="mt-2 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
          value={entry.targetPlatform}
          onChange={(event) => onMoveEntryToPlatform(game.id, event.target.value as GamePlatform)}
        >
          {platformOptions.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </select>
      </details>
    </article>
  );
}

function QueueGameRow({ game, onOpenDetails }: { game: Game; onOpenDetails: (gameId: string) => void }) {
  return (
    <button
      className="min-h-9 rounded-md border border-mint/20 bg-mint/10 px-3 py-1.5 text-left text-sm text-mint transition hover:bg-mint/20"
      onClick={() => onOpenDetails(game.id)}
      type="button"
    >
      <span className="block truncate font-semibold">Playing: {game.title}</span>
    </button>
  );
}
