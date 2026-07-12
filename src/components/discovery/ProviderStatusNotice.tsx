import { isProviderSetupErrorKind, type ProviderStatusSummary } from '../../lib/providerResult';

/**
 * AS-10: the one place a provider problem is shown to the user.
 *
 * It exists because a failure used to look exactly like "nothing found" — the section simply went
 * empty and there was nothing to press. It is deliberately a single non-blocking row rather than a
 * redesign: it names the problem, and it offers the one action that fits it. A setup problem sends
 * the user to Integrations (retrying an invalid key achieves nothing); a temporary provider problem
 * offers Retry; stale data says it is stale.
 */
export function ProviderStatusNotice({
  provider,
  onRetry,
  onOpenSettings,
  isRetrying = false,
}: {
  provider: ProviderStatusSummary | null | undefined;
  onRetry: () => void;
  onOpenSettings?: () => void;
  isRetrying?: boolean;
}) {
  if (!provider || provider.status === 'ok') {
    return provider?.stale ? <StaleNotice onRetry={onRetry} isRetrying={isRetrying} /> : null;
  }

  const needsSetup = provider.error ? isProviderSetupErrorKind(provider.error.kind) : false;
  const message = provider.error?.safeMessage ?? 'Some results could not be refreshed.';

  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
      role="status"
    >
      <span className="min-w-0">
        {message}
        {provider.stale ? ' Showing your last saved results.' : null}
      </span>
      {needsSetup && onOpenSettings ? (
        <button
          className="shrink-0 rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20"
          onClick={onOpenSettings}
          type="button"
        >
          Settings → Integrations
        </button>
      ) : (
        <button
          className="shrink-0 rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-60"
          disabled={isRetrying}
          onClick={onRetry}
          type="button"
        >
          {isRetrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

function StaleNotice({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-skyglass/20 bg-ink-900/60 px-3 py-2 text-sm text-slate-300" role="status">
      <span>Showing your last saved results.</span>
      <button
        className="shrink-0 rounded-lg border border-skyglass/25 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-mint/40 hover:text-mint disabled:opacity-60"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        {isRetrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
