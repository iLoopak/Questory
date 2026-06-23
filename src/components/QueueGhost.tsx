import { useEffect, useRef, useState } from 'react';

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

export function shouldShowQueueGhost(): boolean {
  try {
    const stored = sessionStorage.getItem(GHOST_SESSION_KEY);
    if (stored !== null) return stored === '1';
    const show = Math.random() < 0.75;
    sessionStorage.setItem(GHOST_SESSION_KEY, show ? '1' : '0');
    return show;
  } catch {
    return Math.random() < 0.75;
  }
}

const TOOLTIP_WIDTH = 160;
const HOVER_DELAY_MS = 600;

export function QueueGhost() {
  const [open, setOpen] = useState(false);
  const [message] = useState(
    () => GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)],
  );
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function computeTooltipStyle() {
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 8));
    setTooltipStyle({ position: 'fixed', top: r.bottom + 12, left, width: TOOLTIP_WIDTH, zIndex: 50 });
  }

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function cancelOpen() {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  }

  function scheduleOpen() {
    cancelOpen();
    openTimerRef.current = setTimeout(() => {
      computeTooltipStyle();
      setOpen(true);
    }, HOVER_DELAY_MS);
  }

  function handleClick() {
    cancelClose();
    cancelOpen();
    if (open) {
      setOpen(false);
    } else {
      computeTooltipStyle();
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle, true);
    document.addEventListener('touchstart', handle, true);
    return () => {
      document.removeEventListener('mousedown', handle, true);
      document.removeEventListener('touchstart', handle, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    },
    [],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Queue Ghost"
        className="block opacity-[0.92] outline-none"
        type="button"
        onClick={handleClick}
        onMouseEnter={() => {
          cancelClose();
          scheduleOpen();
        }}
        onMouseLeave={() => {
          cancelOpen();
          scheduleClose();
        }}
      >
        <svg
          aria-hidden="true"
          className="queue-ghost h-auto w-[38px]"
          fill="none"
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
            <ellipse className="queue-ghost-eye" cx="38" cy="42" rx="5" ry="7" />
            <ellipse className="queue-ghost-eye" cx="58" cy="42" rx="5" ry="7" />
            <circle cx="40" cy="40" r="1.5" fill="white" />
            <circle cx="60" cy="40" r="1.5" fill="white" />
            <path className="queue-ghost-mouth" d="M44 57 C46 59 50 59 52 57" />
          </g>
        </svg>
      </button>

      {open && (
        <div
          className="pointer-events-none rounded-lg bg-ink-950 p-3 backdrop-blur-md"
          role="tooltip"
          style={{
            ...tooltipStyle,
            boxShadow:
              '0 0 0 1px color-mix(in srgb, var(--qs-secondary-accent) 30%, transparent), 0 12px 28px -4px rgba(0,0,0,0.8)',
          }}
        >
          {/* Speech bubble arrow — upward, pointing at ghost */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: -9,
              width: 0,
              height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderBottom:
                '9px solid color-mix(in srgb, var(--qs-secondary-accent) 30%, transparent)',
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              top: -7,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '8px solid rgb(var(--ink-950-rgb))',
            }}
          />
          <p className="text-xs font-bold text-white">Queue Ghost</p>
          <p className="text-2xs text-slate-500">The Spirit of Backlog Past</p>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-snug text-slate-300">{message}</p>
        </div>
      )}
    </div>
  );
}
