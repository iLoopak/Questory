import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { getControllerButtonLabels, type ControllerLayoutPreference } from '../lib/controllerLayoutPreferences';
import { useI18n, type TFunction } from '../i18n';
import { getGameCoverSources, getGeneratedFallbackCover } from '../lib/gameCoverImages';
import { useGamepadDetection } from '../hooks/useGamepadDetection';
import { BacklogPlatformPicker } from './BacklogPlatformPicker';
import type { PlatformQueueState } from '../lib/platformQueueStorage';
import { PlatformBadge } from './PlatformBadge';
import { getReviewSourceLabel, reviewSourceOptions, type ReviewModeState, type ReviewSource } from '../lib/reviewModeStorage';
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

export type ReviewModeActionContext = {
  queueGameIds?: string[];
};

type ReviewModePanelProps = {
  controllerLayout: ControllerLayoutPreference;
  games: Game[];
  ignoredGameIds: Set<string>;
  queuePlatforms: GamePlatform[];
  queueState?: PlatformQueueState;
  refreshingMetadataGameIds: Set<string>;
  reviewModeState: ReviewModeState;
  source: ReviewSource;
  onAction: (game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform, context?: ReviewModeActionContext) => void;
  onAddPlatform: (platform: GamePlatform) => void;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onRestoreIgnored: () => void;
  onSourceChange: (source: ReviewSource) => void;
};

const anyPlatform = 'Any platform';
const reviewSessionBatchSize = 20;

const negativeActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: IconName;
  label: string;
  tone: 'danger' | 'quiet';
}> = [
  { action: 'ignore', hint: '', icon: 'eye-off', label: 'Ignore', tone: 'danger' },
  { action: 'dropped', hint: '', icon: 'archive', label: 'Drop', tone: 'quiet' },
  { action: 'skip', hint: 'cancel', icon: 'chevrons-right', label: 'Skip', tone: 'quiet' },
];

const positiveActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: IconName;
  label: string;
  tone: 'accent' | 'neutral';
}> = [
  { action: 'queue', hint: 'primary', icon: 'list-plus', label: 'Add to Platform Plans', tone: 'accent' },
  { action: 'playing', hint: 'topFace', icon: 'gamepad-2', label: 'Playing Now', tone: 'accent' },
  { action: 'wishlist', hint: 'leftFace', icon: 'heart', label: 'Wishlist', tone: 'neutral' },
  { action: 'finished', hint: '', icon: 'trophy', label: 'Finished', tone: 'neutral' },
];

type SwipeHorizontalDirection = 'left' | 'right';
type SwipeVerticalDirection = 'up' | 'down';
type SwipeQuadrant = `${SwipeHorizontalDirection}-${SwipeVerticalDirection}`;

const actionDescriptions: Partial<Record<ReviewModeAction, string>> = {
  queue: 'Save for future play on a specific platform',
  playing: 'Currently part of your active rotation',
  ignore: 'Hide from future review queues',
  dropped: 'Stopped playing, not continuing',
  wishlist: 'Interested, but not ready to commit',
  finished: 'Completed or considered complete',
};

const decisionActions = [...negativeActions, ...positiveActions];
const decisionActionTypes = new Set<ReviewModeAction>(decisionActions.map((action) => action.action));
const firstPositiveActionIndex = negativeActions.length;
const swipeReleaseThreshold = 110;
const swipeVerticalDeadZone = 34;
const swipeCommitDelayMs = 180;
const dragStartScale = 0.85;
const minDragScale = 0.74;
// Derived from button arrays: top button = up gesture, bottom button = down gesture.
// Middle buttons (Drop, Playing Now, Wishlist) are click-only — no swipe gesture.
const futureSwipeZones: Record<SwipeHorizontalDirection, Array<{ action: ReviewModeAction; quadrant: SwipeQuadrant }>> = {
  left: [
    { action: negativeActions[0].action, quadrant: 'left-up' },
    { action: negativeActions[negativeActions.length - 1].action, quadrant: 'left-down' },
  ],
  right: [
    { action: positiveActions[0].action, quadrant: 'right-up' },
    { action: positiveActions[positiveActions.length - 1].action, quadrant: 'right-down' },
  ],
};

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

export function ReviewModePanel({
  controllerLayout,
  games,
  ignoredGameIds,
  queuePlatforms,
  queueState,
  refreshingMetadataGameIds,
  reviewModeState,
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
  const [sessionGameIds, setSessionGameIds] = useState<string[]>([]);
  const [reviewHistory, setReviewHistory] = useState<Array<{ action: ReviewModeAction; gameId: string }>>([]);
  const [actionStats, setActionStats] = useState<ReviewActionStats>(emptyReviewActionStats);
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(firstPositiveActionIndex);
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [isQueuePickerOpen, setIsQueuePickerOpen] = useState(false);
  const [isReviewOptionsOpen, setIsReviewOptionsOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [retainedUtilityGameIds, setRetainedUtilityGameIds] = useState<Set<string>>(() => new Set());
  const [showReviewHint, setShowReviewHint] = useState(() => localStorage.getItem('qs-review-hint-v1') !== 'dismissed');
  const queueButtonRef = useRef<HTMLButtonElement | null>(null);

  const reviewedGameIds = useMemo(() => new Set(Object.keys(reviewModeState.reviewedGames)), [reviewModeState.reviewedGames]);
  const queueOrderPositions = useMemo(() => new Map(reviewModeState.queueOrder.map((gameId, index) => [gameId, index])), [reviewModeState.queueOrder]);

  const platformOptions = useMemo(() => {
    return Array.from(new Set(games.map((game) => game.platform))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const baseSourceGames = useMemo(() => {
    return games
      .filter((game) => matchesReviewSource(game, source))
      .filter((game) => selectedPlatform === anyPlatform || game.platform === selectedPlatform)
      .filter((game) => !ignoredGameIds.has(game.id))
      .filter((game) => !reviewedGameIds.has(game.id))
      .sort((firstGame, secondGame) => {
        const firstQueuePosition = queueOrderPositions.get(firstGame.id);
        const secondQueuePosition = queueOrderPositions.get(secondGame.id);

        if (firstQueuePosition !== undefined || secondQueuePosition !== undefined) {
          return (firstQueuePosition ?? Number.MAX_SAFE_INTEGER) - (secondQueuePosition ?? Number.MAX_SAFE_INTEGER);
        }

        return compareReviewGames(firstGame, secondGame);
      });
  }, [games, ignoredGameIds, queueOrderPositions, reviewedGameIds, selectedPlatform, source]);

  const sourceGames = useMemo(() => {
    return games
      .filter((game) => matchesReviewSource(game, source) || retainedUtilityGameIds.has(game.id))
      .filter((game) => selectedPlatform === anyPlatform || game.platform === selectedPlatform)
      .filter((game) => !ignoredGameIds.has(game.id))
      .filter((game) => !reviewedGameIds.has(game.id) || retainedUtilityGameIds.has(game.id))
      .sort((firstGame, secondGame) => {
        const firstRetained = retainedUtilityGameIds.has(firstGame.id);
        const secondRetained = retainedUtilityGameIds.has(secondGame.id);

        if (firstRetained !== secondRetained) {
          return firstRetained ? -1 : 1;
        }

        const firstQueuePosition = queueOrderPositions.get(firstGame.id);
        const secondQueuePosition = queueOrderPositions.get(secondGame.id);

        if (firstQueuePosition !== undefined || secondQueuePosition !== undefined) {
          return (firstQueuePosition ?? Number.MAX_SAFE_INTEGER) - (secondQueuePosition ?? Number.MAX_SAFE_INTEGER);
        }

        return compareReviewGames(firstGame, secondGame);
      });
  }, [games, ignoredGameIds, queueOrderPositions, retainedUtilityGameIds, reviewedGameIds, selectedPlatform, source]);

  const sourceGamesById = useMemo(() => new Map(sourceGames.map((game) => [game.id, game])), [sourceGames]);

  const reviewQueue = useMemo(() => {
    return sessionGameIds
      .map((gameId) => sourceGamesById.get(gameId))
      .filter((game): game is Game => game !== undefined && !processedGameIds.has(game.id));
  }, [processedGameIds, sessionGameIds, sourceGamesById]);

  const sourceCounts = useMemo(() => {
    const counts = new Map<ReviewSource, number>();
    for (const s of reviewSourceOptions) {
      counts.set(s, games.filter((g) => matchesReviewSource(g, s)).length);
    }
    return counts;
  }, [games]);

  const activeGame = reviewQueue[0] ?? null;
  const isRefreshingCurrentGame = activeGame ? refreshingMetadataGameIds.has(activeGame.id) : false;
  const sourceLabel = getReviewSourceLabel(source);
  const completedCount = sessionGameIds.filter((gameId) => processedGameIds.has(gameId)).length;
  const totalCount = sessionGameIds.length;
  const lifetimeReviewedCount = Object.keys(reviewModeState.reviewedGames).length + completedCount;
  const fullRemainingCount = Math.max(0, baseSourceGames.length - completedCount);

  useEffect(() => {
    setProcessedGameIds(new Set());
    setSessionGameIds(baseSourceGames.slice(0, reviewSessionBatchSize).map((game) => game.id));
    setReviewHistory([]);
    setActionStats(emptyReviewActionStats);
    setHighlightedActionIndex(firstPositiveActionIndex);
    setIsQueuePickerOpen(false);
    setIsReviewOptionsOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
    setRetainedUtilityGameIds(new Set());
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
    onAction(game, action, note, targetPlatform, { queueGameIds: sessionGameIds });
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
      setRetainedUtilityGameIds((currentIds) => new Set(currentIds).add(game.id));
      setIsNoteOpen(true);
      return;
    }

    if (action === 'open-details') {
      setRetainedUtilityGameIds((currentIds) => new Set(currentIds).add(game.id));
      onAction(game, action);
      return;
    }

    if (!decisionActionTypes.has(action)) {
      setRetainedUtilityGameIds((currentIds) => new Set(currentIds).add(game.id));
      onAction(game, action);
      return;
    }

    advanceReview(game, action);
  }

  function submitNote() {
    if (!activeGame || !noteDraft.trim()) {
      return;
    }

    onAction(activeGame, 'note', noteDraft.trim());
    setIsNoteOpen(false);
    setNoteDraft('');
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

  function dismissReviewHint() {
    localStorage.setItem('qs-review-hint-v1', 'dismissed');
    setShowReviewHint(false);
  }

  return (
    <section className="qs-review-shell relative rounded-lg border border-skyglass/15 bg-ink-950/90">
      <div className="qs-review-overlay-controls absolute right-2 top-2 z-30 flex items-start gap-2 sm:right-3 sm:top-3">
        <div
          aria-label={`Quest Queue: ${completedCount} of ${totalCount} session games reviewed`}
          className="rounded-full border border-mint/30 bg-ink-950/85 px-3 py-1.5 text-center shadow-panel backdrop-blur-md"
        >
          <div className="text-sm font-bold text-mint leading-none">{totalCount === 0 ? '—' : `${completedCount} of ${totalCount}`}</div>
          {totalCount > 0 && <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-mint/50 leading-none">reviewed</div>}
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
                  Review Group
                  <select
                    className="h-10 rounded-md border border-skyglass/15 bg-ink-900 px-2 text-sm normal-case tracking-normal text-white outline-none transition focus:border-mint"
                    id="review-source"
                    value={source}
                    onChange={(event) => onSourceChange(event.target.value as ReviewSource)}
                  >
                    {reviewSourceOptions.map((option) => (
                      <option key={option} value={option}>
                        {getReviewSourceLabel(option)} ({sourceCounts.get(option) ?? 0})
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
                    Show hidden games
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col">
        {showReviewHint && (
          <div className="relative mx-2 mt-12 mb-1 rounded-xl border border-mint/20 bg-mint/5 p-3 text-xs">
            <button
              aria-label="Dismiss hint"
              className="absolute right-2 top-2 text-slate-500 transition hover:text-slate-300"
              onClick={dismissReviewHint}
              type="button"
            >
              <Icon name="x" size={14} />
            </button>
            <p className="pr-6 font-semibold text-mint">Not sure where to start?</p>
            <div className="mt-2 space-y-1 pr-6 text-slate-400">
              <p><span className="font-semibold text-slate-300">Platform Plans</span> — games you intend to play on a specific platform soon.</p>
              <p><span className="font-semibold text-slate-300">Playing Now</span> — games you're actively playing right now.</p>
              <p><span className="font-semibold text-slate-300">Wishlist</span> — interesting games you're not ready to commit to.</p>
              <p><span className="font-semibold text-slate-300">Drop / Ignore</span> — skip games you're not interested in.</p>
            </div>
          </div>
        )}
        <div className="qs-scroll-panel p-2 sm:p-3">
          {activeGame ? (
            <FocusedReviewCard
              key={activeGame.id}
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
              isRefreshingMetadata={isRefreshingCurrentGame}
            />
          ) : totalCount === 0 ? (
            <ReviewSourceEmpty source={source} onSourceChange={onSourceChange} />
          ) : (
            <ReviewComplete
              actionStats={actionStats}
              queuePlatforms={queuePlatforms}
              reviewedCount={completedCount}
              lifetimeReviewedCount={lifetimeReviewedCount}
              remainingCount={fullRemainingCount}
              sourceLabel={sourceLabel}
              onOpenQueue={onOpenQueue}
              onReturnToLibrary={onReturnToLibrary}
              onReviewAnother={() => {
                setProcessedGameIds(new Set());
                setReviewHistory([]);
                setActionStats(emptyReviewActionStats);
                setSessionGameIds(sourceGames.filter((game) => !processedGameIds.has(game.id)).slice(0, reviewSessionBatchSize).map((game) => game.id));
              }}
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
  isRefreshingMetadata,
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
  isRefreshingMetadata: boolean;
}) {
  const { t } = useI18n();
  const coverSources = getGameCoverSources(game);
  const fallbackCoverSource = getGeneratedFallbackCover(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const [swipeState, setSwipeState] = useState<SwipeState>(emptySwipeState);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const activeCoverSource = coverSources[coverSourceIndex];
  const isGeneratedFallbackActive = activeCoverSource === fallbackCoverSource;

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
    setSwipeState(emptySwipeState);
    swipeStartRef.current = null;
  }, [game.id, game.coverImage, game.wideCoverImage, game.heroImage, game.backgroundImage, game.steamAppId, game.title, game.platform]);

  const swipeTarget = getSwipeTarget(swipeState.offsetX, swipeState.offsetY);
  const swipeDirection = swipeTarget?.horizontal ?? getSwipeHorizontalDirection(swipeState.offsetX);
  const activeSwipeAction = swipeTarget?.action ?? null;
  const swipeProgress = Math.min(Math.abs(swipeState.offsetX) / swipeReleaseThreshold, 1);
  const isSwipeDragging = swipeState.phase === 'dragging';
  const isSwipeExiting = swipeState.phase === 'exiting';
  const isSwipeEngaged = isSwipeDragging || isSwipeExiting;
  const dragScale = isSwipeEngaged ? dragStartScale - (dragStartScale - minDragScale) * swipeProgress : 1;
  const rotation = Math.max(-10, Math.min(10, swipeState.offsetX / 18));
  const swipeStyle = {
    '--qs-swipe-x': `${swipeState.offsetX}px`,
    '--qs-swipe-y': `${swipeState.offsetY}px`,
    '--qs-swipe-rotate': `${rotation}deg`,
    '--qs-swipe-progress': swipeProgress,
    '--qs-swipe-scale': dragScale,
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

    setSwipeState({ offsetX: nextOffsetX, offsetY: nextOffsetY, phase: 'dragging' });

    const target = getSwipeTarget(nextOffsetX, nextOffsetY);
    if (target) {
      onHighlight(target.actionIndex);
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

    const target = Math.abs(swipeState.offsetX) >= swipeReleaseThreshold ? getSwipeTarget(swipeState.offsetX, swipeState.offsetY) : null;

    if (!target) {
      setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
      window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
      return;
    }

    if (target.action.action === 'queue') {
      // Skip exit animation for queue action — card stays visible while platform picker opens,
      // matching the button-tap experience exactly.
      setSwipeState(emptySwipeState);
      onAction('queue');
      return;
    }

    const exitX = target.horizontal === 'left' ? -window.innerWidth : window.innerWidth;
    const exitY = target.vertical === 'up' ? -window.innerHeight * 0.45 : window.innerHeight * 0.45;
    setSwipeState({ offsetX: exitX, offsetY: exitY, phase: 'exiting' });
    window.setTimeout(() => {
      setSwipeState(emptySwipeState);
      onAction(target.action.action);
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

  function handleInlineUtilityClick(event: ReactMouseEvent<HTMLButtonElement>, action: ReviewModeAction) {
    event.preventDefault();
    event.stopPropagation();
    onAction(action);
  }

  return (
    <article
      className={`qs-review-stage min-h-full ${isSwipeEngaged ? 'is-swipe-engaged' : ''}`}
      data-swipe-active={isSwipeEngaged ? swipeTarget?.quadrant ?? swipeDirection ?? 'none' : 'none'}
      data-swipe-left="negative"
      data-swipe-right="positive"
    >
      <section className={`qs-review-zone qs-review-zone-negative ${isSwipeEngaged && swipeDirection === 'left' ? 'qs-review-zone-active' : ''}`} aria-label={t('review.negativeActions')}>
        <div className="qs-review-zone-label">{t('review.discard')}</div>
        <div className="grid gap-2">
          {negativeActions.map((action, index) => {
            const isTarget = highlightedActionIndex === index;
            return (
              <button
                key={action.action}
                className={`qs-review-action qs-review-action-side min-h-[3.5rem] rounded-xl border px-3 py-2 text-center transition flex flex-col items-center justify-center gap-1 ${getActionClassName(action.tone, isTarget)} ${swipeTarget !== null && !isTarget ? 'opacity-30 pointer-events-none' : ''}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                type="button"
              >
                <div className="flex items-center gap-1.5 justify-center">
                  <Icon className="select-none" name={action.icon} />
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{getReviewActionLabel(action, t)}</span>
                </div>
                {actionDescriptions[action.action] && !hasGamepad && (
                  <span className="mt-0.5 block text-[9px] leading-none opacity-50">{actionDescriptions[action.action]}</span>
                )}
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

      <section
        className="qs-review-hero flex flex-col items-center"
        aria-label={`${game.title} Quest Queue card. Drag the cover or title left to Skip, left and up to Ignore, right to add to Platform Plans, or right and down to Finished.`}
      >
        <div
          className={`qs-review-identity-drag-region qs-review-swipe-card flex w-full flex-col items-center ${swipeState.phase === 'dragging' ? 'is-dragging' : ''} ${swipeState.phase === 'exiting' ? 'is-exiting' : ''} ${swipeState.phase === 'settling' ? 'is-settling' : ''}`}
          onPointerCancel={cancelSwipe}
          onPointerDown={beginSwipe}
          onPointerMove={updateSwipe}
          onPointerUp={finishSwipe}
          style={swipeStyle}
        >
          <div className="qs-review-cover relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-ink-900 shadow-panel">
            {isSwipeEngaged && activeSwipeAction ? (
              <div className={`qs-review-swipe-label qs-review-swipe-label-${swipeDirection}`} aria-hidden="true">
                {getReviewActionLabel(activeSwipeAction, t)}
              </div>
            ) : null}
            <div className="qs-review-artwork-frame relative h-full w-full">
              {activeCoverSource ? (
                <div className="relative h-full w-full">
                  {!isGeneratedFallbackActive && !isCoverLoaded ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-contain p-2"
                      decoding="async"
                      draggable={false}
                      src={fallbackCoverSource}
                    />
                  ) : null}
                  <img
                    alt={game.title}
                    className={`relative h-full w-full object-contain p-2 transition-opacity duration-300 ${
                      isGeneratedFallbackActive || isCoverLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    decoding="async"
                    draggable={false}
                    loading={isGeneratedFallbackActive ? 'eager' : 'lazy'}
                    onDragStart={(event) => event.preventDefault()}
                    onError={() => {
                      setIsCoverLoaded(false);
                      setCoverSourceIndex((currentIndex) => currentIndex + 1);
                    }}
                    onLoad={() => setIsCoverLoaded(true)}
                    src={activeCoverSource}
                  />
                  {isGeneratedFallbackActive && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-950/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 backdrop-blur-sm">
                      No artwork
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative h-full w-full">
                  <img
                    alt={game.title}
                    className="h-full w-full object-contain p-2"
                    decoding="async"
                    draggable={false}
                    src={fallbackCoverSource}
                  />
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink-950/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 backdrop-blur-sm">
                    No artwork
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


        <div className="mt-3 grid w-full gap-2 px-2 sm:grid-cols-2">
          <button
            className="min-h-11 rounded-xl border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:text-white focus-visible:border-mint"
            onClick={(event) => handleInlineUtilityClick(event, 'open-details')}
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Icon name="info" />
              <span>{t('review.details')}</span>
            </span>
          </button>
          <button
            className="min-h-11 rounded-xl border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:border-mint"
            onClick={(event) => handleInlineUtilityClick(event, 'note')}
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Icon name="pencil" />
              <span>{t('review.quickNote')}</span>
            </span>
          </button>
          <button
            className="min-h-11 rounded-xl border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:border-mint disabled:cursor-wait disabled:opacity-70"
            disabled={isRefreshingMetadata}
            onClick={(event) => handleInlineUtilityClick(event, 'enrich')}
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Icon name="refresh-cw" />
              <span>{isRefreshingMetadata ? t('action.refreshingMetadata') : t('action.refreshMetadata')}</span>
            </span>
          </button>
          <button
            className="min-h-11 rounded-xl border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white focus-visible:border-mint disabled:cursor-wait disabled:opacity-70"
            disabled={isRefreshingMetadata}
            onClick={(event) => handleInlineUtilityClick(event, 'find-artwork')}
            type="button"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Icon name="image" />
              <span>{isRefreshingMetadata ? t('artwork.searching') : t('artwork.findArtwork')}</span>
            </span>
          </button>
        </div>

        {isNoteOpen ? (
          <div className="mt-3 w-full rounded-xl border border-mint/20 bg-ink-950/80 p-3">
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
      </section>

      <section className={`qs-review-zone qs-review-zone-positive ${isSwipeEngaged && swipeDirection === 'right' ? 'qs-review-zone-active' : ''}`} aria-label={t('review.positiveActions')}>
        <div className="qs-review-zone-label">{t('review.keep')}</div>
        <div className="grid gap-2">
          {positiveActions.map((action, actionIndex) => {
            const index = firstPositiveActionIndex + actionIndex;
            const isTarget = highlightedActionIndex === index;

            return (
              <button
                key={action.action}
                className={`qs-review-action qs-review-action-side min-h-[3.5rem] rounded-xl border px-3 py-2 text-center transition flex flex-col items-center justify-center gap-1 ${getActionClassName(action.tone, isTarget)} ${swipeTarget !== null && !isTarget ? 'opacity-30 pointer-events-none' : ''}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                ref={action.action === 'queue' ? queueButtonRef : undefined}
                type="button"
              >
                <div className="flex items-center gap-1.5 justify-center">
                  <Icon className="select-none" name={action.icon} />
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{getReviewActionLabel(action, t)}</span>
                </div>
                {actionDescriptions[action.action] && !hasGamepad && (
                  <span className="mt-0.5 block text-[9px] leading-none opacity-50">{actionDescriptions[action.action]}</span>
                )}
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

function getSwipeHorizontalDirection(offsetX: number): SwipeHorizontalDirection | null {
  if (offsetX < -16) {
    return 'left';
  }

  if (offsetX > 16) {
    return 'right';
  }

  return null;
}

function getSwipeVerticalDirection(offsetY: number, horizontal: SwipeHorizontalDirection): SwipeVerticalDirection {
  if (offsetY < -swipeVerticalDeadZone) {
    return 'up';
  }

  if (offsetY > swipeVerticalDeadZone) {
    return 'down';
  }

  // Left default = 'down' → bottom button (Skip, gentle). Right default = 'up' → top button (Queue, primary).
  return horizontal === 'left' ? 'down' : 'up';
}

function getSwipeTarget(offsetX: number, offsetY: number) {
  const horizontal = getSwipeHorizontalDirection(offsetX);

  if (!horizontal) {
    return null;
  }

  const vertical = getSwipeVerticalDirection(offsetY, horizontal);
  const quadrant: SwipeQuadrant = `${horizontal}-${vertical}`;
  const actionType = futureSwipeZones[horizontal].find((zone) => zone.quadrant === quadrant)?.action ?? null;
  const action = actionType ? decisionActions.find((candidate) => candidate.action === actionType) ?? null : null;

  if (!action) {
    return null;
  }

  return {
    action,
    actionIndex: decisionActions.findIndex((candidate) => candidate.action === action.action),
    horizontal,
    quadrant,
    vertical,
  };
}

function ReviewSourceEmpty({
  source,
  onSourceChange,
}: {
  source: ReviewSource;
  onSourceChange: (source: ReviewSource) => void;
}) {
  const messages: Record<ReviewSource, { title: string; text: string }> = {
    backlog: {
      title: 'No games waiting for review',
      text: 'Quest Queue shows you one game at a time. For each game, you decide: add to a Platform Plan, drop it, send it to your Wishlist, or skip for now. Import games or add them manually to get started.',
    },
    'recent-imports': {
      title: 'No recent imports found',
      text: 'Import games from Steam or add them manually to see them here.',
    },
    'missing-metadata': {
      title: 'All games have covers and details',
      text: 'No games are currently missing covers or metadata.',
    },
    manual: {
      title: 'No manually added games',
      text: 'Games added manually outside of Steam or Retro will appear here.',
    },
    steam: {
      title: 'No Steam games found',
      text: 'Connect Steam and import your library to see games here.',
    },
    retro: {
      title: 'No retro games found',
      text: 'Import your retro ROM collection to see games here.',
    },
    'never-played': {
      title: "You've launched every game in this group",
      text: 'All your library games have some recorded play time.',
    },
    wishlist: {
      title: 'Your wishlist is empty',
      text: 'Add games to your Wishlist to review them here.',
    },
  };

  const { title, text } = messages[source] ?? messages.backlog;

  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Nothing here</div>
        <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{text}</p>
        {source !== 'backlog' && (
          <button
            className="mt-5 min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={() => onSourceChange('backlog')}
            type="button"
          >
            Switch to Want to Play
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewComplete({
  actionStats,
  queuePlatforms,
  reviewedCount,
  lifetimeReviewedCount,
  remainingCount,
  sourceLabel,
  onOpenQueue,
  onReturnToLibrary,
  onReviewAnother,
}: {
  actionStats: ReviewActionStats;
  queuePlatforms: GamePlatform[];
  reviewedCount: number;
  lifetimeReviewedCount: number;
  remainingCount: number;
  sourceLabel: string;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onReviewAnother: () => void;
}) {
  const { t } = useI18n();
  const hasStats = actionStats.queued > 0 || actionStats.playing > 0 || actionStats.wishlisted > 0 || actionStats.dropped > 0 || actionStats.ignored > 0;
  const noPlatformsWarning = actionStats.queued > 0 && queuePlatforms.length === 0;

  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Quest Queue Session Complete</div>
        <h3 className="mt-2 text-3xl font-semibold text-white">Great work!</h3>
        <p className="mt-3 text-sm text-slate-400">
          You reviewed {reviewedCount} {reviewedCount === 1 ? 'game' : 'games'} from {sourceLabel}{reviewedCount > 0 ? ' — every decision improves your library' : ''}.
        </p>
        {remainingCount > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Quest Queue reviews in focused 20-game sessions to keep decisions quick and manageable. {remainingCount} {remainingCount === 1 ? 'game remains' : 'games remain'} for your next session.
          </p>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-mint/30 bg-mint/10 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">This Session</div>
            <div className="mt-1 text-2xl font-semibold text-white">{reviewedCount}</div>
            <div className="text-xs text-slate-400">reviewed</div>
          </div>
          <div className="rounded-xl border border-skyglass/15 bg-ink-950/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lifetime</div>
            <div className="mt-1 text-2xl font-semibold text-white">{lifetimeReviewedCount}</div>
            <div className="text-xs text-slate-400">reviewed</div>
          </div>
          <div className="rounded-xl border border-skyglass/15 bg-ink-950/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Remaining</div>
            <div className="mt-1 text-2xl font-semibold text-white">{remainingCount}</div>
            <div className="text-xs text-slate-400">still waiting</div>
          </div>
        </div>
        {hasStats && (
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {actionStats.queued > 0 && <span className="rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-mint">{actionStats.queued} added to Platform Plans</span>}
            {actionStats.playing > 0 && <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-200">{actionStats.playing} marked Playing Now</span>}
            {actionStats.wishlisted > 0 && <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-200">{actionStats.wishlisted} added to Wishlist</span>}
            {actionStats.dropped > 0 && <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-400">{actionStats.dropped} dropped</span>}
            {actionStats.ignored > 0 && <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-400">{actionStats.ignored} ignored</span>}
          </div>
        )}
        {actionStats.queued > 0 && !noPlatformsWarning && (
          <div className="mt-4 rounded-xl border border-mint/20 bg-mint/5 p-3 text-center">
            <p className="text-sm text-slate-300">
              {actionStats.queued} {actionStats.queued === 1 ? 'game was' : 'games were'} added to Platform Plans — open it to see them and start playing.
            </p>
          </div>
        )}
        {noPlatformsWarning ? (
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-left">
            <div className="text-sm font-semibold text-amber-200">
              {actionStats.queued} {actionStats.queued === 1 ? 'game was' : 'games were'} sent to Platform Plans — but no platforms are configured yet.
            </div>
            <p className="mt-1 text-xs text-amber-100/70">Set up at least one platform so your queued games have somewhere to go.</p>
            <button
              className="mt-3 h-9 rounded-md bg-amber-300/80 px-4 text-sm font-semibold text-ink-950 transition hover:bg-amber-300"
              onClick={onOpenQueue}
              type="button"
            >
              Set Up Platform Plans
            </button>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint px-5 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={onOpenQueue}
            type="button"
          >
            Open Platform Plans
          </button>
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint/10 px-5 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onReviewAnother}
            type="button"
          >
            Continue Reviewing
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
    return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped' && game.status !== 'Playing';
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
  if (action.action === 'queue') return t('action.addToQueue');
  if (action.action === 'playing') return t('action.playingNow');
  if (action.action === 'wishlist') return t('wishlist.title');
  if (action.action === 'finished') return t('action.finished');
  if (action.action === 'ignore') return t('action.ignore');
  if (action.action === 'dropped') return t('action.drop');
  if (action.action === 'skip') return t('action.skip');
  return action.label;
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
