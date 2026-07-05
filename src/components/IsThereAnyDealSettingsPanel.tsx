import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { SettingsSection } from './settings/SettingsSection';
import { loadIsThereAnyDealSettings, saveIsThereAnyDealSettings, ITAD_SETTINGS_STORAGE_KEY } from '../lib/isThereAnyDealSettingsStorage';
import { getLocalStorageIssues } from '../lib/localPersistence';
import type { IsThereAnyDealSettings } from '../types/itad';

export function IsThereAnyDealSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<IsThereAnyDealSettings>(() => loadIsThereAnyDealSettings());
  const isConfigured = settings.apiKey.trim().length > 0;

  useEffect(() => {
    const persisted = loadIsThereAnyDealSettings();
    console.debug('[ITAD] hasItadKeyInPersistedSettings:', Boolean(persisted.apiKey.trim()));
  }, []);

  function handleApiKeyChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newSettings: IsThereAnyDealSettings = { apiKey: event.target.value };
    console.debug('[ITAD] hasItadKeyInInput:', Boolean(event.target.value.trim()));
    setSettings(newSettings);
    saveIsThereAnyDealSettings(newSettings);
    console.debug('[ITAD] hasItadKeyInSettingsState:', Boolean(newSettings.apiKey.trim()));
  }

  return (
    <SettingsSection
      title={t('itad.title')}
      description={t('itad.settingsHelp')}
      meta={(
        <span className={`inline-flex rounded-full border px-3 py-1 qs-label-caps ${
          isConfigured
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
        }`}>
          {isConfigured ? 'Configured' : 'Missing'}
        </span>
      )}
    >
      <label className="block">
        <span className="qs-label-caps text-muted">{t('integrations.apiKey')}</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          value={settings.apiKey}
          onChange={handleApiKeyChange}
          placeholder={t('integrations.pasteApiKey')}
          spellCheck={false}
          type="password"
        />
      </label>

      <p className="text-xs text-slate-500">{t('itad.attribution')}</p>

      {import.meta.env.DEV && <ItadDiagnosticPanel settings={settings} />}
    </SettingsSection>
  );
}

// ─── Dev-only diagnostic panel ────────────────────────────────────────────────
// Shown only in development builds. Surfaces the exact state of memory, localStorage,
// and the browser environment so the dev/prod persistence difference can be pinpointed.

function ItadDiagnosticPanel({ settings }: { settings: IsThereAnyDealSettings }) {
  const [hasSw, setHasSw] = useState<boolean | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => { setHasSw(regs.length > 0); })
        .catch(() => { setHasSw(false); });
    } else {
      setHasSw(false);
    }

    const issues = getLocalStorageIssues().filter((i) => i.key === ITAD_SETTINGS_STORAGE_KEY);
    if (issues.length > 0) {
      setStorageError(issues[0].message);
    }
  }, []);

  const persisted = loadIsThereAnyDealSettings();
  const hasItadKeyInMemory = Boolean(settings.apiKey.trim());
  const hasItadKeyInLocalStorage = Boolean(persisted.apiKey.trim());

  const rows: Array<[string, boolean | string | null]> = [
    ['hasItadKeyInMemory', hasItadKeyInMemory],
    ['hasItadKeyInLocalStorage', hasItadKeyInLocalStorage],
    ['storageKeyUsed', ITAD_SETTINGS_STORAGE_KEY],
    ['settingsVersion', ITAD_SETTINGS_STORAGE_KEY.match(/\.(v\d+)$/)?.[1] ?? 'unknown'],
    ['environment', import.meta.env.MODE],
    ['hasPwaServiceWorker', hasSw],
    ['syncReadsConfiguredKey', 'logged to console when sync runs'],
    ...(storageError ? [['storageWriteError', storageError] as [string, string]] : []),
  ];

  return (
    <details className="rounded-md border border-amber-300/20 bg-amber-300/5 p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-amber-200/60">ITAD Debug (dev only)</summary>
      <div className="mt-2 space-y-1 font-mono">
        {rows.map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="shrink-0 text-slate-500">{key}:</span>
            <span className={
              value === null
                ? 'text-slate-500'
                : typeof value === 'boolean'
                  ? (value ? 'text-emerald-400' : 'text-rose-400')
                  : 'text-slate-300'
            }>
              {value === null ? '…' : String(value)}
            </span>
          </div>
        ))}
        {hasSw && (
          <p className="mt-2 text-amber-300/80">
            ⚠ Active service worker detected in dev. It may serve cached old JS that
            still has the pre-fix useEffect. Unregister via DevTools → Application →
            Service Workers → Unregister, then hard-refresh.
          </p>
        )}
        {hasItadKeyInLocalStorage && !hasItadKeyInMemory && (
          <p className="mt-2 text-rose-400">
            Key is in localStorage but not in React state. Component mounted with stale state —
            this points to a StrictMode double-init or an unmount/remount with stale localStorage read.
          </p>
        )}
        {!hasItadKeyInLocalStorage && !hasItadKeyInMemory && (
          <p className="mt-1 text-slate-500">
            No key configured yet. Type to set. If key disappears after navigation, check hasPwaServiceWorker above.
          </p>
        )}
      </div>
    </details>
  );
}
