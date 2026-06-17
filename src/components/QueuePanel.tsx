import { Icon } from './Icon';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, KeyboardEvent, ReactNode, RefObject } from 'react';
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
  getPlatformTag,
  getQueuePlatforms,
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
import { getGameCoverSources } from '../lib/gameCoverImages';
import { AchievementProgressBadge } from './AchievementProgressBadge';
import { CollectionToolbar } from './CollectionToolbar';
import { PlatformBadge } from './PlatformBadge';
import { PlatformIdentityFields } from './PlatformIdentityFields';
import { HltbBadge } from './HltbBadge';
import { ViewportModal } from './ViewportModal';
import { useI18n } from '../i18n';
import { useVirtualWindow } from '../hooks/useVirtualWindow';

type QueuePanelProps = {
  games: Game[];
  initialPlatform?: GamePlatform;
  queueState: PlatformQueueState;
  onAddGameToQueue: (game: Game, platform: GamePlatform) => void;
  onLimitChange: (platform: GamePlatform, maxActiveGames: number) => void;
  onQueueStateChange: (state: PlatformQueueState) => void;
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
  onAddGameToQueue,
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
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | ''>(initialPlatform ?? queueState.activePlatforms[0] ?? '');
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const platformRefs = useRef(new Map<GamePlatform, HTMLElement>());
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [queueSearchTerm, setQueueSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<GamePlatform | 'All'>('All');
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const queuePlatforms = useMemo(() => getQueuePlatforms(games, queueState), [games, queueState]);
  const activeQueuePlatforms = useMemo(() => getActiveQueuePlatforms(queueState), [queueState]);
  const movePlatformOptions = activeQueuePlatforms;
  const queueGameIds = useMemo(() => new Set(queueState.entries.map((entry) => `${entry.gameId}::${entry.targetPlatform}`)), [queueState.entries]);
  const displayedQueuePlatforms = useMemo(() => {
    const visiblePlatforms = platformFilter === 'All' ? activeQueuePlatforms : activeQueuePlatforms.filter((platform) => platform === platformFilter);

    if (!initialPlatform || !visiblePlatforms.includes(initialPlatform)) {
      return visiblePlatforms;
    }

    return [initialPlatform, ...visiblePlatforms.filter((platform) => platform !== initialPlatform)];
  }, [activeQueuePlatforms, initialPlatform, platformFilter]);

  const normalizedQueueSearch = queueSearchTerm.trim().toLowerCase();
  const addableGames = games
    .filter((game) => game.collectionType === 'library' && (!selectedPlatform || !queueGameIds.has(`${game.id}::${selectedPlatform}`)))
    .filter((game) =>
      normalizedQueueSearch
        ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedQueueSearch)
        : true,
    )
    .sort((first, second) => first.title.localeCompare(second.title));

  useEffect(() => {
    if (!initialPlatform) {
      return;
    }

    setSelectedPlatform(initialPlatform);
    window.requestAnimationFrame(() => {
      platformRefs.current.get(initialPlatform)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [initialPlatform]);

  useEffect(() => {
    if (activeQueuePlatforms.length === 0) {
      setSelectedPlatform('');
      return;
    }

    if (!selectedPlatform || !activeQueuePlatforms.includes(selectedPlatform)) {
      setSelectedPlatform(activeQueuePlatforms[0]);
    }
  }, [activeQueuePlatforms, selectedPlatform]);

  function addQueuePlatform(platform: GamePlatform) {
    const nextState = addActiveQueuePlatform(queueState, platform);
    onQueueStateChange(nextState);
    setSelectedPlatform(platform);
    setCustomPlatformName('');
  }

  function addCustomQueuePlatform() {
    const platform = customPlatformName.trim() as GamePlatform;
    if (!platform) {
      return;
    }

    addQueuePlatform(platform);
  }

  function addSelectedGame() {
    const game = gamesById.get(selectedGameId);
    if (!game || !selectedPlatform || !activeQueuePlatforms.includes(selectedPlatform)) {
      return;
    }

    onAddGameToQueue(game, selectedPlatform);
    setSelectedGameId('');
  }

  return (
    <section className="qs-queue-shell flex min-w-0 flex-col rounded-lg border border-skyglass/15 bg-ink-900/70 p-2 sm:p-3">
      <CollectionToolbar
        title={t('queue.platforms')}
        searchValue={queueSearchTerm}
        searchPlaceholder={t('queue.findGame')}
        onSearchChange={setQueueSearchTerm}
        selects={[
          {
            label: t('toolbar.status'),
            value: 'Planned',
            options: ['Planned'],
            onChange: () => undefined,
          },
          {
            label: t('toolbar.platform'),
            value: platformFilter,
            options: ['All', ...activeQueuePlatforms],
            onChange: (value) => setPlatformFilter(value as GamePlatform | 'All'),
          },
        ]}
        primaryAction={
          <button
            aria-label={t('queue.addPlatform')}
            className="grid h-9 w-9 place-items-center rounded-md bg-mint text-ink-950 transition hover:bg-mint/90"
            onClick={() => setIsPlatformModalOpen(true)}
            title={t('queue.addPlatform')}
            type="button"
          >
            <Icon name="plus" size={18} strokeWidth={2.5} />
          </button>
        }
        actionMenu={
          <>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('queue.addGame')}</span>
              <select
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
                value={selectedGameId}
                onChange={(event) => setSelectedGameId(event.target.value)}
              >
                <option value="">{t('queue.chooseLibraryGame')}</option>
                {addableGames.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.title} - {game.platform}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('queue.targetPlatform')}</span>
              <select
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
                value={selectedPlatform}
                onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform)}
              >
                {activeQueuePlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="h-9 rounded-md bg-mint px-3 text-left text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              disabled={!selectedGameId || !selectedPlatform || !activeQueuePlatforms.includes(selectedPlatform)}
              onClick={addSelectedGame}
              type="button"
            >
              {t('queue.addGame')}
            </button>
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-left text-sm font-semibold text-mint transition hover:bg-mint/20"
              onClick={onStartReview}
              type="button"
            >
              {t('queue.buildReview')}
            </button>
            <details className="rounded-md border border-white/10 bg-ink-900 p-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-300">{t('queue.managePlatforms')}</summary>
              <div className="mt-2 grid gap-2">
                {queuePlatforms
                  .filter((platform) => !activeQueuePlatforms.includes(platform))
                  .slice(0, 12)
                  .map((platform) => (
                    <button
                      key={platform}
                      className="h-8 rounded-md border border-white/10 px-2 text-left text-xs font-semibold text-slate-200 hover:border-mint/40 hover:bg-mint/10 hover:text-mint"
                      onClick={() => addQueuePlatform(platform)}
                      type="button"
                    >
                      {platform}
                    </button>
                  ))}
                <label className="grid gap-2">
                  <span className="sr-only">{t('queue.customPlatform')}</span>
                  <input
                    className="h-8 min-w-0 rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
                    placeholder={t('queue.customPlatform')}
                    value={customPlatformName}
                    onChange={(event) => setCustomPlatformName(event.target.value)}
                  />
                  <button
                    className="h-8 rounded-md bg-mint px-3 text-xs font-semibold text-ink-950 hover:bg-mint/90 disabled:bg-slate-600 disabled:text-slate-300"
                    disabled={!customPlatformName.trim()}
                    onClick={addCustomQueuePlatform}
                    type="button"
                  >
                    {t('queue.addPlatform')}
                  </button>
                </label>
              </div>
            </details>
          </>
        }
      />
      <p className="-mt-1 mb-2 px-1 text-sm text-slate-400">{t('queue.platformBacklogHelp')}</p>

      {displayedQueuePlatforms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-mint/30 bg-mint/10 p-4 text-sm text-slate-200">
          <div className="font-semibold text-white">{t('queue.noPlatformsYet')}</div>
          <p className="mt-1 text-slate-300">{t('queue.noPlatformsCreateHelp')}</p>
          <button className="mt-3 h-9 rounded-md bg-mint px-3 text-sm font-semibold text-ink-950 hover:bg-mint/90" onClick={() => setIsPlatformModalOpen(true)} type="button">
            ＋ {t('queue.addPlatform')}
          </button>
        </div>
      ) : null}

      <div ref={queueListRef} className="qs-queue-list min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-2 xl:grid-cols-2">
          {displayedQueuePlatforms.map((platform) => (
            <PlatformQueueColumn
              key={platform}
              games={games}
              gamesById={gamesById}
              maxActiveGames={getPlatformMaxActiveGames(queueState, platform)}
              accentColor={getPlatformAccentColor(queueState, platform)}
              artworkUrl={getPlatformArtworkUrl(queueState, platform)}
              isHighlighted={platform === initialPlatform}
              platform={platform}
              platformTag={getPlatformTag(queueState, platform)}
              platformOptions={movePlatformOptions}
              setPlatformRef={(element) => {
                if (element) {
                  platformRefs.current.set(platform, element);
                } else {
                  platformRefs.current.delete(platform);
                }
              }}
              queueScrollRef={queueListRef}
              queueEntries={queueState.entries
                .filter((entry) => entry.targetPlatform === platform)
                .filter((entry) => {
                  const game = gamesById.get(entry.gameId);
                  return !normalizedQueueSearch || (game ? `${game.title} ${game.platform} ${game.status}`.toLowerCase().includes(normalizedQueueSearch) : false);
                })
                .sort(compareQueueEntries)}
              onHidePlatform={(platform) => onQueueStateChange(hideQueuePlatform(queueState, platform))}
              onLimitChange={onLimitChange}
              onMovePlatform={(platform, direction) => onQueueStateChange(moveQueuePlatform(queueState, platform, direction))}
              onRemovePlatform={(platform) => onQueueStateChange(removeQueuePlatform(queueState, platform))}
              onRenamePlatform={(platform, nextPlatform) => onQueueStateChange(renameQueuePlatform(queueState, platform, nextPlatform))}
              onMoveEntry={onMoveEntry}
              onMoveEntryToPlatform={onMoveEntryToPlatform}
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
            setPlatformFilter('All');
            setSelectedPlatform(platform);
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
  const previewArtworkUrl = artworkUrl || createPlatformArtworkPreset(previewName, accentColor, 'Aurora');

  function applyPresetPlatform(platform: GamePlatform) {
    const nextAccentColor = getDefaultPlatformAccentColor(platform);
    setPlatformName(platform);
    setAccentColor(nextAccentColor);
    setArtworkUrl(createPlatformArtworkPreset(platform, nextAccentColor, 'Aurora'));
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
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">{t('queue.platforms')}</div>
            <h2 className="mt-1 text-xl font-semibold text-white">{t('queue.addPlatform')}</h2>
            <p className="mt-1 text-sm text-slate-400">{t('queue.addPlatformHelp')}</p>
          </div>
          <button className="rounded-md border border-white/10 px-2 py-1 text-sm text-slate-300 hover:bg-white/10" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-ink-950/70">
          <div className="relative h-24">
            {previewArtworkUrl ? <img alt="" className="h-full w-full object-cover" src={previewArtworkUrl} /> : null}
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
        className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
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
  games,
  gamesById,
  accentColor,
  artworkUrl,
  maxActiveGames,
  isHighlighted,
  platform,
  platformOptions,
  platformTag,
  setPlatformRef,
  queueEntries,
  queueScrollRef,
  onHidePlatform,
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
  games: Game[];
  gamesById: Map<string, Game>;
  maxActiveGames: number;
  isHighlighted: boolean;
  platform: GamePlatform;
  platformOptions: GamePlatform[];
  platformTag: string;
  setPlatformRef: (element: HTMLElement | null) => void;
  queueEntries: PlatformQueueEntry[];
  queueScrollRef: RefObject<HTMLElement | null>;
  onHidePlatform: (platform: GamePlatform) => void;
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
  const playingNowLabel = t('nav.playingNow');
  const currentlyPlaying = games.filter((game) => game.status === 'Playing' && game.platform === platform);
  const queueEntriesVirtualizerRef = useRef<HTMLDivElement | null>(null);
  const virtualQueueEntries = useVirtualWindow({
    itemCount: queueEntries.length,
    estimateItemSize: 148,
    overscan: 5,
    scrollElementRef: queueScrollRef,
    virtualizerRef: queueEntriesVirtualizerRef,
  });
  const renderedQueueEntries = queueEntries.slice(virtualQueueEntries.startIndex, virtualQueueEntries.endIndex + 1);
  const hasGames = currentlyPlaying.length > 0 || queueEntries.length > 0;
  const platformAccentColor = accentColor || 'var(--accent)';
  const displayArtworkUrl = removePlatformArtworkWatermark(artworkUrl);
  const accentStyle = { '--platform-accent': platformAccentColor, borderColor: isHighlighted || hasGames ? platformAccentColor : undefined } as CSSProperties;

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    console.debug('[QuestShelf VirtualQueueList]', {
      label: `${platform} queue`,
      totalItems: queueEntries.length,
      renderedItemCount: renderedQueueEntries.length,
      virtualRangeStart: virtualQueueEntries.startIndex,
      virtualRangeEnd: virtualQueueEntries.endIndex,
      columns: 1,
      viewportHeight: virtualQueueEntries.viewportSize,
      containerHeight: queueScrollRef.current?.clientHeight ?? null,
    });
  }, [platform, queueEntries.length, queueScrollRef, renderedQueueEntries.length, virtualQueueEntries.endIndex, virtualQueueEntries.startIndex, virtualQueueEntries.viewportSize]);

  function renamePlatform() {
    const nextName = window.prompt(t('queue.renamePlatform'), platform);
    if (!nextName?.trim()) {
      return;
    }

    onRenamePlatform(platform, nextName.trim() as GamePlatform);
  }

  return (
    <section ref={setPlatformRef} style={accentStyle} className={`overflow-hidden rounded-lg border bg-ink-950/80 p-3 ${isHighlighted ? 'shadow-glow' : hasGames ? '' : 'border-skyglass/10 opacity-80'}`}>
      {displayArtworkUrl ? (
        <div className="relative -mx-3 -mt-3 mb-3 h-16 overflow-hidden border-b border-white/10">
          <img alt="" className="h-full w-full object-cover opacity-65" src={displayArtworkUrl} />
          <div className="absolute inset-0 bg-gradient-to-r from-ink-950/90 via-ink-950/45 to-ink-950/85" />
          <div className="absolute inset-x-0 bottom-0 flex min-w-0 p-3">
            <h3 className="max-w-full truncate rounded-full border border-white/10 bg-ink-950/80 px-3 py-1 text-base font-semibold leading-tight text-white shadow-panel backdrop-blur-sm">
              {platform}
            </h3>
          </div>
        </div>
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {!displayArtworkUrl ? <h3 className="truncate text-base font-semibold leading-tight text-white" style={{ color: platformAccentColor }}>{platform}</h3> : null}
          {platformTag ? <div className="mt-1 text-xs text-slate-500">Tag: {platformTag}</div> : null}
        </div>
        <PlatformOptionsMenu label={t('queue.options')}>
          {({ closeMenu }) => (
            <>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('queue.futureActiveLimit')}</span>
                <input
                  className="mt-1 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
                  min={1}
                  max={25}
                  type="number"
                  value={maxActiveGames}
                  onChange={(event) => onLimitChange(platform, Number(event.target.value))}
                />
              </label>
              <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => { onHidePlatform(platform); closeMenu(); }} type="button">{t('queue.hidePlatform')}</button>
              <button className="h-8 rounded-md border border-red-400/30 px-2 text-left text-xs text-red-100 hover:bg-red-500/10" onClick={() => { onRemovePlatform(platform); closeMenu(); }} type="button">{t('queue.removePlatform')}</button>
              <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => { renamePlatform(); closeMenu(); }} type="button">{t('queue.renamePlatform')}</button>
              <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => { onMovePlatform(platform, 'up'); closeMenu(); }} type="button">{t('queue.moveUp')}</button>
              <button className="h-8 rounded-md border border-white/10 px-2 text-left text-xs text-slate-200 hover:bg-white/10" onClick={() => { onMovePlatform(platform, 'down'); closeMenu(); }} type="button">{t('queue.moveDown')}</button>
            </>
          )}
        </PlatformOptionsMenu>
      </div>

      {currentlyPlaying.length > 0 ? (
        <div className="mb-3 grid w-full min-w-0 gap-2 border-b border-skyglass/15 pb-3">
          <div className="qs-platform-playing-panel w-full min-w-0 rounded-xl border p-3 shadow-panel">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="qs-platform-playing-title text-sm font-semibold uppercase tracking-[0.18em]">{playingNowLabel}</h4>
                <p className="qs-platform-playing-meta mt-1 text-xs">{currentlyPlaying.length} {currentlyPlaying.length === 1 ? t('queue.activeGame') : t('queue.activeGames')} · {platform}</p>
              </div>
              <span className="qs-platform-playing-chip rounded-full border px-2 py-1 text-xs font-semibold">{t('queue.activeList')}</span>
            </div>
            <div className="grid w-full min-w-0 gap-2">
              {currentlyPlaying.map((game) => (
                <QueueGameRow key={game.id} game={game} platform={platform} playingNowLabel={playingNowLabel} onAction={onPlayingAction} onOpenDetails={onOpenDetails} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div ref={queueEntriesVirtualizerRef} className="relative" style={{ height: virtualQueueEntries.totalSize }}>
        {queueEntries.length > 0 ? (
          <div className="absolute left-0 top-0 grid w-full gap-2" style={{ transform: `translateY(${virtualQueueEntries.offsetBefore}px)` }}>
            {renderedQueueEntries.map((entry) => {
              const game = gamesById.get(entry.gameId);
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
          <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
            {t('queue.noQueue')}
          </div>
        )}
      </div>
    </section>
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
      className="rounded-md border border-skyglass/15 bg-ink-950 p-2"
      onKeyDown={handleQueueEntryKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="w-8 pt-1 text-center text-xs font-semibold text-slate-500">#{entry.queuePosition}</div>
        <QueueCoverThumbnail game={game} size="tiny" />
        <div className="min-w-0">
          <button className="block max-w-full truncate text-left font-semibold text-white hover:text-mint" onClick={() => onOpenDetails(game.id)} type="button">
            {game.title}
          </button>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <PlatformBadge accentColor={platformAccentColor} className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold" platform={entry.targetPlatform} />
            <AchievementProgressBadge game={game} />
            <HltbBadge game={game} />
          </div>
        </div>
        <div className="col-span-3 flex flex-wrap gap-1 sm:col-auto">
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold text-slate-100 hover:bg-white/10" style={{ borderColor: 'var(--platform-accent)', backgroundColor: 'color-mix(in srgb, var(--platform-accent) 14%, transparent)' }} onClick={onPlayNow} type="button">
            <Icon name="gamepad-2" />
            <span>{t('queue.playNow')}</span>
          </button>
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, entry.targetPlatform, 'top')} type="button">
            {t('queue.top')}
          </button>
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, entry.targetPlatform, 'up')} type="button">
            {t('settings.up')}
          </button>
          <button className="h-9 rounded-md border border-white/10 px-2 text-xs text-slate-200 hover:bg-white/10" onClick={() => onMoveEntry(game.id, entry.targetPlatform, 'down')} type="button">
            {t('settings.down')}
          </button>
          <button className="h-9 rounded-md border border-red-400/30 px-2 text-xs text-red-100 hover:bg-red-500/10" onClick={() => onRemoveEntry(game.id, entry.targetPlatform)} type="button">
            {t('action.remove')}
          </button>
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('queue.movePlatform')}</summary>
        {platformOptions.length > 0 ? (
          <select
            className="mt-2 h-10 w-full rounded-md border border-white/10 bg-ink-900 px-2 text-sm text-white outline-none focus:border-mint"
            value={platformOptions.includes(entry.targetPlatform) ? entry.targetPlatform : ''}
            onChange={(event) => onMoveEntryToPlatform(game.id, entry.targetPlatform, event.target.value as GamePlatform)}
          >
            {!platformOptions.includes(entry.targetPlatform) ? (
              <option disabled value="">
                {entry.targetPlatform}
              </option>
            ) : null}
            {platformOptions.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        ) : (
          <div className="mt-2 rounded-md border border-dashed border-white/10 bg-ink-900/70 p-3 text-sm text-slate-300">
            <div className="font-semibold text-white">{t('queue.noActivePlatformsConfigured')}</div>
            <p className="mt-1 text-xs text-slate-400">{t('queue.managePlatformsHint')}</p>
          </div>
        )}
      </details>
    </article>
  );
}

function QueueGameRow({
  game,
  platform,
  playingNowLabel,
  onAction,
  onOpenDetails,
}: {
  game: Game;
  platform: GamePlatform;
  playingNowLabel: string;
  onAction: (gameId: string, platform: GamePlatform, action: PlayingGameAction) => void;
  onOpenDetails: (gameId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <article className="qs-platform-playing-row group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-2 text-sm transition">
      <button className="text-left" onClick={() => onOpenDetails(game.id)} type="button">
        <QueueCoverThumbnail game={game} size="playing" />
      </button>
      <div className="min-w-0">
        <button className="qs-platform-playing-link block max-w-full truncate text-left text-base font-semibold" onClick={() => onOpenDetails(game.id)} type="button">
          {game.title}
        </button>
        <span className="qs-platform-playing-label mt-1 block text-xs font-semibold uppercase tracking-[0.14em]">{playingNowLabel}</span>
        <span className="qs-platform-playing-meta mt-1 block truncate text-xs">{game.platform}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          <AchievementProgressBadge game={game} />
          <HltbBadge game={game} includeLabel />
        </div>
        <div className="mt-3 flex flex-wrap gap-1" aria-label={`${game.title} ${t('queue.currentlyPlayingActions')}`}>
          <button className="qs-platform-playing-secondary-action h-8 rounded-md border px-2 text-xs" onClick={() => onAction(game.id, platform, 'move-to-backlog')} type="button">{t('queue.moveToQueue')}</button>
          <button className="qs-platform-playing-action h-8 rounded-md border px-2 text-xs" onClick={() => onAction(game.id, platform, 'finished')} type="button">{t('action.finished')}</button>
          <button className="qs-platform-playing-drop-action h-8 rounded-md border px-2 text-xs" onClick={() => onAction(game.id, platform, 'drop')} type="button">{t('queue.drop')}</button>
          <button className="qs-platform-playing-secondary-action h-8 rounded-md border px-2 text-xs" onClick={() => onAction(game.id, platform, 'remove-from-playing')} type="button">{t('queue.removeFromPlaying')}</button>
        </div>
      </div>
    </article>
  );
}

function QueueCoverThumbnail({ game, size }: { game: Game; size: 'playing' | 'tiny' }) {
  const coverSources = useMemo(() => getGameCoverSources(game), [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];
  const isPlayingSize = size === 'playing';

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden rounded-md border bg-ink-800 ${
        isPlayingSize ? 'qs-platform-playing-cover h-20 w-[3.75rem] shadow-panel' : 'h-11 w-[2.0625rem] border-skyglass/15'
      }`}
    >
      {activeCoverSource ? (
        <>
          {!isCoverLoaded ? <span className="absolute inset-0 animate-pulse bg-white/5" /> : null}
          <img
            alt=""
            className={`h-full w-full object-cover transition-opacity duration-200 ${isCoverLoaded ? 'opacity-100' : 'opacity-0'}`}
            decoding="async"
            height={isPlayingSize ? 80 : 44}
            loading="lazy"
            onError={() => {
              setIsCoverLoaded(false);
              setCoverSourceIndex((currentIndex) => currentIndex + 1);
            }}
            onLoad={() => setIsCoverLoaded(true)}
            src={activeCoverSource}
            width={isPlayingSize ? 60 : 33}
          />
        </>
      ) : (
        <span className={`grid h-full w-full place-items-center font-semibold ${isPlayingSize ? 'qs-platform-playing-cover-fallback text-xl' : 'text-mint/80 text-xs'}`}>
          {game.title.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
