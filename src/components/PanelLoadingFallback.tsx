/**
 * Suspense fallback for lazily loaded nav-level panels. Lightweight pulsing
 * placeholder matching the panel chrome used across Questory.
 */
export function PanelLoadingFallback() {
  return (
    <div aria-busy="true" className="px-3 pb-24 pt-4">
      <div className="qs-glass min-h-[60vh] animate-pulse rounded-lg border border-skyglass/15 bg-ink-900/45" />
    </div>
  );
}
