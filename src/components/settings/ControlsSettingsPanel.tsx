import { useMemo } from "react";
import { createTranslator, type AppLanguage } from "../../i18n";
import { getRuntimeEnvironment } from "../../lib/capacitorEnvironment";
import {
  controllerProfileIds,
  getProfileDisplayName,
  type ControllerProfileId,
} from "../../lib/controllerProfiles";
import { SettingsSection } from "./SettingsSection";

export function ControlsSettingsPanel({
  controllerProfileId,
  detectedProfileId,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  language,
  runtimeEnvironment,
  onControllerDebugChange,
  onControllerProfileChange,
  onLandscapeLockChange,
}: {
  controllerProfileId: ControllerProfileId;
  detectedProfileId: ControllerProfileId | null;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  language: AppLanguage;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerProfileChange: (profileId: ControllerProfileId) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
}) {
  const t = useMemo(() => createTranslator(language), [language]);

  const detectedLabel = detectedProfileId
    ? getProfileDisplayName(detectedProfileId)
    : null;

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Controller Profile"
        description="Select your controller type to get correct button hints, confirm/cancel layout, and input tuning for your hardware."
        meta={
          detectedLabel ? (
            <span className="rounded-md border border-mint/25 bg-mint/10 px-3 py-1.5 qs-label-caps text-accent">
              Detected: {detectedLabel}
            </span>
          ) : null
        }
      >
        <div
          aria-label="Controller profile"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
        >
          {controllerProfileIds.map((id) => {
            const isSelected = controllerProfileId === id;
            const isDetected = id !== 'auto' && id === detectedProfileId;

            return (
              <button
                aria-checked={isSelected}
                className={`relative min-h-14 rounded-md border px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? "border-mint/60 bg-mint/15 text-white shadow-glow"
                    : "border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white"
                }`}
                key={id}
                onClick={() => onControllerProfileChange(id)}
                role="radio"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                      isSelected
                        ? "border-mint bg-mint text-ink-950"
                        : "border-skyglass/30"
                    }`}
                  >
                    {isSelected ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />
                    ) : null}
                  </span>
                  <span className="font-semibold">{getProfileDisplayName(id)}</span>
                </span>
                {isDetected ? (
                  <span className="mt-1 block text-xs text-mint opacity-80">
                    Detected
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-5 text-slate-500">
          Auto detects your hardware from the browser-reported device name. Choose manually if detection is wrong.
        </p>
      </SettingsSection>

      <SettingsSection
        title="Input"
        description="Configure Android display orientation and the input debug overlay."
      >
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
    </div>
  );
}
