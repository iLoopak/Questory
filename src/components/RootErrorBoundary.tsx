import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearQuestoryAppCaches, reloadWithNewestServiceWorker } from '../lib/appUpdateRecovery';

type RootErrorBoundaryProps = { children: ReactNode };
type RootErrorBoundaryState = { error: Error | null; isRecovering: boolean };

/**
 * AS-11: the last line of defense when a deploy and an open tab disagree.
 *
 * A lazy route (Settings, Stats, Metadata, Quest Runner) is fetched when the user first opens it. If
 * the build it belongs to is gone from the server and missing from the cache, the dynamic import
 * rejects and the app used to die behind a Suspense fallback with no way out. The recovery offered
 * here is to reload onto the newest worker, and — only if that is not enough — to drop Questory's own
 * caches so the next load rebuilds them from the network.
 *
 * It never touches IndexedDB, localStorage or Preferences: a chunk-load error is a delivery problem,
 * and the user's library is not the thing that is broken.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { error: null, isRecovering: false };

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Questory] Root render failed', { message: error.message, componentStack: info.componentStack });
  }

  private handleReload = async () => {
    this.setState({ isRecovering: true });
    await reloadWithNewestServiceWorker();
  };

  private handleClearCaches = async () => {
    this.setState({ isRecovering: true });
    await clearQuestoryAppCaches();
    window.location.reload();
  };

  render() {
    const { error, isRecovering } = this.state;
    if (!error) {
      return this.props.children;
    }

    const isUpdateFailure = isChunkLoadError(error);

    return (
      <div className="root-error-boundary" role="alert">
        <div className="root-error-boundary__panel">
          <h1 className="root-error-boundary__title">
            {isUpdateFailure ? 'Questory was updated' : 'Questory could not start'}
          </h1>
          <p className="root-error-boundary__message">
            {isUpdateFailure
              ? 'This tab is still running an older version, and part of it is no longer available. Reloading picks up the new one. Your library is untouched.'
              : 'Something went wrong while rendering. Reloading usually fixes it, and your library is untouched.'}
          </p>

          <div className="root-error-boundary__actions">
            <button type="button" className="root-error-boundary__button" disabled={isRecovering} onClick={this.handleReload}>
              {isRecovering ? 'Reloading…' : 'Reload Questory'}
            </button>
            <button type="button" className="root-error-boundary__button root-error-boundary__button--secondary" disabled={isRecovering} onClick={this.handleClearCaches}>
              Reload and rebuild the app cache
            </button>
          </div>

          <p className="root-error-boundary__detail">{error.message}</p>
        </div>
      </div>
    );
  }
}

/** A failed dynamic import, in the several shapes the browsers phrase it. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message);
}
