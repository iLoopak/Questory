import { useEffect, useMemo, useState } from 'react';
import { GameCard } from './components/GameCard';
import { SteamSettingsPanel } from './components/SteamSettingsPanel';
import { loadGames, saveGames } from './lib/gameStorage';
import type { Game, GamePlatform, GameStatus } from './types/game';
import { gamePlatforms, gameStatuses } from './types/game';

const navItems = ['Library', 'Recommendation', 'Stats', 'Settings'] as const;
type NavItem = (typeof navItems)[number];

const allOption = 'All';

function App() {
  const [games, setGames] = useState<Game[]>(() => loadGames());
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<GamePlatform | typeof allOption>(allOption);
  const [statusFilter, setStatusFilter] = useState<GameStatus | typeof allOption>(allOption);
  const [tagFilter, setTagFilter] = useState<string>(allOption);
  const [activeNavItem, setActiveNavItem] = useState<NavItem>('Library');

  useEffect(() => {
    saveGames(games);
  }, [games]);

  const tags = useMemo(() => {
    return Array.from(new Set(games.flatMap((game) => game.tags))).sort((first, second) =>
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
                onClick={() => setActiveNavItem(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
        </header>

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
                  options={[allOption, ...gamePlatforms]}
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
                {activeNavItem === 'Settings'
                  ? 'Steam integration settings are local to this browser.'
                  : `${activeNavItem} remains a placeholder for a later feature pass.`}
              </div>
            )}
          </aside>

          {activeNavItem === 'Library' ? (
            <section className="min-w-0 rounded-lg border border-white/10 bg-ink-900/70 p-3 sm:p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Library</h2>
                  <p className="mt-1 text-sm text-slate-400">{filteredGames.length} games match the current view</p>
                </div>
                <div className="rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
                  Local storage enabled
                </div>
              </div>

              {filteredGames.length > 0 ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {filteredGames.map((game) => (
                    <GameCard key={game.id} game={game} onStatusChange={updateGameStatus} />
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
          ) : activeNavItem === 'Settings' ? (
            <SteamSettingsPanel games={games} onImportGames={importGames} />
          ) : (
            <PlaceholderPanel title={activeNavItem} />
          )}
        </section>
      </div>
    </main>
  );
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
