import { useEffect, useRef, useState } from 'react';

// Tooltip messages — short, atmospheric, rotating per session
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
    const show = Math.random() < 0.015;
    sessionStorage.setItem(GHOST_SESSION_KEY, show ? '1' : '0');
    return show;
  } catch {
    return Math.random() < 0.015;
  }
}

export function QueueGhost() {
  const [open, setOpen] = useState(false);
  const [message] = useState(
    () => GHOST_MESSAGES[Math.floor(Math.random() * GHOST_MESSAGES.length)],
  );
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  }

  function handleClick() {
    cancelClose();
    setOpen((prev) => !prev);
  }

  // Dismiss on outside interaction while open
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
    },
    [],
  );

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Queue Ghost"
        className="queue-ghost-float block outline-none"
        type="button"
        onClick={handleClick}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        {/* Ghost SVG — 20×24 viewBox, rendered at 20×24 CSS px */}
        <svg
          aria-hidden="true"
          className="h-6 w-5"
          fill="none"
          viewBox="0 0 20 24"
        >
          {/* Glow puddle beneath ghost, tinted with secondary accent */}
          <ellipse className="queue-ghost-glow" cx="10" cy="23" rx="4.5" ry="0.8" />

          {/* Main body — pale translucent white */}
          <path
            className="queue-ghost-body"
            d="M10 1C15 1 18 5 18 10L18 19Q15.5 23 13 19Q10.5 23 8 19Q5.5 23 2 19L2 10C2 5 5 1 10 1Z"
          />

          {/* Subtle secondary-accent sheen in upper body */}
          <ellipse className="queue-ghost-accent" cx="8" cy="7" rx="2.5" ry="1.5" />

          {/* Eyes — dark ink, slightly droopy for melancholy */}
          <ellipse className="queue-ghost-eyes" cx="7.5" cy="11" rx="1.2" ry="1.5" />
          <ellipse className="queue-ghost-eyes" cx="12.5" cy="11" rx="1.2" ry="1.5" />
        </svg>
      </button>

      {open && (
        <div
          className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-44 rounded-xl border border-[var(--qs-secondary-accent)]/30 bg-ink-950/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl"
          role="tooltip"
        >
          <p className="text-xs font-bold text-white">Queue Ghost</p>
          <p className="text-2xs text-slate-500">The Spirit of Backlog Past</p>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-snug text-slate-300">{message}</p>
        </div>
      )}
    </div>
  );
}
