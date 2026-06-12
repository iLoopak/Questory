import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { getControllerButtonLabels, type ControllerLayoutPreference } from '../lib/controllerLayoutPreferences';
import { useI18n, type TFunction } from '../i18n';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { useGamepadDetection } from '../hooks/useGamepadDetection';
import { BacklogPlatformPicker } from './BacklogPlatformPicker';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { PlatformBadge } from './PlatformBadge';
import { getReviewSourceLabel, reviewSourceOptions, type ReviewSource } from '../lib/reviewModeStorage';
import type { Game, GamePlatform } from '../types/game';
import { Icon, type IconName } from './Icon';

export type ReviewModeAction =
  | 'queue'
  | 'playing'
  | 'wishlist'
  | 'finished'
  | 'dropped'
  | 'ignore'
  | 'enrich'
  | 'find-artwork'
  | 'open-details'
  | 'skip'
  | 'note';

type ReviewModePanelProps = {
  controllerLayout: ControllerLayoutPreference;
  games: Game[];
  ignoredGameIds: Set<string>;
  queuePlatforms: GamePlatform[];
  queueState?: PlatformQueueState;
  source: ReviewSource;
  onAction: (game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) => void;
  onAddPlatform: (platform: GamePlatform) => void;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onRestoreIgnored: () => void;
  onSourceChange: (source: ReviewSource) => void;
};

const anyPlatform = 'Any platform';

const negativeActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: IconName;
  label: string;
  tone: 'danger' | 'quiet';
}> = [
  { action: 'ignore', hint: '', icon: 'eye-off', label: 'Ignore', tone: 'danger' },
  { action: 'dropped', hint: '', icon: 'trash-2', label: 'Drop', tone: 'danger' },
  { action: 'skip', hint: 'cancel', icon: 'chevrons-right', label: 'Skip', tone: 'quiet' },
];

const positiveActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: IconName;
  label: string;
  tone: 'accent' | 'neutral';
}> = [
  { action: 'queue', hint: 'primary', icon: 'list-plus', label: 'Add to Platforms', tone: 'accent' },
  { action: 'playing', hint: 'topFace', icon: 'gamepad-2', label: 'Playing Now', tone: 'accent' },
  { action: 'wishlist', hint: 'leftFace', icon: 'heart', label: 'Wishlist', tone: 'neutral' },
  { action: 'finished', hint: '', icon: 'trophy', label: 'Finished', tone: 'neutral' },
];

const decisionActions = [...negativeActions, ...positiveActions];
const firstPositiveActionIndex = negativeActions.length;
const defaultSwipeLeftAction: ReviewModeAction = 'skip';
const defaultSwipeRightAction: ReviewModeAction = 'queue';
const swipeLeftActionIndex = negativeActions.findIndex((action) => action.action === defaultSwipeLeftAction);
const swipeRightActionIndex = firstPositiveActionIndex + positiveActions.findIndex((action) => action.action === defaultSwipeRightAction);
const swipeReleaseThreshold = 110;
const swipeCommitDelayMs = 180;

type ReviewActionStats = {
  dropped: number;
  ignored: number;
  playing: number;
  queued: number;
  wishlisted: number;
};

const emptyReviewActionStats: ReviewActionStats = {
  dropped: 0,
  ignored: 0,
  playing: 0,
  queued: 0,
  wishlisted: 0,
};

const secondaryActions: Array<{ action: ReviewModeAction; icon: IconName; label: string }> = [
  { action: 'open-details', icon: 'info', label: 'Open full details' },
  { action: 'enrich', icon: 'refresh-cw', label: 'Enrich metadata' },
  { action: 'find-artwork', icon: 'image', label: 'Find Artwork' },
  { action: 'note', icon: 'pencil', label: 'Add note' },
];

export function ReviewModePanel({
  controllerLayout,
  games,
  ignoredGameIds,
  queuePlatforms,
  queueState,
  source,
  onAction,
  onAddPlatform,
  onOpenQueue,
  onReturnToLibrary,
  onRestoreIgnored,
  onSourceChange,
}: ReviewModePanelProps) {
  const { t } = useI18n();
  const hasGamepad = useGamepadDetection();
  const buttonLabels = getControllerButtonLabels(controllerLayout);
  const [processedGameIds, setProcessedGameIds] = useState<Set<string>>(() => new Set());
  const [reviewHistory, setReviewHistory] = useState<Array<{ action: ReviewModeAction; gameId: string }>>([]);
  const [actionStats, setActionStats] = useState<ReviewActionStats>(emptyReviewActionStats);
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(firstPositiveActionIndex);
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [isQueuePickerOpen, setIsQueuePickerOpen] = useState(false);
  const [isReviewOptionsOpen, setIsReviewOptionsOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const queueButtonRef = useRef<HTMLButtonElement | null>(null);

  const platformOptions = useMemo(() => {
    return Array.from(new Set(games.map((game) => game.platform))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const sourceGames = useMemo(() => {
    return games
      .filter((game) => matchesReviewSource(game, source))
      .filter((game) => selectedPlatform === anyPlatform || game.platform === selectedPlatform)
      .filter((game) => !ignoredGameIds.has(game.id))
      .sort(compareReviewGames);
  }, [games, ignoredGameIds, selectedPlatform, source]);

  const reviewQueue = useMemo(() => {
    return sourceGames.filter((game) => !processedGameIds.has(game.id));
  }, [processedGameIds, sourceGames]);

  const activeGame = reviewQueue[0] ?? null;
  const sourceLabel = getReviewSourceLabel(source);
  const completedCount = sourceGames.length - reviewQueue.length;
  const totalCount = sourceGames.length;
  const progressLabel = totalCount === 0 ? '0 / 0' : `${Math.min(completedCount + 1, totalCount)} / ${totalCount}`;

  useEffect(() => {
    setProcessedGameIds(new Set());
    setReviewHistory([]);
    setActionStats(emptyReviewActionStats);
    setHighlightedActionIndex(firstPositiveActionIndex);
    setIsQueuePickerOpen(false);
    setIsReviewOptionsOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
  }, [selectedPlatform, source]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (isReviewOptionsOpen) {
        if (event.key === 'Escape' || event.key.toLowerCase() === 'b') {
          event.preventDefault();
          setIsReviewOptionsOpen(false);
        }
        return;
      }

      if (!activeGame) {
        return;
      }

      if (isQueuePickerOpen) {
        if (event.key === 'Escape' || event.key.toLowerCase() === 'b') {
          event.preventDefault();
          setIsQueuePickerOpen(false);
        }
        return;
      }

      if (isNoteOpen && (event.key === 'Escape' || event.key.toLowerCase() === 'b')) {
        event.preventDefault();
        setIsNoteOpen(false);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) =>
          currentIndex >= firstPositiveActionIndex
            ? firstPositiveActionIndex + ((currentIndex - firstPositiveActionIndex + 1) % positiveActions.length)
            : firstPositiveActionIndex,
        );
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) =>
          currentIndex < firstPositiveActionIndex ? (currentIndex + 1) % negativeActions.length : 0,
        );
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) => {
          const direction = event.key === 'ArrowDown' ? 1 : -1;

          if (currentIndex >= firstPositiveActionIndex) {
            const positiveIndex = currentIndex - firstPositiveActionIndex;
            return firstPositiveActionIndex + ((positiveIndex + direction + positiveActions.length) % positiveActions.length);
          }

          return (currentIndex + direction + negativeActions.length) % negativeActions.length;
        });
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        performAction(activeGame, decisionActions[highlightedActionIndex].action);
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        performAction(activeGame, 'queue');
        return;
      }

      if (event.key === 'Escape' || event.key.toLowerCase() === 'b') {
        event.preventDefault();
        performAction(activeGame, 'skip');
        return;
      }

      if (event.key.toLowerCase() === 'x') {
        event.preventDefault();
        performAction(activeGame, 'wishlist');
        return;
      }

      if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        performAction(activeGame, 'playing');
        return;
      }

      // L2/R2 gamepads are normalized to bracket keys so L1/R1 can stay global tab controls.
      if (event.key === ']') {
        event.preventDefault();
        performAction(activeGame, 'skip');
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        showPreviousGame();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, highlightedActionIndex, isNoteOpen, isQueuePickerOpen, isReviewOptionsOpen, reviewHistory]);

  function advanceReview(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) {
    onAction(game, action, note, targetPlatform);
    setProcessedGameIds((currentIds) => new Set(currentIds).add(game.id));
    setReviewHistory((currentHistory) => [...currentHistory, { action, gameId: game.id }]);
    setActionStats((currentStats) => getNextActionStats(currentStats, action));
    setHighlightedActionIndex(firstPositiveActionIndex);
    setIsQueuePickerOpen(false);
    setIsReviewOptionsOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
  }

  function showPreviousGame() {
    setReviewHistory((currentHistory) => {
      const previousReview = currentHistory.at(-1);

      if (!previousReview) {
        return currentHistory;
      }

      setProcessedGameIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(previousReview.gameId);
        return nextIds;
      });
      setActionStats((currentStats) => getPreviousActionStats(currentStats, previousReview.action));

      return currentHistory.slice(0, -1);
    });
  }

  function performAction(game: Game, action: ReviewModeAction) {
    if (action === 'queue') {
      setIsQueuePickerOpen(true);
      return;
    }

    if (action === 'note') {
      setIsNoteOpen(true);
      return;
    }

    if (action === 'open-details') {
      onAction(game, action);
      return;
    }

    advanceReview(game, action);
  }

  function submitNote() {
    if (!activeGame || !noteDraft.trim()) {
      return;
    }

    advanceReview(activeGame, 'note', noteDraft.trim());
  }

  function addToQueue(platform: GamePlatform) {
    if (!activeGame) {
      return;
    }

    advanceReview(activeGame, 'queue', undefined, platform);
  }

  function closeQueuePicker() {
    setIsQueuePickerOpen(false);
  }


  return (
    <section className="qs-review-shell relative overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/90 lg:h-[calc(100vh-74px)]">
      <div className="qs-review-overlay-controls absolute right-2 top-2 z-30 flex items-start gap-2 sm:right-3 sm:top-3">
        <div
          aria-label={`Quest Queue progress ${progressLabel}`}
          className="rounded-full border border-mint/30 bg-ink-950/85 px-3 py-1.5 text-sm font-bold text-mint shadow-panel backdrop-blur-md"
        >
          {progressLabel}
        </div>
        <div className="relative">
          <button
            aria-expanded={isReviewOptionsOpen}
            aria-label={t('review.options')}
            className="grid h-9 w-9 place-items-center rounded-full border border-skyglass/20 bg-ink-950/85 text-lg text-slate-100 shadow-panel backdrop-blur-md transition hover:border-mint/45 hover:text-white focus-visible:border-mint"
            onClick={() => setIsReviewOptionsOpen((isOpen) => !isOpen)}
            type="button"
          >
            <Icon name="settings" />
          </button>

          {isReviewOptionsOpen ? (
            <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-skyglass/15 bg-ink-950/95 p-3 text-left shadow-panel backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white">{t('review.options')}</h2>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {sourceLabel}
                </span>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor="review-source">
                  Status filter
                  <select
                    className="h-10 rounded-md border border-skyglass/15 bg-ink-900 px-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-mint"
                    id="review-source"
                    value={source}
                    onChange={(event) => onSourceChange(event.target.value as ReviewSource)}
                  >
                    {reviewSourceOptions.map((option) => (
                      <option key={option} value={option}>
                        {getReviewSourceLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400" htmlFor="review-platform">
                  Platform filter
                  <select
                    className="h-10 rounded-md border border-skyglass/15 bg-ink-900 px-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-mint"
                    id="review-platform"
                    value={selectedPlatform}
                    onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform | typeof anyPlatform)}
                  >
                    {[anyPlatform, ...platformOptions].map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{t('review.batchOptions')}</div>
                  <p className="mt-1 text-xs text-slate-400">{t('review.switchHelp')}</p>
                </div>

                {ignoredGameIds.size > 0 ? (
                  <button
                    className="min-h-10 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                    onClick={onRestoreIgnored}
                    type="button"
                  >
                    Restore ignored
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-full min-h-0 flex-col">
        <div className="qs-scroll-panel min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
          {activeGame ? (
            <FocusedReviewCard
              game={activeGame}
              hasGamepad={hasGamepad}
              highlightedActionIndex={highlightedActionIndex}
              isNoteOpen={isNoteOpen}
              noteDraft={noteDraft}
              onAction={(action) => performAction(activeGame, action)}
              onHighlight={setHighlightedActionIndex}
              onNoteDraftChange={setNoteDraft}
              onSubmitNote={submitNote}
              buttonLabels={buttonLabels}
              queueButtonRef={queueButtonRef}
              queuePlatforms={queuePlatforms}
              queueState={queueState}
            />
          ) : (
            <ReviewComplete
              actionStats={actionStats}
              reviewedCount={completedCount}
              sourceLabel={sourceLabel}
              onOpenQueue={onOpenQueue}
              onReturnToLibrary={onReturnToLibrary}
              onReviewAnother={() => onSourceChange('backlog')}
            />
          )}
        </div>
      </div>

      {activeGame ? (
        <BacklogPlatformPicker
          game={activeGame}
          isOpen={isQueuePickerOpen}
          platforms={queuePlatforms}
          restoreFocusRef={queueButtonRef}
          queueState={queueState}
          onAddPlatform={onAddPlatform}
          onClose={closeQueuePicker}
          onSelectPlatform={addToQueue}
        />
      ) : null}
    </section>
  );
}

function FocusedReviewCard({
  game,
  hasGamepad,
  highlightedActionIndex,
  isNoteOpen,
  noteDraft,
  onAction,
  onHighlight,
  onNoteDraftChange,
  onSubmitNote,
  buttonLabels,
  queueButtonRef,
  queuePlatforms,
  queueState,
}: {
  game: Game;
  hasGamepad: boolean;
  highlightedActionIndex: number;
  isNoteOpen: boolean;
  noteDraft: string;
  onAction: (action: ReviewModeAction) => void;
  onHighlight: (index: number) => void;
  onNoteDraftChange: (value: string) => void;
  onSubmitNote: () => void;
  buttonLabels: ReturnType<typeof getControllerButtonLabels>;
  queueButtonRef: RefObject<HTMLButtonElement | null>;
  queuePlatforms: GamePlatform[];
  queueState?: PlatformQueueState;
}) {
  const { t } = useI18n();
  const coverSources = getGameCoverSources(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [swipeState, setSwipeState] = useState<SwipeState>(emptySwipeState);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setSwipeState(emptySwipeState);
    swipeStartRef.current = null;
  }, [game.id]);

  const releaseLabel = game.releaseDate ?? game.released ?? null;
  const metadataRows = [
    ['Status', game.status],
    ['Collection', game.collectionType === 'wishlist' ? 'Wishlist' : 'Library'],
    ['Source', game.externalSource ?? 'manual'],
    ['Steam app', typeof game.steamAppId === 'number' ? String(game.steamAppId) : null],
    ['Imported', game.importedAt ?? null],
    ['Updated', game.updatedAt ?? null],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const releaseRows = [
    ['Release date', releaseLabel],
    ['Developers', game.developers?.join(', ') ?? null],
    ['Publishers', game.publishers?.join(', ') ?? null],
    ['Steam reviews', game.steamReviewInfo ?? null],
    ['Metacritic', typeof game.metacritic === 'number' ? String(game.metacritic) : null],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const genreLabels = [...(game.genres ?? []), ...(game.rawgTags ?? []), ...game.tags];

  const swipeDirection = getSwipeDirection(swipeState.offsetX);
  const activeSwipeAction = getSwipeActionForDirection(swipeDirection);
  const swipeProgress = Math.min(Math.abs(swipeState.offsetX) / swipeReleaseThreshold, 1);
  const rotation = Math.max(-10, Math.min(10, swipeState.offsetX / 18));
  const swipeStyle = {
    '--qs-swipe-x': `${swipeState.offsetX}px`,
    '--qs-swipe-y': `${swipeState.offsetY}px`,
    '--qs-swipe-rotate': `${rotation}deg`,
    '--qs-swipe-progress': swipeProgress,
  } as CSSProperties;

  function beginSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if (swipeState.phase === 'exiting') {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea, summary')) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    swipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'dragging' });
  }

  function updateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId || swipeState.phase !== 'dragging') {
      return;
    }

    const nextOffsetX = event.clientX - swipeStart.x;
    const nextOffsetY = event.clientY - swipeStart.y;

    if (Math.abs(nextOffsetX) > 8) {
      event.preventDefault();
    }

    setSwipeState({ offsetX: nextOffsetX, offsetY: nextOffsetY * 0.25, phase: 'dragging' });

    const direction = getSwipeDirection(nextOffsetX);
    if (direction === 'left') {
      onHighlight(swipeLeftActionIndex);
    }

    if (direction === 'right') {
      onHighlight(swipeRightActionIndex);
    }
  }

  function finishSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
      return;
    }

    swipeStartRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const direction = Math.abs(swipeState.offsetX) >= swipeReleaseThreshold ? getSwipeDirection(swipeState.offsetX) : null;
    const action = getSwipeActionForDirection(direction);

    if (!direction || !action) {
      setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
      window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
      return;
    }

    const exitX = direction === 'left' ? -window.innerWidth : window.innerWidth;
    setSwipeState({ offsetX: exitX, offsetY: swipeState.offsetY, phase: 'exiting' });
    window.setTimeout(() => {
      setSwipeState(emptySwipeState);
      onAction(action.action);
    }, swipeCommitDelayMs);
  }

  function cancelSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (swipeStartRef.current?.pointerId !== event.pointerId) {
      return;
    }

    swipeStartRef.current = null;
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
    window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
  }

  return (
    <article className="qs-review-stage min-h-full" data-swipe-active={swipeDirection ?? 'none'} data-swipe-left="negative" data-swipe-right="positive">
      <section className={`qs-review-zone qs-review-zone-negative ${swipeDirection === 'left' ? 'qs-review-zone-active' : ''}`} aria-label={t('review.negativeActions')}>
        <div className="qs-review-zone-label">{t('review.discard')}</div>
        <div className="grid gap-2">
          {negativeActions.map((action, index) => (
            <button
              key={action.action}
              className={`qs-review-action qs-review-action-side min-h-[3.5rem] rounded-xl border px-3 py-2 text-center transition flex flex-col items-center justify-center gap-1 ${getActionClassName(
                action.tone,
                highlightedActionIndex === index,
              )}`}
              onClick={() => onAction(action.action)}
              onFocus={() => onHighlight(index)}
              type="button"
            >
              <div className="flex items-center gap-1.5 justify-center">
                <Icon className="select-none" name={action.icon} />
                <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{getReviewActionLabel(action, t)}</span>
              </div>
              {hasGamepad && action.hint && (
                <span className="mt-1 block text-[9.5px] font-bold tracking-widest opacity-50 uppercase leading-none">
                  {action.hint in buttonLabels ? buttonLabels[action.hint as keyof typeof buttonLabels] : action.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section
        className={`qs-review-hero qs-review-swipe-card flex flex-col items-center ${swipeState.phase === 'dragging' ? 'is-dragging' : ''} ${swipeState.phase === 'exiting' ? 'is-exiting' : ''} ${swipeState.phase === 'settling' ? 'is-settling' : ''}`}
        aria-label={`${game.title} Quest Queue card. Drag left to Skip or right to Add to Platforms.`}
        onPointerCancel={cancelSwipe}
        onPointerDown={beginSwipe}
        onPointerMove={updateSwipe}
        onPointerUp={finishSwipe}
        style={swipeStyle}
      >
        <div className="qs-review-cover relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-ink-900 shadow-panel">
          {activeSwipeAction ? (
            <div className={`qs-review-swipe-label qs-review-swipe-label-${swipeDirection}`} aria-hidden="true">
              {getReviewActionLabel(activeSwipeAction, t)}
            </div>
          ) : null}
          <div className="qs-review-artwork-frame relative h-full w-full">
            {activeCoverSource ? (
              <div className="relative h-full w-full">
                {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
                <img
                  alt={game.title}
                  className={`h-full w-full object-contain p-2 transition-opacity duration-300 ${
                    isCoverLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  decoding="async"
                  draggable={false}
                  loading="lazy"
                  onDragStart={(event) => event.preventDefault()}
                  onError={() => {
                    setIsCoverLoaded(false);
                    setCoverSourceIndex((currentIndex) => currentIndex + 1);
                  }}
                  onLoad={() => setIsCoverLoaded(true)}
                  src={activeCoverSource}
                />
              </div>
            ) : (
              <div className="grid h-full place-items-center bg-ink-800 px-4 text-center">
                <div className="mx-auto grid h-24 w-24 place-items-center rounded-2xl border border-white/10 bg-ink-950 text-4xl font-semibold text-mint">
                  {game.title.slice(0, 1).toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 text-center w-full px-2">
          <div className="flex items-center justify-center gap-2">
            <PlatformBadge
              className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.1em]"
              platform={game.platform}
              queueState={queueState}
            />
          </div>
          <h3 className="mt-2 text-2xl font-bold leading-snug text-white line-clamp-2 px-1 sm:text-3xl" title={game.title}>
            {game.title}
          </h3>
        </div>

        {hasGamepad ? (
          <div className="qs-gamepad-hints mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            <span>{t('review.previous')}</span>
            <span>•</span>
            <span>{t('review.next')}</span>
            <span>•</span>
            <span>{t('review.dpadFocus')}</span>
            <span>•</span>
            <span>{buttonLabels.primary} {t('review.addToQueue')}</span>
          </div>
        ) : null}


        <details className="qs-review-details mt-3 rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-sm text-slate-300 w-full">
          <summary className="cursor-pointer select-none font-semibold text-slate-100">{t('review.details')}</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('review.metadata')}</div>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400">
                {metadataRows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-2">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words text-slate-300">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('review.releaseInfo')}</div>
              <dl className="mt-2 grid gap-1 text-xs text-slate-400">
                {releaseRows.length ? (
                  releaseRows.map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-2">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="min-w-0 break-words text-slate-300">{value}</dd>
                    </div>
                  ))
                ) : (
                  <div>{t('review.noReleaseInfo')}</div>
                )}
              </dl>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('review.genresTags')}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {genreLabels.length ? (
                  genreLabels.slice(0, 16).map((label) => (
                    <span key={label} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">{t('review.noGenreData')}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('review.notes')}</div>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-ink-950/70 p-3 text-xs text-slate-300">
                {game.notes || t('review.noNotes')}
              </p>
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{t('review.enrichEdit')}</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {secondaryActions.map((action) => (
                  <button
                    key={action.action}
                    className="min-h-11 rounded-lg border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                    onClick={() => onAction(action.action)}
                    type="button"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <Icon name={action.icon} />
                      <span>{action.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isNoteOpen ? (
            <div className="mt-3 rounded-xl border border-mint/20 bg-ink-950/80 p-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('review.quickNote')}</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  placeholder={t('review.notePlaceholder')}
                  value={noteDraft}
                />
              </label>
              <button
                className="mt-2 min-h-11 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                disabled={!noteDraft.trim()}
                onClick={onSubmitNote}
                type="button"
              >
                Save note and continue
              </button>
            </div>
          ) : null}
        </details>
      </section>

      <section className={`qs-review-zone qs-review-zone-positive ${swipeDirection === 'right' ? 'qs-review-zone-active' : ''}`} aria-label={t('review.positiveActions')}>
        <div className="qs-review-zone-label">{t('review.keep')}</div>
        <div className="grid gap-2">
          {positiveActions.map((action, actionIndex) => {
            const index = firstPositiveActionIndex + actionIndex;

            return (
              <button
                key={action.action}
                className={`qs-review-action qs-review-action-side min-h-[3.5rem] rounded-xl border px-3 py-2 text-center transition flex flex-col items-center justify-center gap-1 ${getActionClassName(
                  action.tone,
                  highlightedActionIndex === index,
                )}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                ref={action.action === 'queue' ? queueButtonRef : undefined}
                type="button"
              >
                <div className="flex items-center gap-1.5 justify-center">
                  <Icon className="select-none" name={action.icon} />
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{getReviewActionLabel(action, t)}</span>
                </div>
                {hasGamepad && action.hint && (
                  <span className="mt-1 block text-[9.5px] font-bold tracking-widest opacity-50 uppercase leading-none">
                    {action.hint in buttonLabels ? buttonLabels[action.hint as keyof typeof buttonLabels] : action.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </article>
  );
}

type SwipeDirection = 'left' | 'right';

type SwipePhase = 'idle' | 'dragging' | 'settling' | 'exiting';

type SwipeState = {
  offsetX: number;
  offsetY: number;
  phase: SwipePhase;
};

type SwipeStart = {
  pointerId: number;
  x: number;
  y: number;
};

const emptySwipeState: SwipeState = {
  offsetX: 0,
  offsetY: 0,
  phase: 'idle',
};

function getSwipeDirection(offsetX: number): SwipeDirection | null {
  if (offsetX < -16) {
    return 'left';
  }

  if (offsetX > 16) {
    return 'right';
  }

  return null;
}

function getSwipeActionForDirection(direction: SwipeDirection | null) {
  if (direction === 'left') {
    return negativeActions.find((action) => action.action === defaultSwipeLeftAction) ?? null;
  }

  if (direction === 'right') {
    return positiveActions.find((action) => action.action === defaultSwipeRightAction) ?? null;
  }

  return null;
}

function ReviewComplete({
  actionStats,
  reviewedCount,
  sourceLabel,
  onOpenQueue,
  onReturnToLibrary,
  onReviewAnother,
}: {
  actionStats: ReviewActionStats;
  reviewedCount: number;
  sourceLabel: string;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onReviewAnother: () => void;
}) {
  const { t } = useI18n();
  void actionStats;

  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{t('review.complete')}</div>
        <h3 className="mt-2 text-3xl font-semibold text-white">{sourceLabel} is clear</h3>
        <p className="mt-3 text-sm text-slate-400">Processed {reviewedCount} games into clearer platform decisions. Analytics stay in Stats.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint px-5 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={onOpenQueue}
            type="button"
          >
            Open Platforms
          </button>
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint/10 px-5 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onReviewAnother}
            type="button"
          >
            Process another batch
          </button>
          <button
            className="min-h-12 rounded-xl border border-skyglass/15 px-5 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onReturnToLibrary}
            type="button"
          >
            Return to Library
          </button>
        </div>
      </div>
    </div>
  );
}

function getNextActionStats(currentStats: ReviewActionStats, action: ReviewModeAction): ReviewActionStats {
  if (action === 'queue') {
    return { ...currentStats, queued: currentStats.queued + 1 };
  }

  if (action === 'playing') {
    return { ...currentStats, playing: currentStats.playing + 1 };
  }

  if (action === 'wishlist') {
    return { ...currentStats, wishlisted: currentStats.wishlisted + 1 };
  }

  if (action === 'dropped') {
    return { ...currentStats, dropped: currentStats.dropped + 1 };
  }

  if (action === 'ignore') {
    return { ...currentStats, ignored: currentStats.ignored + 1 };
  }

  return currentStats;
}

function getPreviousActionStats(currentStats: ReviewActionStats, action: ReviewModeAction): ReviewActionStats {
  if (action === 'queue') {
    return { ...currentStats, queued: Math.max(0, currentStats.queued - 1) };
  }

  if (action === 'playing') {
    return { ...currentStats, playing: Math.max(0, currentStats.playing - 1) };
  }

  if (action === 'wishlist') {
    return { ...currentStats, wishlisted: Math.max(0, currentStats.wishlisted - 1) };
  }

  if (action === 'dropped') {
    return { ...currentStats, dropped: Math.max(0, currentStats.dropped - 1) };
  }

  if (action === 'ignore') {
    return { ...currentStats, ignored: Math.max(0, currentStats.ignored - 1) };
  }

  return currentStats;
}

function matchesReviewSource(game: Game, source: ReviewSource) {
  if (source === 'backlog') {
    return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped';
  }

  if (source === 'recent-imports') {
    return Boolean(game.importedAt);
  }

  if (source === 'wishlist') {
    return game.collectionType === 'wishlist';
  }

  if (source === 'missing-metadata') {
    return game.metadataSource !== 'rawg' && !game.metadataManualManagedAt;
  }

  if (source === 'retro') {
    return game.externalSource === 'retro-rom';
  }

  if (source === 'steam') {
    return game.externalSource === 'steam' || game.externalSource === 'steam-wishlist' || typeof game.steamAppId === 'number';
  }

  if (source === 'manual') {
    return game.externalSource === 'manual';
  }

  return game.collectionType === 'library' && game.playtimeHours === 0 && !game.lastPlayedAt;
}

function compareReviewGames(firstGame: Game, secondGame: Game) {
  return getGameTime(secondGame.importedAt ?? secondGame.updatedAt) - getGameTime(firstGame.importedAt ?? firstGame.updatedAt);
}

function getGameTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function getReviewActionLabel(action: { action: ReviewModeAction; label: string }, t: TFunction) {
  return action.action === 'queue' ? t('action.addToQueue') : action.label;
}

function getActionClassName(tone: 'accent' | 'neutral' | 'danger' | 'quiet', isHighlighted: boolean) {
  if (isHighlighted) {
    return 'border-mint/70 bg-mint text-ink-950 shadow-glow';
  }

  if (tone === 'accent') {
    return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20';
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }

  if (tone === 'quiet') {
    return 'border-skyglass/15 bg-ink-900/60 text-slate-300 hover:bg-white/10 hover:text-white';
  }

  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}
