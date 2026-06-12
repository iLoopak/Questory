import { createTranslator } from "../../i18n";
import {
  isTopNavItem,
  navigationVisibilityLabelKeys,
} from "../../config/navigation";
import {
  configurableNavigationItems,
  type ConfigurableNavigationItem,
  type NavigationVisibilityPreferences,
} from "../../lib/navigationVisibilityPreferences";

type NavigationVisibilitySettingsPanelProps = {
  navigationVisibility: NavigationVisibilityPreferences;
  onNavigationVisibilityChange: (
    preferences: NavigationVisibilityPreferences
  ) => void;
  t: ReturnType<typeof createTranslator>;
};

export function NavigationVisibilitySettingsPanel({
  navigationVisibility,
  onNavigationVisibilityChange,
  t,
}: NavigationVisibilitySettingsPanelProps) {
  function updateNavigationItemVisibility(
    item: ConfigurableNavigationItem,
    isVisible: boolean
  ) {
    onNavigationVisibilityChange({
      ...navigationVisibility,
      [item]: isVisible,
    });
  }

  return (
    <section className="rounded-xl border border-skyglass/15 bg-ink-950/70 p-4 shadow-inner">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          {t("settings.navigation.title")}
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {t("settings.navigation.help")}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {configurableNavigationItems.map((item) => (
          <label
            className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-skyglass/15 bg-ink-900/70 px-3 py-2 text-sm text-slate-200 transition hover:border-mint/30 hover:bg-mint/10"
            key={item}
          >
            <span className="font-medium">
              {t(navigationVisibilityLabelKeys[item])}
            </span>
            <input
              checked={navigationVisibility[item]}
              className="h-5 w-5 rounded border-skyglass/30 bg-ink-950 text-mint accent-mint"
              onChange={(event) =>
                updateNavigationItemVisibility(item, event.target.checked)
              }
              type="checkbox"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {t("settings.navigation.alwaysVisible")}
      </p>
    </section>
  );
}
