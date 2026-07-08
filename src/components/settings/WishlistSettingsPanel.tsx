import { useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { ViewportModal } from "../ViewportModal";
import {
  formatCountMessage,
  formatSteamWishlistHtmlImportSummary,
  type SteamWishlistHtmlImportSummary,
} from "../../utils/summaryFormatters";
import { useI18n } from "../../i18n";
import { loadSteamSettings } from "../../lib/steamSettingsStorage";
import {
  parseSteamWishlistHtmlTextWithSummary,
  repairSteamWishlistPlaceholderItems,
  steamWishlistBookmarklet,
  type ParsedSteamWishlistImportItem,
} from "../../lib/steamWishlistHtmlImport";
import type { SteamWishlistSyncState } from "../../types/steam";

export function SteamWishlistSyncNotice({
  syncState,
}: {
  syncState: SteamWishlistSyncState;
}) {
  const { t } = useI18n();
  const statusStyles = {
    idle: "border-skyglass/15 bg-ink-950/70 text-slate-400",
    loading: "border-skyglass/40 bg-skyglass/10 text-skyglass",
    success: "border-mint/40 bg-mint/10 text-mint",
    error: "border-red-400/40 bg-red-500/10 text-red-200",
  }[syncState.status];

  return (
    <div
      className={`mb-4 rounded-lg border px-3 py-3 text-sm leading-6 ${statusStyles}`}
    >
      <div>{syncState.message}</div>
      {syncState.summary ? (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
          <SyncStat label={t('app.fetched')} value={syncState.summary.fetchedCount} />
          <SyncStat label={t('app.added')} value={syncState.summary.addedCount} />
          <SyncStat label={t('app.updated')} value={syncState.summary.updatedCount} />
          <SyncStat
            label={t('app.unchanged')}
            value={syncState.summary.unchangedCount}
          />
          <SyncStat
            label={t('app.inLibrary')}
            value={syncState.summary.skippedAlreadyInLibraryCount}
          />
          <SyncStat
            label={t('app.ignored')}
            value={syncState.summary.skippedIgnoredCount}
          />
          <SyncStat label={t('app.failed')} value={syncState.summary.failedCount} />
        </div>
      ) : null}
    </div>
  );
}

type SteamWishlistHtmlImportModalProps = {
  existingSteamAppIds: number[];
  isExperimentalSyncLoading?: boolean;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onExperimentalSync?: () => void;
  onImport: (
    items: ParsedSteamWishlistImportItem[],
    skippedCount?: number
  ) => SteamWishlistHtmlImportSummary;
};

export function SteamWishlistHtmlImportModal({
  existingSteamAppIds,
  isExperimentalSyncLoading = false,
  onClose,
  onExperimentalSync,
  onImport,
  restoreFocusRef,
}: SteamWishlistHtmlImportModalProps) {
  const { t } = useI18n();
  const [pastedText, setPastedText] = useState("");
  const [clipboardMessage, setClipboardMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [summaryMessage, setSummaryMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const parseResult = useMemo(
    () => parseSteamWishlistHtmlTextWithSummary(pastedText),
    [pastedText]
  );
  const existingSteamAppIdSet = useMemo(
    () => new Set(existingSteamAppIds),
    [existingSteamAppIds]
  );
  const hasPastedText = pastedText.trim().length > 0;
  const foundCount = parseResult.items.length;
  const existingCount = parseResult.items.filter((item) =>
    existingSteamAppIdSet.has(item.appid)
  ).length;
  const newCount = Math.max(0, foundCount - existingCount);
  const previewItems = parseResult.items.slice(0, 6);
  const importDisabled = !hasPastedText || foundCount === 0 || isImporting;

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(steamWishlistBookmarklet);
      setClipboardMessage(t("wishlist.bookmarkletCopied"));
      setErrorMessage("");
    } catch {
      setClipboardMessage("");
      setErrorMessage(t("wishlist.bookmarkletCopyFailed"));
    }
  }

  async function pasteCollectedLinks() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setPastedText(clipboardText);
      setClipboardMessage(t("wishlist.clipboardPasted"));
      setErrorMessage("");
      setSummaryMessage("");
      textareaRef.current?.focus();
    } catch {
      setClipboardMessage("");
      setErrorMessage(t("wishlist.clipboardReadFailed"));
    }
  }

  async function handleImport() {
    if (importDisabled) {
      if (hasPastedText && foundCount === 0) {
        setSummaryMessage("");
        setErrorMessage(t("wishlist.noSteamAppLinksFound"));
      }
      return;
    }

    setIsImporting(true);
    setErrorMessage("");

    try {
      const repairedItems = await repairSteamWishlistPlaceholderItems(
        parseResult.items
      );
      const summary = onImport(
        repairedItems,
        parseResult.skippedCount + parseResult.duplicateCount
      );
      setSummaryMessage(
        `${formatSteamWishlistHtmlImportSummary(summary, t)} ${t(
          "wishlist.refreshMetadataHint"
        )}`
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <ViewportModal
      ariaLabel={t("wishlist.importSteamWishlist")}
      initialFocusRef={textareaRef}
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
      placement="center"
    >
      <div className="border-b border-skyglass/15 bg-ink-950/90 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs font-bold uppercase tracking-caps text-mint">
              {t("wishlist.recommendedManualImport")}
            </div>
            <h3 className="text-lg font-semibold text-white">
              {t("wishlist.importSteamWishlist")}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {t("wishlist.importSteamHtmlHelp")}
            </p>
          </div>
          <a
            className="rounded-md border border-skyglass/20 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
            href="https://store.steampowered.com/wishlist/"
            rel="noreferrer"
            target="_blank"
          >
            {t("wishlist.openSteamWishlist")}
          </a>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section className="rounded-lg border border-mint/25 bg-mint/10 p-3 text-sm leading-6 text-slate-200">
          <p className="font-semibold text-mint">
            {t("wishlist.manualImportDoesNotCallEndpoints")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
            <li>{t("wishlist.lazyLoadHelp")}</li>
            <li>{t("wishlist.bookmarkletOnlyCollects")}</li>
            <li>{t("wishlist.bookmarkletDoesNotSend")}</li>
            <li>{t("wishlist.bookmarkletDoesNotModify")}</li>
          </ul>
        </section>

        <section className="space-y-3 rounded-lg border border-skyglass/15 bg-ink-950/60 p-3">
          <div>
            <h4 className="text-sm font-semibold text-white">
              {t("wishlist.runHelperTitle")}
            </h4>
            <p className="mt-1 text-sm text-slate-400">
              {t("wishlist.runHelperOnSteamPage")}
            </p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-300">
            <li>{t("wishlist.stepCreateBookmark")}</li>
            <li>{t("wishlist.stepPasteBookmarklet")}</li>
            <li>{t("wishlist.stepOpenSteamWishlist")}</li>
            <li>{t("wishlist.stepClickBookmarklet")}</li>
            <li>{t("wishlist.stepWait")}</li>
            <li>{t("wishlist.stepPasteOutput")}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a
              className="h-10 rounded-md border border-skyglass/20 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
              href="https://store.steampowered.com/wishlist/"
              rel="noreferrer"
              target="_blank"
            >
              {t("wishlist.openSteamWishlist")}
            </a>
            <button
              className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
              onClick={copyBookmarklet}
              type="button"
            >
              {t("wishlist.copyBookmarklet")}
            </button>
            <button
              className="h-10 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20"
              onClick={pasteCollectedLinks}
              type="button"
            >
              {t("wishlist.pasteCollectedLinks")}
            </button>
          </div>
          <textarea
            className="h-24 w-full resize-y rounded-md border border-skyglass/15 bg-ink-950/80 p-2 font-mono text-xs text-slate-300 outline-none focus:border-mint/50"
            readOnly
            value={steamWishlistBookmarklet}
          />
          {clipboardMessage ? (
            <p className="text-sm font-semibold text-mint">
              {clipboardMessage}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <label
            className="block text-sm font-semibold text-slate-200"
            htmlFor="steam-wishlist-html-import"
          >
            {t("wishlist.pasteSteamHtmlOrLinks")}
          </label>
          <textarea
            className="min-h-48 w-full resize-y rounded-lg border border-skyglass/15 bg-ink-950/80 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-mint/50 focus:ring-2 focus:ring-mint/20"
            id="steam-wishlist-html-import"
            onChange={(event) => {
              setPastedText(event.target.value);
              setErrorMessage("");
              setSummaryMessage("");
            }}
            placeholder="https://store.steampowered.com/app/488790/South_Park_The_Fractured_But_Whole?snr=...&#10;488790"
            ref={textareaRef}
            value={pastedText}
          />
          {foundCount > 0 ? (
            <div className="rounded-lg border border-skyglass/15 bg-ink-950/60 p-3 text-sm text-slate-300">
              <p className="font-semibold text-mint">
                {formatCountMessage(t("wishlist.foundSteamGames"), foundCount)}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <SyncStat label={t("wishlist.previewNew")} value={newCount} />
                <SyncStat
                  label={t("wishlist.previewDuplicates")}
                  value={existingCount + parseResult.duplicateCount}
                />
                <SyncStat
                  label={t("wishlist.previewSkipped")}
                  value={parseResult.skippedCount}
                />
              </div>
              <ul className="mt-3 space-y-1 text-xs text-slate-400">
                {previewItems.map((item) => (
                  <li key={item.appid}>
                    {item.name} · {item.appid}
                    {existingSteamAppIdSet.has(item.appid)
                      ? ` · ${t("wishlist.alreadyExisted")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : hasPastedText ? (
            <p className="text-sm font-semibold text-amber-300">
              {t("wishlist.noSteamAppLinksFound")}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="text-sm font-semibold text-rose-300">
              {errorMessage}
            </p>
          ) : null}
          {summaryMessage ? (
            <p className="text-sm font-semibold text-mint">{summaryMessage}</p>
          ) : null}
        </section>

        {onExperimentalSync ? (
          <section className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
            <h4 className="font-semibold text-amber-200">
              {t("wishlist.advancedExperimental")}
            </h4>
            <p className="mt-1">{t("wishlist.experimentalSyncWarning")}</p>
            <button
              className="mt-3 h-9 rounded-md border border-amber-200/40 px-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExperimentalSyncLoading}
              onClick={onExperimentalSync}
              type="button"
            >
              {isExperimentalSyncLoading
                ? t("collection.syncingSteamWishlist")
                : t("collection.syncSteamWishlist")}
            </button>
          </section>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-skyglass/15 bg-ink-950/80 p-4 sm:flex-row sm:justify-end">
        <button
          className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
          onClick={onClose}
          type="button"
        >
          {t("action.cancel")}
        </button>
        <button
          className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
          disabled={importDisabled}
          onClick={() => void handleImport()}
          type="button"
        >
          {isImporting
            ? t("wishlist.importingToWishlist")
            : t("wishlist.importToWishlist")}
        </button>
      </div>
    </ViewportModal>
  );
}

type WishlistSettingsPanelProps = {
  existingSteamAppIds: number[];
  steamWishlistSyncState: SteamWishlistSyncState;
  onImportSteamWishlistHtml: (
    items: ParsedSteamWishlistImportItem[],
    skippedCount?: number
  ) => SteamWishlistHtmlImportSummary;
  onSyncSteamWishlist: () => void;
};

export function WishlistSettingsPanel({
  existingSteamAppIds,
  steamWishlistSyncState,
  onImportSteamWishlistHtml,
  onSyncSteamWishlist,
}: WishlistSettingsPanelProps) {
  const { t } = useI18n();
  const [isSteamWishlistHtmlImportOpen, setIsSteamWishlistHtmlImportOpen] =
    useState(false);
  const [clipboardMessage, setClipboardMessage] = useState("");
  const [clipboardError, setClipboardError] = useState("");
  const importButtonRef = useRef<HTMLButtonElement | null>(null);
  const steamSettings = loadSteamSettings();
  const steamWishlistUrl = getConfiguredSteamWishlistUrl(steamSettings);
  const hasConfiguredSteamWishlistUrl =
    steamWishlistUrl !== genericSteamWishlistUrl;

  async function copySteamBookmarklet() {
    try {
      await navigator.clipboard.writeText(steamWishlistBookmarklet);
      setClipboardMessage(t("wishlist.bookmarkletCopied"));
      setClipboardError("");
    } catch {
      setClipboardMessage("");
      setClipboardError(t("wishlist.bookmarkletCopyFailed"));
    }
  }




  return (
    <section className="qs-glass space-y-5 rounded-lg border p-4">
      <div>
        <h2 className="text-xl font-semibold text-white">
          {t("settings.wishlistTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("settings.wishlistHelp")}
        </p>
      </div>

      <div className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h3 className="text-lg font-semibold text-white">
              {t("wishlist.settingsSteamImportTitle")}
            </h3>
            <p className="text-sm leading-6 text-slate-300">
              {t("wishlist.settingsSteamImportHelp")}
            </p>
            {!hasConfiguredSteamWishlistUrl ? (
              <p className="text-sm leading-6 text-amber-200">
                {t("wishlist.settingsSteamWishlistUrlMissing")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="h-10 rounded-md border border-skyglass/20 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
              href={steamWishlistUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("wishlist.openSteamWishlist")}
            </a>
            <button
              className="h-10 rounded-md border border-skyglass/20 px-3 text-sm font-semibold text-slate-100 transition hover:border-mint/40 hover:bg-mint/10"
              onClick={() => void copySteamBookmarklet()}
              type="button"
            >
              {t("wishlist.copyBookmarklet")}
            </button>
            <button
              className="h-10 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 shadow-glow transition hover:bg-mint/90"
              onClick={() => setIsSteamWishlistHtmlImportOpen(true)}
              ref={importButtonRef}
              type="button"
            >
              {t("wishlist.importSteamWishlist")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-3">
            <h4 className="text-sm font-semibold uppercase tracking-caps text-mint">
              {t("wishlist.settingsSteamImportStepsTitle")}
            </h4>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
              <li>{t("wishlist.settingsStepOpenSteamWishlist")}</li>
              <li>{t("wishlist.settingsStepRunBookmarklet")}</li>
              <li>{t("wishlist.settingsStepPasteCollected")}</li>
              <li>{t("wishlist.settingsStepImportToWishlist")}</li>
            </ol>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {t("wishlist.settingsLazyLoadNote")}
            </p>
          </div>

          <div className="rounded-lg border border-skyglass/15 bg-ink-950/50 p-3">
            <h4 className="text-sm font-semibold uppercase tracking-caps text-mint">
              {t("wishlist.bookmarkletSafetyTitle")}
            </h4>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
              <li>{t("wishlist.settingsBookmarkletReadsOnly")}</li>
              <li>{t("wishlist.bookmarkletDoesNotModify")}</li>
              <li>{t("wishlist.settingsBookmarkletOutputsPlainLinks")}</li>
            </ul>
          </div>
        </div>

        {clipboardMessage ? (
          <p className="mt-3 text-sm font-semibold text-mint">
            {clipboardMessage}
          </p>
        ) : null}
        {clipboardError ? (
          <p className="mt-3 text-sm font-semibold text-rose-300">
            {clipboardError}
          </p>
        ) : null}
      </div>

      {isSteamWishlistHtmlImportOpen ? (
        <SteamWishlistHtmlImportModal
          existingSteamAppIds={existingSteamAppIds}
          isExperimentalSyncLoading={
            steamWishlistSyncState.status === "loading"
          }
          onClose={() => setIsSteamWishlistHtmlImportOpen(false)}
          onExperimentalSync={onSyncSteamWishlist}
          onImport={onImportSteamWishlistHtml}
          restoreFocusRef={importButtonRef}
        />
      ) : null}
    </section>
  );
}

const genericSteamWishlistUrl = "https://store.steampowered.com/wishlist/";

function getConfiguredSteamWishlistUrl(
  settings: ReturnType<typeof loadSteamSettings>
) {
  const configuredUrl = normalizeSteamWishlistUrl(
    settings.wishlistUrl || settings.profile?.profileUrl || ""
  );

  if (configuredUrl) {
    return configuredUrl;
  }

  const steamId64 = settings.steamId64.trim();
  if (/^\d{17}$/.test(steamId64)) {
    return `https://store.steampowered.com/wishlist/profiles/${steamId64}/`;
  }

  return genericSteamWishlistUrl;
}

function normalizeSteamWishlistUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://steamcommunity.com/id/${encodeURIComponent(trimmedValue)}`;

  try {
    const url = new URL(withProtocol);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (url.hostname.includes("store.steampowered.com")) {
      return url.toString();
    }

    if (
      url.hostname.includes("steamcommunity.com") &&
      pathParts.length >= 2 &&
      (pathParts[0] === "id" || pathParts[0] === "profiles")
    ) {
      return `https://store.steampowered.com/wishlist/${pathParts[0]}/${pathParts[1]}/`;
    }

    return url.toString();
  } catch {
    return genericSteamWishlistUrl;
  }
}

function SyncStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-skyglass/15 bg-ink-950/80 p-2">
      <div className="text-[11px] uppercase tracking-caps text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
