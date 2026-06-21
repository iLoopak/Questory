import { useEffect, useMemo, useState } from 'react';
import { normalizeSteamGridDbApiKey, testSteamGridDbConnection } from '../lib/steamGridDbArtwork';
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
  const [apiKey, setApiKey] = useState<string>(() => loadSteamGridDbSettings().apiKey);
  const [connectionStatus, setConnectionStatus] = useState<SteamGridDbConnectionStatus>(() => (apiKey.trim() ? 'configured' : 'missing'));
  const [message, setMessage] = useState('');
  const hasApiKey = apiKey.trim().length > 0;

  useEffect(() => {
    const normalized = normalizeSteamGridDbApiKey(apiKey);
    saveSteamGridDbSettings({ apiKey: normalized });
    setConnectionStatus(normalized ? 'configured' : 'missing');
  }, [apiKey]);

  const statusLabel = useMemo(() => {
    if (connectionStatus === 'success') return 'Connection OK';
    if (connectionStatus === 'error') return 'Failed';
    if (hasApiKey) return 'Configured';
    return 'Missing';
  }, [connectionStatus, hasApiKey]);

  const testStatusLabel: Record<string, string> = {
    success: 'success',
    'missing-key': 'missing key',
    'invalid-key': 'invalid key',
    'rate-limited': 'rate limited',
    'no-game-match': 'no game match',
    'no-artwork': 'no artwork',
    'endpoint-unavailable': 'endpoint unavailable',
    'provider-error': 'provider error',
    'network-error': 'network error',
  };

  const statusClassName = connectionStatus === 'success' || (connectionStatus === 'configured' && hasApiKey)
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : connectionStatus === 'error'
      ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
      : 'border-amber-300/30 bg-amber-300/10 text-amber-100';

  function clearSettings() {
    setApiKey('');
    setConnectionStatus('missing');
    setMessage('SteamGridDB API key cleared.');
  }

  async function testConnection() {
    const testApiKey = normalizeSteamGridDbApiKey(apiKey);

    setConnectionStatus('configured');
    setMessage('Testing SteamGridDB connection…');

    const result = await testSteamGridDbConnection(testGame, {
      apiKey: testApiKey.length > 0 ? testApiKey : undefined,
      skipCache: true,
    });
    if (result.status === 'success') {
      setConnectionStatus('success');
      setMessage('SteamGridDB returned artwork successfully.');
      return;
    }

    setConnectionStatus('error');
    setMessage(`SteamGridDB test failed (${testStatusLabel[result.status] ?? result.status}): ${result.message}`);
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
        <span className="text-xs text-slate-500">Key saved automatically as you type.</span>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">API key</span>
        <div className="mt-2 flex gap-2">
          <input
            className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); setMessage(''); }}
            placeholder="Paste SteamGridDB API key"
            spellCheck={false}
            type="password"
          />
        </div>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-rose-500/10 hover:text-white" onClick={clearSettings} type="button">Clear</button>
        <button className="h-10 rounded-md border border-mint/30 px-4 text-sm font-semibold text-mint transition hover:bg-mint/10" onClick={testConnection} type="button">Test connection</button>
      </div>

      {message ? <p className="text-sm text-slate-400">{message}</p> : null}
    </SettingsSection>
  );
}
