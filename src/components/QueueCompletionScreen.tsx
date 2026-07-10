import { useEffect, useRef, type ReactNode } from 'react';

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

type Props = {
  actions?: QueueCompletionAction[];
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

export function QueueCompletionScreen({ actions = [], chips = [], eyebrow, footer, heading, state, stats, summary }: Props) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const visibleChips = chips.filter((chip) => chip.value === undefined || chip.value > 0);
  const visibleStats = stats.slice(0, 2);

  useEffect(() => {
    primaryActionRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      aria-labelledby="queue-completion-title"
      className="grid min-h-full content-start justify-items-center overflow-y-auto rounded-[1.5rem] border border-white/10 bg-ink-900/70 px-4 py-5 text-center sm:px-5 md:place-items-center"
      data-completion-state={state}
    >
      <div className="w-full max-w-sm">
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
