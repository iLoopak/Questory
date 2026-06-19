import { useMemo, type CSSProperties } from "react";
import {
  createTranslator,
  languageOptions,
  type AppLanguage,
} from "../../i18n";
import { getRuntimeEnvironment } from "../../lib/capacitorEnvironment";
import { type ControllerLayoutPreference } from "../../lib/controllerLayoutPreferences";
import {
  defaultAccentColor,
  defaultGradientOrientation,
  defaultNeonButtonGradientBalance,
  defaultNeonButtonGradientMidpoint,
  defaultSecondaryAccentColor,
  getGradientOrientationCssDirection,
  getNeonButtonGradientStops,
  normalizeAccentColor,
  neonButtonStylePreferences,
  type AccentColorPreference,
  type AppTemplatePreference,
  type GradientOrientationPreference,
  type NeonButtonStylePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "../../lib/themePreferences";
import { SettingsSection } from "./SettingsSection";

export function AppearanceSettingsPanel({
  controllerLayoutPreference,
  isControllerDebugEnabled,
  isLandscapeLockEnabled,
  resolvedTheme,
  runtimeEnvironment,
  themePreference,
  appTemplatePreference,
  accentColorPreference,
  secondaryAccentColorPreference,
  gradientOrientationPreference,
  neonButtonGradientBalancePreference,
  neonButtonGradientMidpointPreference,
  neonButtonStylePreference,
  language,
  onControllerDebugChange,
  onControllerLayoutChange,
  onLandscapeLockChange,
  onThemePreferenceChange,
  onAppTemplatePreferenceChange,
  onAccentColorChange,
  onSecondaryAccentColorChange,
  onGradientOrientationChange,
  onNeonButtonGradientBalanceChange,
  onNeonButtonGradientMidpointChange,
  onNeonButtonStyleChange,
  onLanguageChange,
}: {
  controllerLayoutPreference: ControllerLayoutPreference;
  isControllerDebugEnabled: boolean;
  isLandscapeLockEnabled: boolean;
  resolvedTheme: ResolvedTheme;
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
  themePreference: ThemePreference;
  appTemplatePreference: AppTemplatePreference;
  accentColorPreference: AccentColorPreference;
  secondaryAccentColorPreference: AccentColorPreference;
  gradientOrientationPreference: GradientOrientationPreference;
  neonButtonGradientBalancePreference: number;
  neonButtonGradientMidpointPreference: number;
  neonButtonStylePreference: NeonButtonStylePreference;
  language: AppLanguage;
  onControllerDebugChange: (isEnabled: boolean) => void;
  onControllerLayoutChange: (preference: ControllerLayoutPreference) => void;
  onLandscapeLockChange: (isEnabled: boolean) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onAppTemplatePreferenceChange: (preference: AppTemplatePreference) => void;
  onAccentColorChange: (color: AccentColorPreference) => void;
  onSecondaryAccentColorChange: (color: AccentColorPreference) => void;
  onGradientOrientationChange: (orientation: GradientOrientationPreference) => void;
  onNeonButtonGradientBalanceChange: (balance: number) => void;
  onNeonButtonGradientMidpointChange: (midpoint: number) => void;
  onNeonButtonStyleChange: (style: NeonButtonStylePreference) => void;
  onLanguageChange: (language: AppLanguage) => void;
}) {
  const t = useMemo(() => createTranslator(language), [language]);
  const isNeonTemplate = appTemplatePreference === "neon-deck";
  const themeOptions: Array<{
    description: string;
    label: string;
    value: ThemePreference;
  }> = [
    {
      description: t("settings.lightThemeDescription"),
      label: t("settings.light"),
      value: "light",
    },
    {
      description: t("settings.darkThemeDescription"),
      label: t("settings.dark"),
      value: "dark",
    },
    {
      description: t("settings.systemThemeDescription"),
      label: t("settings.followDevice"),
      value: "system",
    },
  ];
  const appTemplateOptions: Array<{
    description: string;
    label: string;
    value: AppTemplatePreference;
  }> = [
    {
      description: t("settings.templateClassicDescription"),
      label: t("settings.templateClassic"),
      value: "classic",
    },
    {
      description: t("settings.templateNeonDeckDescription"),
      label: t("settings.templateNeonDeck"),
      value: "neon-deck",
    },
  ];
  const availableThemeOptions = isNeonTemplate
    ? themeOptions.filter((option) => option.value === "dark")
    : themeOptions;
  const selectedAccentColor = accentColorPreference ?? defaultAccentColor;
  const selectedSecondaryAccentColor =
    secondaryAccentColorPreference ?? defaultSecondaryAccentColor;
  const isDefaultAccentColor = accentColorPreference === null;
  const isDefaultSecondaryAccentColor = secondaryAccentColorPreference === null;
  const neonButtonGradientStops = getNeonButtonGradientStops(neonButtonGradientBalancePreference, neonButtonGradientMidpointPreference);
  const selectedGradientOrientation = gradientOrientationPreference ?? defaultGradientOrientation;
  const gradientOrientationOptions: Array<{ label: string; value: GradientOrientationPreference }> = [
    { label: t("settings.gradientOrientationHorizontal"), value: "horizontal" },
    { label: t("settings.gradientOrientationVertical"), value: "vertical" },
    { label: t("settings.gradientOrientationDiagonalDown"), value: "diagonal-down" },
    { label: t("settings.gradientOrientationDiagonalUp"), value: "diagonal-up" },
  ];
  const accentColorPresets = [
    { color: defaultAccentColor, label: t("settings.defaultAccentColor") },
    { color: "#1b75d0", label: "Steam blue" },
    { color: "#006fdb", label: "PlayStation blue" },
    { color: "#107c10", label: "Xbox green" },
    { color: "#e60012", label: "Nintendo red" },
    { color: "#8b5cf6", label: "Purple" },
    { color: "#14b8a6", label: "Teal" },
  ];
  const neonAccentPresetPairs = [
    {
      label: "Orange / Blue",
      primary: defaultAccentColor,
      secondary: defaultSecondaryAccentColor,
    },
    { label: "Pink / Cyan", primary: "#ec4899", secondary: "#22d3ee" },
    { label: "Purple / Mint", primary: "#8b5cf6", secondary: "#5bffd8" },
    { label: "Red / Amber", primary: "#ef4444", secondary: "#f59e0b" },
    { label: "Green / Blue", primary: "#22c55e", secondary: "#38bdf8" },
    { label: "Monochrome Neon", primary: "#e5e7eb", secondary: "#94a3b8" },
  ];
  const selectAccentColor = (color: string) => {
    const normalizedColor = normalizeAccentColor(color);
    if (normalizedColor) {
      onAccentColorChange(
        normalizedColor === defaultAccentColor ? null : normalizedColor
      );
    }
  };
  const selectSecondaryAccentColor = (color: string) => {
    const normalizedColor = normalizeAccentColor(color);
    if (normalizedColor) {
      onSecondaryAccentColorChange(
        normalizedColor === defaultSecondaryAccentColor ? null : normalizedColor
      );
    }
  };
  const selectNeonAccentPair = (primary: string, secondary: string) => {
    const normalizedPrimary = normalizeAccentColor(primary);
    const normalizedSecondary = normalizeAccentColor(secondary);

    if (normalizedPrimary && normalizedSecondary) {
      onAccentColorChange(
        normalizedPrimary === defaultAccentColor ? null : normalizedPrimary
      );
      onSecondaryAccentColorChange(
        normalizedSecondary === defaultSecondaryAccentColor
          ? null
          : normalizedSecondary
      );
      onNeonButtonGradientBalanceChange(defaultNeonButtonGradientBalance);
      onNeonButtonGradientMidpointChange(defaultNeonButtonGradientMidpoint);
      onGradientOrientationChange(defaultGradientOrientation);
    }
  };

  return (
    <SettingsSection
      title={t("settings.appearanceTitle")}
      description={t("settings.appearanceHelp")}
      meta={(
        <span className="rounded-md border border-mint/25 bg-mint/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-mint">
          {resolvedTheme} {t("settings.active")}
        </span>
      )}
    >

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("settings.theme")}
        </div>
        <div
          className={`mt-3 grid gap-2 ${
            isNeonTemplate ? "md:grid-cols-1" : "md:grid-cols-3"
          }`}
          role="radiogroup"
          aria-label={t("settings.theme")}
        >
          {availableThemeOptions.map((option) => {
            const isSelected = themePreference === option.value;

            return (
              <button
                aria-checked={isSelected}
                className={`min-h-28 rounded-md border p-3 text-left transition ${
                  isSelected
                    ? "border-mint/60 bg-mint/15 text-white shadow-glow"
                    : "border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35 hover:bg-mint/10 hover:text-white"
                }`}
                key={option.value}
                onClick={() => onThemePreferenceChange(option.value)}
                role="radio"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border ${
                      isSelected
                        ? "border-mint bg-mint text-ink-950"
                        : "border-skyglass/30"
                    }`}
                  >
                    {isSelected ? (
                      <span className="h-2 w-2 rounded-full bg-ink-950" />
                    ) : null}
                  </span>
                  <span className="font-semibold">{option.label}</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {isNeonTemplate
            ? t("settings.neonDarkOnlyNote")
            : "Native Android status-bar color, browser theme-color, and CSS color-scheme update immediately without reloading the current screen."}
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("settings.template")}
        </div>
        <div
          className="mt-3 grid gap-2 md:grid-cols-2"
          role="radiogroup"
          aria-label={t("settings.template")}
        >
          {appTemplateOptions.map((option) => {
            const isSelected = appTemplatePreference === option.value;

            return (
              <button
                aria-checked={isSelected}
                className={`min-h-24 rounded-md border p-3 text-left transition ${
                  isSelected
                    ? "border-mint/60 bg-mint/15 text-white shadow-glow"
                    : "border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/35 hover:bg-mint/10 hover:text-white"
                }`}
                key={option.value}
                onClick={() => onAppTemplatePreferenceChange(option.value)}
                role="radio"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border ${
                      isSelected
                        ? "border-mint bg-mint text-ink-950"
                        : "border-skyglass/30"
                    }`}
                  >
                    {isSelected ? (
                      <span className="h-2 w-2 rounded-full bg-ink-950" />
                    ) : null}
                  </span>
                  <span className="font-semibold">{option.label}</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        {!isNeonTemplate ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t("settings.accentColor")}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t("settings.accentColorHelp")}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-mint/30 bg-mint/10 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-full border border-white/20 shadow-glow"
                  style={{ backgroundColor: selectedAccentColor }}
                />
                <span className="text-xs font-semibold text-mint">
                  {t("settings.currentAccentColor")} · {selectedAccentColor}
                </span>
              </div>
            </div>

            <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="font-semibold text-white">
                {t("settings.customAccentColor")}
              </span>
              <input
                aria-label={t("settings.customAccentColor")}
                className="qs-accent-color-input h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1"
                onChange={(event) => selectAccentColor(event.target.value)}
                type="color"
                value={selectedAccentColor}
              />
            </label>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {t("settings.recommendedAccents")}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {accentColorPresets.map((preset) => {
                  const isSelected =
                    selectedAccentColor === preset.color &&
                    (preset.color !== defaultAccentColor ||
                      isDefaultAccentColor);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`qs-accent-swatch grid min-h-11 min-w-11 place-items-center rounded-md border p-1 transition ${
                        isSelected
                          ? "border-mint/60 shadow-glow"
                          : "border-skyglass/20 hover:border-mint/45 hover:shadow-glow"
                      }`}
                      key={preset.color}
                      onClick={() => selectAccentColor(preset.color)}
                      title={preset.label}
                      type="button"
                    >
                      <span className="sr-only">{preset.label}</span>
                      <span
                        className="h-8 w-8 rounded-full border border-white/25"
                        style={{ backgroundColor: preset.color }}
                      />
                    </button>
                  );
                })}
                <button
                  className="min-h-11 rounded-md border border-skyglass/20 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/45 hover:bg-mint/10 hover:text-white"
                  onClick={() => onAccentColorChange(null)}
                  type="button"
                >
                  {t("settings.resetAccentColor")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Neon accent colors
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Tune the Neon template with a primary glow color and a
                  secondary edge color. Orange / Blue remains the default.
                </p>
              </div>
              <div
                className="qs-neon-accent-preview rounded-xl border p-3"
                style={
                  {
                    "--preview-primary": selectedAccentColor,
                    "--preview-secondary": selectedSecondaryAccentColor,
                    "--preview-button-gradient-start": neonButtonGradientStops.startStop,
                    "--preview-button-gradient-mid": neonButtonGradientStops.midStop,
                    "--preview-button-gradient-end": neonButtonGradientStops.endStop,
                    "--preview-accent-gradient-direction": getGradientOrientationCssDirection(selectedGradientOrientation),
                  } as CSSProperties
                }
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: selectedAccentColor }}
                  />
                  <span>{t("settings.primaryAccent")}</span>
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: selectedSecondaryAccentColor }}
                  />
                  <span>{t("settings.secondaryAccent")}</span>
                </div>
                <div className="mt-3 rounded-lg border p-3">
                  <div className="qs-neon-preview-button inline-flex rounded-md px-3 py-2 text-xs font-black uppercase tracking-[0.12em]">
                    {t("settings.buttonSample")}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    Card border and glow sample
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="rounded-lg border border-skyglass/15 bg-ink-900/60 p-3 text-sm text-slate-300">
                <span className="font-semibold text-white">{t("settings.primaryAccent")}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {t("settings.primaryAccentHelp")}
                </span>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    aria-label={t("settings.primaryAccentColor")}
                    className="qs-accent-color-input h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1"
                    onChange={(event) => selectAccentColor(event.target.value)}
                    type="color"
                    value={selectedAccentColor}
                  />
                  <span className="font-mono text-xs text-slate-400">
                    {selectedAccentColor}
                  </span>
                </div>
              </label>
              <label className="rounded-lg border border-skyglass/15 bg-ink-900/60 p-3 text-sm text-slate-300">
                <span className="font-semibold text-white">
                  {t("settings.secondaryAccent")}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {t("settings.secondaryAccentHelp")}
                </span>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    aria-label={t("settings.secondaryAccentColor")}
                    className="qs-accent-color-input h-11 w-16 rounded-md border border-white/10 bg-ink-900 p-1"
                    onChange={(event) =>
                      selectSecondaryAccentColor(event.target.value)
                    }
                    type="color"
                    value={selectedSecondaryAccentColor}
                  />
                  <span className="font-mono text-xs text-slate-400">
                    {selectedSecondaryAccentColor}
                  </span>
                </div>
              </label>
            </div>


            <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-900/60 p-3 text-sm text-slate-300">
              <span className="font-semibold text-white">{t("settings.gradientOrientation")}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {t("settings.gradientOrientationHelp")}
              </span>
              <div
                aria-label={t("settings.gradientOrientation")}
                className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                role="radiogroup"
              >
                {gradientOrientationOptions.map((option) => {
                  const isSelected = selectedGradientOrientation === option.value;

                  return (
                    <button
                      aria-checked={isSelected}
                      className={`rounded-md border px-3 py-2 text-left text-xs font-semibold transition ${
                        isSelected
                          ? "border-mint/60 bg-mint/15 text-white shadow-glow"
                          : "border-skyglass/20 bg-ink-950/70 text-slate-300 hover:border-mint/35 hover:bg-mint/10 hover:text-white"
                      }`}
                      key={option.value}
                      onClick={() => onGradientOrientationChange(option.value)}
                      role="radio"
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Button style
              </p>
              <div className="flex gap-2" role="radiogroup" aria-label="Button style">
                {neonButtonStylePreferences.map((style) => {
                  const isSelected = neonButtonStylePreference === style;
                  return (
                    <button
                      aria-checked={isSelected}
                      className={`min-h-9 flex-1 rounded-lg border px-3 text-xs font-semibold capitalize transition ${
                        isSelected
                          ? "border-mint/60 bg-mint/15 text-white shadow-glow"
                          : "border-skyglass/20 bg-ink-950/70 text-slate-300 hover:border-mint/35 hover:bg-mint/10 hover:text-white"
                      }`}
                      key={style}
                      onClick={() => onNeonButtonStyleChange(style)}
                      role="radio"
                      type="button"
                    >
                      {style === 'gradient' ? 'Gradient' : 'Solid'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block rounded-lg border border-skyglass/15 bg-ink-900/60 p-3 text-sm text-slate-300">
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold text-white">Button gradient balance</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Shift Neon CTA buttons toward the primary or secondary accent without changing card glows.
                    </span>
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {neonButtonGradientBalancePreference}
                  </span>
                </span>
                <input
                  aria-label="Button gradient balance"
                  className="accent-mint mt-4 w-full"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    onNeonButtonGradientBalanceChange(Number(event.target.value))
                  }
                  type="range"
                  value={neonButtonGradientBalancePreference}
                />
                <span className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>Primary</span>
                  <span>Balanced</span>
                  <span>Secondary</span>
                </span>
              </label>

              <label className="block rounded-lg border border-skyglass/15 bg-ink-900/60 p-3 text-sm text-slate-300">
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold text-white">Button gradient midpoint</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Move the Neon button color transition from tighter and earlier to wider and later.
                    </span>
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {neonButtonGradientMidpointPreference}
                  </span>
                </span>
                <input
                  aria-label="Button gradient midpoint"
                  className="accent-mint mt-4 w-full"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    onNeonButtonGradientMidpointChange(Number(event.target.value))
                  }
                  type="range"
                  value={neonButtonGradientMidpointPreference}
                />
                <span className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>Sharper</span>
                  <span>50</span>
                  <span>Wider</span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Neon preset pairs
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {neonAccentPresetPairs.map((preset) => {
                  const isSelected =
                    selectedAccentColor === preset.primary &&
                    selectedSecondaryAccentColor === preset.secondary &&
                    (preset.primary !== defaultAccentColor ||
                      isDefaultAccentColor) &&
                    (preset.secondary !== defaultSecondaryAccentColor ||
                      isDefaultSecondaryAccentColor);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`qs-accent-swatch rounded-md border p-3 text-left text-sm transition ${
                        isSelected
                          ? "border-mint/60 shadow-glow"
                          : "border-skyglass/20 hover:border-mint/45 hover:shadow-glow"
                      }`}
                      key={`${preset.primary}-${preset.secondary}`}
                      onClick={() =>
                        selectNeonAccentPair(preset.primary, preset.secondary)
                      }
                      type="button"
                    >
                      <span className="font-semibold text-white">
                        {preset.label}
                      </span>
                      <span className="mt-2 flex gap-2">
                        <span
                          className="h-6 flex-1 rounded-full border border-white/20"
                          style={{ backgroundColor: preset.primary }}
                        />
                        <span
                          className="h-6 flex-1 rounded-full border border-white/20"
                          style={{ backgroundColor: preset.secondary }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                className="mt-3 min-h-11 rounded-md border border-skyglass/20 px-3 text-sm font-semibold text-slate-200 transition hover:border-mint/45 hover:bg-mint/10 hover:text-white"
                onClick={() => {
                  onAccentColorChange(null);
                  onSecondaryAccentColorChange(null);
                  onNeonButtonGradientBalanceChange(defaultNeonButtonGradientBalance);
                  onNeonButtonGradientMidpointChange(defaultNeonButtonGradientMidpoint);
                  onGradientOrientationChange(defaultGradientOrientation);
      onGradientOrientationChange(defaultGradientOrientation);
                }}
                type="button"
              >
                Reset to Orange / Blue
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/80 p-3">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t("settings.language")}
          </span>
          <select
            className="mt-3 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
            onChange={(event) =>
              onLanguageChange(event.target.value as AppLanguage)
            }
            value={language}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            {t("settings.languageHelp")}
          </span>
        </label>
      </div>

      {runtimeEnvironment.isAndroid ? (
        <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
          <span className="block font-semibold text-white">
            {t("settings.androidIntegration")}
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            QuestShelf respects Android light/dark mode when Follow Device is
            selected and refreshes system chrome after resume.
          </span>
        </div>
      ) : null}

      <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
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

      <div className="mt-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
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

      <label className="mt-3 flex items-start gap-3 rounded-md border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-300">
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
