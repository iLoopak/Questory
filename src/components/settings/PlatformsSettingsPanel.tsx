import { useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ViewportModal } from "../ViewportModal";
import { PlatformIdentityFields } from "../PlatformIdentityFields";
import { useI18n } from "../../i18n";
import {
  addActiveQueuePlatform,
  createPlatformArtworkPreset,
  getActiveQueuePlatforms,
  getPlatformAccentColor,
  getPlatformArtworkUrl,
  getPlatformTag,
  getQueuePlatforms,
  getQueueSummary,
  hideQueuePlatform,
  moveQueuePlatform,
  platformArtworkPresetOptions,
  removeQueuePlatform,
  renameQueuePlatform,
  setActiveQueuePlatforms,
  updatePlatformQueueSetting,
  updatePlatformQueueVisualSettings,
  type PlatformQueueState,
} from "../../lib/platformQueueStorage";
import type { Game, GamePlatform } from "../../types/game";

export function QueuePlatformsSettingsPanel({
  games,
  queueState,
  onQueueStateChange,
}: {
  games: Game[];
  queueState: PlatformQueueState;
  onQueueStateChange: Dispatch<SetStateAction<PlatformQueueState>>;
}) {
  const { t } = useI18n();
  const [customPlatformName, setCustomPlatformName] = useState("");
  const allQueuePlatforms = useMemo(
    () => getQueuePlatforms(games, queueState),
    [games, queueState]
  );
  const activeQueuePlatforms = useMemo(
    () => getActiveQueuePlatforms(queueState),
    [queueState]
  );
  const hiddenQueuePlatforms = allQueuePlatforms.filter(
    (platform) => !activeQueuePlatforms.includes(platform)
  );

  function addPlatform(platform: GamePlatform) {
    onQueueStateChange((currentState) => addActiveQueuePlatform(currentState, platform));
    setCustomPlatformName("");
  }

  function addCustomPlatform() {
    const platform = customPlatformName.trim() as GamePlatform;
    if (!platform) {
      return;
    }

    addPlatform(platform);
  }

  function togglePlatform(platform: GamePlatform, isEnabled: boolean) {
    onQueueStateChange((currentState) =>
      isEnabled
        ? addActiveQueuePlatform(currentState, platform)
        : hideQueuePlatform(currentState, platform)
    );
  }

  return (
    <section className="qs-glass rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {t("settings.platformsTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Supported platforms remain available for imports and metadata.
            Active platforms are the only ones shown in Platform Plans.
          </p>
        </div>
        <div className="rounded-md border border-mint/20 bg-mint/10 px-3 py-2 text-sm font-semibold text-mint">
          {activeQueuePlatforms.length} active
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="h-10 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
          placeholder="Custom Platform, Retroid, Steam Deck..."
          value={customPlatformName}
          onChange={(event) => setCustomPlatformName(event.target.value)}
        />
        <button
          className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 hover:bg-mint/90 disabled:bg-slate-600 disabled:text-slate-300"
          disabled={!customPlatformName.trim()}
          onClick={addCustomPlatform}
          type="button"
        >
          Add Platform
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
          <h3 className="font-semibold text-white">
            {t("settings.activePlatforms")}
          </h3>
          <div className="mt-3 grid gap-2">
            {activeQueuePlatforms.length > 0 ? (
              activeQueuePlatforms.map((platform) => (
                <QueuePlatformManagementRow
                  key={platform}
                  isActive
                  accentColor={getPlatformAccentColor(queueState, platform)}
                  displayArtworkUrl={getPlatformArtworkUrl(queueState, platform)}
                  artworkUrl={
                    queueState.settings.find(
                      (setting) => setting.platform === platform
                    )?.artworkUrl ?? ""
                  }
                  platform={platform}
                  platformTag={getPlatformTag(queueState, platform)}
                  onAccentColorChange={(accentColor) =>
                    onQueueStateChange(
                      updatePlatformQueueVisualSettings(queueState, platform, {
                        accentColor,
                      })
                    )
                  }
                  onArtworkUrlChange={(artworkUrl) =>
                    onQueueStateChange(
                      updatePlatformQueueVisualSettings(queueState, platform, {
                        artworkUrl,
                      })
                    )
                  }
                  onPlatformTagChange={(platformTag) =>
                    onQueueStateChange(
                      updatePlatformQueueVisualSettings(queueState, platform, {
                        platformTag,
                      })
                    )
                  }
                  onPresetArtwork={(preset) =>
                    onQueueStateChange(
                      updatePlatformQueueVisualSettings(queueState, platform, {
                        artworkUrl: createPlatformArtworkPreset(
                          platform,
                          getPlatformAccentColor(queueState, platform),
                          preset
                        ),
                      })
                    )
                  }
                  onHide={() =>
                    onQueueStateChange(hideQueuePlatform(queueState, platform))
                  }
                  onMoveDown={() =>
                    onQueueStateChange(
                      moveQueuePlatform(queueState, platform, "down")
                    )
                  }
                  onMoveUp={() =>
                    onQueueStateChange(
                      moveQueuePlatform(queueState, platform, "up")
                    )
                  }
                  onRemove={() =>
                    onQueueStateChange(
                      removeQueuePlatform(queueState, platform)
                    )
                  }
                  onRename={(nextPlatform) =>
                    onQueueStateChange(
                      renameQueuePlatform(queueState, platform, nextPlatform)
                    )
                  }
                  onToggle={(isEnabled) => togglePlatform(platform, isEnabled)}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-white/10 p-3 text-sm text-slate-500">
                New users start with no active platforms. Enable only the
                platforms you want to plan around.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
          <h3 className="font-semibold text-white">
            {t("settings.availableHidden")}
          </h3>
          <div className="mt-3 grid gap-2">
            {hiddenQueuePlatforms.map((platform) => (
              <QueuePlatformManagementRow
                key={platform}
                isActive={false}
                accentColor={getPlatformAccentColor(queueState, platform)}
                displayArtworkUrl={getPlatformArtworkUrl(queueState, platform)}
                artworkUrl={
                  queueState.settings.find(
                    (setting) => setting.platform === platform
                  )?.artworkUrl ?? ""
                }
                platform={platform}
                platformTag={getPlatformTag(queueState, platform)}
                onAccentColorChange={(accentColor) =>
                  onQueueStateChange(
                    updatePlatformQueueVisualSettings(queueState, platform, {
                      accentColor,
                    })
                  )
                }
                onArtworkUrlChange={(artworkUrl) =>
                  onQueueStateChange(
                    updatePlatformQueueVisualSettings(queueState, platform, {
                      artworkUrl,
                    })
                  )
                }
                onPlatformTagChange={(platformTag) =>
                  onQueueStateChange(
                    updatePlatformQueueVisualSettings(queueState, platform, {
                      platformTag,
                    })
                  )
                }
                onPresetArtwork={(preset) =>
                  onQueueStateChange(
                    updatePlatformQueueVisualSettings(queueState, platform, {
                      artworkUrl: createPlatformArtworkPreset(
                        platform,
                        getPlatformAccentColor(queueState, platform),
                        preset
                      ),
                    })
                  )
                }
                onHide={() =>
                  onQueueStateChange(hideQueuePlatform(queueState, platform))
                }
                onMoveDown={() => undefined}
                onMoveUp={() => undefined}
                onRemove={() =>
                  onQueueStateChange(removeQueuePlatform(queueState, platform))
                }
                onRename={(nextPlatform) =>
                  onQueueStateChange(
                    renameQueuePlatform(queueState, platform, nextPlatform)
                  )
                }
                onToggle={(isEnabled) => togglePlatform(platform, isEnabled)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-skyglass/15 bg-ink-950/70 p-3">
        <h3 className="font-semibold text-white">
          {t("settings.bulkManagement")}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10"
            onClick={() =>
              onQueueStateChange(
                setActiveQueuePlatforms(queueState, allQueuePlatforms)
              )
            }
            type="button"
          >
            Enable all
          </button>
          <button
            className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10"
            onClick={() =>
              onQueueStateChange(setActiveQueuePlatforms(queueState, []))
            }
            type="button"
          >
            Disable all
          </button>
          <button
            className="h-9 rounded-md border border-white/10 px-3 text-sm text-slate-200 hover:bg-white/10"
            onClick={() =>
              onQueueStateChange(
                setActiveQueuePlatforms(
                  queueState,
                  [...activeQueuePlatforms].sort((first, second) =>
                    first.localeCompare(second)
                  )
                )
              )
            }
            type="button"
          >
            Sort all A-Z
          </button>
        </div>
      </div>
    </section>
  );
}

function QueuePlatformManagementRow({
  accentColor,
  artworkUrl,
  displayArtworkUrl,
  isActive,
  platform,
  platformTag,
  onAccentColorChange,
  onArtworkUrlChange,
  onHide,
  onMoveDown,
  onMoveUp,
  onPlatformTagChange,
  onPresetArtwork,
  onRemove,
  onRename,
  onToggle,
}: {
  accentColor: string;
  artworkUrl: string;
  displayArtworkUrl: string;
  isActive: boolean;
  platform: GamePlatform;
  platformTag: string;
  onAccentColorChange: (accentColor: string) => void;
  onArtworkUrlChange: (artworkUrl: string) => void;
  onHide: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPlatformTagChange: (platformTag: string) => void;
  onPresetArtwork: (
    preset: (typeof platformArtworkPresetOptions)[number]
  ) => void;
  onRemove: () => void;
  onRename: (platform: GamePlatform) => void;
  onToggle: (isEnabled: boolean) => void;
}) {
  const { t } = useI18n();
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const accentStyle = {
    "--platform-accent": accentColor,
    borderColor: accentColor,
  } as CSSProperties;

  return (
    <>
    <div
      className="grid gap-2 rounded-md border bg-ink-900/70 p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"
      style={accentStyle}
    >
      <input
        checked={isActive}
        className="mt-1 h-4 w-4"
        style={{ accentColor }}
        onChange={(event) => onToggle(event.target.checked)}
        type="checkbox"
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <div className="truncate text-sm font-semibold text-white">
            {platform}
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {isActive
            ? "Shown in Platform Plans"
            : "Hidden from Platform Plans but available for imports/metadata"}
        </div>
        {displayArtworkUrl ? (
          <div className="qs-platform-artwork-banner mt-2 overflow-hidden rounded border border-white/10">
            <img
              alt=""
              className="h-full w-full object-cover object-center"
              src={displayArtworkUrl}
            />
          </div>
        ) : null}
        <details className="mt-2 rounded-md border border-white/10 bg-ink-950/60 p-2">
          <summary className="cursor-pointer qs-label-caps text-slate-400">
            {t("settings.identity")}
          </summary>
          <div className="mt-3">
            <PlatformIdentityFields
              accentColor={accentColor}
              artworkUrl={artworkUrl}
              platformTag={platformTag}
              onAccentColorChange={onAccentColorChange}
              onArtworkUrlChange={onArtworkUrlChange}
              onPlatformTagChange={onPlatformTagChange}
              onPresetArtwork={onPresetArtwork}
            />
          </div>
        </details>
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10"
          disabled={!isActive}
          onClick={onMoveUp}
          type="button"
        >
          {t("settings.up")}
        </button>
        <button
          className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10"
          disabled={!isActive}
          onClick={onMoveDown}
          type="button"
        >
          {t("settings.down")}
        </button>
        <button
          className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10"
          onClick={() => setIsRenameModalOpen(true)}
          type="button"
        >
          {t("settings.rename")}
        </button>
        <button
          className="h-8 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10"
          disabled={!isActive}
          onClick={onHide}
          type="button"
        >
          {t("settings.hide")}
        </button>
        <button
          className="h-8 rounded-md border border-red-400/30 px-2 text-xs text-red-100 hover:bg-red-500/10"
          onClick={onRemove}
          type="button"
        >
          {t("action.remove")}
        </button>
      </div>
    </div>

    {isRenameModalOpen ? (
      <PlatformRenameModal
        platform={platform}
        onRename={(nextPlatform) => { setIsRenameModalOpen(false); onRename(nextPlatform); }}
        onClose={() => setIsRenameModalOpen(false)}
      />
    ) : null}
    </>
  );
}

function PlatformRenameModal({
  platform,
  onRename,
  onClose,
}: {
  platform: GamePlatform;
  onRename: (nextPlatform: GamePlatform) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(platform);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canRename = value.trim().length > 0 && value.trim() !== platform;

  function handleConfirm() {
    if (canRename) onRename(value.trim() as GamePlatform);
  }

  return (
    <ViewportModal ariaLabel="Rename platform" placement="center" onClose={onClose} initialFocusRef={inputRef}>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-white">Rename platform</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Enter a new name for <span className="font-semibold text-white">{platform}</span>.
        </p>
        <input
          ref={inputRef}
          aria-label="Platform name"
          className="mt-4 h-11 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
          spellCheck={false}
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') handleConfirm(); }}
        />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            disabled={!canRename}
            onClick={handleConfirm}
            type="button"
          >
            Rename
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}
