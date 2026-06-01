import { useEffect, useMemo, useState } from 'react';
import { loadRawgSettings, saveRawgSettings } from '../lib/rawgSettingsStorage';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import type { OnboardingItemId } from '../lib/onboardingStorage';
import { searchGameByName, RawgApiError } from '../services/rawgApi';
import { getOwnedGames, getRecentlyPlayedGames, SteamApiError } from '../services/steamApi';
import type { RawgSettings } from '../types/rawg';
import type { SteamSettings } from '../types/steam';

type OnboardingChecklistItem = {
  actionLabel?: string;
  description: string;
  helpHref?: string;
  helpLabel?: string;
  id: OnboardingItemId;
  setup?: 'steam' | 'rawg';
  title: string;
};

type OnboardingChecklistProps = {
  completedItemIds: Set<OnboardingItemId>;
  isSettingsPanel?: boolean;
  onAction: (itemId: OnboardingItemId) => void;
  onClose?: () => void;
  onConnectionTested?: () => void;
  onRawgApiKeyConfigured?: () => void;
  onSkip?: () => void;
  onSteamApiKeyConfigured?: () => void;
  onSteamIdConfigured?: () => void;
};

type SetupStatus = {
  tone: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const onboardingItems: OnboardingChecklistItem[] = [
  {
    id: 'manual-game',
    title: 'Add first game',
    description: 'Create one local entry so your shelf has something to show.',
    actionLabel: 'Add game',
  },
  {
    id: 'steam-api-key',
    title: 'Connect Steam key',
    description: 'Save your Steam Web API key locally on this device.',
    helpHref: 'https://steamcommunity.com/dev/apikey',
    helpLabel: 'Get key',
    setup: 'steam',
  },
  {
    id: 'steam-id64',
    title: 'Add SteamID64',
    description: 'Save the numeric Steam profile ID you want to import from.',
    helpHref: 'https://www.steamidfinder.com/',
    helpLabel: 'Find ID',
    setup: 'steam',
  },
  {
    id: 'steam-test',
    title: 'Test Steam',
    description: 'Confirm QuestShelf can read your Steam library.',
    setup: 'steam',
  },
  {
    id: 'steam-import',
    title: 'Import Steam library',
    description: 'Review Steam games and add the ones you want to Library.',
    actionLabel: 'Open import',
  },
  {
    id: 'rawg-api-key',
    title: 'Connect RAWG',
    description: 'Save a RAWG key for optional metadata enrichment.',
    helpHref: 'https://rawg.io/apidocs',
    helpLabel: 'Get key',
    setup: 'rawg',
  },
  {
    id: 'metadata-enriched',
    title: 'Enrich metadata',
    description: 'Attach RAWG details to at least one Library or Wishlist item.',
    actionLabel: 'Open metadata',
  },
  {
    id: 'wishlist-item',
    title: 'Create wishlist item',
    description: 'Add one future game to Wishlist.',
    actionLabel: 'Add wishlist',
  },
  {
    id: 'backup-exported',
    title: 'Export backup',
    description: 'Save a local backup before moving between devices.',
    actionLabel: 'Open backup',
  },
];

export function OnboardingChecklist({
  completedItemIds,
  isSettingsPanel = false,
  onAction,
  onClose,
  onConnectionTested,
  onRawgApiKeyConfigured,
  onSkip,
  onSteamApiKeyConfigured,
  onSteamIdConfigured,
}: OnboardingChecklistProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedSetup, setExpandedSetup] = useState<'steam' | 'rawg' | null>(() => {
    if (!completedItemIds.has('steam-test')) {
      return 'steam';
    }

    if (!completedItemIds.has('rawg-api-key')) {
      return 'rawg';
    }

    return null;
  });
  const [steamSettings, setSteamSettings] = useState<SteamSettings>(() => loadSteamSettings());
  const [rawgSettings, setRawgSettings] = useState<RawgSettings>(() => loadRawgSettings());
  const [steamStatus, setSteamStatus] = useState<SetupStatus>({
    tone: 'idle',
    message: 'Steam settings are saved only on this device.',
  });
  const [rawgStatus, setRawgStatus] = useState<SetupStatus>({
    tone: 'idle',
    message: 'RAWG settings are saved only on this device.',
  });

  useEffect(() => {
    saveSteamSettings(steamSettings);
  }, [steamSettings]);

  useEffect(() => {
    saveRawgSettings(rawgSettings);
  }, [rawgSettings]);

  const completedCount = onboardingItems.filter((item) => completedItemIds.has(item.id)).length;
  const remainingCount = onboardingItems.length - completedCount;
  const progressPercent = Math.round((completedCount / onboardingItems.length) * 100);
  const remainingItems = useMemo(
    () => onboardingItems.filter((item) => !completedItemIds.has(item.id)),
    [completedItemIds],
  );
  const completedItems = useMemo(
    () => onboardingItems.filter((item) => completedItemIds.has(item.id)),
    [completedItemIds],
  );

  function updateSteamSetting(field: keyof SteamSettings, value: string) {
    setSteamSettings((currentSettings) => ({
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

  function updateRawgKey(value: string) {
    setRawgSettings({ apiKey: value });

    if (value.trim()) {
      onRawgApiKeyConfigured?.();
    }
  }

  async function testSteamConnection() {
    if (!steamSettings.apiKey.trim()) {
      setSteamStatus({ tone: 'error', message: 'Add your Steam API key first.' });
      return;
    }

    if (!steamSettings.steamId64.trim()) {
      setSteamStatus({ tone: 'error', message: 'Add your SteamID64 first.' });
      return;
    }

    setSteamStatus({ tone: 'loading', message: 'Checking Steam...' });

    try {
      const ownedGames = await getOwnedGames(steamSettings);
      const recentlyPlayedGames = await getRecentlyPlayedGames(steamSettings);
      setSteamStatus({
        tone: 'success',
        message:
          ownedGames.length === 0
            ? 'Steam connected, but this profile did not return owned games.'
            : `Steam connected. Found ${ownedGames.length} owned games and ${recentlyPlayedGames.length} recently played entries.`,
      });
      onConnectionTested?.();
    } catch (error) {
      setSteamStatus({ tone: 'error', message: getFriendlySteamError(error) });
    }
  }

  async function testRawgConnection() {
    if (!rawgSettings.apiKey.trim()) {
      setRawgStatus({ tone: 'error', message: 'Add your RAWG API key first.' });
      return;
    }

    setRawgStatus({ tone: 'loading', message: 'Checking RAWG...' });

    try {
      await searchGameByName('Hades');
      setRawgStatus({ tone: 'success', message: 'RAWG connected. Metadata search is ready.' });
      onRawgApiKeyConfigured?.();
    } catch (error) {
      setRawgStatus({ tone: 'error', message: getFriendlyRawgError(error) });
    }
  }

  return (
    <section className={`qs-setup-card rounded-lg border p-4 ${isSettingsPanel ? '' : 'shadow-panel'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Setup assistant</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Set up QuestShelf</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {remainingCount === 0
              ? 'Setup is complete. You can reopen this anytime.'
              : `${remainingCount} steps left. Configure essentials here without leaving the app.`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="grid h-10 place-items-center rounded-md border border-skyglass/15 bg-ink-950 px-3 text-sm text-slate-300">
            {completedCount}/{onboardingItems.length}
          </span>
          {onClose ? (
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Hide
            </button>
          ) : null}
          {onSkip && remainingCount > 0 ? (
            <button
              className="h-10 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onSkip}
              type="button"
            >
              Skip
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-medium text-slate-400">
          <span>{progressPercent}% complete</span>
          <span>{remainingCount} remaining</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950">
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {remainingItems.map((item) => (
          <OnboardingStep
            key={item.id}
            item={item}
            onAction={onAction}
            onExpandSetup={(setup) => setExpandedSetup((currentSetup) => (currentSetup === setup ? null : setup))}
          />
        ))}
      </div>

      {expandedSetup === 'steam' ? (
        <InlineSteamSetup
          settings={steamSettings}
          status={steamStatus}
          onSettingChange={updateSteamSetting}
          onTestConnection={testSteamConnection}
        />
      ) : null}

      {expandedSetup === 'rawg' ? (
        <InlineRawgSetup settings={rawgSettings} status={rawgStatus} onKeyChange={updateRawgKey} onTestConnection={testRawgConnection} />
      ) : null}

      {completedItems.length > 0 ? (
        <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-950/70 p-3">
          <button
            className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-1 text-left text-sm font-semibold text-white"
            onClick={() => setShowCompleted((currentValue) => !currentValue)}
            type="button"
          >
            <span>Completed ({completedItems.length})</span>
            <span className="text-xs font-medium text-mint">{showCompleted ? 'Hide completed' : 'Show completed'}</span>
          </button>

          {showCompleted ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {completedItems.map((item) => (
                <div key={item.id} className="rounded-md border border-mint/20 bg-mint/10 px-3 py-2 text-sm text-mint">
                  {item.title}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OnboardingStep({
  item,
  onAction,
  onExpandSetup,
}: {
  item: OnboardingChecklistItem;
  onAction: (itemId: OnboardingItemId) => void;
  onExpandSetup: (setup: 'steam' | 'rawg') => void;
}) {
  return (
    <article className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{item.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {item.setup ? (
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={() => onExpandSetup(item.setup!)}
              type="button"
            >
              Configure
            </button>
          ) : item.actionLabel ? (
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={() => onAction(item.id)}
              type="button"
            >
              {item.actionLabel}
            </button>
          ) : null}
          {item.helpHref ? (
            <a
              className="grid h-10 place-items-center rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
              href={item.helpHref}
              rel="noreferrer"
              target="_blank"
            >
              {item.helpLabel}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function InlineSteamSetup({
  settings,
  status,
  onSettingChange,
  onTestConnection,
}: {
  settings: SteamSettings;
  status: SetupStatus;
  onSettingChange: (field: keyof SteamSettings, value: string) => void;
  onTestConnection: () => void;
}) {
  return (
    <section className="mt-4 rounded-md border border-mint/25 bg-mint/10 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Steam API key</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.apiKey}
            onChange={(event) => onSettingChange('apiKey', event.target.value)}
            placeholder="Paste Steam API key"
            spellCheck={false}
            type="password"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">SteamID64</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.steamId64}
            onChange={(event) => onSettingChange('steamId64', event.target.value)}
            placeholder="7656119..."
            inputMode="numeric"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <button
          className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          disabled={status.tone === 'loading'}
          onClick={onTestConnection}
          type="button"
        >
          {status.tone === 'loading' ? 'Testing...' : 'Test connection'}
        </button>
        <SetupStatusMessage status={status} />
      </div>
    </section>
  );
}

function InlineRawgSetup({
  settings,
  status,
  onKeyChange,
  onTestConnection,
}: {
  settings: RawgSettings;
  status: SetupStatus;
  onKeyChange: (value: string) => void;
  onTestConnection: () => void;
}) {
  return (
    <section className="mt-4 rounded-md border border-mint/25 bg-mint/10 p-3">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">RAWG API key</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          value={settings.apiKey}
          onChange={(event) => onKeyChange(event.target.value)}
          placeholder="Paste RAWG API key"
          spellCheck={false}
          type="password"
        />
      </label>

      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <button
          className="h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          disabled={status.tone === 'loading'}
          onClick={onTestConnection}
          type="button"
        >
          {status.tone === 'loading' ? 'Testing...' : 'Test connection'}
        </button>
        <SetupStatusMessage status={status} />
      </div>
    </section>
  );
}

function SetupStatusMessage({ status }: { status: SetupStatus }) {
  const toneClass = {
    idle: 'border-skyglass/15 bg-ink-950/70 text-slate-300',
    loading: 'border-skyglass/40 bg-skyglass/10 text-skyglass',
    success: 'border-mint/40 bg-mint/10 text-mint',
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
  }[status.tone];

  return <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${toneClass}`}>{status.message}</div>;
}

function getFriendlySteamError(error: unknown) {
  if (error instanceof SteamApiError) {
    if (error.code === 'missing-api-key') {
      return 'Add your Steam API key first.';
    }

    if (error.code === 'missing-steamid64') {
      return 'Add your SteamID64 first.';
    }

    if (error.code === 'invalid-steamid64') {
      return 'SteamID64 should be a 17-digit numeric ID.';
    }

    if (error.code === 'private-profile') {
      return 'Steam connected, but this profile or library is private.';
    }
  }

  return 'Steam could not be reached. Check the key, SteamID64, profile privacy, and connection.';
}

function getFriendlyRawgError(error: unknown) {
  if (error instanceof RawgApiError) {
    if (error.code === 'missing-api-key') {
      return 'Add your RAWG API key first.';
    }

    if (error.code === 'rate-limit') {
      return 'RAWG is busy right now. Try again later.';
    }

    if (error.code === 'invalid-api-key') {
      return 'RAWG did not accept this API key.';
    }
  }

  return 'RAWG could not be reached. Check the key and connection.';
}
