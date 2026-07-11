import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useControllerAction } from '../lib/controllerActions';
import { useGamepadDetection } from '../hooks/useGamepadDetection';
import { isInteractiveOrOverlayActive, shouldIgnoreQuestQueueShortcut } from '../lib/keyboardShortcutGuards';
import type { DiscoveryInboxItem } from '../lib/discoveryInboxStorage';
import { Icon } from './Icon';
import { QueueCompletionScreen, type QueueCompletionArtwork } from './QueueCompletionScreen';
import { DiscoveryScreenshotStrip } from './ScreenshotStrip';
import { useI18n } from '../i18n';
import { formatMessageTemplate } from '../utils/summaryFormatters';

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

type DiscoveryInboxAction = 'library' | 'wishlist' | 'plans' | 'ignore' | 'skip';

// Labels/descriptions are i18n keys, translated at render time.
const negativeActions = [
  { action: 'skip', icon: 'chevrons-right', labelKey: 'action.skip', tone: 'neutral' },
  { action: 'ignore', icon: 'eye-off', labelKey: 'action.ignore', tone: 'danger' },
] as const;

const positiveActions = [
  { action: 'library', icon: 'library', labelKey: 'preview.addToLibrary', tone: 'accent' },
  { action: 'wishlist', icon: 'heart', labelKey: 'preview.addToWishlist', tone: 'neutral' },
  { action: 'plans', icon: 'list-plus', labelKey: 'action.addToQueue', tone: 'neutral' },
] as const;

const actionDescriptionKeys = {
  library: 'discoveryInbox.modeLibrary',
  wishlist: 'discoveryInbox.modeWishlist',
  plans: 'discoveryInbox.modePlans',
  ignore: 'discoveryInbox.modeIgnore',
  skip: 'discoveryInbox.modeSkip',
} as const;

const decisionActions = [...negativeActions, ...positiveActions];
const firstPositiveActionIndex: number = negativeActions.length;

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
    { action: 'skip', quadrant: 'left-down' },
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

type SessionStats = { library: number; wishlist: number; plans: number; ignored: number; skipped: number };
const emptySessionStats: SessionStats = { library: 0, wishlist: 0, plans: 0, ignored: 0, skipped: 0 };

function getNextStats(stats: SessionStats, action: DiscoveryInboxAction): SessionStats {
  if (action === 'library') return { ...stats, library: stats.library + 1 };
  if (action === 'wishlist') return { ...stats, wishlist: stats.wishlist + 1 };
  if (action === 'plans') return { ...stats, plans: stats.plans + 1 };
  if (action === 'ignore') return { ...stats, ignored: stats.ignored + 1 };
  if (action === 'skip') return { ...stats, skipped: stats.skipped + 1 };
  return stats;
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
  onRequestRecommendations: () => void;
  isRequestingRecommendations: boolean;
  onSkip: (item: DiscoveryInboxItem) => void;
  onOpenTasteProfile?: () => void;
};

export function DiscoveryInboxPanel({ items, onAddToLibrary, onAddToWishlist, onAddToPlans, onIgnore, onRequestRecommendations, isRequestingRecommendations, onSkip, onOpenTasteProfile }: Props) {
  const hasGamepad = useGamepadDetection();
  const [sessionStats, setSessionStats] = useState<SessionStats>(emptySessionStats);
  const [sessionReviewedCount, setSessionReviewedCount] = useState(0);
  const [sessionArtwork, setSessionArtwork] = useState<QueueCompletionArtwork[]>([]);
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(firstPositiveActionIndex);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

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
      if (event.key.toLowerCase() === 's') { event.preventDefault(); performAction(activeItem, 'skip'); return; }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'i') { event.preventDefault(); performAction(activeItem, 'ignore'); return; }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem, highlightedActionIndex]);

  useEffect(() => {
    if (activeItem && hasGamepad) {
      primaryButtonRef.current?.focus({ preventScroll: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.id]);

  const canReceiveControllerActions = !!activeItem && !isInteractiveOrOverlayActive();

  useControllerAction('pageNext', () => {
    if (activeItem) performAction(activeItem, 'ignore');
  }, { enabled: canReceiveControllerActions });

  function performAction(item: DiscoveryInboxItem, action: DiscoveryInboxAction) {
    setHighlightedActionIndex(firstPositiveActionIndex);

    setSessionStats((s) => getNextStats(s, action));
    setSessionReviewedCount((c) => c + 1);
    setSessionArtwork((current) => appendDiscoveryCompletionArtwork(current, item));

    if (action === 'skip') {
      onSkip(item);
      return;
    }

    if (action === 'library') onAddToLibrary(item);
    else if (action === 'wishlist') onAddToWishlist(item);
    else if (action === 'plans') onAddToPlans(item);
    else onIgnore(item);
  }

  return (
    <section className="qs-review-shell relative rounded-lg border border-skyglass/15 bg-ink-950/90">
      <div className="qs-review-overlay-controls absolute right-2 top-2 z-30 flex items-start gap-2 sm:right-3 sm:top-3">
        {onOpenTasteProfile ? (
          <button
            className="rounded-full border border-mint/30 bg-ink-950/85 px-3 py-1.5 text-xs font-bold text-mint shadow-panel backdrop-blur-md transition hover:bg-mint/10"
            onClick={onOpenTasteProfile}
            type="button"
          >
            Gaming DNA
          </button>
        ) : null}
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
              primaryButtonRef={primaryButtonRef}
              onAction={(action) => performAction(activeItem, action)}
              onHighlight={setHighlightedActionIndex}
            />
          ) : totalCount === 0 ? (
            <InboxEmpty isRequestingRecommendations={isRequestingRecommendations} onRequestRecommendations={onRequestRecommendations} />
          ) : (
            <InboxComplete artwork={sessionArtwork} isRequestingRecommendations={isRequestingRecommendations} onRequestRecommendations={onRequestRecommendations} reviewedCount={sessionReviewedCount} stats={sessionStats} />
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
  primaryButtonRef,
  onAction,
  onHighlight,
}: {
  hasGamepad: boolean;
  highlightedActionIndex: number;
  item: DiscoveryInboxItem;
  primaryButtonRef: RefObject<HTMLButtonElement | null>;
  onAction: (action: DiscoveryInboxAction) => void;
  onHighlight: (index: number) => void;
}) {
  const { t } = useI18n();
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
      {/* Left zone — Skip / Ignore */}
      <section
        aria-label={`${t('action.skip')} / ${t('action.ignore')}`}
        className={`qs-review-zone qs-review-zone-negative ${isSwipeEngaged && swipeDirection === 'left' ? 'qs-review-zone-active' : ''}`}
      >
        <div className="qs-review-zone-label">{t('action.ignore')}</div>
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
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{t(action.labelKey)}</span>
                </div>
                {!hasGamepad && (
                  <span className="mt-0.5 block text-2xs leading-none opacity-50">
                    {t(actionDescriptionKeys[action.action])}
                  </span>
                )}
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
            {/* Blurred cover used as hero background — mirrors Quest Queue's heroBgUrl treatment */}
            {game.coverUrl ? (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <img
                  alt=""
                  className="h-full w-full object-cover opacity-[0.18] blur-md"
                  decoding="async"
                  draggable={false}
                  loading="lazy"
                  src={game.coverUrl}
                />
              </div>
            ) : null}
            {isSwipeEngaged && activeSwipeAction ? (
              <div
                aria-hidden="true"
                className={`qs-review-swipe-label qs-review-swipe-label-${swipeDirection}`}
              >
                {t(activeSwipeAction.labelKey)}
              </div>
            ) : null}
            <div className="qs-review-artwork-frame relative h-full w-full">
              {game.coverUrl ? (
                <div className="relative h-full w-full">
                  {/* Shimmer shown while main image loads */}
                  {!isCoverLoaded ? (
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 animate-pulse rounded-xl bg-white/5"
                    />
                  ) : null}
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
                </div>
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

        {/* Screenshot strip — helps decide if the game is worth adding before committing */}
        <DiscoveryScreenshotStrip
          className="mt-3 w-full px-2"
          rawgId={game.rawgId}
          title={game.title}
        />

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
            <span>{t('discoveryInbox.hintIgnore')}</span>
            <span>•</span>
            <span>{t('discoveryInbox.hintChoose')}</span>
            <span>•</span>
            <span>{t('discoveryInbox.hintConfirm')}</span>
          </div>
        ) : null}
      </section>

      {/* Right zone — Library, Wishlist, Platform Plans */}
      <section
        aria-label={t('discoveryInbox.zoneAddA11y')}
        className={`qs-review-zone qs-review-zone-positive ${isSwipeEngaged && swipeDirection === 'right' ? 'qs-review-zone-active' : ''}`}
      >
        <div className="qs-review-zone-label">{t('discoveryInbox.zoneAdd')}</div>
        <div className="grid gap-2">
          {positiveActions.map((action, actionIndex) => {
            const index = firstPositiveActionIndex + actionIndex;
            const isTarget = highlightedActionIndex === index;
            const isLibrary = action.action === 'library';
            return (
              <button
                key={action.action}
                ref={isLibrary ? primaryButtonRef : undefined}
                className={`qs-review-action qs-review-action-side min-h-[3.5rem] rounded-xl border px-3 py-2 text-center transition flex flex-col items-center justify-center gap-1 ${getActionClassName(action.tone, isTarget)} ${swipeTarget !== null && !isTarget ? 'opacity-30 pointer-events-none' : ''}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                type="button"
              >
                <div className="flex items-center gap-1.5 justify-center">
                  <Icon className="select-none" name={action.icon} />
                  <span className="font-bold text-xs sm:text-sm tracking-wide leading-none">{t(action.labelKey)}</span>
                </div>
                {!hasGamepad && (
                  <span className="mt-0.5 block text-2xs leading-none opacity-50">
                    {t(actionDescriptionKeys[action.action])}
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

function appendDiscoveryCompletionArtwork(current: QueueCompletionArtwork[], item: DiscoveryInboxItem): QueueCompletionArtwork[] {
  const url = item.game.coverUrl?.trim();
  const gameKey = getDiscoveryArtworkGameKey(item);
  if (!url || current.some((artwork) => artwork.url === url || artwork.gameKey === gameKey)) return current;
  return [...current, { alt: item.game.title, gameKey, id: item.id, url }];
}

function getDiscoveryArtworkGameKey(item: DiscoveryInboxItem): string {
  if (typeof item.rawgId === 'number') return `rawg:${item.rawgId}`;

  const normalizedTitle = normalizeDiscoveryArtworkIdentity(item.game.title);
  const normalizedPlatform = normalizeDiscoveryArtworkIdentity(item.game.platforms[0]);
  return normalizedPlatform ? `title-platform:${normalizedPlatform}:${normalizedTitle}` : `title:${normalizedTitle}`;
}

function normalizeDiscoveryArtworkIdentity(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Completion screen
// ---------------------------------------------------------------------------

function InboxComplete({ artwork, stats, reviewedCount, isRequestingRecommendations, onRequestRecommendations }: { artwork: QueueCompletionArtwork[]; stats: SessionStats; reviewedCount: number; isRequestingRecommendations: boolean; onRequestRecommendations: () => void }) {
  const { t } = useI18n();
  const addedCount = stats.library + stats.wishlist + stats.plans;
  const chipConfigs = [
    stats.library > 0 ? { label: formatMessageTemplate(t('discoveryInbox.completeAddedLibrary'), { count: stats.library }), tone: 'accent' as const, value: stats.library } : null,
    stats.wishlist > 0 ? { label: formatMessageTemplate(t('discoveryInbox.completeAddedWishlist'), { count: stats.wishlist }), tone: 'neutral' as const, value: stats.wishlist } : null,
    stats.plans > 0 ? { label: formatMessageTemplate(t('discoveryInbox.completeAddedPlans'), { count: stats.plans }), tone: 'neutral' as const, value: stats.plans } : null,
    stats.ignored > 0 ? { label: formatMessageTemplate(t('discoveryInbox.completeIgnored'), { count: stats.ignored }), tone: 'muted' as const, value: stats.ignored } : null,
    stats.skipped > 0 ? { label: formatMessageTemplate(t('discoveryInbox.completeSkipped'), { count: stats.skipped }), tone: 'muted' as const, value: stats.skipped } : null,
  ].filter((chip): chip is NonNullable<typeof chip> => chip !== null);

  return (
    <QueueCompletionScreen
      artwork={artwork}
      eyebrow={t('discoveryInbox.completeKicker')}
      footer={t('discoveryInbox.completeBrowseMore')}
      heading={t('discoveryInbox.completeTitle')}
      state="queue-empty"
      summary={formatMessageTemplate(
        t(reviewedCount === 1 ? 'discoveryInbox.completeTriagedOne' : 'discoveryInbox.completeTriagedMany'),
        { count: reviewedCount },
      )}
      stats={[
        { label: t('discoveryInbox.completeTriagedLabel'), value: reviewedCount, helper: t('discoveryInbox.completeThisSession'), tone: 'warm' },
        { label: t('discoveryInbox.completeAddedLabel'), value: addedCount, helper: t('discoveryInbox.completeToCollection'), tone: 'accent' },
      ]}
      chips={chipConfigs}
      actions={[{
        label: isRequestingRecommendations ? t('discoveryInbox.findingRecommendations') : t('discoveryInbox.getMoreRecommendations'),
        onClick: onRequestRecommendations,
        variant: 'secondary',
      }]}
    />
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function InboxEmpty({ isRequestingRecommendations, onRequestRecommendations }: { isRequestingRecommendations: boolean; onRequestRecommendations: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-sm">
        <Icon className="mx-auto text-slate-600" name="compass" size={40} />
        <h3 className="mt-3 text-xl font-semibold text-white">{t('discoveryInbox.emptyTitle')}</h3>
        <p className="mt-2 text-sm text-slate-400">
          {t('discoveryInbox.emptyHint')}
        </p>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{t('discoveryInbox.recommendationsCopy')}</p>
        <div className="mt-4">
          <RecommendationCta
            isLoading={isRequestingRecommendations}
            label={t('discoveryInbox.getRecommendations')}
            onClick={onRequestRecommendations}
          />
        </div>
      </div>
    </div>
  );
}

function RecommendationCta({ isLoading, label, onClick }: { isLoading: boolean; label: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-4 text-sm font-bold text-amber-100 shadow-panel transition hover:border-amber-300/55 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isLoading}
      onClick={onClick}
      type="button"
    >
      <Icon className={isLoading ? 'animate-spin' : ''} name={isLoading ? 'refresh-cw' : 'sparkles'} size={16} />
      <span>{isLoading ? t('discoveryInbox.findingRecommendations') : label}</span>
    </button>
  );
}
