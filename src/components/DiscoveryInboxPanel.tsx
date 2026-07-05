import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useControllerAction } from '../lib/controllerActions';
import { useGamepadDetection } from '../hooks/useGamepadDetection';
import { isInteractiveOrOverlayActive, shouldIgnoreQuestQueueShortcut } from '../lib/keyboardShortcutGuards';
import type { DiscoveryInboxItem } from '../lib/discoveryInboxStorage';
import { Icon, type IconName } from './Icon';

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

type DiscoveryInboxAction = 'library' | 'wishlist' | 'plans' | 'ignore';

const negativeActions: ReadonlyArray<{
  readonly action: DiscoveryInboxAction;
  readonly icon: IconName;
  readonly label: string;
  readonly tone: 'danger';
}> = [
  { action: 'ignore', icon: 'eye-off', label: 'Ignore', tone: 'danger' },
];

const positiveActions: ReadonlyArray<{
  readonly action: DiscoveryInboxAction;
  readonly icon: IconName;
  readonly label: string;
  readonly tone: 'accent' | 'neutral';
}> = [
  { action: 'library', icon: 'library', label: 'Add to Library', tone: 'accent' },
  { action: 'wishlist', icon: 'heart', label: 'Add to Wishlist', tone: 'neutral' },
  { action: 'plans', icon: 'list-plus', label: 'Add to Platform Plans', tone: 'neutral' },
];

const decisionActions = [...negativeActions, ...positiveActions];
const firstPositiveActionIndex = negativeActions.length;

// ---------------------------------------------------------------------------
// Swipe mechanics — mirrors ReviewModePanel
// ---------------------------------------------------------------------------

type SwipePhase = 'idle' | 'dragging' | 'settling' | 'exiting';
type SwipeHorizontalDirection = 'left' | 'right';
type SwipeVerticalDirection = 'up' | 'down';
type SwipeQuadrant = `${SwipeHorizontalDirection}-${SwipeVerticalDirection}`;

type SwipeState = { offsetX: number; offsetY: number; phase: SwipePhase };
type SwipeStart = { pointerId: number; x: number; y: number };

const emptySwipeState: SwipeState = { offsetX: 0, offsetY: 0, phase: 'idle' };
const swipeReleaseThreshold = 110;
const swipeVerticalDeadZone = 34;
const swipeCommitDelayMs = 180;
const dragStartScale = 0.85;
const minDragScale = 0.74;

const discoverySwipeZones: Record<SwipeHorizontalDirection, ReadonlyArray<{ action: DiscoveryInboxAction; quadrant: SwipeQuadrant }>> = {
  left: [
    { action: 'ignore', quadrant: 'left-up' },
    { action: 'ignore', quadrant: 'left-down' },
  ],
  right: [
    { action: 'library', quadrant: 'right-up' },
    { action: 'plans', quadrant: 'right-down' },
  ],
};

function getSwipeHorizontalDirection(offsetX: number): SwipeHorizontalDirection | null {
  if (offsetX < -16) return 'left';
  if (offsetX > 16) return 'right';
  return null;
}

function getSwipeVerticalDirection(offsetY: number, horizontal: SwipeHorizontalDirection): SwipeVerticalDirection {
  if (offsetY < -swipeVerticalDeadZone) return 'up';
  if (offsetY > swipeVerticalDeadZone) return 'down';
  return horizontal === 'left' ? 'down' : 'up';
}

function getSwipeTarget(offsetX: number, offsetY: number) {
  const horizontal = getSwipeHorizontalDirection(offsetX);
  if (!horizontal) return null;
  const vertical = getSwipeVerticalDirection(offsetY, horizontal);
  const quadrant: SwipeQuadrant = `${horizontal}-${vertical}`;
  const zone = discoverySwipeZones[horizontal].find((z) => z.quadrant === quadrant);
  if (!zone) return null;
  const actionDef = decisionActions.find((a) => a.action === zone.action);
  if (!actionDef) return null;
  return {
    action: actionDef,
    actionIndex: decisionActions.findIndex((a) => a.action === actionDef.action),
    horizontal,
    quadrant,
    vertical,
  };
}

// ---------------------------------------------------------------------------
// Session stats
// ---------------------------------------------------------------------------

type SessionStats = { library: number; wishlist: number; plans: number; ignored: number };
const emptySessionStats: SessionStats = { library: 0, wishlist: 0, plans: 0, ignored: 0 };

function getNextStats(stats: SessionStats, action: DiscoveryInboxAction): SessionStats {
  if (action === 'library') return { ...stats, library: stats.library + 1 };
  if (action === 'wishlist') return { ...stats, wishlist: stats.wishlist + 1 };
  if (action === 'plans') return { ...stats, plans: stats.plans + 1 };
  return { ...stats, ignored: stats.ignored + 1 };
}

function getActionClassName(tone: 'accent' | 'neutral' | 'danger', isHighlighted: boolean): string {
  if (isHighlighted) return 'border-mint/70 bg-mint text-ink-950 shadow-glow';
  if (tone === 'accent') return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20';
  if (tone === 'danger') return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type Props = {
  items: DiscoveryInboxItem[];
  onAddToLibrary: (item: DiscoveryInboxItem) => void;
  onAddToWishlist: (item: DiscoveryInboxItem) => void;
  onAddToPlans: (item: DiscoveryInboxItem) => void;
  onIgnore: (item: DiscoveryInboxItem) => void;
};

export function DiscoveryInboxPanel({ items, onAddToLibrary, onAddToWishlist, onAddToPlans, onIgnore }: Props) {
  const hasGamepad = useGamepadDetection();
  const [sessionStats, setSessionStats] = useState<SessionStats>(emptySessionStats);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(firstPositiveActionIndex);

  const activeItem = items[0] ?? null;
  const totalCount = sessionReviewedCount + items.length;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreQuestQueueShortcut(event)) return;
      if (!activeItem) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setHighlightedActionIndex((i) =>
          i >= firstPositiveActionIndex
            ? firstPositiveActionIndex + ((i - firstPositiveActionIndex + 1) % positiveActions.length)
            : firstPositiveActionIndex,
        );
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setHighlightedActionIndex(0);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedActionIndex((i) => {
          const d = event.key === 'ArrowDown' ? 1 : -1;
          if (i >= firstPositiveActionIndex) {
            const pi = i - firstPositiveActionIndex;
            return firstPositiveActionIndex + ((pi + d + positiveActions.length) % positiveActions.length);
          }
          return (i + d + negativeActions.length) % negativeActions.length;
        });
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        performAction(activeItem, decisionActions[highlightedActionIndex].action);
        return;
      }

      if (event.key.toLowerCase() === 'l') { event.preventDefault(); performAction(activeItem, 'library'); return; }
      if (event.key.toLowerCase() === 'w') { event.preventDefault(); performAction(activeItem, 'wishlist'); return; }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); performAction(activeItem, 'plans'); return; }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'i') { event.preventDefault(); performAction(activeItem, 'ignore'); return; }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem, highlightedActionIndex]);

  const canReceiveControllerActions = !!activeItem && !isInteractiveOrOverlayActive();

  useControllerAction('pageNext', () => {
    if (activeItem) performAction(activeItem, 'ignore');
  }, { enabled: canReceiveControllerActions });

  function performAction(item: DiscoveryInboxItem, action: DiscoveryInboxAction) {
    setSessionStats((s) => getNextStats(s, action));
    setSessionReviewedCount((c) => c + 1);
    setHighlightedActionIndex(firstPositiveActionIndex);

    if (action === 'library') onAddToLibrary(item);
    else if (action === 'wishlist') onAddToWishlist(item);
    else if (action === 'plans') onAddToPlans(item);
    else onIgnore(item);
  }

  return (
    <section className="qs-review-shell relative rounded-lg border border-skyglass/15 bg-ink-950/90">
      <div className="qs-review-overlay-controls absolute right-2 top-2 z-30 flex items-start gap-2 sm:right-3 sm:top-3">
        <div
          aria-label={`Discovery Inbox: ${sessionReviewedCount} of ${totalCount} games triaged`}
          className="rounded-full border border-amber-400/30 bg-ink-950/85 px-3 py-1.5 text-center shadow-panel backdrop-blur-md"
        >
          <div className="text-sm font-bold text-amber-400 leading-none">
            {totalCount === 0 ? '—' : `${sessionReviewedCount} of ${totalCount}`}
          </div>
          {totalCount > 0 && (
            <div className="mt-0.5 text-2xs font-semibold uppercase tracking-widest text-amber-400/50 leading-none">
              triaged
            </div>
          )}
        </div>
      </div>

      <div className="qs-review-body flex flex-col">
        <div className="qs-scroll-panel p-2 sm:p-3">
          {activeItem ? (
            <FocusedDiscoveryCard
              key={activeItem.id}
              hasGamepad={hasGamepad}
              highlightedActionIndex={highlightedActionIndex}
              item={activeItem}
              onAction={(action) => performAction(activeItem, action)}
              onHighlight={setHighlightedActionIndex}
            />
          ) : totalCount === 0 ? (
            <InboxEmpty />
          ) : (
            <InboxComplete reviewedCount={sessionReviewedCount} stats={sessionStats} />
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Single-focus triage card
// ---------------------------------------------------------------------------

function FocusedDiscoveryCard({
  hasGamepad,
  highlightedActionIndex,
  item,
  onAction,
  onHighlight,
}: {
  hasGamepad: boolean;
  highlightedActionIndex: number;
  item: DiscoveryInboxItem;
  onAction: (action: DiscoveryInboxAction) => void;
  onHighlight: (index: number) => void;
}) {
  const { game } = item;
  const year = game.released?.match(/^(\d{4})/)?.[1] ?? null;
  const [swipeState, setSwipeState] = useState<SwipeState>(emptySwipeState);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const swipeStartRef = useRef<SwipeStart | null>(null);

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
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (swipeState.phase === 'exiting') return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea, summary')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'dragging' });
  }

  function updateSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId || swipeState.phase !== 'dragging') return;
    const nextOffsetX = event.clientX - swipeStart.x;
    const nextOffsetY = event.clientY - swipeStart.y;
    if (Math.abs(nextOffsetX) > 8) event.preventDefault();
    setSwipeState({ offsetX: nextOffsetX, offsetY: nextOffsetY, phase: 'dragging' });
    const nextTarget = getSwipeTarget(nextOffsetX, nextOffsetY);
    if (nextTarget) onHighlight(nextTarget.actionIndex);
  }

  function finishSwipe(event: ReactPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || swipeStart.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const target =
      Math.abs(swipeState.offsetX) >= swipeReleaseThreshold
        ? getSwipeTarget(swipeState.offsetX, swipeState.offsetY)
        : null;
    if (!target) {
      setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
      window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
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
    if (swipeStartRef.current?.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    setSwipeState({ offsetX: 0, offsetY: 0, phase: 'settling' });
    window.setTimeout(() => setSwipeState(emptySwipeState), swipeCommitDelayMs);
  }

  const displayedGenres = game.genres.slice(0, 3);
  const metacriticScore = typeof game.metacritic === 'number' && game.metacritic > 0 ? game.metacritic : null;

  return (
    <article
      className={`qs-review-stage min-h-full ${isSwipeEngaged ? 'is-swipe-engaged' : ''}`}
      data-swipe-active={isSwipeEngaged ? (swipeTarget?.quadrant ?? swipeDirection ?? 'none') : 'none'}
      data-swipe-left="negative"
      data-swipe-right="positive"
    >
      {/* Left zone — Ignore */}
      <section
        aria-label="Ignore"
        className={`qs-review-zone qs-review-zone-negative ${isSwipeEngaged && swipeDirection === 'left' ? 'qs-review-zone-active' : ''}`}
      >
        <div className="qs-review-zone-label">Ignore</div>
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
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{action.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Center — card */}
      <section
        aria-label={`${game.title} — Discovery Inbox card`}
        className="qs-review-hero flex flex-col items-center"
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
              <div
                aria-hidden="true"
                className={`qs-review-swipe-label qs-review-swipe-label-${swipeDirection}`}
              >
                {activeSwipeAction.label}
              </div>
            ) : null}
            <div className="qs-review-artwork-frame relative h-full w-full">
              {game.coverUrl ? (
                <img
                  alt={game.title}
                  className={`relative h-full w-full object-contain p-2 transition-opacity duration-300 ${isCoverLoaded ? 'opacity-100' : 'opacity-0'}`}
                  decoding="async"
                  draggable={false}
                  loading="lazy"
                  onDragStart={(e) => e.preventDefault()}
                  onLoad={() => setIsCoverLoaded(true)}
                  src={game.coverUrl}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Icon className="text-slate-700" name="gamepad-2" size={40} />
                </div>
              )}
              {metacriticScore ? (
                <div className="pointer-events-none absolute left-4 top-4 z-10">
                  <span className="rounded-full border border-mint/35 bg-ink-950/90 px-3 py-1 text-xs font-black leading-none text-mint shadow-glow backdrop-blur-md">
                    MC {metacriticScore}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 w-full px-2 text-center">
            <h3
              className="mt-2 text-2xl font-bold leading-snug text-white line-clamp-2 px-1 sm:text-3xl"
              title={game.title}
            >
              {game.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              {year && <span>{year}</span>}
              {displayedGenres.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-ink-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                >
                  {g}
                </span>
              ))}
              {game.hasSteamVersion && (
                <span className="flex items-center gap-0.5 text-slate-600">
                  <Icon name="steam" size={11} />
                  <span>Steam</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Recommendation reason */}
        {item.reason ? (
          <div className="mt-3 w-full rounded-xl border border-amber-400/15 bg-amber-400/5 px-4 py-3">
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 shrink-0 text-amber-400/70" name="sparkles" size={14} />
              <p className="text-xs leading-relaxed text-amber-200/70 italic">{item.reason}</p>
            </div>
          </div>
        ) : null}

        {hasGamepad ? (
          <div className="qs-gamepad-hints mt-4 flex flex-wrap items-center justify-center gap-2 qs-label-caps text-slate-400">
            <span>R2 Ignore</span>
            <span>•</span>
            <span>D-Pad choose action</span>
            <span>•</span>
            <span>A confirm</span>
          </div>
        ) : null}
      </section>

      {/* Right zone — Library, Wishlist, Platform Plans */}
      <section
        aria-label="Add game"
        className={`qs-review-zone qs-review-zone-positive ${isSwipeEngaged && swipeDirection === 'right' ? 'qs-review-zone-active' : ''}`}
      >
        <div className="qs-review-zone-label">Add</div>
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
                type="button"
              >
                <div className="flex items-center gap-1.5 justify-center">
                  <Icon className="select-none" name={action.icon} />
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{action.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Completion screen
// ---------------------------------------------------------------------------

function InboxComplete({ stats, reviewedCount }: { stats: SessionStats; reviewedCount: number }) {
  const hasStats = stats.library > 0 || stats.wishlist > 0 || stats.plans > 0 || stats.ignored > 0;
  const addedCount = stats.library + stats.wishlist + stats.plans;

  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-sm">
        <div className="text-xs font-semibold uppercase tracking-spread text-amber-400">
          Discovery Inbox Complete
        </div>
        <h3 className="mt-2 text-3xl font-semibold text-white">Inbox cleared!</h3>
        <p className="mt-3 text-sm text-slate-400">
          You triaged {reviewedCount} {reviewedCount === 1 ? 'recommendation' : 'recommendations'}.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
            <div className="qs-label-caps text-amber-400">Triaged</div>
            <div className="mt-1 text-2xl font-semibold text-white">{reviewedCount}</div>
            <div className="text-xs text-slate-400">this session</div>
          </div>
          <div className="rounded-xl border border-mint/30 bg-mint/10 p-3">
            <div className="qs-label-caps text-accent">Added</div>
            <div className="mt-1 text-2xl font-semibold text-white">{addedCount}</div>
            <div className="text-xs text-slate-400">to your collection</div>
          </div>
        </div>
        {hasStats && (
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {stats.library > 0 && (
              <span className="rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-mint">
                {stats.library} added to Library
              </span>
            )}
            {stats.wishlist > 0 && (
              <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-200">
                {stats.wishlist} added to Wishlist
              </span>
            )}
            {stats.plans > 0 && (
              <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-200">
                {stats.plans} added to Platform Plans
              </span>
            )}
            {stats.ignored > 0 && (
              <span className="rounded-full border border-skyglass/15 bg-ink-950/70 px-3 py-1 text-slate-400">
                {stats.ignored} ignored
              </span>
            )}
          </div>
        )}
        <p className="mt-6 text-xs text-slate-500">
          Browse the Home screen to discover more games worth adding.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function InboxEmpty() {
  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-sm">
        <Icon className="mx-auto text-slate-600" name="compass" size={40} />
        <h3 className="mt-3 text-xl font-semibold text-white">Discovery Inbox is clear</h3>
        <p className="mt-2 text-sm text-slate-400">
          Browse the Home screen recommendations and tap "Review Later" to queue games here.
        </p>
      </div>
    </div>
  );
}
