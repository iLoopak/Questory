import { Icon, type IconName } from './Icon';

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * Canonical empty-state card — dashed border, title, short explanation and
 * an optional action. Use instead of bare text so empty screens read the
 * same everywhere.
 */
export function EmptyState({ icon, title, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-skyglass/15 bg-ink-950/55 p-4 text-center">
      {icon ? (
        <div className="mb-2 flex justify-center">
          <Icon className="text-slate-600" name={icon} size={28} />
        </div>
      ) : null}
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-4 min-h-10 rounded-lg border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
          data-home-focus="true"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
