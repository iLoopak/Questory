import { createTranslator } from "../../i18n";
import { homeWidgetRegistry, type HomeWidgetId } from "../../lib/homeWidgetPreferences";
import { useHomeWidgetPreferences } from "../../hooks/useHomeWidgetPreferences";
import { SettingsSection } from "./SettingsSection";

type HomeWidgetsSettingsPanelProps = {
  t: ReturnType<typeof createTranslator>;
};

export function HomeWidgetsSettingsPanel({ t }: HomeWidgetsSettingsPanelProps) {
  const { preferences, setPreferences } = useHomeWidgetPreferences();

  function updateWidgetVisibility(id: HomeWidgetId, isVisible: boolean) {
    setPreferences({ ...preferences, [id]: isVisible });
  }

  const enabledCount = homeWidgetRegistry.filter((widget) => preferences[widget.id]).length;

  return (
    <SettingsSection title={t("settings.home.title")} description={t("settings.home.help")} className="border-skyglass/15 bg-ink-950/70 shadow-inner">
      <div className="grid gap-2 sm:grid-cols-2">
        {homeWidgetRegistry.map((widget) => (
          <label
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-skyglass/15 bg-ink-900/70 px-3 py-2 text-sm text-slate-200 transition hover:border-mint/30 hover:bg-mint/10"
            key={widget.id}
          >
            <span className="min-w-0 truncate font-medium">{t(widget.labelKey)}</span>
            <input
              checked={preferences[widget.id]}
              className="h-5 w-5 shrink-0 rounded border-skyglass/30 bg-ink-950 text-mint accent-mint"
              onChange={(event) => updateWidgetVisibility(widget.id, event.target.checked)}
              type="checkbox"
            />
          </label>
        ))}
      </div>
      {enabledCount === 0 ? (
        <p className="mt-3 text-xs text-amber-300/80">{t("settings.home.allHidden")}</p>
      ) : null}
    </SettingsSection>
  );
}
