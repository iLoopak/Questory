import { createTranslator } from "../../i18n";
import {
  homeWidgetRegistry,
  orderedWidgetIdsForColumn,
  type HomeWidgetColumn,
  type HomeWidgetId,
} from "../../lib/homeWidgetPreferences";
import { useHomeWidgetPreferences } from "../../hooks/useHomeWidgetPreferences";
import { Icon } from "../Icon";
import { SettingsSection } from "./SettingsSection";

type HomeWidgetsSettingsPanelProps = {
  t: ReturnType<typeof createTranslator>;
};

const columns: { id: HomeWidgetColumn; labelKey: Parameters<ReturnType<typeof createTranslator>>[0] }[] = [
  { id: "main", labelKey: "settings.home.columnMain" },
  { id: "sidebar", labelKey: "settings.home.columnSidebar" },
];

const labelKeyById = new Map<HomeWidgetId, Parameters<ReturnType<typeof createTranslator>>[0]>(
  homeWidgetRegistry.map((widget) => [widget.id, widget.labelKey]),
);

export function HomeWidgetsSettingsPanel({ t }: HomeWidgetsSettingsPanelProps) {
  const { preferences, setPreferences } = useHomeWidgetPreferences();

  const mainOrder = orderedWidgetIdsForColumn(preferences, "main");
  const sidebarOrder = orderedWidgetIdsForColumn(preferences, "sidebar");
  const listByColumn: Record<HomeWidgetColumn, HomeWidgetId[]> = { main: mainOrder, sidebar: sidebarOrder };

  function setEnabled(id: HomeWidgetId, isEnabled: boolean) {
    setPreferences({ ...preferences, enabled: { ...preferences.enabled, [id]: isEnabled } });
  }

  function setCompact(isCompact: boolean) {
    setPreferences({ ...preferences, compact: isCompact });
  }

  function moveWidget(column: HomeWidgetColumn, id: HomeWidgetId, direction: -1 | 1) {
    const list = [...listByColumn[column]];
    const index = list.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const nextMain = column === "main" ? list : mainOrder;
    const nextSidebar = column === "sidebar" ? list : sidebarOrder;
    setPreferences({ ...preferences, order: [...nextMain, ...nextSidebar] });
  }

  function resetLayout() {
    setPreferences({ ...preferences, order: homeWidgetRegistry.map((widget) => widget.id) });
  }

  const enabledCount = homeWidgetRegistry.filter((widget) => preferences.enabled[widget.id]).length;

  return (
    <SettingsSection title={t("settings.home.title")} description={t("settings.home.help")} className="border-skyglass/15 bg-ink-950/70 shadow-inner">
      <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-skyglass/15 bg-ink-900/70 px-3 py-2 text-sm text-slate-200 transition hover:border-mint/30 hover:bg-mint/10">
        <span className="min-w-0">
          <span className="block font-medium">{t("settings.home.compact")}</span>
          <span className="mt-0.5 block text-xs text-slate-500">{t("settings.home.compactHelp")}</span>
        </span>
        <input
          checked={preferences.compact}
          className="h-5 w-5 shrink-0 rounded border-skyglass/30 bg-ink-950 text-mint accent-mint"
          onChange={(event) => setCompact(event.target.checked)}
          type="checkbox"
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{t("settings.home.reorderHelp")}</p>
        <button
          className="shrink-0 rounded-lg border border-skyglass/15 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-mint/35 hover:bg-mint/10 hover:text-white"
          onClick={resetLayout}
          type="button"
        >
          {t("settings.home.resetLayout")}
        </button>
      </div>

      {columns.map((column) => (
        <div className="mt-3" key={column.id}>
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-spread text-slate-500">{t(column.labelKey)}</div>
          <div className="space-y-2">
            {listByColumn[column.id].map((id, index) => {
              const labelKey = labelKeyById.get(id);
              const isFirst = index === 0;
              const isLast = index === listByColumn[column.id].length - 1;
              return (
                <div
                  className="flex min-h-12 items-center gap-2 rounded-lg border border-skyglass/15 bg-ink-900/70 px-2 py-2 text-sm text-slate-200"
                  key={id}
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      aria-label={t("settings.home.moveUp")}
                      className="flex h-5 w-6 items-center justify-center rounded text-slate-400 transition enabled:hover:bg-mint/10 enabled:hover:text-mint disabled:opacity-25"
                      disabled={isFirst}
                      onClick={() => moveWidget(column.id, id, -1)}
                      type="button"
                    >
                      <Icon name="chevron-up" size={14} />
                    </button>
                    <button
                      aria-label={t("settings.home.moveDown")}
                      className="flex h-5 w-6 items-center justify-center rounded text-slate-400 transition enabled:hover:bg-mint/10 enabled:hover:text-mint disabled:opacity-25"
                      disabled={isLast}
                      onClick={() => moveWidget(column.id, id, 1)}
                      type="button"
                    >
                      <Icon name="chevron-down" size={14} />
                    </button>
                  </div>
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{labelKey ? t(labelKey) : id}</span>
                    <input
                      checked={preferences.enabled[id]}
                      className="h-5 w-5 shrink-0 rounded border-skyglass/30 bg-ink-950 text-mint accent-mint"
                      onChange={(event) => setEnabled(id, event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {enabledCount === 0 ? (
        <p className="mt-3 text-xs text-amber-300/80">{t("settings.home.allHidden")}</p>
      ) : null}
    </SettingsSection>
  );
}
