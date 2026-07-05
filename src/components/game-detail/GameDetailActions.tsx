import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

export type GameDetailAction = {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone: 'accent' | 'neutral' | 'danger';
  disabled?: boolean;
};

/**
 * Canonical primary-actions bar for the Game page — same chrome in the
 * Library Game Hub and Discovery Preview; only the actions inside differ.
 */
export function GameDetailActionBar({ ariaLabel, children, menu }: { ariaLabel: string; children: ReactNode; menu?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ink-950/80 p-3" aria-label={ariaLabel}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {menu}
    </section>
  );
}

export function GameDetailActionButton({ action }: { action: GameDetailAction }) {
  return (
    <button
      className={`min-h-10 rounded-xl border px-3 py-2 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${getGameDetailActionClassName(
        action.tone,
      )}`}
      disabled={action.disabled}
      onClick={action.onClick}
      type="button"
    >
      <span className="flex items-center gap-2">
        <Icon name={action.icon} />
        <span>{action.label}</span>
      </span>
    </button>
  );
}

function getGameDetailActionClassName(tone: GameDetailAction['tone']) {
  if (tone === 'accent') {
    return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20 hover:shadow-glow';
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }

  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}
