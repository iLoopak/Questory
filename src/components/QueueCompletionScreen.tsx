import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export type QueueCompletionState = 'batch-complete' | 'queue-empty';

type QueueCompletionStat = {
  label: string;
  value: number | string;
  helper?: string;
  tone?: 'accent' | 'warm' | 'neutral';
};

type QueueCompletionChip = {
  label: string;
  tone?: 'accent' | 'warm' | 'neutral' | 'muted' | 'danger';
  value?: number;
};

type QueueCompletionAction = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export type QueueCompletionArtwork = {
  alt?: string;
  gameKey?: string;
  id?: string;
  url: string | null | undefined;
};

type Props = {
  actions?: QueueCompletionAction[];
  artwork?: QueueCompletionArtwork[];
  chips?: QueueCompletionChip[];
  eyebrow: string;
  footer: ReactNode;
  heading: string;
  state: QueueCompletionState;
  stats: QueueCompletionStat[];
  summary: string;
};

const statToneClasses = {
  accent: 'border-mint/30 bg-mint/10 text-accent',
  warm: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  neutral: 'border-skyglass/15 bg-ink-950/70 text-slate-300',
} as const;

const chipToneClasses = {
  accent: 'border-mint/30 bg-mint/10 text-mint',
  danger: 'border-red-400/25 bg-red-500/10 text-red-100',
  muted: 'border-skyglass/15 bg-ink-950/70 text-slate-400',
  neutral: 'border-skyglass/15 bg-ink-950/70 text-slate-200',
  warm: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
} as const;

const actionClasses = {
  primary: 'border-mint/30 bg-mint text-ink-950 hover:bg-mint/90',
  secondary: 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20',
  ghost: 'border-skyglass/15 text-slate-200 hover:bg-mint/10 hover:text-white',
} as const;

const artworkSlots = [
  { className: 'left-[4%] top-[10%] hidden md:block', rotate: '-8deg', duration: '5.8s', delay: '-0.6s' },
  { className: 'left-[10%] top-[48%] hidden lg:block', rotate: '6deg', duration: '6.6s', delay: '-2.1s' },
  { className: 'left-[22%] bottom-[7%] hidden xl:block', rotate: '-3deg', duration: '5.1s', delay: '-1.4s' },
  { className: 'right-[5%] top-[12%] hidden md:block', rotate: '7deg', duration: '6.2s', delay: '-1.1s' },
  { className: 'right-[11%] top-[52%] hidden lg:block', rotate: '-6deg', duration: '5.5s', delay: '-2.8s' },
  { className: 'right-[23%] bottom-[6%] hidden xl:block', rotate: '4deg', duration: '7s', delay: '-3.6s' },
  { className: 'left-[8%] top-[5%] md:hidden', rotate: '-7deg', duration: '6s', delay: '-1.5s' },
  { className: 'right-[7%] top-[7%] md:hidden', rotate: '6deg', duration: '5.4s', delay: '-0.4s' },
  { className: 'left-[10%] bottom-[5%] md:hidden', rotate: '4deg', duration: '6.8s', delay: '-2.4s' },
  { className: 'right-[10%] bottom-[6%] md:hidden', rotate: '-5deg', duration: '5.7s', delay: '-3.2s' },
] as const;

type VisibleArtwork = QueueCompletionArtwork & { index: number; markFailed: () => void };

export function QueueCompletionScreen({ actions = [], artwork = [], chips = [], eyebrow, footer, heading, state, stats, summary }: Props) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const visibleChips = chips.filter((chip) => chip.value === undefined || chip.value > 0);
  const visibleStats = stats.slice(0, 2);
  const visibleArtwork = useCompletionArtwork(artwork);

  useEffect(() => {
    primaryActionRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      aria-labelledby="queue-completion-title"
      className="relative isolate grid min-h-full content-start justify-items-center overflow-hidden overflow-y-auto rounded-[1.5rem] border border-white/10 bg-ink-900/70 px-4 py-5 text-center sm:px-5 md:place-items-center"
      data-completion-state={state}
    >
      <CompletionArtworkLayer artwork={visibleArtwork} />
      <div className="relative z-10 w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-spread text-mint">{eyebrow}</p>
        <h2 id="queue-completion-title" className="mt-2 text-3xl font-semibold leading-tight text-white">
          {heading}
        </h2>
        <p className="mt-3 text-sm text-slate-400">{summary}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {visibleStats.map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-3 ${statToneClasses[stat.tone ?? 'neutral']}`}>
              <div className="qs-label-caps">{stat.label}</div>
              <div className="mt-1 text-2xl font-semibold text-white">{stat.value}</div>
              {stat.helper ? <div className="text-xs text-slate-400">{stat.helper}</div> : null}
            </div>
          ))}
        </div>

        {visibleChips.length > 0 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            {visibleChips.map((chip) => (
              <span key={chip.label} className={`rounded-full border px-3 py-1 ${chipToneClasses[chip.tone ?? 'neutral']}`}>
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-6 text-xs text-slate-500">{footer}</div>

        {actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {actions.map((action, index) => (
              <button
                key={action.label}
                ref={index === 0 ? primaryActionRef : undefined}
                className={`min-h-12 rounded-xl border px-5 text-sm font-semibold transition focus-visible:border-mint ${actionClasses[action.variant ?? (index === 0 ? 'primary' : 'ghost')]}`}
                onClick={action.onClick}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function useCompletionArtwork(artwork: QueueCompletionArtwork[]): VisibleArtwork[] {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  return useMemo(() => {
    const seenArtwork = new Set<string>();
    const seenGames = new Set<string>();
    return artwork
      .filter((item) => {
        const url = item.url?.trim();
        const gameKey = item.gameKey?.trim();
        if (!url || failedUrls.has(url) || seenArtwork.has(url) || (gameKey && seenGames.has(gameKey))) return false;
        seenArtwork.add(url);
        if (gameKey) seenGames.add(gameKey);
        return true;
      })
      .slice(0, 7)
      .map((item, index) => ({ ...item, index, markFailed: () => setFailedUrls((current) => new Set(current).add(item.url!.trim())) }));
  }, [artwork, failedUrls]);
}

function CompletionArtworkLayer({ artwork }: { artwork: VisibleArtwork[] }) {
  if (artwork.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink-900/75 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink-900/70 to-transparent" />
      {artwork.map((item) => {
        const slot = artworkSlots[item.index % artworkSlots.length];
        return (
          <img
            key={`${item.id ?? item.url}-${item.index}`}
            alt=""
            className={`qs-batch-cover-tile absolute aspect-[3/4] w-16 rounded-xl border border-white/10 object-cover opacity-45 shadow-panel sm:w-20 md:w-24 lg:w-28 ${slot.className}`}
            decoding="async"
            draggable={false}
            loading={item.index < 4 ? 'eager' : 'lazy'}
            onError={item.markFailed}
            src={item.url?.trim()}
            style={{
              '--tile-rotate': slot.rotate,
              animationDelay: slot.delay,
              animationDuration: slot.duration,
            } as CSSProperties}
          />
        );
      })}
    </div>
  );
}
