import { useI18n } from '../i18n';

export function HltbSettingsPanel() {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-white">{t('hltb.howLongToBeat')}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{t('hltb.settingsHelp')}</p>
      </div>
      <div className="rounded-md border border-mint/20 bg-mint/10 px-3 py-2 text-sm text-mint">
        {t('hltb.noApiKeyRequired')}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{t('hltb.proxyHelp')}</p>
    </section>
  );
}
