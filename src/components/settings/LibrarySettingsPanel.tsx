import { useI18n } from "../../i18n";
import { SettingsSection } from "./SettingsSection";

type DemoDataPanelProps = {
  demoGameCount: number;
  onLoadDemoData: () => void;
  onRemoveDemoGames: () => void;
};

export function DemoDataPanel({
  demoGameCount,
  onLoadDemoData,
  onRemoveDemoGames,
}: DemoDataPanelProps) {
  const { t } = useI18n();

  return (
    <SettingsSection
      title={t("settings.libraryData")}
      description="Load or remove sample content used while developing and validating local library flows."
      actions={(
        <>
          {import.meta.env.DEV ? (
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20 hover:shadow-glow"
              onClick={onLoadDemoData}
              type="button"
            >
              Load demo data
            </button>
          ) : null}
          <button
            className="h-9 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white disabled:cursor-not-allowed disabled:text-slate-500"
            disabled={demoGameCount === 0}
            onClick={onRemoveDemoGames}
            type="button"
          >
            Remove demo games
          </button>
        </>
      )}
    />
  );
}
