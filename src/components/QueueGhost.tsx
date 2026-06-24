import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

const GHOST_MESSAGES = [
  'Queue Ghost never forgets.',
  'The backlog remembers.',
  'Some games remain unfinished for a reason.',
  '*stares at your queue*',
  'The backlog does not judge.\nIt only waits.',
  'Every unfinished game is a promise.',
  'Somewhere in the queue, a masterpiece gathers dust.',
] as const;

const GHOST_SESSION_KEY = 'qs-ghost-v1';

export type QueueGhostVariant = 'default' | 'cover' | 'sleepy' | 'panic' | 'achievement' | 'midnight' | 'peek';

export type QueueGhostHabitat =
  | 'home'
  | 'questQueue'
  | 'achievements'
  | 'platformPlans'
  | 'gameDetail'
  | 'wishlist'
  | 'library';

let activeQueueGhostHabitat: QueueGhostHabitat | null = null;

const QUEUE_GHOST_SAFE_SLOTS = {
  home: ['heroTopRight', 'heroPeekTop', 'journeyCorner', 'wishlistEdge', 'queueCardCorner'],
  questQueue: ['queueHeaderCorner', 'sidePanelPeek', 'emptyStateCorner'],
  achievements: ['achievementBadgePeek', 'achievementCorner'],
  platformPlans: ['toolbarCorner', 'platformCardEdge', 'emptySpaceTopRight'],
  gameDetail: ['coverEdgePeek', 'detailHeaderCorner', 'statsPanelCorner'],
  wishlist: ['toolbarCorner', 'gridEdge', 'emptySpaceTopRight'],
  library: ['toolbarCorner', 'gridEdge', 'emptySpaceTopRight'],
} as const satisfies Record<QueueGhostHabitat, readonly string[]>;

export type QueueGhostSlot = (typeof QUEUE_GHOST_SAFE_SLOTS)[QueueGhostHabitat][number];

function getAvailableQueueGhostSlots(habitat: QueueGhostHabitat): readonly QueueGhostSlot[] {
  if (typeof window === 'undefined') return QUEUE_GHOST_SAFE_SLOTS[habitat];

  const { innerWidth, innerHeight } = window;
  if (innerWidth < 761 || innerHeight < 520) return [];

  const slots = QUEUE_GHOST_SAFE_SLOTS[habitat];
  if (innerWidth < 1040) {
    return slots.filter((slot) => !['sidePanelPeek', 'wishlistEdge', 'gridEdge'].includes(slot));
  }

  return slots;
}

export function pickQueueGhostSlot(habitat: QueueGhostHabitat): QueueGhostSlot | null {
  const slots = getAvailableQueueGhostSlots(habitat);
  if (slots.length === 0) return null;
  const slot = slots[Math.floor(Math.random() * slots.length)];
  if (import.meta.env.DEV) console.debug(`[QueueGhost] picked slot="${slot}" habitat="${habitat}"`);
  return slot;
}

export function hasAvailableQueueGhostSlot(habitat: QueueGhostHabitat): boolean {
  return getAvailableQueueGhostSlots(habitat).length > 0;
}

export function shouldShowQueueGhostInHabitat(habitat: QueueGhostHabitat, probability: number): boolean {
  if (activeQueueGhostHabitat) return false;
  if (!hasAvailableQueueGhostSlot(habitat)) return false;
  if (Math.random() >= probability) return false;
  activeQueueGhostHabitat = habitat;
  if (import.meta.env.DEV) console.debug(`[QueueGhost] activated habitat="${habitat}"`);
  return true;
}

export function releaseQueueGhostHabitat(habitat: QueueGhostHabitat) {
  if (activeQueueGhostHabitat === habitat) {
    activeQueueGhostHabitat = null;
  }
}

export const QUEUE_GHOST_DEVELOPMENT_PROBABILITY = 0.95;
export const QUEUE_GHOST_PRODUCTION_PROBABILITY = 0.05;
export const QUEUE_GHOST_PROBABILITY = import.meta.env.DEV ? QUEUE_GHOST_DEVELOPMENT_PROBABILITY : QUEUE_GHOST_PRODUCTION_PROBABILITY;
export const QUEUE_GHOST_HABITAT_PROBABILITY = QUEUE_GHOST_PROBABILITY;
export const QUEUE_GHOST_VARIANT_PROBABILITY = import.meta.env.DEV ? QUEUE_GHOST_DEVELOPMENT_PROBABILITY : 0.12;

const CONTEXTUAL_VARIANT_PROBABILITIES: Record<'sleepy' | 'panic' | 'midnight' | 'achievement' | 'peek', number> = {
  sleepy: QUEUE_GHOST_VARIANT_PROBABILITY,
  panic: QUEUE_GHOST_VARIANT_PROBABILITY,
  midnight: import.meta.env.DEV ? QUEUE_GHOST_DEVELOPMENT_PROBABILITY : 0.03,
  achievement: 1,
  peek: import.meta.env.DEV ? QUEUE_GHOST_DEVELOPMENT_PROBABILITY : 0.05,
};
const QUEUE_GHOST_COVER_PROBABILITY = import.meta.env.DEV ? QUEUE_GHOST_DEVELOPMENT_PROBABILITY : QUEUE_GHOST_VARIANT_PROBABILITY;

export type QueueGhostCover = {
  title: string;
  imageUrl: string;
};

export type QueueGhostAchievement = {
  title: string;
  icon: IconName;
};

type QueueGhostVariantContext = {
  achievement?: QueueGhostAchievement | null;
  hasNoPlayTodaySessionForSevenDays?: boolean;
  queueSize?: number;
  isMidnight?: boolean;
  hasCover?: boolean;
};

export function shouldShowQueueGhost(): boolean {
  if (activeQueueGhostHabitat) return false;
  if (!hasAvailableQueueGhostSlot('home')) return false;
  const show = getSessionRandomFlag(GHOST_SESSION_KEY, QUEUE_GHOST_PROBABILITY);
  if (show) activeQueueGhostHabitat = 'home';
  return show;
}

export function getQueueGhostVariant({
  achievement = null,
  hasNoPlayTodaySessionForSevenDays = false,
  queueSize = 0,
  isMidnight = false,
  hasCover = false,
}: QueueGhostVariantContext): QueueGhostVariant {
  if (achievement && Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.achievement) return 'achievement';
  if (hasNoPlayTodaySessionForSevenDays && Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.sleepy) return 'sleepy';
  if (queueSize > 1000 && Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.panic) return 'panic';
  if (isMidnight && Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.midnight) return 'midnight';
  if (hasCover && Math.random() < QUEUE_GHOST_COVER_PROBABILITY) return 'cover';
  if (Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.peek) return 'peek';
  return 'default';
}

export function pickSimpleVariant(): QueueGhostVariant {
  if (Math.random() < CONTEXTUAL_VARIANT_PROBABILITIES.peek) return 'peek';
  return 'default';
}

export function shouldQueueGhostCarryCover(): boolean {
  return getQueueGhostVariant({ hasCover: true }) === 'cover';
}

export function hideQueueGhostForSession() {
  try {
    sessionStorage.setItem(GHOST_SESSION_KEY, '0');
  } catch {
    // Ignore unavailable session storage; the in-memory Home state still hides the ghost.
  }
}

function getSessionRandomFlag(key: string, probability: number): boolean {
  if (import.meta.env.DEV) return Math.random() < probability;

  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return stored === '1';
    const show = Math.random() < probability;
    sessionStorage.setItem(key, show ? '1' : '0');
    return show;
  } catch {
    return Math.random() < probability;
  }
}

const TOOLTIP_WIDTH = 156;
const TOOLTIP_ANCHOR_OFFSET = 34;
const HOVER_DELAY_MS = 600;
const TOOLTIP_Z_INDEX = 10_000;
const MIN_COVER_ROTATION_DEGREES = -10;
const MAX_COVER_ROTATION_DEGREES = 10;

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

type QueueGhostProps = {
  achievement?: QueueGhostAchievement | null;
  cover?: QueueGhostCover | null;
  variant?: QueueGhostVariant;
  message?: string;
  onVanish?: () => void;
};

const COVER_GHOST_MESSAGES = [
  'Queue Ghost found this one.',
  'The backlog remembers:',
  'Queue Ghost is carrying:',
] as const;

const PEEK_GHOST_REVEAL_MESSAGES = [
  'Queue Ghost was here.',
  "You weren't meant to see this.",
  'Queue Ghost has been watching.',
  'The backlog sees you.',
  "Queue Ghost remembers.",
] as const;

const VARIANT_MESSAGES: Record<Exclude<QueueGhostVariant, 'cover' | 'achievement'>, readonly string[]> = {
  default: GHOST_MESSAGES,
  sleepy: ['The backlog misses you.', 'Queue Ghost has been waiting.', 'Even fifteen minutes counts.', 'Your adventures miss you.'],
  panic: ['It keeps growing.', 'Queue Ghost is concerned.', 'The backlog grows stronger.', 'We may need a bigger queue.'],
  midnight: ["You're still here?", 'Sleep is temporary. Backlog is forever.', 'Queue Ghost does not judge.', 'One more game?', 'This seems like a tomorrow problem.'],
  peek: PEEK_GHOST_REVEAL_MESSAGES,
};

export function QueueGhost({ achievement = null, cover = null, variant = cover ? 'cover' : 'default', message: customMessage, onVanish }: QueueGhostProps) {
  const [open, setOpen] = useState(false);
  const message = useMemo(() => {
    if (customMessage) return customMessage;
    if (variant === 'achievement' && achievement) {
      return `Queue Ghost brought you something.\n${achievement.title}`;
    }
    if (variant === 'cover' && cover) {
      const prefix = COVER_GHOST_MESSAGES[Math.floor(Math.random() * COVER_GHOST_MESSAGES.length)];
      return `${prefix}\n${cover.title}`;
    }
    const messages = VARIANT_MESSAGES[variant as keyof typeof VARIANT_MESSAGES] ?? VARIANT_MESSAGES.default;
    return messages[Math.floor(Math.random() * messages.length)];
  }, [customMessage, achievement, cover, variant]);
  const [coverVisible, setCoverVisible] = useState(variant === 'cover' && Boolean(cover));
  const [coverRevealed, setCoverRevealed] = useState(false);
  const [peekRevealed, setPeekRevealed] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const coverRotation = useMemo(
    () => randomBetween(MIN_COVER_ROTATION_DEGREES, MAX_COVER_ROTATION_DEGREES),
    [],
  );

  function computeTooltipStyle() {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const left = Math.max(8, Math.min(r.left + r.width * 0.7 - TOOLTIP_ANCHOR_OFFSET, vw - TOOLTIP_WIDTH - 8));
    setTooltipStyle({ position: 'fixed', top: r.bottom + 4, left, width: TOOLTIP_WIDTH, zIndex: TOOLTIP_Z_INDEX });
  }

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function cancelOpen() {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setCoverRevealed(false);
    }, 200);
  }

  function scheduleOpen() {
    cancelOpen();
    openTimerRef.current = setTimeout(() => {
      computeTooltipStyle();
      setOpen(true);
    }, HOVER_DELAY_MS);
  }

  function vanishGhost() {
    cancelClose();
    cancelOpen();
    setOpen(false);
    setCoverRevealed(false);
    if (activeQueueGhostHabitat === 'home') hideQueueGhostForSession();
    onVanish?.();
  }

  function revealCover() {
    if (!cover || !coverVisible) return;
    cancelClose();
    cancelOpen();
    computeTooltipStyle();
    setCoverRevealed(true);
    setOpen(true);
  }

  function revealPeek() {
    if (variant !== 'peek' || peekRevealed) return;
    cancelOpen();
    setPeekRevealed(true);
    computeTooltipStyle();
    setOpen(true);
  }

  function handleClick() {
    if (variant === 'peek' && !peekRevealed) {
      revealPeek();
      return;
    }
    if (cover && coverVisible && !coverRevealed) {
      revealCover();
      return;
    }
    vanishGhost();
  }

  useEffect(() => {
    setPortalHost(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    computeTooltipStyle();

    window.addEventListener('resize', computeTooltipStyle);
    window.addEventListener('scroll', computeTooltipStyle, true);
    return () => {
      window.removeEventListener('resize', computeTooltipStyle);
      window.removeEventListener('scroll', computeTooltipStyle, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCoverRevealed(false);
      }
    }
    document.addEventListener('mousedown', handle, true);
    document.addEventListener('touchstart', handle, true);
    return () => {
      document.removeEventListener('mousedown', handle, true);
      document.removeEventListener('touchstart', handle, true);
    };
  }, [open]);


  useEffect(() => {
    if (variant !== 'achievement') return;
    const timer = setTimeout(() => {
      setOpen(false);
      onVanish?.();
    }, 3200);
    return () => clearTimeout(timer);
  }, [onVanish, variant]);

  useEffect(() => {
    if (variant !== 'peek' || peekRevealed) return;
    const timer = setTimeout(() => { onVanish?.(); }, 10000);
    return () => clearTimeout(timer);
  }, [variant, peekRevealed, onVanish]);

  useEffect(() => {
    if (variant !== 'peek') return;
    if (import.meta.env.DEV) console.debug('[QueueGhost] Peek Ghost spawned');
  }, [variant]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    },
    [],
  );

  const tooltipMessage = variant === 'cover' && cover && coverRevealed ? `The backlog remembers:\n${cover.title}` : message;

  const tooltip = open ? (
    <div
      className="queue-ghost-tooltip pointer-events-none rounded-xl p-3 backdrop-blur-md"
      role="tooltip"
      style={{
        ...tooltipStyle,
        '--queue-ghost-arrow-x': `${TOOLTIP_ANCHOR_OFFSET}px`,
      } as CSSProperties}
    >
      {/* Speech bubble arrow — upward, pointing at ghost */}
      <div className="queue-ghost-tooltip-arrow" />
      <p className="text-xs font-bold text-white">Queue Ghost</p>
      <p className="text-2xs text-slate-500">The Spirit of Backlog Past</p>
      <p className="mt-1.5 whitespace-pre-line text-xs leading-snug text-slate-300">{tooltipMessage}</p>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        aria-expanded={open || coverRevealed}
        aria-haspopup="dialog"
        aria-label={variant === 'cover' && cover && coverVisible ? (coverRevealed ? 'Dismiss Queue Ghost' : `Reveal carried cover for ${cover.title}`) : 'Dismiss Queue Ghost'}
        className={`block outline-none transition-opacity hover:opacity-95 focus-visible:opacity-95 ${variant === 'sleepy' ? 'opacity-[0.64]' : variant === 'peek' && !peekRevealed ? 'opacity-[0.62]' : 'opacity-[0.82]'}`}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => {
          cancelClose();
          if (variant === 'peek' && !peekRevealed) {
            revealPeek();
          } else if (cover && coverVisible) {
            revealCover();
          } else {
            scheduleOpen();
          }
        }}
        onMouseLeave={() => {
          cancelOpen();
          scheduleClose();
        }}
      >
        <svg
          aria-hidden="true"
          className={`queue-ghost queue-ghost--${variant} h-auto w-full${coverRevealed ? ' queue-ghost--cover-revealed' : ''}${variant === 'peek' && peekRevealed ? ' queue-ghost--peek-revealed' : ''}`}
          fill="none"
          style={{ '--queue-ghost-cover-rotation': `${coverRotation}deg` } as CSSProperties}
          viewBox="0 0 96 96"
        >
          <ellipse className="queue-ghost-glow" cx="48" cy="76" rx="28" ry="8" />
          <g className="queue-ghost-float">
            <path
              className="queue-ghost-body"
              d="M48 12 C28 12 14 28 14 48 V66 C14 76 20 82 28 84 C34 86 38 78 44 84 C48 88 52 88 56 84 C62 78 66 86 72 84 C80 82 82 76 82 66 V48 C82 28 68 12 48 12Z"
            />
            <path
              className="queue-ghost-accent"
              d="M22 62 C28 66 34 67 42 64 C50 61 58 61 66 64 C72 66 76 65 82 62 V67 C82 76 80 82 72 84 C66 86 62 78 56 84 C52 88 48 88 44 84 C38 78 34 86 28 84 C20 82 14 76 14 66 V62 C16 61 18 61 22 62Z"
            />
            {variant === 'sleepy' ? (
              <>
                <path className="queue-ghost-eye queue-ghost-eye--closed" d="M33 43 C36 46 40 46 43 43" />
                <path className="queue-ghost-eye queue-ghost-eye--closed" d="M53 43 C56 46 60 46 63 43" />
                <text className="queue-ghost-zzz" x="63" y="25">Zzz</text>
              </>
            ) : variant === 'panic' ? (
              <>
                <ellipse className="queue-ghost-eye" cx="38" cy="42" rx="5" ry="8" />
                <ellipse className="queue-ghost-eye" cx="58" cy="42" rx="5" ry="8" />
                <path className="queue-ghost-mouth" d="M44 59 C47 55 51 55 54 59" />
              </>
            ) : (
              <>
                <ellipse className="queue-ghost-eye" cx="38" cy="42" rx="5" ry="7" />
                <ellipse className="queue-ghost-eye" cx="58" cy="42" rx="5" ry="7" />
                <circle cx="40" cy="40" r="1.5" fill="white" />
                <circle cx="60" cy="40" r="1.5" fill="white" />
                <path className="queue-ghost-mouth" d="M44 57 C46 59 50 59 52 57" />
              </>
            )}
            {variant === 'achievement' && achievement ? (
              <foreignObject className="queue-ghost-achievement-prop" x="55" y="48" width="28" height="28">
                <div className="queue-ghost-achievement-badge" title={achievement.title}>
                  <Icon name={achievement.icon} size={14} />
                </div>
              </foreignObject>
            ) : null}
            {variant === 'cover' && cover && coverVisible ? (
              <foreignObject className="queue-ghost-cover-prop" x="52" y="50" width="25" height="34">
                <img
                  alt=""
                  className="queue-ghost-cover-image"
                  decoding="async"
                  src={cover.imageUrl}
                  onError={() => setCoverVisible(false)}
                />
              </foreignObject>
            ) : null}
          </g>
        </svg>
      </button>

      {portalHost && tooltip ? createPortal(tooltip, portalHost) : null}
    </div>
  );
}
