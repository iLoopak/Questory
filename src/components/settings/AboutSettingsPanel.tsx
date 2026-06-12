import { useI18n } from "../../i18n";
import { getRuntimeEnvironment } from "../../lib/capacitorEnvironment";

export function AboutSettingsPanel({
  runtimeEnvironment,
}: {
  runtimeEnvironment: ReturnType<typeof getRuntimeEnvironment>;
}) {
  const { t } = useI18n();

  return (
    <section className="qs-glass rounded-lg border p-4">
      <h2 className="text-xl font-semibold text-white">
        {t("settings.about")}
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Version 0.1.0 · {runtimeEnvironment.isNative ? "Native" : "Web"} ·{" "}
        {runtimeEnvironment.platform}
      </p>
      <a
        className="mt-4 inline-flex h-10 items-center rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
        href="https://github.com/Loopak/QuestShelf"
        target="_blank"
        rel="noreferrer"
      >
        GitHub Repository
      </a>
    </section>
  );
}
