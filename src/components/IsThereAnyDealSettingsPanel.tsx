import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { loadIsThereAnyDealSettings, saveIsThereAnyDealSettings } from '../lib/isThereAnyDealSettingsStorage';
import type { IsThereAnyDealSettings } from '../types/itad';

export function IsThereAnyDealSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<IsThereAnyDealSettings>(() => loadIsThereAnyDealSettings());

  useEffect(() => {
    saveIsThereAnyDealSettings(settings);
  }, [settings]);

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-white">{t('itad.title')}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{t('itad.settingsHelp')}</p>
      </div>

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

      <p className="mt-3 text-xs text-slate-500">{t('itad.attribution')}</p>
    </section>
  );
}
