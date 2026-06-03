import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  addActiveQueuePlatform,
  compareQueueEntries,
  getActiveQueuePlatforms,
  getPlatformMaxActiveGames,
  getQueuePlatforms,
  hideQueuePlatform,
  moveQueuePlatform,
  removeQueuePlatform,
  renameQueuePlatform,
  type PlatformQueueEntry,
  type PlatformQueueState,
} from '../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../types/game';
import { CollectionToolbar } from './CollectionToolbar';

type QueuePanelProps = {
  games: Game[];
  initialPlatform?: GamePlatform;
  queueState: PlatformQueueState;
  onAddGameToQueue: (game: Game, platform: GamePlatform) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onQueueStateChange: (state: PlatformQueueState) => void;
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
  onQueueStateChange,
  onMoveEntry,
  onMoveEntryToPlatform,
  onOpenDetails,
  onRemoveEntry,
  onStartReview,
}: QueuePanelProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform>(initialPlatform ?? queueState.activePlatforms[0] ?? 'Steam');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const platformRefs = useRef(new Map<GamePlatform, HTMLElement>());
  const [selectedGameId, setSelectedGameId] = useState('');
  const [queueSearchTerm, setQueueSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<GamePlatform | 'All'>('All');
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(queueState), [queueState]);
  const queueGameIds = useMemo(() => new Set(queueState.entries.map((entry) => entry.gameId)), [queueState.entries]);
  const displayedQueuePlatforms = useMemo(() => {
    const visiblePlatforms = platformFilter === 'All' ? activeQueuePlatforms : activeQueuePlatforms.filter((platform) => platform === platformFilter);

    if (!initialPlatform || !visiblePlatforms.includes(initialPlatform)) {
      return visiblePlatforms;
    }

    return [initialPlatform, ...visiblePlatforms.filter((platform) => platform !== initialPlatform)];
  }, [activeQueuePlatforms, initialPlatform, platformFilter]);

  const normalizedQueueSearch = queueSearchTerm.trim().toLowerCase();
  const addableGames = games
    .filter((game) => game.collectionType === 'library' && !queueGameIds.has(game.id))
    .filter((game) =>
      normalizedQueueSearch
        ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedQueueSearch)
        : true,
    )
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

  function addQueuePlatform(platform: GamePlatform) {
    const nextState = addActiveQueuePlatform(queueState, platform);
    onQueueStateChange(nextState);
    setSelectedPlatform(platform);
    setCustomPlatformName('');
  }

  function addCustomQueuePlatform() {
    const platform = customPlatformName.trim() as GamePlatform;
    if (!platform) {
      return;
    }

    addQueuePlatform(platform);
  }

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
      <CollectionToolbar
        title="Platforms"
        searchValue={queueSearchTerm}
        searchPlaceholder="Find platform game"
        onSearchChange={setQueueSearchTerm}
        selects={[
          {
            label: 'Status',
            value: 'Planned',
            options: ['Planned'],
            onChange: () => undefined,
          },
          {
            label: 'Platform',
            value: platformFilter,
            options: ['All', ...activeQueuePlatforms],
            onChange: (value) => setPlatformFilter(value as GamePlatform | 'All'),
          },
        ]}
        primaryAction={
          <button
            className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            disabled={!selectedGameId || activeQueuePlatforms.length === 0}
            onClick={addSelectedGame}
            type="button"
          >
            Add
          </button>
        }
        actionMenu={
          <>
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
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target platform</span>
              <select
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
                value={selectedPlatform}
                onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform)}
              >
                {activeQueuePlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20"
              onClick={onStartReview}
              type="button"
            >
              Build in Quest Queue
            </button>
            <details className="rounded-md border border-white/10 bg-ink-900 p-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300">Manage platforms</summary>
              <div className="mt-2 grid gap-2">
                {queuePlatforms
                  .filter((platform) => !activeQueuePlatforms.includes(platform))
                  .slice(0, 12)
                  .map((platform) => (
                    <button
                      key={platform}
                      className="h-8 rounded-md border border-white/10 px-2 text-left text-xs font-semibold text-slate-200 hover:border-mint/40 hover:bg-mint/10 hover:text-mint"
                      onClick={() => addQueuePlatform(platform)}
                      type="button"
                    >
                      {platform}
                    </button>
                  ))}
                <label className="grid gap-2">
                  <span className="sr-only">Custom platform</span>
                  <input
                    className="h-8 min-w-0 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
                    placeholder="Custom Platform"
                    value={customPlatformName}
                    onChange={(event) => setCustomPlatformName(event.target.value)}
                  />
                  <button
                    className="h-8 rounded-md bg-mint px-3 text-xs font-semibold text-ink-950 hover:bg-mint/90 disabled:bg-slate-600 disabled:text-slate-300"
                    disabled={!customPlatformName.trim()}
                    onClick={addCustomQueuePlatform}
                    type="button"
                  >
                    Add platform
                  </button>
                </label>
              </div>
            </details>
          </>
        }
      />

      {displayedQueuePlatforms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-mint/30 bg-mint/10 p-4 text-sm text-slate-200">
          No active platforms yet. Add Steam, Retroid, PS5, Switch 2, or a custom platform to make Platforms personal.
        </div>
      ) : null}

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
            queueEntries={queueState.entries
              .filter((entry) => entry.targetPlatform === platform)
              .filter((entry) => {
                const game = gamesById.get(entry.gameId);
                return !normalizedQueueSearch || (game ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedQueueSearch) : false);
              })
              .sort(compareQueueEntries)}
            onHidePlatform={(platform) => onQueueStateChange(hideQueuePlatform(queueState, platform))}
            onLimitChange={onLimitChange}
            onMovePlatform={(platform, direction) => onQueueStateChange(moveQueuePlatform(queueState, platform, direction))}
            onRemovePlatform={(platform) => onQueueStateChange(removeQueuePlatform(queueState, platform))}
            onRenamePlatform={(platform, nextPlatform) => onQueueStateChange(renameQueuePlatform(queueState, platform, nextPlatform))}
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
  onHidePlatform,
  onLimitChange,
  onMovePlatform,
  onRemovePlatform,
  onRenamePlatform,
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
  onHidePlatform: (platform: GamePlatform) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onMovePlatform: (platform: GamePlatform, direction: 'up' | 'down') => void;
  onRemovePlatform: (platform: GamePlatform) => void;
  onRenamePlatform: (platform: GamePlatform, nextPlatform: GamePlatform) => void;
  onMoveEntry: (gameId: string, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string) => void;
}) {
  const currentlyPlaying = games.filter((game) => game.status === 'Playing' && game.platform === platform);
  const hasGames = currentlyPlaying.length > 0 || queueEntries.length > 0;

  function renamePlatform() {
    const nextName = window.prompt('Rename platform', platform);
    if (!nextName?.trim()) {
      return;
    }

    onRenamePlatform(platform, nextName.trim() as GamePlatform);
  }

  return (
    <section ref={setPlatformRef} className={`rounded-lg border bg-ink-950/80 p-3 ${isHighlighted ? 'border-mint/50 shadow-glow' : hasGames ? 'border-skyglass/15' : 'border-skyglass/10 opacity-80'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{platform}</h3>
        <details className="relative">
          <summary className="cursor-pointer rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">
            Options
          </summary>
          <div className="absolute right-0 z-20 mt-2 grid w-48 gap-2 rounded-md border border-skyglass/15 bg-ink-950 p-3 shadow-panel">
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
            <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => onHidePlatform(platform)} type="button">Hide Platform</button>
            <button className="h-8 rounded-md border border-red-400/30 px-2 text-left text-xs text-red-100 hover:bg-red-500/10" onClick={() => onRemovePlatform(platform)} type="button">Remove Platform</button>
            <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={renamePlatform} type="button">Rename Platform</button>
            <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => onMovePlatform(platform, 'up')} type="button">Move Up</button>
            <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => onMovePlatform(platform, 'down')} type="button">Move Down</button>
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
            No platform backlog yet. Add one above or use Quest Queue.
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
      aria-label={`${game.title} platform plan entry. A opens details, X moves up, Y moves down.`}
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
          <div className="mt-1">
            <span className="platform-badge inline-flex rounded-full px-2 py-0.5 text-xs font-semibold">{game.platform}</span>
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
