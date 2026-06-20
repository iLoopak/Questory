import { useEffect, useState } from 'react';
import { SettingsSection } from './settings/SettingsSection';
import { useI18n } from '../i18n';
import { loadPsnSettings, savePsnSettings, hasPsnAccessToken } from '../lib/psnSettingsStorage';
import { syncPsnTrophiesForGames, isPsnSyncableGame } from '../lib/psnTrophySync';
import { connectWithCookies, PsnApiError } from '../services/psnApi';
import type { PsnSettings, PsnConnectionState, PsnTrophySyncState } from '../types/psn';
import type { Game } from '../types/game';
import { ViewportModal } from './ViewportModal';

const initialConnectionState: PsnConnectionState = {
  status: 'idle',
  message: '',
};

const initialSyncState: PsnTrophySyncState = {
  status: 'idle',
  message: '',
  progress: { completed: 0, total: 0 },
};

type PsnSettingsPanelProps = {
  games: Game[];
  onGamesUpdate: (games: Game[]) => void;
};

export function PsnSettingsPanel({ games, onGamesUpdate }: PsnSettingsPanelProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<PsnSettings>(() => loadPsnSettings());
  const [connectionState, setConnectionState] = useState<PsnConnectionState>(initialConnectionState);
  const [syncState, setSyncState] = useState<PsnTrophySyncState>(initialSyncState);
  const [isNpssoHelpOpen, setIsNpssoHelpOpen] = useState(false);

  useEffect(() => {
    savePsnSettings(settings);
  }, [settings]);

  const isConnected = hasPsnAccessToken(settings);
  const psnGamesCount = games.filter(isPsnSyncableGame).length;

  async function handleConnect() {
    if (!settings.cookieString.trim()) return;

    setConnectionState({ status: 'loading', message: t('psn.connecting') });

    try {
      const result = await connectWithCookies(settings.cookieString);
      const expiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();

      setSettings((current) => ({
        ...current,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenExpiresAt: expiresAt,
        onlineId: result.onlineId,
      }));

      setConnectionState({
        status: 'success',
        message: result.onlineId
          ? `Connected as ${result.onlineId}. Token valid for ~${Math.round(result.expiresIn / 86400)} days.`
          : `Connected. Token valid for ~${Math.round(result.expiresIn / 86400)} days.`,
      });
    } catch (error) {
      const message =
        error instanceof PsnApiError
          ? error.message
          : 'PSN connection failed. Check your NPSSO token and try again.';
      setConnectionState({ status: 'error', message });
    }
  }

  async function handleSyncTrophies() {
    if (!isConnected) return;

    setSyncState({
      status: 'loading',
      message: t('psn.syncingTrophies'),
      progress: { completed: 0, total: psnGamesCount },
    });

    try {
      const syncedAt = new Date().toISOString();
      const { games: updatedGames, summary } = await syncPsnTrophiesForGames(
        games,
        settings.accessToken,
        syncedAt,
        (progress) => {
          setSyncState((current) => ({ ...current, progress }));
        },
      );

      onGamesUpdate(updatedGames);
      setSyncState({
        status: 'success',
        message: `${t('psn.trophiesSynced')} — ${summary.updatedCount} updated, ${summary.matchedCount} matched, ${summary.skippedCount} unmatched.`,
        progress: { completed: psnGamesCount, total: psnGamesCount },
        summary,
      });
    } catch (error) {
      const message =
        error instanceof PsnApiError
          ? error.message
          : 'Trophy sync failed. Check your connection and try again.';

      if (error instanceof PsnApiError && error.code === 'token-expired') {
        setSettings((current) => ({ ...current, accessToken: '', tokenExpiresAt: '' }));
      }

      setSyncState({
        status: 'error',
        message,
        progress: { completed: 0, total: psnGamesCount },
      });
    }
  }

  const connectionStatusStyles = {
    idle: 'border-white/10 bg-ink-950 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[connectionState.status];

  const syncStatusStyles = {
    idle: 'border-white/10 bg-ink-950 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[syncState.status];

  const progressPercent =
    syncState.progress.total > 0
      ? Math.round((syncState.progress.completed / syncState.progress.total) * 100)
      : 0;

  return (
    <SettingsSection
      title={t('psn.integration')}
      description="Sync PlayStation trophies for PS4 and PS5 games in your library."
      className="min-w-0 border-white/10 bg-ink-900/70"
    >
      <section className="rounded-lg border border-skyglass/20 bg-ink-950 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">1</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{t('psn.connection')}</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
            {t('psn.credentials')}
          </span>
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t('psn.cookieString')}{' '}
            <button
              className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint"
              onClick={() => setIsNpssoHelpOpen(true)}
              type="button"
              aria-label={t('psn.cookieHelp')}
            >
              ?
            </button>
          </span>
          <textarea
            className="mt-2 h-24 w-full rounded-md border border-white/10 bg-ink-900 px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.cookieString}
            onChange={(e) => setSettings((s) => ({ ...s, cookieString: e.target.value }))}
            placeholder="npsso=abc123...; _abck=xyz...; bm_sz=..."
            spellCheck={false}
          />
        </label>

        <p className="mt-2 text-xs leading-5 text-slate-500">{t('psn.devServerNote')}</p>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button
            className="h-12 w-full rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
            disabled={connectionState.status === 'loading' || !settings.cookieString.trim()}
            onClick={() => void handleConnect()}
            type="button"
          >
            {connectionState.status === 'loading' ? t('psn.connecting') : t('psn.connect')}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">2</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{t('psn.connectionResult')}</h3>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isConnected ? 'border-mint/40 bg-mint/10 text-mint' : 'border-white/10 bg-white/5 text-slate-300'}`}>
            {isConnected
              ? settings.onlineId
                ? `${t('psn.connected')} · ${settings.onlineId}`
                : t('psn.connected')
              : t('psn.notConnected')}
          </span>
        </div>

        {connectionState.status !== 'idle' ? (
          <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${connectionStatusStyles}`}>
            {connectionState.message}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">3</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{t('psn.syncTrophies')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Matches your {psnGamesCount} PS4/PS5 library game{psnGamesCount === 1 ? '' : 's'} to PSN trophy titles by name and updates trophy counts.
          </p>
        </div>

        <button
          className="h-12 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          disabled={!isConnected || syncState.status === 'loading' || psnGamesCount === 0}
          onClick={() => void handleSyncTrophies()}
          type="button"
        >
          {syncState.status === 'loading' ? t('psn.syncingTrophies') : t('psn.syncTrophies')}
        </button>

        {syncState.status !== 'idle' ? (
          <div className={`mt-4 rounded-md border px-3 py-3 text-sm leading-6 ${syncStatusStyles}`}>
            <div>{syncState.message}</div>
            {syncState.status === 'loading' ? (
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-[0.12em]">
                  <span>Progress</span>
                  <span>{syncState.progress.completed}/{syncState.progress.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            ) : null}
            {syncState.summary ? (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <SyncStat label={t('psn.matchedGames')} value={syncState.summary.matchedCount.toString()} />
                <SyncStat label={t('psn.updatedGames')} value={syncState.summary.updatedCount.toString()} />
                <SyncStat label={t('psn.skippedGames')} value={syncState.summary.skippedCount.toString()} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {isNpssoHelpOpen ? <NpssoHelpModal onClose={() => setIsNpssoHelpOpen(false)} /> : null}
    </SettingsSection>
  );
}

function SyncStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

function NpssoHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ViewportModal ariaLabel="PSN cookie help" placement="center" onClose={onClose}>
      <div className="max-w-md p-4 text-sm text-slate-300">
        <h3 className="text-lg font-semibold text-white">How to get your PSN cookie string</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Sony requires browser session cookies to authenticate. You need to copy the full cookie string from an active PlayStation session in your browser.
        </p>

        <ol className="mt-4 space-y-3 leading-6">
          <li>
            <span className="font-semibold text-white">1.</span> Sign in to{' '}
            <strong className="text-white">my.playstation.com</strong> in your browser.
          </li>
          <li>
            <span className="font-semibold text-white">2.</span> Open{' '}
            <strong className="text-white">DevTools</strong> (F12 / ⌘⌥I) → go to the{' '}
            <strong className="text-white">Network</strong> tab.
          </li>
          <li>
            <span className="font-semibold text-white">3.</span> Refresh the page (⌘R / F5).
          </li>
          <li>
            <span className="font-semibold text-white">4.</span> Click any request to{' '}
            <code className="rounded bg-white/10 px-1">my.playstation.com</code> in the list.
          </li>
          <li>
            <span className="font-semibold text-white">5.</span> In the right panel, open{' '}
            <strong className="text-white">Request Headers</strong> and find the{' '}
            <code className="rounded bg-white/10 px-1">cookie</code> header.
          </li>
          <li>
            <span className="font-semibold text-white">6.</span> Right-click the cookie value →{' '}
            <strong className="text-white">Copy value</strong> (or select all and copy). It will be a long string starting with{' '}
            <code className="rounded bg-white/10 px-1">npsso=...</code>
          </li>
          <li>
            <span className="font-semibold text-white">7.</span> Paste the entire string into QuestShelf.
          </li>
        </ol>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          The session cookies expire with your browser session. If authentication stops working, repeat this process.
        </p>
      </div>
    </ViewportModal>
  );
}
