import { useEffect, useMemo, useState } from 'react';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import { getOwnedGames, getRecentlyPlayedGames, mapSteamGamesToLocalGames, SteamApiError } from '../services/steamApi';
import type { SteamConnectionState, SteamSettings } from '../types/steam';

const initialConnectionState: SteamConnectionState = {
  status: 'idle',
  message: 'Steam credentials are stored locally in this browser.',
  data: null,
};

export function SteamSettingsPanel() {
  const [settings, setSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [connectionState, setConnectionState] = useState<SteamConnectionState>(initialConnectionState);

  useEffect(() => {
    saveSteamSettings(settings);
  }, [settings]);

  const debugOutput = useMemo(() => {
    if (!connectionState.data) {
      return '{\n  "ownedGames": [],\n  "recentlyPlayedGames": [],\n  "mappedGames": []\n}';
    }

    return JSON.stringify(connectionState.data, null, 2);
  }, [connectionState.data]);

  function updateSetting(field: keyof SteamSettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
  }

  async function testConnection() {
    setConnectionState({
      status: 'loading',
      message: 'Testing Steam connection...',
      data: connectionState.data,
    });

    try {
      const ownedGames = await getOwnedGames(settings);
      const recentlyPlayedGames = await getRecentlyPlayedGames(settings);
      const mappedGames = mapSteamGamesToLocalGames(ownedGames, recentlyPlayedGames);

      setConnectionState({
        status: 'success',
        message: `Loaded ${ownedGames.length} owned games and ${recentlyPlayedGames.length} recently played games. Nothing was added to the local library.`,
        data: {
          ownedGames,
          recentlyPlayedGames,
          mappedGames,
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
        data: connectionState.data,
      });
    }
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
          <p className="mt-1 text-sm text-slate-400">Foundation only. Tests can import data, but they do not sync.</p>
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

          <pre className="max-h-[520px] overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
            {debugOutput}
          </pre>
        </section>
      </div>
    </section>
  );
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
