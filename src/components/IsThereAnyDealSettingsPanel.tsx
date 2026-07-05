import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { SettingsSection } from './settings/SettingsSection';
import { loadIsThereAnyDealSettings, saveIsThereAnyDealSettings } from '../lib/isThereAnyDealSettingsStorage';
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
    </SettingsSection>
  );
}
