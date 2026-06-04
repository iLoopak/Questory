import { useEffect, useMemo, useState } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import { ViewportModal } from './ViewportModal';
import type { IgnoredSteamGame } from '../lib/steamIgnoredGamesStorage';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import {
  clearSteamApiDebugLog,
  getOwnedGames,
  getRecentlyPlayedGames,
  getSteamApiDebugLog,
  mapSteamGamesToLocalGames,
  SteamApiError,
} from '../services/steamApi';
import type { Game } from '../types/game';
import type {
  SteamApiDebugEntry,
  SteamConnectionState,
  SteamDebugResult,
  SteamOwnedGame,
  SteamRecentlyPlayedGame,
  SteamPlaytimeRefreshState,
  SteamSettings,
} from '../types/steam';

const initialConnectionState: SteamConnectionState = {
  status: 'idle',
  message: 'Steam credentials are stored locally on this device.',
  data: null,
};

type ImportSummary = {
  importedCount: number;
  skippedDuplicateCount: number;
  skippedIgnoredCount: number;
};

type SteamSettingsPanelProps = {
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  onConnectionTested?: () => void;
  onSteamApiKeyConfigured?: () => void;
  onSteamIdConfigured?: () => void;
  onImportGames: (games: Game[]) => void;
  onSteamLibraryImported?: () => void;
  playtimeRefreshState: SteamPlaytimeRefreshState;
  onRefreshSteamPlaytime: () => Promise<unknown>;
  onUnignoreSteamGame: (steamAppId: number) => void;
};

export function SteamSettingsPanel({
  games,
  ignoredSteamGames,
  onConnectionTested,
  onImportGames,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  playtimeRefreshState,
  onRefreshSteamPlaytime,
  onUnignoreSteamGame,
}: SteamSettingsPanelProps) {
  const [settings, setSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [connectionState, setConnectionState] = useState<SteamConnectionState>(initialConnectionState);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(() => new Set());
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [helpTopic, setHelpTopic] = useState<'steam-api-key' | 'steam-id64' | null>(null);

  useEffect(() => {
    saveSteamSettings(settings);
  }, [settings]);

  const existingSteamAppIds = useMemo(() => {
    return new Set(
      games
        .filter((game) => game.collectionType === 'library')
        .map((game) => game.steamAppId)
        .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
    );
  }, [games]);

  const ignoredSteamAppIds = useMemo(() => {
    return new Set(ignoredSteamGames.map((game) => game.steamAppId));
  }, [ignoredSteamGames]);

  const recentlyPlayedByAppId = useMemo(() => {
    const recentlyPlayedGames = connectionState.data?.recentlyPlayedGames ?? [];
    return new Map(recentlyPlayedGames.map((game) => [game.appid, game]));
  }, [connectionState.data]);

  const importableGames = useMemo(() => {
    return (connectionState.data?.ownedGames ?? []).filter(
      (game) => !existingSteamAppIds.has(game.appid) && !ignoredSteamAppIds.has(game.appid),
    );
  }, [connectionState.data, existingSteamAppIds, ignoredSteamAppIds]);

  const debugOutput = useMemo(() => {
    if (!connectionState.data) {
      return JSON.stringify(createEmptyDebugResult(settings.steamId64), null, 2);
    }

    return JSON.stringify(connectionState.data, null, 2);
  }, [connectionState.data, settings.steamId64]);

  const apiDebugEntries = connectionState.data?.apiDebugEntries ?? [];
  const latestApiDebugEntry = apiDebugEntries.at(-1);

  function updateSetting(field: keyof SteamSettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));

    if (field === 'apiKey' && value.trim()) {
      onSteamApiKeyConfigured?.();
    }

    if (field === 'steamId64' && value.trim()) {
      onSteamIdConfigured?.();
    }
  }

  async function testConnection() {
    clearSteamApiDebugLog();
    setConnectionState({
      status: 'loading',
      message: 'Testing Steam connection...',
      data: connectionState.data,
    });
    setImportSummary(null);

    try {
      const ownedGames = await getOwnedGames(settings);
      const recentlyPlayedGames = await getRecentlyPlayedGames(settings);
      const mappedGames = mapSteamGamesToLocalGames(ownedGames, recentlyPlayedGames);

      setSelectedAppIds(new Set());
      setConnectionState({
        status: 'success',
        message:
          ownedGames.length === 0
            ? 'Steam returned a valid response, but the owned games library is empty.'
            : `Loaded ${ownedGames.length} owned games and ${recentlyPlayedGames.length} recently played games. Select games below to import them locally.`,
        data: {
          ownedGames,
          recentlyPlayedGames,
          mappedGames,
          apiDebugEntries: getSteamApiDebugLog(),
        },
      });
      onConnectionTested?.();
    } catch (error) {
      const message =
        error instanceof SteamApiError
          ? error.message
          : 'Steam API request failed. Check the API key, SteamID64, profile privacy, and network access.';

      setConnectionState({
        status: 'error',
        message,
        data: {
          ownedGames: connectionState.data?.ownedGames ?? [],
          recentlyPlayedGames: connectionState.data?.recentlyPlayedGames ?? [],
          mappedGames: connectionState.data?.mappedGames ?? [],
          apiDebugEntries: getSteamApiDebugLog(),
        },
      });
    }
  }

  function toggleSelectedAppId(appId: number) {
    if (existingSteamAppIds.has(appId) || ignoredSteamAppIds.has(appId)) {
      return;
    }

    setSelectedAppIds((currentSelectedAppIds) => {
      const nextSelectedAppIds = new Set(currentSelectedAppIds);

      if (nextSelectedAppIds.has(appId)) {
        nextSelectedAppIds.delete(appId);
      } else {
        nextSelectedAppIds.add(appId);
      }

      return nextSelectedAppIds;
    });
  }

  function selectAllImportableGames() {
    setSelectedAppIds(new Set(importableGames.map((game) => game.appid)));
  }

  function deselectAllGames() {
    setSelectedAppIds(new Set());
  }

  function importSelectedGames() {
    if (!connectionState.data) {
      return;
    }

    const selectedOwnedGames = connectionState.data.ownedGames.filter((game) => selectedAppIds.has(game.appid));
    const duplicateCount = connectionState.data.ownedGames.filter((game) => existingSteamAppIds.has(game.appid)).length;
    const ignoredCount = connectionState.data.ownedGames.filter((game) => ignoredSteamAppIds.has(game.appid)).length;
    const newOwnedGames = selectedOwnedGames.filter(
      (game) => !existingSteamAppIds.has(game.appid) && !ignoredSteamAppIds.has(game.appid),
    );
    const importedAt = new Date().toISOString();
    const mappedGames = mapSteamGamesToLocalGames(
      newOwnedGames,
      connectionState.data.recentlyPlayedGames,
      importedAt,
    );

    onImportGames(mappedGames);
    if (mappedGames.length > 0) {
      onSteamLibraryImported?.();
    }
    setSelectedAppIds(new Set());
    setImportSummary({
      importedCount: mappedGames.length,
      skippedDuplicateCount: duplicateCount,
      skippedIgnoredCount: ignoredCount,
    });
  }

  const statusStyles = {
    idle: 'border-white/10 bg-ink-950 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[connectionState.status];

  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-ink-900/70 p-4">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Steam integration</h2>

        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Steam Web API key <button className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint" onClick={(event) => { event.preventDefault(); setHelpTopic('steam-api-key'); }} type="button" aria-label="Steam API key help">?</button>
              </span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.apiKey}
                onChange={(event) => updateSetting('apiKey', event.target.value)}
                placeholder="Paste API key"
                spellCheck={false}
                type="password"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">SteamID64 <button className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint" onClick={(event) => { event.preventDefault(); setHelpTopic('steam-id64'); }} type="button" aria-label="SteamID64 help">?</button></span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.steamId64}
                onChange={(event) => updateSetting('steamId64', event.target.value)}
                placeholder="7656119..."
                inputMode="numeric"
                spellCheck={false}
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Steam wishlist URL
              </span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.wishlistUrl}
                onChange={(event) => updateSetting('wishlistUrl', event.target.value)}
                placeholder="https://store.steampowered.com/wishlist/id/loopak/"
                spellCheck={false}
                type="url"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Optional. Paste the public wishlist URL if Steam redirects your SteamID64 wishlist to a custom profile URL.
              </p>
            </label>

            <button
              className="h-11 w-full rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              disabled={connectionState.status === 'loading'}
              onClick={testConnection}
              type="button"
            >
              {connectionState.status === 'loading' ? 'Testing...' : 'Test connection'}
            </button>

            <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
              {connectionState.message}
            </div>

            {importSummary ? (
              <div className="rounded-md border border-mint/40 bg-mint/10 px-3 py-3 text-sm leading-6 text-mint">
                Imported {importSummary.importedCount} games. Skipped {importSummary.skippedDuplicateCount} duplicates and{' '}
                {importSummary.skippedIgnoredCount} ignored games.
              </div>
            ) : null}

            <SteamPlaytimeRefreshCard
              librarySteamGameCount={existingSteamAppIds.size}
              refreshState={playtimeRefreshState}
              onRefresh={onRefreshSteamPlaytime}
            />
          </div>
        </section>

        <details className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <summary className="cursor-pointer font-semibold text-white">Connection details</summary>
          <div className="mt-3">
            <SteamApiDebugSummary
              entries={apiDebugEntries}
              latestEntry={latestApiDebugEntry}
              steamId64={settings.steamId64}
            />

            <pre className="max-h-[320px] overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
              {debugOutput}
            </pre>
          </div>
        </details>
      </div>

      <IgnoredSteamGamesSection ignoredSteamGames={ignoredSteamGames} onUnignoreSteamGame={onUnignoreSteamGame} />

      {helpTopic ? <SteamHelpModal topic={helpTopic} onClose={() => setHelpTopic(null)} /> : null}

      <SteamImportSection
        existingSteamAppIds={existingSteamAppIds}
        ignoredSteamAppIds={ignoredSteamAppIds}
        importableGamesCount={importableGames.length}
        ownedGames={connectionState.data?.ownedGames ?? []}
        recentlyPlayedByAppId={recentlyPlayedByAppId}
        selectedAppIds={selectedAppIds}
        onDeselectAll={deselectAllGames}
        onImportSelected={importSelectedGames}
        onSelectAll={selectAllImportableGames}
        onToggleSelected={toggleSelectedAppId}
      />
    </section>
  );
}

type SteamPlaytimeRefreshCardProps = {
  librarySteamGameCount: number;
  refreshState: SteamPlaytimeRefreshState;
  onRefresh: () => Promise<unknown>;
};

function SteamPlaytimeRefreshCard({ librarySteamGameCount, refreshState, onRefresh }: SteamPlaytimeRefreshCardProps) {
  const isLoading = refreshState.status === 'loading';
  const progressPercent = refreshState.progress.total > 0
    ? Math.round((refreshState.progress.completed / refreshState.progress.total) * 100)
    : 0;
  const statusStyles = {
    idle: 'border-white/10 bg-ink-900/70 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[refreshState.status];

  return (
    <section className="rounded-md border border-white/10 bg-ink-900/80 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Refresh playtime for Steam games</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Updates playtime and Steam last played dates for {librarySteamGameCount} Steam library game{librarySteamGameCount === 1 ? '' : 's'} without re-importing your library.
          </p>
        </div>
        <button
          className="h-10 shrink-0 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
          disabled={isLoading || librarySteamGameCount === 0}
          onClick={() => void onRefresh()}
          type="button"
        >
          {isLoading ? 'Refreshing...' : 'Refresh playtime'}
        </button>
      </div>

      {refreshState.status !== 'idle' ? (
        <div className={`mt-3 rounded-md border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
          <div>{refreshState.message}</div>
          {isLoading ? (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-[0.12em]">
                <span>Progress</span>
                <span>{refreshState.progress.completed}/{refreshState.progress.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}
          {refreshState.summary ? (
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <DebugStat label="Updated" value={refreshState.summary.updatedCount.toString()} />
              <DebugStat label="Unchanged" value={refreshState.summary.unchangedCount.toString()} />
              <DebugStat label="Failed" value={refreshState.summary.failedCount.toString()} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type SteamApiDebugSummaryProps = {
  entries: SteamApiDebugEntry[];
  latestEntry?: SteamApiDebugEntry;
  steamId64: string;
};

function SteamApiDebugSummary({ entries, latestEntry, steamId64 }: SteamApiDebugSummaryProps) {
  const parsedGameCount = latestEntry?.parsedGameCount;

  return (
    <div className="mb-4 rounded-md border border-white/10 bg-ink-900 p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold text-white">Temporary Steam API debug</h4>
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          API key redacted
        </span>
      </div>
      <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <DebugField label="Current SteamID64" value={steamId64 || 'Not set'} />
        <DebugField label="Last HTTP status" value={latestEntry?.httpStatus?.toString() ?? 'n/a'} />
        <DebugField label="Parsed game count" value={parsedGameCount === null || parsedGameCount === undefined ? 'n/a' : parsedGameCount.toString()} />
        <DebugField label="Debug responses" value={entries.length.toString()} />
      </div>
      {latestEntry ? (
        <div className="mt-3 min-w-0 rounded border border-white/10 bg-black/20 px-2 py-2 text-xs leading-5 text-slate-400">
          <div className="truncate">Endpoint: {latestEntry.endpoint}</div>
          <div className="truncate">Request: {latestEntry.requestUrl}</div>
        </div>
      ) : null}
    </div>
  );
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-white/10 bg-ink-950 px-2 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-slate-200">{value}</div>
    </div>
  );
}

type SteamImportSectionProps = {
  existingSteamAppIds: Set<number>;
  ignoredSteamAppIds: Set<number>;
  importableGamesCount: number;
  ownedGames: SteamOwnedGame[];
  recentlyPlayedByAppId: Map<number, SteamRecentlyPlayedGame>;
  selectedAppIds: Set<number>;
  onDeselectAll: () => void;
  onImportSelected: () => void;
  onSelectAll: () => void;
  onToggleSelected: (appId: number) => void;
};

function SteamImportSection({
  existingSteamAppIds,
  ignoredSteamAppIds,
  importableGamesCount,
  ownedGames,
  recentlyPlayedByAppId,
  selectedAppIds,
  onDeselectAll,
  onImportSelected,
  onSelectAll,
  onToggleSelected,
}: SteamImportSectionProps) {
  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-ink-950 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Steam import</h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={onSelectAll} type="button">
            Select all
          </button>
          <button className="h-10 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10" onClick={onDeselectAll} type="button">
            Deselect all
          </button>
          <button
            className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            disabled={selectedAppIds.size === 0}
            onClick={onImportSelected}
            type="button"
          >
            Import selected
          </button>
        </div>
      </div>

      {ownedGames.length > 0 ? (
        <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
          {ownedGames.map((game) => {
            const isDuplicate = existingSteamAppIds.has(game.appid);
            const isIgnored = ignoredSteamAppIds.has(game.appid);
            const recentGame = recentlyPlayedByAppId.get(game.appid);
            const isSelected = selectedAppIds.has(game.appid);

            return (
              <SteamImportRow
                key={game.appid}
                game={game}
                isDuplicate={isDuplicate}
                isIgnored={isIgnored}
                isSelected={isSelected}
                recentGame={recentGame}
                onToggleSelected={onToggleSelected}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-white/15 bg-black/20 p-6 text-center">
          <p className="max-w-md text-sm leading-6 text-slate-400">
            Test the Steam connection to load owned games for import.
          </p>
        </div>
      )}
    </section>
  );
}

type SteamImportRowProps = {
  game: SteamOwnedGame;
  isDuplicate: boolean;
  isIgnored: boolean;
  isSelected: boolean;
  recentGame?: SteamRecentlyPlayedGame;
  onToggleSelected: (appId: number) => void;
};

function SteamImportRow({ game, isDuplicate, isIgnored, isSelected, recentGame, onToggleSelected }: SteamImportRowProps) {
  const artworkUrls = getSteamArtworkUrls(game.appid);
  const isDisabled = isDuplicate || isIgnored;

  return (
    <label
      className={`grid gap-3 rounded-md border p-3 transition sm:grid-cols-[auto_120px_minmax(0,1fr)_auto] sm:items-center ${
        isDisabled ? 'border-white/10 bg-ink-900/50 opacity-70' : 'border-white/10 bg-ink-900 hover:border-mint/50'
      }`}
    >
      <input
        checked={isSelected}
        className="mt-1 h-5 w-5 accent-mint sm:mt-0"
        disabled={isDisabled}
        onChange={() => onToggleSelected(game.appid)}
        type="checkbox"
      />

      <img
        alt=""
        className="h-16 w-full rounded-md bg-ink-800 object-cover sm:w-[120px]"
        decoding="async"
        loading="lazy"
        src={artworkUrls.header}
      />

      <div className="min-w-0">
        <div className="truncate font-medium text-white">{game.name ?? `Steam app ${game.appid}`}</div>
        <div className="mt-1 text-sm text-slate-400">Steam</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-white/10 px-2.5 py-1">Total {formatSteamPlaytime(game.playtime_forever)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            Recent {formatSteamPlaytime(recentGame?.playtime_2weeks)}
          </span>
        </div>
      </div>

      <div className="text-sm font-medium text-slate-300">
        {isDuplicate ? (
          <span className="text-skyglass">Already in library</span>
        ) : isIgnored ? (
          <span className="text-red-200">Ignored</span>
        ) : (
          <span>Ready</span>
        )}
      </div>
    </label>
  );
}

type IgnoredSteamGamesSectionProps = {
  ignoredSteamGames: IgnoredSteamGame[];
  onUnignoreSteamGame: (steamAppId: number) => void;
};

function IgnoredSteamGamesSection({ ignoredSteamGames, onUnignoreSteamGame }: IgnoredSteamGamesSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-ink-950 p-4">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
        aria-expanded={isOpen}
      >
        <h3 className="text-lg font-semibold text-white">Ignored Steam games ({ignoredSteamGames.length})</h3>
        <span className="text-sm font-semibold text-mint">{isOpen ? 'Collapse' : 'Expand'}</span>
      </button>

      {isOpen && ignoredSteamGames.length > 0 ? (
        <div className="grid gap-2">
          {ignoredSteamGames.map((game) => (
            <div
              key={game.steamAppId}
              className="grid gap-3 rounded-md border border-white/10 bg-ink-900 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {game.title || `Steam app ${game.steamAppId}`}
                </div>
                <div className="mt-1 text-xs text-slate-400">Steam</div>
              </div>
              <button
                className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                onClick={() => onUnignoreSteamGame(game.steamAppId)}
                type="button"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      ) : isOpen ? (
        <div className="mt-4 rounded-md border border-dashed border-white/15 bg-black/20 p-4 text-sm text-slate-400">
          No ignored Steam games yet.
        </div>
      ) : null}
    </section>
  );
}

function SteamHelpModal({ topic, onClose }: { topic: 'steam-api-key' | 'steam-id64'; onClose: () => void }) {
  const isApiKey = topic === 'steam-api-key';
  const url = isApiKey ? 'https://steamcommunity.com/dev/apikey' : 'https://steamid.io';

  return (
    <ViewportModal ariaLabel={isApiKey ? 'Steam API key help' : 'SteamID64 help'} placement="center" onClose={onClose}>
      <div className="max-w-md p-4 text-sm text-slate-300">
        <h3 className="text-lg font-semibold text-white">{isApiKey ? 'Steam Web API key' : 'SteamID64 lookup'}</h3>
        <p className="mt-2 leading-6">
          {isApiKey
            ? 'QuestShelf uses your Steam Web API key to read your owned games from Steam. Generate a key from Steam Community and paste it here.'
            : 'SteamID64 is the long numeric ID for your Steam account. Use a lookup site if your profile URL uses a custom name.'}
        </p>
        <a className="mt-4 inline-flex h-10 items-center rounded-md bg-mint px-4 font-semibold text-ink-950" href={url} target="_blank" rel="noreferrer">
          {isApiKey ? 'Open Steam API key page' : 'Open SteamID64 lookup'}
        </a>
      </div>
    </ViewportModal>
  );
}

function formatSteamPlaytime(minutes?: number) {
  if (minutes === undefined) {
    return 'not available';
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

type DebugStatProps = {
  label: string;
  value: string;
};

function DebugStat({ label, value }: DebugStatProps) {
  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

function createEmptyDebugResult(steamId64: string): SteamDebugResult {
  return {
    ownedGames: [],
    recentlyPlayedGames: [],
    mappedGames: [],
    apiDebugEntries: [
      {
        endpoint: 'n/a',
        httpStatus: null,
        parsedGameCount: null,
        requestUrl: 'n/a',
        responseSummary: 'No Steam API request has been run in this session.',
        steamId64,
      },
    ],
  };
}
