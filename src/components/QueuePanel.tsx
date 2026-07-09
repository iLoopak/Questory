import { Icon } from './Icon';
import { ArtworkRecoveryButton } from './ArtworkRecoveryButton';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, FormEvent, KeyboardEvent, ReactNode, RefObject, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import {
  addActiveQueuePlatform,
  compareQueueEntries,
  getActiveQueuePlatforms,
  createPlatformArtworkPreset,
  getDefaultPlatformAccentColor,
  getPlatformAccentColor,
  getPlatformArtworkUrl,
  getPlatformMaxActiveGames,
  getPlatformQueueSetting,
  getPlatformTag,
  getQueuePlatforms,
  getVisiblePlatformQueueEntries,
  hideQueuePlatform,
  moveQueuePlatform,
  removeQueuePlatform,
  renameQueuePlatform,
  updatePlatformQueueVisualSettings,
  type PlatformArtworkPreset,
  type PlatformQueueEntry,
  type PlatformQueueState,
} from '../lib/platformQueueStorage';
import type { Game, GamePlatform } from '../types/game';

export type PlayingGameAction = 'move-to-backlog' | 'finished' | 'drop' | 'remove-from-playing';
import { GameCoverImage } from './GameCoverImage';
import { AchievementProgressBadge } from './AchievementProgressBadge';
import { PlatformIdentityBadge } from './PlatformIdentityBadge';
import { PlatformIdentityFields } from './PlatformIdentityFields';
import { HltbBadge } from './HltbBadge';
import { getRawgRatingDisplay } from './RawgRatingBadge';
import { RatingBadgeStack } from './RatingBadgeStack';
import { ViewportModal } from './ViewportModal';
import { useI18n } from '../i18n';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import { QueueGhost, pickQueueGhostSlot, pickSimpleVariant, releaseQueueGhostHabitat, shouldShowQueueGhostInHabitat } from './QueueGhost';
import { resolveDefaultPlatformArtwork } from '../lib/platformArtwork';

type QueuePanelProps = {
  games: Game[];
  initialPlatform?: GamePlatform;
  queueState: PlatformQueueState;
  contentScrollRef: RefObject<HTMLElement | null>;
  onAddGameToQueue: (game: Game, platform: GamePlatform) => void;
  onFindArtwork?: (game: Game) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onQueueStateChange: Dispatch<SetStateAction<PlatformQueueState>>;
  onMoveEntry: (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) => void;
  onPlayNow: (gameId: string, platform: GamePlatform) => void;
  onPlayingAction: (gameId: string, platform: GamePlatform, action: PlayingGameAction) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string, platform: GamePlatform) => void;
  onStartReview: () => void;
};

export function QueuePanel({
  games,
  initialPlatform,
  queueState,
  contentScrollRef,
  onAddGameToQueue,
  onFindArtwork,
  onLimitChange,
  onQueueStateChange,
  onMoveEntry,
  onMoveEntryToPlatform,
  onPlayNow,
  onPlayingAction,
  onOpenDetails,
  onRemoveEntry,
  onStartReview,
}: QueuePanelProps) {
  const { t } = useI18n();
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const platformRefs = useRef(new Map<GamePlatform, HTMLElement>());
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const [showQueueHint, setShowQueueHint] = useState(() => localStorage.getItem('qs-queue-hint-v1') !== 'dismissed');
  const [platformGhostSlot] = useState(() => pickQueueGhostSlot('platformPlans'));
  const [platformGhostVariant] = useState(() => pickSimpleVariant());
  const [showPlatformGhost, setShowPlatformGhost] = useState(() => Boolean(platformGhostSlot) && shouldShowQueueGhostInHabitat('platformPlans'));
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const visibleQueueEntries = useMemo(() => getVisiblePlatformQueueEntries(queueState, games), [games, queueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(queueState), [queueState]);
  const movePlatformOptions = activeQueuePlatforms;
  const suggestedPlatform = useMemo<GamePlatform | null>(() => {
    const libraryGames = games.filter((game) => game.collectionType === 'library');
    if (libraryGames.length === 0) return null;
    const counts = new Map<string, number>();
    libraryGames.forEach((game) => counts.set(game.platform, (counts.get(game.platform) ?? 0) + 1));
    const topEntry = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return topEntry ? (topEntry[0] as GamePlatform) : null;
  }, [games]);
  const playingGamesByPlatform = useMemo(() => {
    const nextPlayingGamesByPlatform = new Map<GamePlatform, Game[]>();

    games.forEach((game) => {
      if (game.status !== 'Playing') {
        return;
      }

      const platformGames = nextPlayingGamesByPlatform.get(game.platform) ?? [];
      platformGames.push(game);
      nextPlayingGamesByPlatform.set(game.platform, platformGames);
    });

    return nextPlayingGamesByPlatform;
  }, [games]);
  useEffect(() => () => releaseQueueGhostHabitat('platformPlans'), []);

  const displayedQueuePlatforms = useMemo(() => {
    if (!initialPlatform || !activeQueuePlatforms.includes(initialPlatform)) {
      return activeQueuePlatforms;
    }

    return [initialPlatform, ...activeQueuePlatforms.filter((platform) => platform !== initialPlatform)];
  }, [activeQueuePlatforms, initialPlatform]);

  useEffect(() => {
    if (!initialPlatform) {
      return;
    }

    window.requestAnimationFrame(() => {
      platformRefs.current.get(initialPlatform)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [initialPlatform]);

  function addSuggestedPlatform(platform: GamePlatform) {
    const nextAccentColor = getDefaultPlatformAccentColor(platform);
    onQueueStateChange((currentState) => updatePlatformQueueVisualSettings(
      addActiveQueuePlatform(currentState, platform),
      platform,
      { accentColor: nextAccentColor, platformTag: '' },
    ));
  }

  function dismissQueueHint() {
    localStorage.setItem('qs-queue-hint-v1', 'dismissed');
    setShowQueueHint(false);
  }

  return (
    <section className="qs-queue-shell flex min-w-0 flex-col rounded-lg border border-skyglass/15 bg-ink-900/70 p-2 sm:p-3">
      <header className="mb-3 space-y-3 px-1">
        <h2 className="text-lg font-semibold text-white">{t('queue.platforms')}</h2>
        {activeQueuePlatforms.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="qs-platform-progress flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" aria-label="Platform Plans navigation">
              {activeQueuePlatforms.map((platform) => {
                const planned = visibleQueueEntries.filter((entry) => entry.targetPlatform === platform).length;
                const playing = playingGamesByPlatform.get(platform)?.length ?? 0;
                const cardAccent = getPlatformAccentColor(queueState, platform);
                return (
                  <button
                    key={platform}
                    className="min-w-[8rem] max-w-[11rem] shrink-0 rounded-xl border px-3 py-2 text-left transition"
                    style={{
                      borderColor: `color-mix(in srgb, ${cardAccent} 32%, rgb(255 255 255 / 0.06))`,
                      backgroundColor: `color-mix(in srgb, ${cardAccent} 7%, rgb(2 6 23 / 0.6))`,
                    }}
                    onClick={() => platformRefs.current.get(platform)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                    type="button"
                  >
                    <div className="truncate text-sm font-semibold text-white">{platform}</div>
                    <div className="mt-1.5 flex gap-3 text-xs">
                      <span>
                        <span className="font-bold" style={{ color: cardAccent }}>{playing}</span>
                        <span className="ml-1 text-slate-500">Playing</span>
                      </span>
                      <span>
                        <span className="font-bold" style={{ color: cardAccent }}>{planned}</span>
                        <span className="ml-1 text-slate-500">{t('queue.planned')}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              aria-label={t('queue.addPlatform')}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-mint text-ink-950 transition hover:bg-mint/90"
              onClick={() => setIsPlatformModalOpen(true)}
              title={t('queue.addPlatform')}
              type="button"
            >
              <Icon name="plus" size={18} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
      </header>

      {showQueueHint && (
        <div className="relative mb-3 rounded-xl border border-mint/20 bg-mint/5 p-3 text-xs">
          <button
            aria-label="Dismiss hint"
            className="absolute right-2 top-2 text-slate-500 transition hover:text-slate-300"
            onClick={dismissQueueHint}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
          <p className="pr-6 font-semibold text-mint">What are Platform Plans?</p>
          <p className="mt-1 pr-6 text-slate-400">Platform Plans organise the games you've chosen to play on each platform. Use Quest Queue to decide which games belong here — think of Quest Queue as decision-making and Platform Plans as planning.</p>
        </div>
      )}

      {displayedQueuePlatforms.length === 0 ? (
        <div className="relative rounded-lg border border-dashed border-mint/30 bg-mint/10 p-5 text-sm text-slate-200">
          {showPlatformGhost && platformGhostSlot ? (
            <div className={`queue-ghost-habitat queue-ghost-habitat--platform-plans queue-ghost-slot--${platformGhostSlot}`}>
              <QueueGhost variant={platformGhostVariant} message={platformGhostVariant !== 'peek' ? pickQueueGhostMessage(platformPlanGhostMessages) : undefined} onVanish={() => { releaseQueueGhostHabitat('platformPlans'); setShowPlatformGhost(false); }} />
            </div>
          ) : null}
          {suggestedPlatform ? (
            <>
              <div className="font-semibold text-white">Your library already contains games.</div>
              <p className="mt-1 text-slate-300">Platform Plans is where the games you've chosen to play next live, organized by platform. Use Quest Queue to triage your Library into plans.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 hover:bg-mint/90" onClick={() => addSuggestedPlatform(suggestedPlatform)} type="button">
                  ＋ Add {suggestedPlatform}
                </button>
                <button className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20" onClick={() => setIsPlatformModalOpen(true)} type="button">
                  Choose a different platform
                </button>
                <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-300 transition hover:border-mint/30 hover:text-mint" onClick={onStartReview} type="button">
                  Open Quest Queue →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-white">{t('queue.noPlatformsYet')}</div>
              <p className="mt-1 text-slate-300">{t('queue.noPlatformsCreateHelp')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 hover:bg-mint/90" onClick={() => setIsPlatformModalOpen(true)} type="button">
                  ＋ {t('queue.addPlatform')}
                </button>
                <button className="h-9 rounded-md border border-skyglass/15 px-3 text-sm text-slate-300 transition hover:border-mint/30 hover:text-mint" onClick={onStartReview} type="button">
                  Open Quest Queue →
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div ref={queueListRef} className="qs-queue-list min-w-0 pr-1">
        <div className={
          displayedQueuePlatforms.length === 1
            ? 'qs-platform-grid grid min-w-0 gap-5'
            : displayedQueuePlatforms.length === 2
            ? 'qs-platform-grid grid min-w-0 grid-cols-2 gap-5'
            : 'qs-platform-grid grid min-w-0 gap-5 xl:grid-cols-2'
        }>
          {displayedQueuePlatforms.map((platform) => (
            <PlatformQueueColumn
              key={platform}
              gamesById={gamesById}
              currentlyPlaying={playingGamesByPlatform.get(platform) ?? []}
              maxActiveGames={getPlatformMaxActiveGames(queueState, platform)}
              accentColor={getPlatformAccentColor(queueState, platform)}
              artworkUrl={getPlatformArtworkUrl(queueState, platform)}
              customArtworkUrl={getPlatformQueueSetting(queueState, platform)?.artworkUrl ?? ''}
              isHighlighted={platform === initialPlatform}
              platform={platform}
              statusFilter="All Statuses"
              platformTag={getPlatformTag(queueState, platform)}
              platformOptions={movePlatformOptions}
              setPlatformRef={(element) => {
                if (element) {
                  platformRefs.current.set(platform, element);
                } else {
                  platformRefs.current.delete(platform);
                }
              }}
              queueScrollRef={contentScrollRef}
              queueEntries={visibleQueueEntries
                .filter((entry) => entry.targetPlatform === platform)
                .sort(compareQueueEntries)}
              onHidePlatform={(platform) => onQueueStateChange(hideQueuePlatform(queueState, platform))}
              onIdentityChange={(changes) => onQueueStateChange(updatePlatformQueueVisualSettings(queueState, platform, changes))}
              onLimitChange={onLimitChange}
              onMovePlatform={(platform, direction) => onQueueStateChange(moveQueuePlatform(queueState, platform, direction))}
              onRemovePlatform={(platform) => onQueueStateChange(removeQueuePlatform(queueState, platform))}
              onRenamePlatform={(platform, nextPlatform) => onQueueStateChange(renameQueuePlatform(queueState, platform, nextPlatform))}
              onMoveEntry={onMoveEntry}
              onMoveEntryToPlatform={onMoveEntryToPlatform}
              onFindArtwork={onFindArtwork}
              onPlayNow={onPlayNow}
              onPlayingAction={onPlayingAction}
              onOpenDetails={onOpenDetails}
              onRemoveEntry={onRemoveEntry}
            />
          ))}
        </div>
      </div>

      {isPlatformModalOpen ? (
        <AddPlatformModal
          games={games}
          queueState={queueState}
          onClose={() => setIsPlatformModalOpen(false)}
          onCreate={(nextState, platform) => {
            onQueueStateChange(nextState);
            setIsPlatformModalOpen(false);
            window.requestAnimationFrame(() => {
              platformRefs.current.get(platform)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
          }}
        />
      ) : null}
    </section>
  );
}

const platformPresetSuggestions: GamePlatform[] = [
  'Steam',
  'PlayStation',
  'Xbox',
  'Nintendo Switch',
  'Switch 2',
  'Wii',
  'Wii U',
  'GameCube',
  'PS Vita',
  'PSP',
  'PS2',
  'SNES',
  'N64',
  'Dreamcast',
  'PC',
  'Retro',
];

function AddPlatformModal({
  games,
  queueState,
  onClose,
  onCreate,
}: {
  games: Game[];
  queueState: PlatformQueueState;
  onClose: () => void;
  onCreate: (state: PlatformQueueState, platform: GamePlatform) => void;
}) {
  const { t } = useI18n();
  const [platformName, setPlatformName] = useState('');
  const [accentColor, setAccentColor] = useState('#2563eb');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [platformTag, setPlatformTag] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const availablePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const activePlatformNames = useMemo(
    () => new Map(queueState.activePlatforms.map((platform) => [platform.trim().toLowerCase(), platform])),
    [queueState.activePlatforms],
  );
  const availablePlatformNames = useMemo(
    () => new Map(availablePlatforms.map((platform) => [platform.trim().toLowerCase(), platform])),
    [availablePlatforms],
  );
  const previewName = (platformName.trim() || 'New Platform') as GamePlatform;
  const previewArtworkUrl = artworkUrl || resolveDefaultPlatformArtwork(previewName) || createPlatformArtworkPreset(previewName, accentColor, 'Aurora');

  function applyPresetPlatform(platform: GamePlatform) {
    const nextAccentColor = getDefaultPlatformAccentColor(platform);
    setPlatformName(platform);
    setAccentColor(nextAccentColor);
    setArtworkUrl('');
    setValidationMessage('');
  }

  function applyPresetArtwork(preset: PlatformArtworkPreset) {
    setArtworkUrl(createPlatformArtworkPreset(previewName, accentColor, preset));
  }

  function submitPlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const platformDraft = platformName.trim() as GamePlatform;

    if (!platformDraft) {
      setValidationMessage(t('queue.platformNameRequired'));
      nameInputRef.current?.focus();
      return;
    }

    const existingActivePlatform = activePlatformNames.get(platformDraft.toLowerCase());
    if (existingActivePlatform) {
      setValidationMessage(t('queue.platformAlreadyExists').replace('{platform}', existingActivePlatform));
      nameInputRef.current?.focus();
      return;
    }

    const platform = (availablePlatformNames.get(platformDraft.toLowerCase()) ?? platformDraft) as GamePlatform;
    const createdState = updatePlatformQueueVisualSettings(addActiveQueuePlatform(queueState, platform), platform, {
      accentColor,
      artworkUrl,
      platformTag: platformTag.trim(),
    });
    onCreate(createdState, platform);
  }

  return (
    <ViewportModal ariaLabel={t('queue.addPlatform')} initialFocusRef={nameInputRef} onClose={onClose} placement="center">
      <form className="max-h-[85vh] overflow-y-auto p-4" onSubmit={submitPlatform}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="qs-label-caps text-accent">{t('queue.platforms')}</div>
            <h2 className="mt-1 text-xl font-semibold text-white">{t('queue.addPlatform')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('queue.addPlatformHelp')}</p>
          </div>
          <button className="rounded-md border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/10" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-ink-950/70">
          <div className="qs-platform-artwork-banner relative">
            {previewArtworkUrl ? <img alt="" className="h-full w-full object-cover object-center" src={previewArtworkUrl} /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 to-ink-950/15" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-ink-950/75 px-3 py-1 text-sm font-semibold text-white">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
                {previewName}
              </div>
            </div>
          </div>
        </div>

        <label className="mt-4 grid gap-1">
          <span className="text-xs font-semibold text-slate-400">{t('queue.platformName')} <span className="text-red-300">*</span></span>
          <input
            ref={nameInputRef}
            aria-invalid={Boolean(validationMessage)}
            className="h-10 rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none focus:border-mint"
            placeholder="Steam, PlayStation, Dreamcast..."
            value={platformName}
            onChange={(event) => {
              setPlatformName(event.target.value);
              setValidationMessage('');
            }}
          />
          {validationMessage ? <span className="text-xs font-semibold text-red-200">{validationMessage}</span> : null}
        </label>

        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-400">{t('queue.platformPresets')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {platformPresetSuggestions.map((platform) => (
              <button key={platform} className="min-h-9 rounded-md border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-mint/40 hover:bg-mint/10 hover:text-mint" onClick={() => applyPresetPlatform(platform)} type="button">
                {platform}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-ink-950/60 p-3">
          <PlatformIdentityFields
            accentColor={accentColor}
            artworkUrl={artworkUrl}
            platformTag={platformTag}
            onAccentColorChange={setAccentColor}
            onArtworkUrlChange={setArtworkUrl}
            onPlatformTagChange={setPlatformTag}
            onPresetArtwork={applyPresetArtwork}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-md border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10" onClick={onClose} type="button">
            {t('common.cancel')}
          </button>
          <button className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 hover:bg-mint/90" type="submit">
            {t('queue.addPlatform')}
          </button>
        </div>
      </form>
    </ViewportModal>
  );
}


type PlatformOptionsMenuPosition = {
  left: number;
  top: number;
};

type PlatformOptionsMenuProps = {
  children: (options: { closeMenu: () => void }) => ReactNode;
  label: string;
};

const platformOptionsMenuWidth = 192;
const platformOptionsMenuViewportMargin = 8;
const platformOptionsMenuOffset = 8;

function PlatformOptionsMenu({ children, label }: PlatformOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PlatformOptionsMenuPosition>({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function closeMenu() {
    setIsOpen(false);
  }

  function updateMenuPosition() {
    const button = buttonRef.current;

    if (!button) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 304;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxLeft = Math.max(platformOptionsMenuViewportMargin, viewportWidth - platformOptionsMenuWidth - platformOptionsMenuViewportMargin);
    const left = Math.min(
      Math.max(buttonRect.right - platformOptionsMenuWidth, platformOptionsMenuViewportMargin),
      maxLeft,
    );
    const belowTop = buttonRect.bottom + platformOptionsMenuOffset;
    const aboveTop = buttonRect.top - menuHeight - platformOptionsMenuOffset;
    const maxTop = Math.max(platformOptionsMenuViewportMargin, viewportHeight - menuHeight - platformOptionsMenuViewportMargin);
    const top =
      belowTop + menuHeight <= viewportHeight - platformOptionsMenuViewportMargin
        ? belowTop
        : aboveTop >= platformOptionsMenuViewportMargin
          ? aboveTop
          : Math.min(Math.max(belowTop, platformOptionsMenuViewportMargin), maxTop);

    setPosition({ left, top });
  }

  function toggleMenu() {
    if (!isOpen) {
      updateMenuPosition();
    }

    setIsOpen((currentIsOpen) => !currentIsOpen);
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();
    const animationFrame = window.requestAnimationFrame(updateMenuPosition);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        buttonRef.current?.focus();
      }
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="qs-platform-secondary-button qs-platform-options-button"
        onClick={toggleMenu}
        type="button"
      >
        {label}
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed grid w-48 gap-2 rounded-md border border-skyglass/15 bg-ink-950 p-3 shadow-panel"
              role="menu"
              style={{ left: position.left, top: position.top, zIndex: 1000 }}
            >
              {children({ closeMenu })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PlatformQueueColumn({
  gamesById,
  currentlyPlaying,
  accentColor,
  artworkUrl,
  customArtworkUrl,
  maxActiveGames,
  isHighlighted,
  platform,
  platformOptions,
  platformTag,
  setPlatformRef,
  queueEntries,
  queueScrollRef,
  statusFilter,
  onFindArtwork,
  onHidePlatform,
  onIdentityChange,
  onLimitChange,
  onMovePlatform,
  onRemovePlatform,
  onRenamePlatform,
  onMoveEntry,
  onMoveEntryToPlatform,
  onPlayNow,
  onPlayingAction,
  onOpenDetails,
  onRemoveEntry,
}: {
  accentColor: string;
  artworkUrl: string;
  customArtworkUrl: string;
  currentlyPlaying: Game[];
  gamesById: Map<string, Game>;
  maxActiveGames: number;
  isHighlighted: boolean;
  platform: GamePlatform;
  platformOptions: GamePlatform[];
  platformTag: string;
  setPlatformRef: (element: HTMLElement | null) => void;
  queueEntries: PlatformQueueEntry[];
  queueScrollRef: RefObject<HTMLElement | null>;
  statusFilter: 'All Statuses' | 'Planned' | 'Playing';
  onFindArtwork?: (game: Game) => void;
  onHidePlatform: (platform: GamePlatform) => void;
  onIdentityChange: (changes: { accentColor: string; artworkUrl: string; platformTag: string }) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onMovePlatform: (platform: GamePlatform, direction: 'up' | 'down') => void;
  onRemovePlatform: (platform: GamePlatform) => void;
  onRenamePlatform: (platform: GamePlatform, nextPlatform: GamePlatform) => void;
  onMoveEntry: (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) => void;
  onPlayNow: (gameId: string, platform: GamePlatform) => void;
  onPlayingAction: (gameId: string, platform: GamePlatform, action: PlayingGameAction) => void;
  onOpenDetails: (gameId: string) => void;
  onRemoveEntry: (gameId: string, platform: GamePlatform) => void;
}) {
  const { t } = useI18n();
  const [isPlannedQueueExpanded, setIsPlannedQueueExpanded] = useState(false);
  const plannedQueuePreviewLimit = 5;
  const shouldCollapsePlannedQueue = queueEntries.length > plannedQueuePreviewLimit;
  const displayedQueueEntries = shouldCollapsePlannedQueue && !isPlannedQueueExpanded
    ? queueEntries.slice(0, plannedQueuePreviewLimit)
    : queueEntries;
  const hiddenPlannedQueueCount = Math.max(0, queueEntries.length - plannedQueuePreviewLimit);
  const queueEntriesVirtualizerRef = useRef<HTMLDivElement | null>(null);
  const virtualQueueEntries = useVirtualWindow({
    itemCount: displayedQueueEntries.length,
    estimateItemSize: 148,
    overscan: 5,
    scrollElementRef: queueScrollRef,
    virtualizerRef: queueEntriesVirtualizerRef,
  });
  const renderedQueueEntries = displayedQueueEntries.slice(virtualQueueEntries.startIndex, virtualQueueEntries.endIndex + 1);
  const showPlayingSection = statusFilter !== 'Planned';
  const showPlannedSection = statusFilter !== 'Playing';
  const hasGames = currentlyPlaying.length > 0 || queueEntries.length > 0;
  const platformAccentColor = accentColor || 'var(--accent)';
  const displayArtworkUrl = removePlatformArtworkWatermark(artworkUrl);
  const accentStyle = {
    '--platform-accent': platformAccentColor,
    '--platform-column-border-strength': `${isHighlighted ? 55 : hasGames ? 32 : 18}%`,
    '--platform-column-glow-strength': `${isHighlighted ? 18 : hasGames ? 8 : 0}%`,
    borderColor: `color-mix(in srgb, ${platformAccentColor} ${isHighlighted ? 55 : hasGames ? 32 : 18}%, rgb(255 255 255 / 0.04))`,
    backgroundImage: `radial-gradient(ellipse at 50% 0%, color-mix(in srgb, ${platformAccentColor} ${hasGames || isHighlighted ? 10 : 5}%, transparent) 0%, transparent 65%)`,
  } as CSSProperties;

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.debug('[QuestShelf VirtualQueueList]', {
      label: `${platform} queue`,
      totalItems: queueEntries.length,
      renderedItemCount: renderedQueueEntries.length,
      displayedItemCount: displayedQueueEntries.length,
      collapsed: shouldCollapsePlannedQueue && !isPlannedQueueExpanded,
      virtualRangeStart: virtualQueueEntries.startIndex,
      virtualRangeEnd: virtualQueueEntries.endIndex,
      columns: 1,
      viewportHeight: virtualQueueEntries.viewportSize,
      containerHeight: queueScrollRef.current?.clientHeight ?? null,
    });
  }, [displayedQueueEntries.length, isPlannedQueueExpanded, platform, queueEntries.length, queueScrollRef, renderedQueueEntries.length, shouldCollapsePlannedQueue, virtualQueueEntries.endIndex, virtualQueueEntries.startIndex, virtualQueueEntries.viewportSize]);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);

  return (
    <>
    <section ref={setPlatformRef} style={accentStyle} className={`qs-platform-column rounded-2xl border bg-ink-950/80 p-4 ${isHighlighted ? 'qs-platform-column--highlighted' : ''} ${hasGames ? 'qs-platform-column--populated' : ''} ${!hasGames && !isHighlighted ? 'opacity-80' : ''}`}>
      {displayArtworkUrl ? (
        <div className="qs-platform-artwork-banner qs-platform-artwork-header relative -mx-4 -mt-4 mb-4 overflow-hidden rounded-t-2xl">
          <img alt="" className="h-full w-full object-cover object-center opacity-88" src={displayArtworkUrl} />
          <div className="qs-platform-artwork-overlay absolute inset-0" />
          {platformTag ? (
            <span
              className="absolute left-4 top-4 inline-flex max-w-[calc(100%-2rem)] items-center rounded-full px-2.5 py-1 text-xs font-semibold shadow-panel backdrop-blur-sm"
              style={{
                color: `color-mix(in srgb, ${platformAccentColor} 82%, rgb(226 232 240))`,
                backgroundColor: `color-mix(in srgb, ${platformAccentColor} 16%, rgb(2 6 23 / 0.76))`,
              }}
            >
              <span className="min-w-0 truncate">{platformTag}</span>
            </span>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-end justify-between gap-3 p-4">
            <h3
              className="qs-platform-artwork-title flex max-w-full min-w-0 items-center gap-2 rounded-full px-3 py-1 text-base font-semibold leading-tight text-white shadow-panel backdrop-blur-sm"
              style={{ backgroundColor: `color-mix(in srgb, ${platformAccentColor} 15%, rgb(2 6 23 / 0.76))` }}
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: platformAccentColor }} />
              <span className="min-w-0 truncate">{platform}</span>
            </h3>
            {currentlyPlaying[0] ? (
              <div className="flex shrink-0 items-center gap-2" aria-label={`${currentlyPlaying[0].title} ${t('queue.currentlyPlayingActions')}`}>
                <button className="qs-platform-secondary-button qs-platform-action-button" onClick={() => onOpenDetails(currentlyPlaying[0].id)} type="button">{t('queue.openAdventure')}</button>
                <PlatformOptionsMenu label="•••">
                  {({ closeMenu }) => (
                    <>
                      <button className="qs-platform-menu-item" onClick={() => { onPlayingAction(currentlyPlaying[0].id, platform, 'move-to-backlog'); closeMenu(); }} type="button">{t('queue.moveToQueue')}</button>
                      <button className="qs-platform-menu-item" onClick={() => { onPlayingAction(currentlyPlaying[0].id, platform, 'finished'); closeMenu(); }} type="button">{t('action.finished')}</button>
                      <button className="qs-platform-menu-item qs-platform-menu-item--danger" onClick={() => { onPlayingAction(currentlyPlaying[0].id, platform, 'drop'); closeMenu(); }} type="button">{t('queue.drop')}</button>
                      <button className="qs-platform-menu-item" onClick={() => { onPlayingAction(currentlyPlaying[0].id, platform, 'remove-from-playing'); closeMenu(); }} type="button">{t('queue.removeFromPlaying')}</button>
                    </>
                  )}
                </PlatformOptionsMenu>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {!displayArtworkUrl ? (
            <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold leading-tight">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: platformAccentColor }} />
              <span className="min-w-0 truncate" style={{ color: platformAccentColor }}>{platform}</span>
            </h3>
          ) : null}
          {platformTag && !displayArtworkUrl ? (
            <div className="mt-1.5">
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                style={{
                  borderColor: `color-mix(in srgb, ${platformAccentColor} 30%, transparent)`,
                  color: `color-mix(in srgb, ${platformAccentColor} 75%, rgb(148 163 184))`,
                  backgroundColor: `color-mix(in srgb, ${platformAccentColor} 10%, transparent)`,
                }}
              >
                {platformTag}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!displayArtworkUrl && currentlyPlaying[0] ? (
            <button className="qs-platform-secondary-button qs-platform-action-button" onClick={() => onOpenDetails(currentlyPlaying[0].id)} type="button">{t('queue.openAdventure')}</button>
          ) : null}
        <PlatformOptionsMenu label={t('queue.options')}>
          {({ closeMenu }) => (
            <>
              <label className="block">
                <span className="qs-label-caps text-muted">{t('queue.futureActiveLimit')}</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
                  min={1}
                  max={25}
                  type="number"
                  value={maxActiveGames}
                  onChange={(event) => onLimitChange(platform, Number(event.target.value))}
                />
              </label>
              <button className="qs-platform-menu-item" onClick={() => { setIsIdentityModalOpen(true); closeMenu(); }} type="button">{t('queue.editIdentity')}</button>
              <button className="qs-platform-menu-item" onClick={() => { onHidePlatform(platform); closeMenu(); }} type="button">{t('queue.hidePlatform')}</button>
              <button className="qs-platform-menu-item qs-platform-menu-item--danger" onClick={() => { onRemovePlatform(platform); closeMenu(); }} type="button">{t('queue.removePlatform')}</button>
              <button className="qs-platform-menu-item" onClick={() => { setIsRenameModalOpen(true); closeMenu(); }} type="button">{t('queue.renamePlatform')}</button>
              <button className="qs-platform-menu-item" onClick={() => { onMovePlatform(platform, 'up'); closeMenu(); }} type="button">{t('queue.moveUp')}</button>
              <button className="qs-platform-menu-item" onClick={() => { onMovePlatform(platform, 'down'); closeMenu(); }} type="button">{t('queue.moveDown')}</button>
            </>
          )}
        </PlatformOptionsMenu>
        </div>
      </div>

      {showPlayingSection && currentlyPlaying.length > 0 ? (
        <div className="qs-platform-playing-section mb-4 grid w-full min-w-0 gap-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="qs-platform-playing-meta text-xs">{currentlyPlaying.length} {currentlyPlaying.length === 1 ? t('queue.activeGame') : t('queue.activeGames')} in progress</p>
          </div>
          <div className="grid w-full min-w-0 gap-2">
              {currentlyPlaying.map((game) => (
                <QueueGameRow key={game.id} game={game} onFindArtwork={onFindArtwork} onOpenDetails={onOpenDetails} />
              ))}
          </div>
        </div>
      ) : null}

      {showPlannedSection ? <div className="qs-platform-nextup-section">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <h4 className="qs-platform-nextup-title text-sm font-semibold uppercase tracking-spread">{t('queue.nextUp')}</h4>
            <p className="mt-1 text-xs text-slate-500">{queueEntries.length} {queueEntries.length === 1 ? t('queue.adventureSingular') : t('queue.adventurePlural')} {t('queue.waitingOnHub')}</p>
          </div>
          {queueEntries.length > 0 ? <span className="text-xs font-semibold text-slate-500">{t('queue.playlistOrder')}</span> : null}
        </div>
        <div ref={queueEntriesVirtualizerRef} className="qs-queue-virtual-window relative min-w-0" style={{ minHeight: displayedQueueEntries.length > 0 ? virtualQueueEntries.totalSize : undefined }}>
        {queueEntries.length > 0 ? (
          <div className="qs-queue-virtual-items absolute left-0 top-0 grid w-full gap-2" style={{ transform: `translateY(${virtualQueueEntries.offsetBefore}px)` }}>
            {renderedQueueEntries.map((entry) => {
              const game = gamesById.get(entry.gameId);
              const isFirstEntry = entry.queuePosition <= 1;
              const isLastEntry = entry.queuePosition >= queueEntries.length;
              if (!game) {
                return null;
              }

              return (
                <QueueEntryRow
                  key={`${entry.gameId}-${entry.targetPlatform}`}
                  entry={entry}
                  game={game}
                  platformAccentColor={accentColor}
                  platformOptions={platformOptions}
                  isFirstEntry={isFirstEntry}
                  isLastEntry={isLastEntry}
                  onMoveEntry={onMoveEntry}
                  onMoveEntryToPlatform={onMoveEntryToPlatform}
                  onOpenDetails={onOpenDetails}
                  onPlayNow={() => onPlayNow(game.id, platform)}
                  onRemoveEntry={onRemoveEntry}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="qs-queue-planned-empty rounded-md border border-dashed px-3 py-4 text-sm"
            style={{
              borderColor: `color-mix(in srgb, ${platformAccentColor} 22%, rgb(255 255 255 / 0.06))`,
              color: `color-mix(in srgb, ${platformAccentColor} 45%, rgb(100 116 139))`,
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              <Icon name="library" size={13} />
              <span>{platform}</span>
            </div>
            <p>{t('queue.noQueuePlatform').replace('{platform}', platform)}</p>
          </div>
        )}
        </div>
        {shouldCollapsePlannedQueue ? (
          <button
            aria-expanded={isPlannedQueueExpanded}
            className="qs-planned-queue-toggle mt-2 flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-semibold transition"
            onClick={() => setIsPlannedQueueExpanded((currentIsExpanded) => !currentIsExpanded)}
            style={{
              borderColor: `color-mix(in srgb, ${platformAccentColor} 24%, rgb(255 255 255 / 0.08))`,
              color: `color-mix(in srgb, ${platformAccentColor} 72%, rgb(203 213 225))`,
              backgroundColor: `color-mix(in srgb, ${platformAccentColor} 8%, rgb(2 6 23 / 0.72))`,
            }}
            type="button"
          >
            <Icon name={isPlannedQueueExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
            <span>
              {isPlannedQueueExpanded
                ? t('queue.showLess')
                : t('queue.showMore').replace('{count}', String(hiddenPlannedQueueCount))}
            </span>
          </button>
        ) : null}
      </div> : null}
    </section>

    {isRenameModalOpen ? (
      <QueuePlatformRenameModal
        platform={platform}
        onRename={(nextPlatform) => { setIsRenameModalOpen(false); onRenamePlatform(platform, nextPlatform); }}
        onClose={() => setIsRenameModalOpen(false)}
      />
    ) : null}
    {isIdentityModalOpen ? (
      <PlatformIdentityModal
        platform={platform}
        accentColor={accentColor}
        artworkUrl={customArtworkUrl}
        platformTag={platformTag}
        onSave={onIdentityChange}
        onClose={() => setIsIdentityModalOpen(false)}
      />
    ) : null}
    </>
  );
}

function QueuePlatformRenameModal({
  platform,
  onRename,
  onClose,
}: {
  platform: GamePlatform;
  onRename: (nextPlatform: GamePlatform) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(platform);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const canRename = value.trim().length > 0 && value.trim() !== platform;

  function handleConfirm() {
    if (canRename) onRename(value.trim() as GamePlatform);
  }

  return (
    <ViewportModal ariaLabel={t('queue.renamePlatform')} placement="center" onClose={onClose} initialFocusRef={inputRef}>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-white">{t('queue.renamePlatform')}</h3>
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
            {t('settings.rename')}
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}

function PlatformIdentityModal({
  platform,
  accentColor: initialAccentColor,
  artworkUrl: initialArtworkUrl,
  platformTag: initialPlatformTag,
  onSave,
  onClose,
}: {
  platform: GamePlatform;
  accentColor: string;
  artworkUrl: string;
  platformTag: string;
  onSave: (changes: { accentColor: string; artworkUrl: string; platformTag: string }) => void;
  onClose: () => void;
}) {
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [artworkUrl, setArtworkUrl] = useState(initialArtworkUrl);
  const [platformTag, setPlatformTag] = useState(initialPlatformTag);
  const previewArtworkUrl = artworkUrl || resolveDefaultPlatformArtwork(platform) || createPlatformArtworkPreset(platform, accentColor, 'Aurora');

  function handleSave() {
    onSave({ accentColor, artworkUrl, platformTag: platformTag.trim() });
    onClose();
  }

  return (
    <ViewportModal ariaLabel="Edit platform identity" placement="center" onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto overscroll-contain p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="qs-label-caps text-accent">Platform Identity</div>
            <h2 className="mt-1 text-lg font-semibold text-white">{platform}</h2>
          </div>
          <button className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/10" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-ink-950/70">
          <div className="qs-platform-artwork-banner relative">
            <img alt="" className="h-full w-full object-cover object-center" src={previewArtworkUrl} />
            <div className="absolute inset-0 bg-gradient-to-r from-ink-950/85 to-ink-950/15" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold text-white"
                style={{
                  borderColor: `color-mix(in srgb, ${accentColor} 40%, rgb(255 255 255 / 0.1))`,
                  backgroundColor: `color-mix(in srgb, ${accentColor} 15%, rgb(2 6 23 / 0.85))`,
                }}
              >
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                {platform}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-ink-950/60 p-3">
          <PlatformIdentityFields
            accentColor={accentColor}
            artworkUrl={artworkUrl}
            platformTag={platformTag}
            onAccentColorChange={setAccentColor}
            onArtworkUrlChange={setArtworkUrl}
            onPlatformTagChange={setPlatformTag}
            onPresetArtwork={(preset) => setArtworkUrl(createPlatformArtworkPreset(platform, accentColor, preset))}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-md border border-skyglass/15 px-4 text-sm font-medium text-slate-200 hover:bg-mint/10 hover:text-white" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="h-10 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 hover:bg-mint/90" onClick={handleSave} type="button">
            Save
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}

function removePlatformArtworkWatermark(artworkUrl: string) {
  if (!artworkUrl.startsWith('data:image/svg+xml,')) {
    return artworkUrl;
  }

  try {
    const [prefix, encodedSvg] = artworkUrl.split(',', 2);
    const svg = decodeURIComponent(encodedSvg);
    const isQuestShelfPreset = svg.includes('viewBox="0 0 360 120"') && svg.includes('<radialGradient id="v"');

    if (!isQuestShelfPreset) {
      return artworkUrl;
    }

    const cleanedSvg = svg
      .replace(/<rect x="12" y="22" width="230" height="60" rx="18" fill="#020617" fill-opacity="0\.18"\/>/g, '')
      .replace(/<text\b[^>]*>.*?<\/text>/g, '');

    return `${prefix},${encodeURIComponent(cleanedSvg)}`;
  } catch {
    return artworkUrl;
  }
}

function QueueEntryRow({
  entry,
  game,
  isFirstEntry,
  isLastEntry,
  platformAccentColor,
  platformOptions,
  onMoveEntry,
  onMoveEntryToPlatform,
  onPlayNow,
  onOpenDetails,
  onRemoveEntry,
}: {
  entry: PlatformQueueEntry;
  game: Game;
  isFirstEntry: boolean;
  isLastEntry: boolean;
  platformAccentColor: string;
  platformOptions: GamePlatform[];
  onMoveEntry: (gameId: string, platform: GamePlatform, direction: 'top' | 'up' | 'down') => void;
  onMoveEntryToPlatform: (gameId: string, sourcePlatform: GamePlatform, platform: GamePlatform) => void;
  onOpenDetails: (gameId: string) => void;
  onPlayNow: () => void;
  onRemoveEntry: (gameId: string, platform: GamePlatform) => void;
}) {
  const { t } = useI18n();

  function handleQueueEntryKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      onOpenDetails(game.id);
      return;
    }

    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault();
      onMoveEntry(game.id, entry.targetPlatform, 'up');
      return;
    }

    if (event.key === 'y' || event.key === 'Y') {
      event.preventDefault();
      onMoveEntry(game.id, entry.targetPlatform, 'down');
    }
  }

  return (
    <article
      aria-label={`${game.title} ${t('queue.entryA11y')}`}
      className="qs-queue-entry qs-queue-entry--playlist rounded-xl bg-ink-950/60 p-3"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, select, input, label')) return;
        onOpenDetails(game.id);
      }}
      onKeyDown={handleQueueEntryKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="w-8 text-center text-xs font-semibold text-slate-500">#{entry.queuePosition}</div>
        <QueueCoverThumbnail game={game} size="tiny" />
        <div className="min-w-0">
          <button className="block max-w-full truncate text-left font-semibold text-white hover:text-mint" onClick={() => onOpenDetails(game.id)} type="button">
            {game.title}
          </button>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <PlatformIdentityBadge accentColor={platformAccentColor} className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" platform={entry.targetPlatform} />
            <AchievementProgressBadge game={game} />
            <HltbBadge game={game} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="qs-platform-secondary-button qs-queue-entry-primary-action hidden items-center gap-1.5 text-slate-100 hover:bg-white/10 sm:inline-flex" style={{ borderColor: 'var(--platform-accent)', backgroundColor: 'color-mix(in srgb, var(--platform-accent) 14%, transparent)' }} onClick={onPlayNow} type="button">
            <Icon name="gamepad-2" />
            <span>{t('queue.playNow')}</span>
          </button>
          <PlatformOptionsMenu label="•••">
            {({ closeMenu }) => (
              <>
                <button className="qs-platform-menu-item" onClick={() => { onPlayNow(); closeMenu(); }} type="button">{t('queue.playNow')}</button>
                <button className="qs-platform-menu-item disabled:opacity-45" disabled={isFirstEntry} onClick={() => { onMoveEntry(game.id, entry.targetPlatform, 'top'); closeMenu(); }} type="button">{t('queue.top')}</button>
                <button className="qs-platform-menu-item disabled:opacity-45" disabled={isFirstEntry} onClick={() => { onMoveEntry(game.id, entry.targetPlatform, 'up'); closeMenu(); }} type="button">{t('settings.up')}</button>
                <button className="qs-platform-menu-item disabled:opacity-45" disabled={isLastEntry} onClick={() => { onMoveEntry(game.id, entry.targetPlatform, 'down'); closeMenu(); }} type="button">{t('settings.down')}</button>
                <label className="block">
                  <span className="qs-label-caps text-muted">{t('queue.movePlatform')}</span>
                  {platformOptions.length > 0 ? (
                    <select className="mt-1 h-8 w-full rounded border border-white/10 bg-ink-900 px-2 text-xs text-white outline-none focus:border-mint" value={platformOptions.includes(entry.targetPlatform) ? entry.targetPlatform : ''} onChange={(event) => { onMoveEntryToPlatform(game.id, entry.targetPlatform, event.target.value as GamePlatform); closeMenu(); }}>
                      {!platformOptions.includes(entry.targetPlatform) ? <option disabled value="">{entry.targetPlatform}</option> : null}
                      {platformOptions.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                    </select>
                  ) : <span className="text-xs text-slate-500">{t('queue.noActivePlatformsConfigured')}</span>}
                </label>
                <button className="qs-platform-menu-item qs-platform-menu-item--danger" onClick={() => { onRemoveEntry(game.id, entry.targetPlatform); closeMenu(); }} type="button">{t('action.remove')}</button>
              </>
            )}
          </PlatformOptionsMenu>
        </div>
      </div>
    </article>
  );
}

function QueueGameRow({
  game,
  onFindArtwork,
  onOpenDetails,
}: {
  game: Game;
  onFindArtwork?: (game: Game) => void;
  onOpenDetails: (gameId: string) => void;
}) {
  return (
    <article className="qs-platform-playing-row group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg p-2 text-sm transition">
      <div className="relative self-start">
        <button className="block text-left" onClick={() => onOpenDetails(game.id)} type="button">
          <QueueCoverThumbnail game={game} size="playing" />
        </button>
        {onFindArtwork ? <ArtworkRecoveryButton game={game} onFind={() => onFindArtwork(game)} compact /> : null}
      </div>
      <div className="min-w-0">
        <button className="qs-platform-playing-link block max-w-full truncate text-left text-base font-semibold" onClick={() => onOpenDetails(game.id)} type="button">
          {game.title}
        </button>
        <span className="qs-platform-playing-meta mt-1 block truncate text-xs">{game.platform}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <AchievementProgressBadge game={game} />
          <HltbBadge game={game} includeLabel />
        </div>

      </div>
    </article>
  );
}

function QueueCoverThumbnail({ game, size }: { game: Game; size: 'playing' | 'tiny' }) {
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [activeCoverSource, setActiveCoverSource] = useState<string | null>(null);
  const isPlayingSize = size === 'playing';
  const shouldShowMetadataBadges = isPlayingSize;
  const metacriticScore = shouldShowMetadataBadges ? formatQueueMetacriticScore(game.metacriticScore) : null;
  const rawgRating = shouldShowMetadataBadges ? getRawgRatingDisplay(game) : null;

  useEffect(() => {
    setIsCoverLoaded(false);
  }, [activeCoverSource]);

  return (
    <span
      aria-hidden="true"
      className={`qs-queue-cover-thumb relative block shrink-0 overflow-hidden rounded-md border bg-ink-800 ${
        isPlayingSize ? 'qs-platform-playing-cover h-20 w-[3.75rem] shadow-panel' : 'h-11 w-[2.0625rem] border-skyglass/15'
      }`}
    >
      {!isCoverLoaded ? <span className="absolute inset-0 animate-pulse bg-white/5" /> : null}
      <GameCoverImage
        alt=""
        className="relative z-[1] h-full w-full object-cover"
        diagnosticsContext="quest-queue"
        game={game}
        height={isPlayingSize ? 80 : 44}
        loading="lazy"
        onLoad={() => setIsCoverLoaded(true)}
        onResolvedSourceChange={setActiveCoverSource}
        usage="portrait"
        width={isPlayingSize ? 60 : 33}
      />
      {metacriticScore || rawgRating ? (
        <span className="pointer-events-none absolute bottom-0 left-0 z-[2] flex max-w-full flex-wrap items-end gap-0.5 bg-gradient-to-tr from-ink-950/85 via-ink-950/45 to-transparent p-0.5 pr-2 pt-2">
          <RatingBadgeStack game={game} metacriticScore={metacriticScore} />
        </span>
      ) : null}
    </span>
  );
}

const platformPlanGhostMessages = [
  'A plan without games is merely a dream.',
  'Queue Ghost recommends adding an adventure.',
  'The future awaits.',
] as const;

function formatQueueMetacriticScore(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value).toString() : null;
}


function pickQueueGhostMessage(messages: readonly string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}
