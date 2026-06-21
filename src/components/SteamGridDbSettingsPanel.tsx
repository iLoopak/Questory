import { useMemo, useState } from 'react';
import { fetchSteamGridDbArtworkForGame } from '../lib/steamGridDbArtwork';
import { loadSteamGridDbSettings, saveSteamGridDbSettings } from '../lib/steamGridDbSettingsStorage';
import type { Game } from '../types/game';
import type { SteamGridDbConnectionStatus, SteamGridDbSettings } from '../types/steamGridDb';
import { SettingsSection } from './settings/SettingsSection';

const testGame = {
  id: 'steamgriddb-test-portal',
  title: 'Portal',
  platform: 'PC',
  status: 'Want to play',
  coverImage: '',
  playtimeHours: 0,
  tags: [],
  lastPlayedAt: null,
  notes: '',
  collectionType: 'library',
  steamAppId: 400,
} satisfies Game;

export function SteamGridDbSettingsPanel() {
  const [savedSettings, setSavedSettings] = useState<SteamGridDbSettings>(() => loadSteamGridDbSettings());
  const [draftApiKey, setDraftApiKey] = useState(() => savedSettings.apiKey);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<SteamGridDbConnectionStatus>(() => (savedSettings.apiKey.trim() ? 'configured' : 'missing'));
  const [message, setMessage] = useState('SteamGridDB is optional. Add an API key to use local artwork enrichment without a server environment key.');
  const hasSavedApiKey = savedSettings.apiKey.trim().length > 0;

  const statusLabel = useMemo(() => {
    if (connectionStatus === 'success') return 'Connection OK';
    if (connectionStatus === 'error') return 'Failed';
    if (hasSavedApiKey) return 'Configured';
    return 'Missing';
  }, [connectionStatus, hasSavedApiKey]);

  const statusClassName = connectionStatus === 'success' || (connectionStatus === 'configured' && hasSavedApiKey)
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : connectionStatus === 'error'
      ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
      : 'border-amber-300/30 bg-amber-300/10 text-amber-100';

  function saveSettings() {
    const nextSettings = { apiKey: draftApiKey.trim() };
    saveSteamGridDbSettings(nextSettings);
    setSavedSettings(nextSettings);
    setConnectionStatus(nextSettings.apiKey ? 'configured' : 'missing');
    setMessage(nextSettings.apiKey ? 'SteamGridDB API key saved locally on this device.' : 'SteamGridDB API key is missing. Artwork enrichment will rely on a server/dev environment key if available.');
  }

  function clearSettings() {
    const nextSettings = { apiKey: '' };
    saveSteamGridDbSettings(nextSettings);
    setSavedSettings(nextSettings);
    setDraftApiKey('');
    setConnectionStatus('missing');
    setMessage('SteamGridDB API key cleared. Artwork enrichment is disabled unless a server/dev environment key is configured.');
  }

  async function testConnection() {
    const testApiKey = draftApiKey.trim();
    const isTestingDraftKey = testApiKey.length > 0;

    setConnectionStatus('configured');
    setMessage(isTestingDraftKey
      ? 'Testing SteamGridDB connection with the current API key field. Save is still required to store it.'
      : 'Testing SteamGridDB connection using saved settings or the server/dev environment key.');

    const artwork = await fetchSteamGridDbArtworkForGame(testGame, {
      apiKey: isTestingDraftKey ? testApiKey : undefined,
      skipCache: true,
    });
    if (artwork) {
      setConnectionStatus('success');
      setMessage(isTestingDraftKey
        ? 'SteamGridDB returned artwork successfully for the current API key field. Click Save to store this key locally.'
        : 'SteamGridDB returned artwork successfully using saved settings or the server/dev environment key.');
      return;
    }

    setConnectionStatus('error');
    setMessage(isTestingDraftKey
      ? 'SteamGridDB connection failed for the current API key field. Check the key and try again before saving.'
      : 'SteamGridDB connection failed or no API key is available. Add a key, save one, or configure a server/dev environment key.');
  }

  return (
    <SettingsSection
      title="SteamGridDB"
      description="Artwork provider for portrait covers, wide covers, heroes, logos, and icons."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusClassName}`}>
          {statusLabel}
        </span>
        <span className="text-xs text-slate-500">Stored locally using the same persistence path as other API-key integrations.</span>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API key</span>
        <div className="mt-2 flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={draftApiKey}
            onChange={(event) => setDraftApiKey(event.target.value)}
            placeholder="Paste SteamGridDB API key"
            spellCheck={false}
            type={isApiKeyVisible ? 'text' : 'password'}
          />
          <button
            className="h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={() => setIsApiKeyVisible((currentValue) => !currentValue)}
            type="button"
          >
            {isApiKeyVisible ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950" onClick={saveSettings} type="button">Save</button>
        <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-rose-500/10 hover:text-white" onClick={clearSettings} type="button">Clear</button>
        <button className="h-10 rounded-md border border-mint/30 px-4 text-sm font-semibold text-mint transition hover:bg-mint/10" onClick={testConnection} type="button">Test connection</button>
      </div>

      <p className="mt-3 text-sm text-slate-400">{message}</p>
    </SettingsSection>
  );
}
