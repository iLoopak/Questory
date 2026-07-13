/**
 * Suspense fallback for lazily loaded nav-level panels. Lightweight pulsing
 * placeholder matching the panel chrome used across Questory.
 */
export function PanelLoadingFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="px-3 pb-24 pt-4" role="status">
      <span className="sr-only">Loading section…</span>
      <div className="qs-glass min-h-[60vh] rounded-lg border border-skyglass/15 bg-ink-900/45 motion-safe:animate-pulse" />
    </div>
  );
}
