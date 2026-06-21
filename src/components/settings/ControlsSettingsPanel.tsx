import { useMemo } from "react";
import { createTranslator, type AppLanguage } from "../../i18n";
import { getRuntimeEnvironment } from "../../lib/capacitorEnvironment";
import { type ControllerLayoutPreference } from "../../lib/controllerLayoutPreferences";
import { SettingsSection } from "./SettingsSection";

export function ControlsSettingsPanel({
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  language,
  runtimeEnvironment,
  onControllerDebugChange,
  onControllerLayoutChange,
  onLandscapeLockChange,
}: {
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  language: AppLanguage;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerLayoutChange: (preference: ControllerLayoutPreference) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
}) {
  const t = useMemo(() => createTranslator(language), [language]);

  return (
    <SettingsSection
      title={t("settings.controllerLayout")}
      description="Configure how QuestShelf handles controller input and Android display orientation."
    >
      <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <label className="block">
          <span className="block font-semibold text-white">
            {t("settings.controllerLayout")}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {t("settings.controllerLayoutHelp")}
          </span>
          <select
            className="mt-3 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            value={controllerLayoutPreference}
            onChange={(event) =>
              onControllerLayoutChange(
                event.target.value as ControllerLayoutPreference
              )
            }
          >
            <option value="auto">{t("settings.controllerAuto")}</option>
            <option value="xbox">Xbox</option>
            <option value="nintendo">{t("settings.controllerNintendo")}</option>
          </select>
        </label>
      </div>

      {runtimeEnvironment.isAndroid ? (
        <label className="flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <input
            checked={isLandscapeLockEnabled}
            className="mt-1 h-5 w-5 accent-mint"
            onChange={(event) => onLandscapeLockChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold text-white">
              {t("settings.preferLandscape")}
            </span>
          </span>
        </label>
      ) : null}

      <label className="flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
        <input
          checked={isControllerDebugEnabled}
          className="mt-1 h-5 w-5 accent-mint"
          onChange={(event) => onControllerDebugChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold text-white">
            {t("settings.controllerDebug")}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {t("settings.controllerDebugHelp")}
          </span>
        </span>
      </label>
    </SettingsSection>
  );
}
