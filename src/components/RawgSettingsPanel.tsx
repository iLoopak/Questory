import { useEffect, useState } from 'react';
import { ViewportModal } from './ViewportModal';
import { loadRawgSettings, saveRawgSettings } from '../lib/rawgSettingsStorage';
import type { RawgSettings } from '../types/rawg';
import { useI18n } from '../i18n';
import { SettingsSection } from './settings/SettingsSection';

type RawgSettingsPanelProps = {
  onRawgApiKeyConfigured?: () => void;
};

export function RawgSettingsPanel({
  onRawgApiKeyConfigured,
}: RawgSettingsPanelProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<RawgSettings>(() => loadRawgSettings());
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    saveRawgSettings(settings);
  }, [settings]);

  return (
    <SettingsSection
      title={t('integrations.gameInfo')}
      description="Configure RAWG metadata access so QuestShelf can enrich game information while keeping the API key stored locally."
    >
      <label className="block">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('integrations.apiKey')} <button className="grid h-6 w-6 place-items-center rounded-full border border-mint/30 text-xs text-mint" onClick={(event) => { event.preventDefault(); setIsHelpOpen(true); }} type="button" aria-label={t('integrations.rawgHelp')}>?</button></span>
        <input
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          value={settings.apiKey}
          onChange={(event) => {
            setSettings({ apiKey: event.target.value });

            if (event.target.value.trim()) {
              onRawgApiKeyConfigured?.();
            }
          }}
          placeholder={t('integrations.pasteApiKey')}
          spellCheck={false}
          type="password"
        />
      </label>
      {isHelpOpen ? (
        <ViewportModal ariaLabel={t('integrations.rawgHelp')} placement="center" onClose={() => setIsHelpOpen(false)}>
          <div className="max-w-md p-4 text-sm text-slate-300">
            <h3 className="text-lg font-semibold text-white">{t('integrations.rawgTitle')}</h3>
            <p className="mt-2 leading-6">{t('integrations.rawgText')}</p>
            <a className="mt-4 inline-flex h-10 items-center rounded-md bg-mint px-4 font-semibold text-ink-950" href="https://rawg.io/apidocs" target="_blank" rel="noreferrer">{t('integrations.rawgOpenDocs')}</a>
          </div>
        </ViewportModal>
      ) : null}
    </SettingsSection>
  );
}
