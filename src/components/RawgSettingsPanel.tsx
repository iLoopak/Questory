import { useEffect, useState } from 'react';
import { loadRawgSettings, saveRawgSettings } from '../lib/rawgSettingsStorage';
import type { RawgSettings } from '../types/rawg';

type RawgSettingsPanelProps = {
  onRawgApiKeyConfigured?: () => void;
};

export function RawgSettingsPanel({
  onRawgApiKeyConfigured,
}: RawgSettingsPanelProps) {
  const [settings, setSettings] = useState<RawgSettings>(() => loadRawgSettings());

  useEffect(() => {
    saveRawgSettings(settings);
  }, [settings]);

  return (
      <section className="qs-glass rounded-lg border p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">RAWG metadata</h2>
            <p className="mt-1 text-sm text-slate-400">Optional local metadata enrichment for individual games.</p>
          </div>
          <span className="rounded-md border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-300">
            Local API key
          </span>
        </div>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">RAWG API key</span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
            value={settings.apiKey}
            onChange={(event) => {
              setSettings({ apiKey: event.target.value });

              if (event.target.value.trim()) {
                onRawgApiKeyConfigured?.();
              }
            }}
            placeholder="Paste RAWG API key"
            spellCheck={false}
            type="password"
          />
        </label>
      </section>
  );
}
