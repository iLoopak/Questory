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
import { SettingsSection } from "./SettingsSection";

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
    <SettingsSection title={t("settings.navigation.title")} description={t("settings.navigation.help")} className="border-skyglass/15 bg-ink-950/70 shadow-inner">
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
    </SettingsSection>
  );
}
