import type { ReactNode } from 'react';

type DetailSectionProps = {
  children: ReactNode;
  description?: string;
  kicker?: string;
  title: string;
};

/**
 * Canonical content section for the Game page — shared by the Library Game
 * Hub and Discovery Preview so both modes use identical section chrome.
 */
export function DetailSection({ children, description, kicker, title }: DetailSectionProps) {
  return (
    <section className="rounded-2xl border border-mint/20 bg-ink-800 p-4 shadow-panel">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          {kicker ? <div className="qs-label-caps text-accent">{kicker}</div> : null}
          <h3 className={kicker ? 'mt-1 text-lg font-semibold text-white' : 'text-lg font-semibold text-white'}>{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
