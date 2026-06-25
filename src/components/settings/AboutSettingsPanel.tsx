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
        description={
          <>
            Version 0.1.0 · {runtimeEnvironment.isNative ? 'Native' : 'Web'} · {runtimeEnvironment.platform}
            <span className="mt-1 block text-slate-500">Built with ❤️ by iLoopak</span>
          </>
        }
      />

      <SettingsSection
        title="Support Questory"
        actions={(
          <>
            <a
              aria-label="Questory on GitHub (opens in new tab)"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 sm:w-auto"
              href="https://github.com/iLoopak/Questory/"
              rel="noreferrer"
              target="_blank"
            >
              GitHub Repository
            </a>
            <a
              aria-label="Buy Me a Coffee — support Questory development (opens in new tab)"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-200 transition hover:bg-amber-300/20 sm:w-auto"
              href="https://buymeacoffee.com/iloopak"
              rel="noreferrer"
              target="_blank"
            >
              ☕ Buy Me a Coffee
            </a>
          </>
        )}
        status={
          <p className="text-center text-xs text-slate-600">Questory is open source and community driven.</p>
        }
      >
        <div className="max-w-3xl space-y-3 text-sm leading-6 text-slate-400">
          <p>Questory is an indie passion project built by a single developer during evenings, weekends, and far too many late nights.</p>
          <p>If Questory helped you rediscover forgotten games, conquer your backlog, or simply enjoy gaming a little more, consider supporting future development.</p>
          <p>Your support helps cover infrastructure costs, APIs, and many late-night coding sessions.</p>
          <p>Thank you for being part of the journey ❤️</p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Anonymous usage analytics"
        description="Help improve Questory by sending anonymous usage counts. No game titles, notes, tags, account IDs, external IDs, search queries, file paths, URLs, or raw error messages are sent."
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
