import { useEffect, useState } from 'react';
import { SettingsSection } from './settings/SettingsSection';
import { useI18n } from '../i18n';
import { loadPsnSettings, savePsnSettings, hasPsnAccessToken } from '../lib/psnSettingsStorage';
import { syncPsnTrophiesForGames, isPsnSyncableGame } from '../lib/psnTrophySync';
import { connectWithNpsso, PsnApiError } from '../services/psnApi';
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
    if (!settings.npssoToken.trim()) return;

    setConnectionState({ status: 'loading', message: t('psn.connecting') });

    try {
      const result = await connectWithNpsso(settings.npssoToken);
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
            {t('psn.npssoToken')}{' '}
            <button
              className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint"
              onClick={() => setIsNpssoHelpOpen(true)}
              type="button"
              aria-label={t('psn.npssoHelp')}
            >
              ?
            </button>
          </span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.npssoToken}
            onChange={(e) => setSettings((s) => ({ ...s, npssoToken: e.target.value }))}
            placeholder="Paste NPSSO token from my.playstation.com cookies"
            spellCheck={false}
            type="password"
          />
        </label>

        <p className="mt-2 text-xs leading-5 text-slate-500">{t('psn.devServerNote')}</p>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button
            className="h-12 w-full rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
            disabled={connectionState.status === 'loading' || !settings.npssoToken.trim()}
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
    <ViewportModal ariaLabel="NPSSO token help" placement="center" onClose={onClose}>
      <div className="max-w-md p-4 text-sm text-slate-300">
        <h3 className="text-lg font-semibold text-white">How to get your NPSSO token</h3>

        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-mint">Easiest method</p>
        <ol className="mt-2 space-y-2 leading-6">
          <li>1. Sign in to <strong className="text-white">my.playstation.com</strong> in your browser.</li>
          <li>2. In the same browser, open this URL:
            <br />
            <code className="mt-1 block break-all rounded bg-white/10 px-2 py-1 text-xs text-slate-200">
              https://ca.account.sony.com/api/v1/ssocookie
            </code>
          </li>
          <li>3. The page shows JSON like <code className="rounded bg-white/10 px-1">{`{"npsso":"xxxx..."}`}</code> — copy the value between the quotes.</li>
        </ol>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Alternative — DevTools</p>
        <ol className="mt-2 space-y-2 leading-6 text-slate-400">
          <li>1. On <strong className="text-slate-300">my.playstation.com</strong>, open <strong className="text-slate-300">DevTools</strong> (F12 / ⌘⌥I).</li>
          <li>2. Go to <strong className="text-slate-300">Application</strong> → <strong className="text-slate-300">Cookies</strong> and check all Sony/PlayStation domains listed.</li>
          <li>3. Find the cookie named <strong className="text-slate-300">npsso</strong> and copy its value.</li>
        </ol>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          The token is valid for approximately 2 months. After it expires, repeat this process to reconnect.
        </p>
      </div>
    </ViewportModal>
  );
}
