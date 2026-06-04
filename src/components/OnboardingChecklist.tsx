import { useEffect, useMemo, useState } from 'react';
import { loadRawgSettings, saveRawgSettings } from '../lib/rawgSettingsStorage';
import { loadSteamSettings, saveSteamSettings } from '../lib/steamSettingsStorage';
import type { OnboardingItemId } from '../lib/onboardingStorage';
import { searchGameByName, RawgApiError } from '../services/rawgApi';
import { getOwnedGames, getRecentlyPlayedGames, SteamApiError } from '../services/steamApi';
import type { RawgSettings } from '../types/rawg';
import type { SteamSettings } from '../types/steam';
import { useI18n } from '../i18n';

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
    description: 'Start your shelf with one game.',
    actionLabel: 'Add game',
  },
  {
    id: 'steam-api-key',
    title: 'Connect Steam key',
    description: 'Save your Steam key on this device.',
    helpHref: 'https://steamcommunity.com/dev/apikey',
    helpLabel: 'Get key',
    setup: 'steam',
  },
  {
    id: 'steam-id64',
    title: 'Add SteamID64',
    description: 'Choose the Steam profile to import.',
    helpHref: 'https://www.steamidfinder.com/',
    helpLabel: 'Find ID',
    setup: 'steam',
  },
  {
    id: 'steam-test',
    title: 'Test Steam',
    description: 'Check that Steam sync works.',
    setup: 'steam',
  },
  {
    id: 'steam-import',
    title: 'Import Steam library',
    description: 'Add selected Steam games to Library.',
    actionLabel: 'Open import',
  },
  {
    id: 'rawg-api-key',
    title: 'Connect game info',
    description: 'Enable optional game info lookup.',
    helpHref: 'https://rawg.io/apidocs',
    helpLabel: 'Get key',
    setup: 'rawg',
  },
  {
    id: 'metadata-enriched',
    title: 'Add game info',
    description: 'Add game info to one title.',
    actionLabel: 'Open info',
  },
  {
    id: 'wishlist-item',
    title: 'Create wishlist item',
    description: 'Add one game you want.',
    actionLabel: 'Add wishlist',
  },
  {
    id: 'backup-exported',
    title: 'Export backup',
    description: 'Save a local backup.',
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
  const { t } = useI18n();
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
    message: 'Game info lookup is saved on this device.',
  });

  useEffect(() => {
    saveSteamSettings(steamSettings);
  }, [steamSettings]);

  useEffect(() => {
    saveRawgSettings(rawgSettings);
  }, [rawgSettings]);

  const completedCount = onboardingItems.filter((item) => completedItemIds.has(item.id)).length;
  const remainingCount = onboardingItems.length - completedCount;
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
      setRawgStatus({ tone: 'error', message: 'Add your game info API key first.' });
      return;
    }

    setRawgStatus({ tone: 'loading', message: 'Checking game info...' });

    try {
      await searchGameByName('Hades');
      setRawgStatus({ tone: 'success', message: 'Game info lookup is ready.' });
      onRawgApiKeyConfigured?.();
    } catch (error) {
      setRawgStatus({ tone: 'error', message: getFriendlyRawgError(error) });
    }
  }

  return (
    <section className={`qs-setup-card rounded-lg border p-4 ${isSettingsPanel ? '' : 'shadow-panel'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('onboarding.assistant')}</div>
          <h2 className="mt-1 text-lg font-semibold text-white">{t('onboarding.setupTitle')}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
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
            <span>{t('onboarding.completed')}</span>
            <span className="text-xs font-medium text-mint">{showCompleted ? t('onboarding.hideCompleted') : t('onboarding.showCompleted')}</span>
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
  const { t } = useI18n();

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
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-md border border-mint/25 bg-mint/10 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('onboarding.steamApiKey')}</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.apiKey}
            onChange={(event) => onSettingChange('apiKey', event.target.value)}
            placeholder={t('onboarding.pasteSteamKey')}
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
          {status.tone === 'loading' ? t('onboarding.testing') : t('onboarding.testConnection')}
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
  const { t } = useI18n();

  return (
    <section className="mt-4 rounded-md border border-mint/25 bg-mint/10 p-3">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('onboarding.gameInfoApiKey')}</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          value={settings.apiKey}
          onChange={(event) => onKeyChange(event.target.value)}
          placeholder={t('onboarding.pasteGameInfoKey')}
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
          {status.tone === 'loading' ? t('onboarding.testing') : t('onboarding.testConnection')}
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
      return 'Add your game info API key first.';
    }

    if (error.code === 'rate-limit') {
      return 'Game info lookup is busy. Try again later.';
    }

    if (error.code === 'invalid-api-key') {
      return 'Game info lookup did not accept this API key.';
    }
  }

  return 'Game info lookup could not be reached. Check the key and connection.';
}
