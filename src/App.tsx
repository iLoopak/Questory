import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { GameDetailView } from './components/GameDetailView';
import { GameCard } from './components/GameCard';
import { MetadataEnrichmentPanel } from './components/MetadataEnrichmentPanel';
import { PwaStatusBanner } from './components/PwaStatusBanner';
import { RawgSettingsPanel } from './components/RawgSettingsPanel';
import { RecommendationPanel } from './components/RecommendationPanel';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { getMockGames, isMockGame, loadGames, removeMockGames, saveGames } from './lib/gameStorage';
import {
  addIgnoredSteamGame,
  loadIgnoredSteamGames,
  removeIgnoredSteamGame,
  saveIgnoredSteamGames,
  type IgnoredSteamGame,
} from './lib/steamIgnoredGamesStorage';
import type { Game, GamePlatform, GameStatus } from './types/game';
import { gamePlatforms, gameStatuses } from './types/game';
import type { RawgMetadata } from './types/rawg';

const navItems = ['Library', 'Metadata', 'Recommendation', 'Stats', 'Settings'] as const;
type NavItem = (typeof navItems)[number];

const allOption = 'All';

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [ignoredSteamGames, setIgnoredSteamGames] = useState<IgnoredSteamGame[]>(() => loadIgnoredSteamGames());
  const [isAppReady, setIsAppReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<GamePlatform | typeof allOption>(allOption);
  const [statusFilter, setStatusFilter] = useState<GameStatus | typeof allOption>(allOption);
  const [tagFilter, setTagFilter] = useState<string>(allOption);
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Library');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);

  useEffect(() => {
    saveGames(games);
  }, [games]);

  useEffect(() => {
    saveIgnoredSteamGames(ignoredSteamGames);
  }, [ignoredSteamGames]);

  useEffect(() => {
    const readyFrame = window.requestAnimationFrame(() => setIsAppReady(true));

    return () => window.cancelAnimationFrame(readyFrame);
  }, []);

  const tags = useMemo(() => {
    return Array.from(new Set(games.flatMap((game) => game.tags))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const platformOptions = useMemo(() => {
    return Array.from(new Set([...gamePlatforms, ...games.map((game) => game.platform)])).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const filteredGames = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return games.filter((game) => {
      const matchesTitle = game.title.toLowerCase().includes(normalizedSearch);
      const matchesPlatform = platformFilter === allOption || game.platform === platformFilter;
      const matchesStatus = statusFilter === allOption || game.status === statusFilter;
      const matchesTag = tagFilter === allOption || game.tags.includes(tagFilter);

      return matchesTitle && matchesPlatform && matchesStatus && matchesTag;
    });
  }, [games, platformFilter, searchTerm, statusFilter, tagFilter]);

  const activeGames = games.filter((game) => game.status === 'Playing').length;
  const totalHours = games.reduce((sum, game) => sum + game.playtimeHours, 0);
  const selectedGame = selectedGameId ? games.find((game) => game.id === selectedGameId) : null;

  function updateGameStatus(gameId: string, status: GameStatus) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              status,
              lastPlayedAt: status === 'Playing' ? new Date().toISOString().slice(0, 10) : game.lastPlayedAt,
            }
          : game,
      ),
    );
  }

  function importGames(importedGames: Game[]) {
    setGames((currentGames) => {
      const existingSteamAppIds = new Set(
        currentGames
          .map((game) => game.steamAppId)
          .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
      );

      const newGames = importedGames.filter((game) => {
        return typeof game.steamAppId !== 'number' || !existingSteamAppIds.has(game.steamAppId);
      });

      return [...currentGames, ...newGames];
    });
  }

  function addManualGame(game: Game) {
    setGames((currentGames) => [...currentGames, game]);
  }

  function removeGame(gameId: string) {
    setGames((currentGames) => currentGames.filter((game) => game.id !== gameId));
    setSelectedGameId((currentSelectedGameId) => (currentSelectedGameId === gameId ? null : currentSelectedGameId));
  }

  function removeAndIgnoreSteamGame(game: Game) {
    if (typeof game.steamAppId !== 'number') {
      return;
    }

    setIgnoredSteamGames((currentIgnoredGames) =>
      addIgnoredSteamGame(currentIgnoredGames, game.steamAppId as number, game.title),
    );
    removeGame(game.id);
  }

  function unignoreSteamGame(steamAppId: number) {
    setIgnoredSteamGames((currentIgnoredGames) => removeIgnoredSteamGame(currentIgnoredGames, steamAppId));
  }

  function loadDemoData() {
    setGames((currentGames) => {
      const existingIds = new Set(currentGames.map((game) => game.id));
      const newMockGames = getMockGames().filter((game) => !existingIds.has(game.id));

      return [...currentGames, ...newMockGames];
    });
  }

  function removeDemoGames() {
    setGames((currentGames) => removeMockGames(currentGames));
  }

  function updateGameMetadata(gameId: string, metadata: RawgMetadata) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              ...metadata,
              metadataSkippedAt: undefined,
              metadataManualManagedAt: undefined,
            }
          : game,
      ),
    );
  }

  function updateGameMetadataManagement(
    gameId: string,
    changes: Pick<Game, 'metadataManualManagedAt' | 'metadataSkippedAt'>,
  ) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              ...changes,
            }
          : game,
      ),
    );
  }

  function updateGameTracking(gameId: string, tracking: Pick<Game, 'notes' | 'status' | 'tags'>) {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              ...tracking,
              lastPlayedAt:
                tracking.status === 'Playing' && game.status !== 'Playing'
                  ? new Date().toISOString().slice(0, 10)
                  : game.lastPlayedAt,
            }
          : game,
      ),
    );
  }

  if (!isAppReady) {
    return <AppStartupScreen />;
  }

  return (
    <main className="min-h-screen bg-ink-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-5 lg:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-mint">QuestShelf</p>
            <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Local game library</h1>
          </div>

          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-ink-900 p-1">
            {navItems.map((item) => (
              <button
                key={item}
                className={`h-10 shrink-0 rounded-md px-3 text-sm font-medium transition ${
                  item === activeNavItem
                    ? 'bg-white text-ink-950'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => {
                  setActiveNavItem(item);
                  if (item !== 'Library') {
                    setSelectedGameId(null);
                  }
                }}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
        </header>

        <div className="pt-4">
          <PwaStatusBanner />
        </div>

        <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-white/10 bg-ink-900 p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Stat label="Games" value={games.length.toString()} />
              <Stat label="Playing" value={activeGames.toString()} />
              <Stat label="Hours" value={totalHours.toString()} />
            </div>

            {activeNavItem === 'Library' ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
                  <input
                    className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Find by title"
                    type="search"
                  />
                </label>

                <FilterSelect
                  label="Platform"
                  value={platformFilter}
                  options={[allOption, ...platformOptions]}
                  onChange={(value) => setPlatformFilter(value as GamePlatform | typeof allOption)}
                />

                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  options={[allOption, ...gameStatuses]}
                  onChange={(value) => setStatusFilter(value as GameStatus | typeof allOption)}
                />

                <FilterSelect label="Tag" value={tagFilter} options={[allOption, ...tags]} onChange={setTagFilter} />
              </div>
            ) : (
              <div className="mt-5 rounded-md border border-white/10 bg-ink-950 p-3 text-sm leading-6 text-slate-400">
                {getNavDescription(activeNavItem)}
              </div>
            )}
          </aside>

          {activeNavItem === 'Library' && selectedGame ? (
            <GameDetailView
              game={selectedGame}
              onBack={() => setSelectedGameId(null)}
              onTrackingChange={updateGameTracking}
            />
          ) : activeNavItem === 'Library' ? (
            <section className="min-w-0 rounded-lg border border-white/10 bg-ink-900/70 p-3 sm:p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Library</h2>
                  <p className="mt-1 text-sm text-slate-400">{filteredGames.length} games match the current view</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
                    onClick={() => setIsAddGameOpen(true)}
                    type="button"
                  >
                    Add game
                  </button>
                  <div className="rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                    Local storage enabled
                  </div>
                </div>
              </div>

              {filteredGames.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3 2xl:grid-cols-4">
                  {filteredGames.map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      onOpenDetails={() => setSelectedGameId(game.id)}
                      onRemove={removeGame}
                      onRemoveAndIgnore={removeAndIgnoreSteamGame}
                      onStatusChange={updateGameStatus}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-white/15 bg-ink-950/50 p-8 text-center">
                  <div>
                    <h3 className="text-lg font-semibold text-white">No games found</h3>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                      Adjust the search or filters to bring titles back into view.
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : activeNavItem === 'Metadata' ? (
            <MetadataEnrichmentPanel
              games={games}
              onMetadataManagementChange={updateGameMetadataManagement}
              onMetadataUpdate={updateGameMetadata}
            />
          ) : activeNavItem === 'Recommendation' ? (
            <RecommendationPanel
              games={games}
              onOpenDetails={(gameId) => {
                setSelectedGameId(gameId);
                setActiveNavItem('Library');
              }}
              onStatusChange={updateGameStatus}
            />
          ) : activeNavItem === 'Settings' ? (
            <section className="min-w-0 space-y-4 overflow-y-auto lg:h-[calc(100vh-116px)]">
              <DemoDataPanel
                demoGameCount={games.filter(isMockGame).length}
                onLoadDemoData={loadDemoData}
                onRemoveDemoGames={removeDemoGames}
              />
              <RawgSettingsPanel />
              <SteamSettingsPanel
                games={games}
                ignoredSteamGames={ignoredSteamGames}
                onImportGames={importGames}
                onUnignoreSteamGame={unignoreSteamGame}
              />
            </section>
          ) : (
            <PlaceholderPanel title={activeNavItem} />
          )}
        </section>
      </div>

      {isAddGameOpen ? (
        <AddGameDialog
          existingGameIds={new Set(games.map((game) => game.id))}
          onClose={() => setIsAddGameOpen(false)}
          onSave={(game) => {
            addManualGame(game);
            setIsAddGameOpen(false);
            setSelectedGameId(game.id);
          }}
        />
      ) : null}
    </main>
  );
}

type AddGameDialogProps = {
  existingGameIds: Set<string>;
  onClose: () => void;
  onSave: (game: Game) => void;
};

function AddGameDialog({ existingGameIds, onClose, onSave }: AddGameDialogProps) {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<GamePlatform>('Steam');
  const [customPlatform, setCustomPlatform] = useState('');
  const [status, setStatus] = useState<GameStatus>('Want to play');
  const [playtimeHours, setPlaytimeHours] = useState('0');
  const [coverImage, setCoverImage] = useState('');
  const [tagText, setTagText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const parsedPlaytime = Number(playtimeHours);
    const resolvedPlatform = platform === 'Other' ? customPlatform.trim() : platform;

    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }

    if (!resolvedPlatform) {
      setError('Custom platform is required when Other is selected.');
      return;
    }

    if (!Number.isFinite(parsedPlaytime) || parsedPlaytime < 0) {
      setError('Playtime must be zero or positive.');
      return;
    }

    const importedAt = new Date().toISOString();
    const id = createManualGameId(trimmedTitle, existingGameIds);

    onSave({
      id,
      title: trimmedTitle,
      platform: resolvedPlatform as GamePlatform,
      status,
      coverImage: coverImage.trim(),
      playtimeHours: parsedPlaytime,
      tags: parseTagInput(tagText),
      lastPlayedAt: status === 'Playing' ? importedAt.slice(0, 10) : null,
      notes: notes.trim(),
      externalSource: 'manual',
      importedAt,
    });
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/75 p-3">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-ink-900 shadow-panel">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-ink-950 p-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Add game</h2>
            <p className="mt-1 text-sm text-slate-400">Manual games stay local and are never affected by Steam import cleanup.</p>
          </div>
          <button
            className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <form className="max-h-[calc(92vh-73px)] overflow-y-auto p-4" onSubmit={submitForm}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Title</span>
              <input
                autoFocus
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Game title"
                value={title}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setPlatform(event.target.value as GamePlatform)}
                value={platform}
              >
                {gamePlatforms.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {platform === 'Other' ? (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Custom platform</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => setCustomPlatform(event.target.value)}
                  placeholder="Dreamcast, 3DS, Arcade"
                  value={customPlatform}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</span>
              <select
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
                onChange={(event) => setStatus(event.target.value as GameStatus)}
                value={status}
              >
                {gameStatuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Playtime hours</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                min="0"
                onChange={(event) => setPlaytimeHours(event.target.value)}
                step="0.1"
                type="number"
                value={playtimeHours}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cover image URL</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setCoverImage(event.target.value)}
                placeholder="https://..."
                type="url"
                value={coverImage}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tags</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setTagText(event.target.value)}
                placeholder="physical, handheld, retro"
                value={tagText}
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</span>
              <textarea
                className="mt-2 min-h-28 w-full resize-y rounded-md border border-white/10 bg-ink-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Physical copy, save file notes, platform details..."
                value={notes}
              />
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <button
              className="h-10 rounded-md border border-white/10 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
              type="submit"
            >
              Save game
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type DemoDataPanelProps = {
  demoGameCount: number;
  onLoadDemoData: () => void;
  onRemoveDemoGames: () => void;
};

function DemoDataPanel({ demoGameCount, onLoadDemoData, onRemoveDemoGames }: DemoDataPanelProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-ink-900/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Library data</h2>
          <p className="mt-1 text-sm text-slate-400">
            New installs start empty. Demo games are optional and never overwrite imported Steam games.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {import.meta.env.DEV ? (
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
              onClick={onLoadDemoData}
              type="button"
            >
              Load demo data
            </button>
          ) : null}
          <button
            className="h-10 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
            disabled={demoGameCount === 0}
            onClick={onRemoveDemoGames}
            type="button"
          >
            Remove demo games
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
        {demoGameCount} known demo games in this browser.
      </div>
    </section>
  );
}

function AppStartupScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-ink-900 p-5 shadow-panel">
        <div className="text-sm font-medium uppercase tracking-[0.18em] text-mint">QuestShelf</div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Loading local library</h1>
        <div className="mt-5 space-y-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-full animate-pulse rounded bg-white/10" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </main>
  );
}

function getNavDescription(activeNavItem: NavItem) {
  if (activeNavItem === 'Settings') {
    return 'Integration settings are local to this browser.';
  }

  if (activeNavItem === 'Metadata') {
    return 'RAWG enrichment runs only when you start it.';
  }

  if (activeNavItem === 'Recommendation') {
    return 'Local picks based on your library.';
  }

  return `${activeNavItem} remains a placeholder for a later feature pass.`;
}

type StatProps = {
  label: string;
  value: string;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-md border border-white/10 bg-ink-950 p-3">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition focus:border-mint"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function createManualGameId(title: string, existingGameIds: Set<string>) {
  const baseId =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'manual-game';
  let id = `manual-${baseId}`;
  let suffix = 2;

  while (existingGameIds.has(id)) {
    id = `manual-${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

type PlaceholderPanelProps = {
  title: string;
};

function PlaceholderPanel({ title }: PlaceholderPanelProps) {
  return (
    <section className="grid min-w-0 place-items-center rounded-lg border border-white/10 bg-ink-900/70 p-8 text-center lg:h-[calc(100vh-116px)]">
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          This section is intentionally waiting for a later foundation pass.
        </p>
      </div>
    </section>
  );
}

export default App;
