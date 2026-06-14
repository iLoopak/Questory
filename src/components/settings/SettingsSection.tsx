import type { ReactNode } from 'react';

type SettingsSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  className?: string;
};

export function SettingsSection({
  title,
  description,
  meta,
  children,
  actions,
  status,
  className = '',
}: SettingsSectionProps) {
  return (
    <section className={`qs-glass rounded-lg border p-4 ${className}`.trim()}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{description}</p> : null}
        </div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>

      {children ? <div className="mt-4 space-y-4">{children}</div> : null}

      {actions ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {actions}
        </div>
      ) : null}

      {status ? <div className="mt-4">{status}</div> : null}
    </section>
  );
}

export function SettingsStatusBlock({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'error' | 'info' | 'success' | 'warning';
}) {
  const toneClass = {
    error: 'border-red-400/40 bg-red-500/10 text-red-200',
    info: 'border-skyglass/15 bg-ink-950/80 text-slate-300',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    warning: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  }[tone];

  return <div className={`rounded-md border px-3 py-3 text-sm leading-6 ${toneClass}`}>{children}</div>;
}
