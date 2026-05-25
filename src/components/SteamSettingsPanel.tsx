import { useEffect, useMemo, useState } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
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
  SteamSettings,
} from '../types/steam';

const initialConnectionState: SteamConnectionState = {
  status: 'idle',
  message: 'Steam credentials are stored locally in this browser.',
  data: null,
};

type ImportSummary = {
  importedCount: number;
  skippedDuplicateCount: number;
};

type SteamSettingsPanelProps = {
  games: Game[];
  onImportGames: (games: Game[]) => void;
};

export function SteamSettingsPanel({ games, onImportGames }: SteamSettingsPanelProps) {
  const [settings, setSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [connectionState, setConnectionState] = useState<SteamConnectionState>(initialConnectionState);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(() => new Set());
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    saveSteamSettings(settings);
  }, [settings]);

  const existingSteamAppIds = useMemo(() => {
    return new Set(
      games
        .map((game) => game.steamAppId)
        .filter((steamAppId): steamAppId is number => typeof steamAppId === 'number'),
    );
  }, [games]);

  const recentlyPlayedByAppId = useMemo(() => {
    const recentlyPlayedGames = connectionState.data?.recentlyPlayedGames ?? [];
    return new Map(recentlyPlayedGames.map((game) => [game.appid, game]));
  }, [connectionState.data]);

  const importableGames = useMemo(() => {
    return (connectionState.data?.ownedGames ?? []).filter((game) => !existingSteamAppIds.has(game.appid));
  }, [connectionState.data, existingSteamAppIds]);

  const debugOutput = useMemo(() => {
    if (!connectionState.data) {
      return JSON.stringify(createEmptyDebugResult(settings.steamId64), null, 2);
    }

    return JSON.stringify(connectionState.data, null, 2);
  }, [connectionState.data, settings.steamId64]);

  const apiDebugEntries = connectionState.data?.apiDebugEntries ?? [];
  const latestApiDebugEntry = apiDebugEntries[apiDebugEntries.length - 1];

  function updateSetting(field: keyof SteamSettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
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
    if (existingSteamAppIds.has(appId)) {
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
    const duplicateCount = selectedOwnedGames.filter((game) => existingSteamAppIds.has(game.appid)).length;
    const newOwnedGames = selectedOwnedGames.filter((game) => !existingSteamAppIds.has(game.appid));
    const importedAt = new Date().toISOString();
    const mappedGames = mapSteamGamesToLocalGames(
      newOwnedGames,
      connectionState.data.recentlyPlayedGames,
      importedAt,
    );

    onImportGames(mappedGames);
    setSelectedAppIds(new Set());
    setImportSummary({
      importedCount: mappedGames.length,
      skippedDuplicateCount: duplicateCount,
    });
  }

  const statusStyles = {
    idle: 'border-white/10 bg-ink-950 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[connectionState.status];

  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-ink-900/70 p-4 lg:h-[calc(100vh-116px)] lg:overflow-y-auto">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Steam integration</h2>
          <p className="mt-1 text-sm text-slate-400">Foundation only. Import is local and never overwrites games.</p>
        </div>
        <div className="rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">
          Local credentials
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Steam Web API key
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
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">SteamID64</span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.steamId64}
                onChange={(event) => updateSetting('steamId64', event.target.value)}
                placeholder="7656119..."
                inputMode="numeric"
                spellCheck={false}
              />
            </label>

            <button
              className="h-11 w-full rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              disabled={connectionState.status === 'loading'}
              onClick={testConnection}
              type="button"
            >
              {connectionState.status === 'loading' ? 'Testing...' : 'Test Steam connection'}
            </button>

            <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
              {connectionState.message}
            </div>

            {importSummary ? (
              <div className="rounded-md border border-mint/40 bg-mint/10 px-3 py-3 text-sm leading-6 text-mint">
                Imported {importSummary.importedCount} games. Skipped {importSummary.skippedDuplicateCount} duplicates.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold text-white">Debug results</h3>
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Raw import preview
            </span>
          </div>

          {connectionState.data ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              <DebugStat label="Owned" value={connectionState.data.ownedGames.length.toString()} />
              <DebugStat label="Recent" value={connectionState.data.recentlyPlayedGames.length.toString()} />
              <DebugStat label="Mapped" value={connectionState.data.mappedGames.length.toString()} />
            </div>
          ) : null}

          <SteamApiDebugSummary
            entries={apiDebugEntries}
            latestEntry={latestApiDebugEntry}
            steamId64={settings.steamId64}
          />

          <pre className="max-h-[360px] overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
            {debugOutput}
          </pre>
        </section>
      </div>

      <SteamImportSection
        existingSteamAppIds={existingSteamAppIds}
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
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">API key redacted</span>
      </div>
      <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <DebugField label="Current SteamID64" value={steamId64 || 'Not set'} />
        <DebugField label="Last HTTP status" value={latestEntry?.httpStatus?.toString() ?? 'n/a'} />
        <DebugField
          label="Parsed game count"
          value={parsedGameCount === null || parsedGameCount === undefined ? 'n/a' : parsedGameCount.toString()}
        />
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
          <p className="mt-1 text-sm text-slate-400">
            Select games to add to the local library. Existing Steam App IDs are skipped.
          </p>
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

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <DebugStat label="Importable" value={importableGamesCount.toString()} />
        <DebugStat label="Selected" value={selectedAppIds.size.toString()} />
        <DebugStat label="Duplicates" value={(ownedGames.length - importableGamesCount).toString()} />
      </div>

      {ownedGames.length > 0 ? (
        <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
          {ownedGames.map((game) => {
            const isDuplicate = existingSteamAppIds.has(game.appid);
            const recentGame = recentlyPlayedByAppId.get(game.appid);
            const isSelected = selectedAppIds.has(game.appid);

            return (
              <SteamImportRow
                key={game.appid}
                game={game}
                isDuplicate={isDuplicate}
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
  isSelected: boolean;
  recentGame?: SteamRecentlyPlayedGame;
  onToggleSelected: (appId: number) => void;
};

function SteamImportRow({ game, isDuplicate, isSelected, recentGame, onToggleSelected }: SteamImportRowProps) {
  const artworkUrls = getSteamArtworkUrls(game.appid);

  return (
    <label
      className={`grid gap-3 rounded-md border p-3 transition sm:grid-cols-[auto_120px_minmax(0,1fr)_auto] sm:items-center ${
        isDuplicate ? 'border-white/10 bg-ink-900/50 opacity-70' : 'border-white/10 bg-ink-900 hover:border-mint/50'
      }`}
    >
      <input
        checked={isSelected}
        className="mt-1 h-5 w-5 accent-mint sm:mt-0"
        disabled={isDuplicate}
        onChange={() => onToggleSelected(game.appid)}
        type="checkbox"
      />

      <img
        alt=""
        className="h-16 w-full rounded-md bg-ink-800 object-cover sm:w-[120px]"
        loading="lazy"
        src={artworkUrls.header}
      />

      <div className="min-w-0">
        <div className="truncate font-medium text-white">{game.name ?? `Steam app ${game.appid}`}</div>
        <div className="mt-1 text-sm text-slate-400">Steam App ID: {game.appid}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-white/10 px-2.5 py-1">Total {formatSteamPlaytime(game.playtime_forever)}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">
            Recent {formatSteamPlaytime(recentGame?.playtime_2weeks)}
          </span>
        </div>
      </div>

      <div className="text-sm font-medium text-slate-300">
        {isDuplicate ? <span className="text-skyglass">Already in library</span> : <span>Ready</span>}
      </div>
    </label>
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
