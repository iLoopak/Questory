import { useEffect, useMemo, useState, type RefObject } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import { getIntegrationTransport } from '../lib/integrationProxy';
import { ViewportModal } from './ViewportModal';
import { SettingsSection } from './settings/SettingsSection';
import { useI18n } from '../i18n';
import type { IgnoredSteamGame } from '../lib/steamIgnoredGamesStorage';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import {
  clearSteamApiDebugLog,
  getOwnedGames,
  getRecentlyPlayedGames,
  getSteamApiDebugLog,
  getSteamPlayerSummary,
  mapSteamGamesToLocalGames,
  SteamApiError,
} from '../services/steamApi';
import type { Game } from '../types/game';
import type { SteamOwnedImportSummary } from '../lib/importTransitions';
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

type ImportSummary = Omit<SteamOwnedImportSummary, 'transitionedGames'>;

type SteamSettingsPanelProps = {
  games: Game[];
  ignoredSteamGames: IgnoredSteamGame[];
  onConnectionTested?: () => void;
  onSteamApiKeyConfigured?: () => void;
  onSteamIdConfigured?: () => void;
  onImportGames: (games: Game[]) => SteamOwnedImportSummary;
  onSteamLibraryImported?: () => void;
  onSteamProfileNameChange?: (profileName: string) => void;
  playtimeRefreshState: SteamPlaytimeRefreshState;
  onRefreshSteamPlaytime: () => Promise<unknown>;
  onUnignoreSteamGame: (steamAppId: number) => void;
  onOpenManualWishlistImport?: () => void;
  manualWishlistImportButtonRef?: RefObject<HTMLButtonElement | null>;
};

export function SteamSettingsPanel({
  games,
  ignoredSteamGames,
  onConnectionTested,
  onImportGames,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
  onSteamLibraryImported,
  onSteamProfileNameChange,
  playtimeRefreshState,
  onRefreshSteamPlaytime,
  onUnignoreSteamGame,
  onOpenManualWishlistImport,
  manualWishlistImportButtonRef,
}: SteamSettingsPanelProps) {
  const { t } = useI18n();
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
  const ownedGamesCount = connectionState.data?.ownedGames.length ?? 0;
  const recentlyPlayedCount = connectionState.data?.recentlyPlayedGames.length ?? 0;
  const hasExistingSteamLibrary = existingSteamAppIds.size > 0;
  const canImportSteamLibrary = connectionState.status === 'success' && importableGames.length > 0;
  const hasWishlistLocator = Boolean(settings.wishlistUrl.trim() || settings.steamId64.trim());

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
      const [ownedGames, recentlyPlayedGames, profile] = await Promise.all([
        getOwnedGames(settings),
        getRecentlyPlayedGames(settings),
        getSteamPlayerSummary(settings).catch(() => null),
      ]);
      const mappedGames = mapSteamGamesToLocalGames(ownedGames, recentlyPlayedGames);
      const nextSettings: SteamSettings = {
        ...settings,
        ...(profile
          ? {
              profile: {
                ...profile,
                updatedAt: new Date().toISOString(),
              },
            }
          : {}),
      };

      if (profile) {
        setSettings(nextSettings);
        onSteamProfileNameChange?.(profile.personaName || profile.profileName || '');
      }

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
          profile,
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
          profile: connectionState.data?.profile ?? null,
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

  function importSelectedGames(appIds: Set<number> = selectedAppIds) {
    if (!connectionState.data) {
      return;
    }

    const selectedOwnedGames = connectionState.data.ownedGames.filter((game) => appIds.has(game.appid));
    const importCandidates = selectedOwnedGames.filter((game) => !ignoredSteamAppIds.has(game.appid));
    const importedAt = new Date().toISOString();
    const mappedGames = mapSteamGamesToLocalGames(
      importCandidates,
      connectionState.data.recentlyPlayedGames,
      importedAt,
    );

    const result = onImportGames(mappedGames);
    if (result.created + result.movedFromWishlist + result.updated > 0) {
      onSteamLibraryImported?.();
    }
    setSelectedAppIds(new Set());
    setImportSummary({
      created: result.created,
      movedFromWishlist: result.movedFromWishlist,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  function importSteamLibrary() {
    const importableAppIds = new Set(importableGames.map((game) => game.appid));
    setSelectedAppIds(importableAppIds);
    importSelectedGames(importableAppIds);
  }

  const statusStyles = {
    idle: 'border-white/10 bg-ink-950 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[connectionState.status];

  return (
    <SettingsSection
      title={t('steam.integration')}
      description="Connect Steam, test what Questory can read, then choose what to import or refresh."
      className="min-w-0 border-white/10 bg-ink-900/70"
    >
        <section className="rounded-lg border border-mint/25 bg-ink-950 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-spread text-mint">1</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{t('steam.connection')}</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
              Local credentials
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="qs-label-caps text-muted">
                Steam Web API key <button className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint" onClick={(event) => { event.preventDefault(); setHelpTopic('steam-api-key'); }} type="button" aria-label={t('steam.apiKeyHelp')}>?</button>
              </span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.apiKey}
                onChange={(event) => updateSetting('apiKey', event.target.value)}
                placeholder={t('integrations.pasteApiKey')}
                spellCheck={false}
                type="password"
              />
            </label>

            <label className="block">
              <span className="qs-label-caps text-muted">SteamID64 <button className="ml-2 inline-grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint" onClick={(event) => { event.preventDefault(); setHelpTopic('steam-id64'); }} type="button" aria-label={t('steam.idHelp')}>?</button></span>
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
              <span className="qs-label-caps text-muted">
                Steam profile / wishlist URL or vanity name
              </span>
              <input
                className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                value={settings.wishlistUrl}
                onChange={(event) => updateSetting('wishlistUrl', event.target.value)}
                placeholder="https://steamcommunity.com/id/loopak or loopak"
                spellCheck={false}
                type="text"
              />
            </label>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            The profile field is optional for playtime. Manual Steam Wishlist import can use it for a direct link, but the bookmarklet flow also works from the generic Wishlist page.
          </p>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <button
              className="h-12 w-full rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:w-auto"
              disabled={connectionState.status === 'loading'}
              onClick={testConnection}
              type="button"
            >
              {connectionState.status === 'loading' ? 'Testing...' : t('steam.testConnection')}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-spread text-mint">2</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{t('steam.connectionResult')}</h3>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles}`}>
              {connectionState.status === 'success' ? 'Connected' : connectionState.status === 'error' ? 'Not connected' : connectionState.status === 'loading' ? 'Testing' : 'Not tested'}
            </span>
          </div>

          <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${statusStyles}`}>
            {connectionState.message}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResultStat label={t('steam.parsedSteamId64')} value={settings.steamId64 || t('steam.notSet')} />
            <ResultStat label={t('steam.ownedGamesFound')} value={ownedGamesCount.toString()} />
            <ResultStat label={t('steam.recentlyPlayedFound')} value={recentlyPlayedCount.toString()} />
            <ResultStat label={t('steam.wishlistAvailability')} value={hasWishlistLocator ? t('steam.manualImportReady') : t('steam.addProfileOrGenericWishlist')} />
          </div>

          {importSummary ? (
            <div className="mt-4 rounded-md border border-mint/40 bg-mint/10 px-3 py-3 text-sm leading-6 text-mint">
              {importSummary.created} created, {importSummary.movedFromWishlist} moved from Wishlist, {importSummary.updated}{' '}
              updated, {importSummary.skipped} skipped, and {importSummary.failed} failed.
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-spread text-mint">3</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{t('steam.nextSteps')}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Use the connection result to bring Steam data into your local Questory library.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ActionCard
              title={hasExistingSteamLibrary ? t('steam.updateSteamLibrary') : t('steam.importSteamLibrary')}
              description={canImportSteamLibrary ? `${importableGames.length} new Steam games are ready to import.` : ownedGamesCount > 0 ? 'All tested Steam games are already in your library or ignored.' : 'Run Test connection to load owned games first.'}
              actionLabel={hasExistingSteamLibrary ? t('steam.updateSteamLibrary') : t('steam.importSteamLibrary')}
              disabled={!canImportSteamLibrary}
              onAction={importSteamLibrary}
            />

            <SteamPlaytimeRefreshCard
              librarySteamGameCount={existingSteamAppIds.size}
              refreshState={playtimeRefreshState}
              onRefresh={onRefreshSteamPlaytime}
            />

            <ActionCard
              title={t('steam.importSteamWishlistManual')}
              description="Automatic Steam Wishlist sync is unreliable, so Questory uses the manual bookmarklet helper."
              actionLabel={t('steam.importSteamWishlistManual')}
              disabled={!onOpenManualWishlistImport}
              buttonRef={manualWishlistImportButtonRef}
              onAction={onOpenManualWishlistImport ?? (() => undefined)}
            />
          </div>
        </section>

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

        <IgnoredSteamGamesSection ignoredSteamGames={ignoredSteamGames} onUnignoreSteamGame={onUnignoreSteamGame} />

        <details className="rounded-lg border border-white/10 bg-ink-950 p-4">
          <summary className="cursor-pointer font-semibold text-white">{t('steam.advancedConnectionDiagnostics')}</summary>
          <div className="mt-3">
            <div className="mb-3 rounded-md border border-white/10 bg-ink-900/80 p-3 text-sm text-slate-300">
              Active integration transport: <span className="font-semibold text-white">{getIntegrationTransport('steam')}</span>
            </div>
            <SteamApiDebugSummary
              entries={apiDebugEntries}
              latestEntry={latestApiDebugEntry}
              steamId64={settings.steamId64}
            />

            <h4 className="mb-2 text-sm font-semibold text-white">{t('steam.rawApiResponse')}</h4>
            <pre className="max-h-[320px] overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
              {debugOutput}
            </pre>
          </div>
        </details>

      {helpTopic ? <SteamHelpModal topic={helpTopic} onClose={() => setHelpTopic(null)} /> : null}
    </SettingsSection>
  );
}

type ResultStatProps = {
  label: string;
  value: string;
};

function ResultStat({ label, value }: ResultStatProps) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-ink-900/80 p-3">
      <div className="truncate text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
    </div>
  );
}

type ActionCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  disabled?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onAction: () => void;
};

function ActionCard({ title, description, actionLabel, disabled = false, buttonRef, onAction }: ActionCardProps) {
  return (
    <section className="rounded-md border border-white/10 bg-ink-900/80 p-3">
      <div className="flex h-full flex-col gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">{title}</h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        <button
          className="mt-auto h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
          disabled={disabled}
          onClick={onAction}
          ref={buttonRef}
          type="button"
        >
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

type SteamPlaytimeRefreshCardProps = {
  librarySteamGameCount: number;
  refreshState: SteamPlaytimeRefreshState;
  onRefresh: () => Promise<unknown>;
};

function SteamPlaytimeRefreshCard({ librarySteamGameCount, refreshState, onRefresh }: SteamPlaytimeRefreshCardProps) {
  const { t } = useI18n();
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
          <h3 className="text-sm font-semibold text-white">{t('steam.refreshPlaytime')}</h3>
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
              <div className="mb-1 flex justify-between qs-label-caps">
                <span>{t('app.progress')}</span>
                <span>{refreshState.progress.completed}/{refreshState.progress.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          ) : null}
          {refreshState.summary ? (
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <DebugStat label={t('app.updated')} value={refreshState.summary.updatedCount.toString()} />
              <DebugStat label={t('app.unchanged')} value={refreshState.summary.unchangedCount.toString()} />
              <DebugStat label={t('app.failed')} value={refreshState.summary.failedCount.toString()} />
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
  const { t } = useI18n();
  const parsedGameCount = latestEntry?.parsedGameCount;

  return (
    <div className="mb-4 rounded-md border border-white/10 bg-ink-900 p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-sm font-semibold text-white">{t('steam.debug')}</h4>
        <span className="text-xs font-medium uppercase tracking-caps text-slate-500">
          API key redacted
        </span>
      </div>
      <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <DebugField label={t('steam.currentSteamId64')} value={steamId64 || t('steam.notSet')} />
        <DebugField label={t('steam.lastHttpStatus')} value={latestEntry?.httpStatus?.toString() ?? 'n/a'} />
        <DebugField label={t('steam.parsedGameCount')} value={parsedGameCount === null || parsedGameCount === undefined ? 'n/a' : parsedGameCount.toString()} />
        <DebugField label={t('steam.debugResponses')} value={entries.length.toString()} />
      </div>
      {latestEntry ? (
        <div className="mt-3 min-w-0 rounded border border-white/10 bg-black/20 px-2 py-2 text-xs leading-5 text-slate-400">
          <div className="truncate">Endpoint: {latestEntry.endpoint}</div>
          <div className="truncate">Request: {latestEntry.requestUrl}</div>
          <div className="line-clamp-3">Result: {latestEntry.responseSummary}</div>
        </div>
      ) : null}
    </div>
  );
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-white/10 bg-ink-950 px-2 py-2">
      <div className="text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
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
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-ink-950 p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{t('steam.import')}</h3>
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
  const { t } = useI18n();
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
          <span className="text-skyglass">{t('steam.alreadyInLibrary')}</span>
        ) : isIgnored ? (
          <span className="text-red-200">{t('steam.ignored')}</span>
        ) : (
          <span>{t('steam.ready')}</span>
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
            ? 'Questory uses your Steam Web API key to read your owned games from Steam. Generate a key from Steam Community and paste it here.'
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
      <div className="mt-1 text-xs font-medium uppercase tracking-caps text-slate-500">{label}</div>
    </div>
  );
}

function createEmptyDebugResult(steamId64: string): SteamDebugResult {
  return {
    ownedGames: [],
    profile: null,
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
