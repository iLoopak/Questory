import { useI18n } from '../i18n';
import { SettingsSection, SettingsStatusBlock } from './settings/SettingsSection';

export function HltbSettingsPanel() {
  const { t } = useI18n();

  return (
    <SettingsSection title={t('hltb.howLongToBeat')} description={t('hltb.settingsHelp')} status={<SettingsStatusBlock tone="success">{t('hltb.noApiKeyRequired')}</SettingsStatusBlock>}>
      <p className="text-xs leading-5 text-slate-500">{t('hltb.proxyHelp')}</p>
    </SettingsSection>
  );
}
