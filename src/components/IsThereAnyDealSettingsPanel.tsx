import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { SettingsSection } from './settings/SettingsSection';
import { loadIsThereAnyDealSettings, saveIsThereAnyDealSettings } from '../lib/isThereAnyDealSettingsStorage';
import type { IsThereAnyDealSettings } from '../types/itad';

export function IsThereAnyDealSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<IsThereAnyDealSettings>(() => loadIsThereAnyDealSettings());

  useEffect(() => {
    saveIsThereAnyDealSettings(settings);
  }, [settings]);

  return (
    <SettingsSection title={t('itad.title')} description={t('itad.settingsHelp')}>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('integrations.apiKey')}</span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          value={settings.apiKey}
          onChange={(event) => setSettings({ apiKey: event.target.value })}
          placeholder={t('integrations.pasteApiKey')}
          spellCheck={false}
          type="password"
        />
      </label>

      <p className="text-xs text-slate-500">{t('itad.attribution')}</p>
    </SettingsSection>
  );
}
