import { useState } from 'react';
import { useI18n } from '../../i18n';
import { getRuntimeEnvironment } from '../../lib/capacitorEnvironment';
import { loadAnalyticsSettings, updateAnalyticsEnabled } from '../../lib/analytics';
import { SettingsSection } from './SettingsSection';

export function AboutSettingsPanel({
  runtimeEnvironment,
}: {
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
}) {
  const { t } = useI18n();
  const [analyticsSettings, setAnalyticsSettings] = useState(() => loadAnalyticsSettings());

  function handleAnalyticsEnabledChange(isAnalyticsEnabled: boolean) {
    setAnalyticsSettings(updateAnalyticsEnabled(isAnalyticsEnabled));
  }

  return (
    <div className="space-y-4">
      <SettingsSection
        title={t('settings.about')}
        description={<>Version 0.1.0 · {runtimeEnvironment.isNative ? 'Native' : 'Web'} · {runtimeEnvironment.platform}</>}
        actions={(
          <a
            className="inline-flex h-10 items-center rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
            href="https://github.com/Loopak/QuestShelf"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Repository
          </a>
        )}
      />
      <SettingsSection
        title="Anonymous usage analytics"
        description="Help improve QuestShelf by sending anonymous usage counts. No game titles, notes, tags, account IDs, external IDs, search queries, file paths, URLs, or raw error messages are sent."
        actions={(
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-md border border-skyglass/15 bg-ink-950 px-3 py-2 text-sm font-medium text-slate-200">
            <input
              checked={analyticsSettings.isAnalyticsEnabled}
              className="h-4 w-4 accent-mint"
              onChange={(event) => handleAnalyticsEnabledChange(event.target.checked)}
              type="checkbox"
            />
            Send anonymous usage counts
          </label>
        )}
      />
    </div>
  );
}
