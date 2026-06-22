import { Icon } from './Icon';
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { getPlatformAccentColor, getPlatformArtworkUrl, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../types/game';
import { ViewportModal } from './ViewportModal';
import { useI18n } from '../i18n';

type BacklogPlatformPickerProps = {
  game: Game;
  isOpen: boolean;
  platforms: GamePlatform[];
  queueState?: PlatformQueueState;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onAddPlatform: (platform: GamePlatform) => void;
  onClose: () => void;
  onSelectPlatform: (platform: GamePlatform) => void;
};

export function BacklogPlatformPicker({
  game,
  isOpen,
  platforms,
  queueState,
  restoreFocusRef,
  onAddPlatform,
  onClose,
  onSelectPlatform,
}: BacklogPlatformPickerProps) {
  const { t } = useI18n();
  const [isPlatformCreationOpen, setIsPlatformCreationOpen] = useState(false);
  const [platformNameDraft, setPlatformNameDraft] = useState('');
  const firstPlatformButtonRef = useRef<HTMLButtonElement | null>(null);
  const addPlatformButtonRef = useRef<HTMLButtonElement | null>(null);
  const platformNameInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  function closePicker() {
    setIsPlatformCreationOpen(false);
    setPlatformNameDraft('');
    onClose();
  }

  function handleModalClose() {
    if (isPlatformCreationOpen) {
      closePlatformCreation();
      return;
    }

    closePicker();
  }

  function selectPlatform(platform: GamePlatform) {
    onSelectPlatform(platform);
    setIsPlatformCreationOpen(false);
    setPlatformNameDraft('');
    onClose();
  }

  function openPlatformCreation() {
    setIsPlatformCreationOpen(true);
    window.setTimeout(() => platformNameInputRef.current?.focus({ preventScroll: true }), 0);
  }

  function closePlatformCreation() {
    setIsPlatformCreationOpen(false);
    setPlatformNameDraft('');
    window.setTimeout(() => addPlatformButtonRef.current?.focus({ preventScroll: true }), 0);
  }

  function submitPlatformCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const platform = platformNameDraft.trim() as GamePlatform;

    if (!platform) {
      return;
    }

    onAddPlatform(platform);
    setPlatformNameDraft('');
    setIsPlatformCreationOpen(false);
  }

  return (
    <ViewportModal
      ariaLabel={`${t('backlog.choosePlatformA11y')} ${game.title}`}
      initialFocusRef={platforms.length > 0 ? firstPlatformButtonRef : addPlatformButtonRef}
      placement="center"
      restoreFocusRef={restoreFocusRef}
      onClose={handleModalClose}
    >
      <div className="qs-review-queue-modal p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 qs-label-caps text-accent"><Icon name="list-plus" /> <span>{t('backlog.choosePlatform')}</span></div>
            <h2 className="mt-1 text-xl font-bold leading-tight text-white">{t('backlog.addToQueue')}</h2>
            <p className="mt-1 line-clamp-2 text-sm text-slate-400">{game.title}</p>
          </div>
          <button
            className="min-h-10 rounded-lg border border-white/10 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
            onClick={closePicker}
            type="button"
          >
            Cancel
          </button>
        </div>

        {platforms.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {platforms.map((platform, index) => {
              const accentColor = queueState ? getPlatformAccentColor(queueState, platform) : '#5fffd8';
              const artworkUrl = queueState ? getPlatformArtworkUrl(queueState, platform) : '';
              return (
                <button
                  key={platform}
                  className="relative min-h-14 overflow-hidden rounded-xl border bg-ink-950/70 px-4 text-left text-base font-bold text-white transition hover:bg-white/10 focus-visible:bg-white/10"
                  style={{ borderColor: accentColor }}
                  onClick={() => selectPlatform(platform)}
                  ref={index === 0 ? firstPlatformButtonRef : undefined}
                  type="button"
                >
                  {artworkUrl ? <img alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" src={artworkUrl} /> : null}
                  <span className="relative inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />{platform}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-ink-950/60 p-4 text-center">
            <div className="text-base font-semibold text-white">{t('backlog.noPlatforms')}</div>
            <p className="mt-1 text-sm text-slate-400">{t('backlog.noPlatformsText')}</p>
          </div>
        )}

        {isPlatformCreationOpen ? (
          <form className="mt-4 rounded-xl border border-skyglass/15 bg-ink-950/70 p-3" onSubmit={submitPlatformCreation}>
            <label className="qs-label-caps text-muted" htmlFor="backlog-platform-name">
              New active platform
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input
                className="h-10 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
                id="backlog-platform-name"
                onChange={(event) => setPlatformNameDraft(event.target.value)}
                placeholder="Legion Go S, Switch, Steam..."
                ref={platformNameInputRef}
                value={platformNameDraft}
              />
              <button
                className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 hover:bg-mint/90 disabled:bg-slate-600 disabled:text-slate-300"
                disabled={!platformNameDraft.trim()}
                type="submit"
              >
                Add
              </button>
              <button
                className="h-10 rounded-md border border-white/10 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                onClick={closePlatformCreation}
                type="button"
              >
                Back
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{t('backlog.creationHelp')}</p>
          </form>
        ) : (
          <div className="mt-4 border-t border-white/10 pt-3">
            <button
              className="w-full min-h-11 rounded-xl border border-white/10 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10"
              onClick={openPlatformCreation}
              ref={addPlatformButtonRef}
              type="button"
            >
              + Add Platform
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">{t('backlog.tapHelp')}</p>
      </div>
    </ViewportModal>
  );
}
