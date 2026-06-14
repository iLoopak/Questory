import { useI18n } from "../../i18n";
import { getRuntimeEnvironment } from "../../lib/capacitorEnvironment";
import { SettingsSection } from "./SettingsSection";

export function AboutSettingsPanel({
  runtimeEnvironment,
}: {
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
}) {
  const { t } = useI18n();

  return (
    <SettingsSection
      title={t("settings.about")}
      description={<>Version 0.1.0 · {runtimeEnvironment.isNative ? "Native" : "Web"} · {runtimeEnvironment.platform}</>}
      actions={(
        <a
          className="inline-flex h-10 items-center rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
          href="https://github.com/Loopak/QuestShelf"
          target="_blank"
          rel="noreferrer"
        >
          GitHub Repository
        </a>
      )}
    />
  );
}
