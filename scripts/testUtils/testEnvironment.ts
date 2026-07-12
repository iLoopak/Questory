/**
 * Test-side accessors for the browser globals installed by `installBrowserGlobals.mjs`.
 *
 * The install itself happens in the runner, before any test bundle is imported — see the
 * comment in that file for why it cannot be done from here.
 */

type TestGlobals = Record<string, unknown> & { __questoryTestWindow?: Window & typeof globalThis };

function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** Fail loudly if a test bundle is run without the runner's global setup. */
export function assertTestEnvironment(): void {
  const globalScope = globalThis as unknown as TestGlobals;

  if (!globalScope.__questoryTestWindow || typeof indexedDB === 'undefined') {
    throw new Error(
      'Browser globals are missing. Run these tests through `npm test` (scripts/run-analytics-tests.mjs), ' +
        'which imports scripts/testUtils/installBrowserGlobals.mjs before loading any test bundle.',
    );
  }
}

/**
 * Re-point the DOM globals at the real jsdom window.
 *
 * Every test bundle shares one Node process, and some older test files replace
 * `globalThis.window` with an in-memory localStorage stub that has no `sessionStorage`
 * (and no event target). Restoring here keeps these tests independent of file order.
 */
export function restoreBrowserGlobals(): void {
  const globalScope = globalThis as unknown as TestGlobals;
  const testWindow = globalScope.__questoryTestWindow;

  if (!testWindow) {
    assertTestEnvironment();
    return;
  }

  defineGlobal('window', testWindow);
  defineGlobal('document', testWindow.document);
}

/** Restore the real window, then clear both web storage tiers. */
export function resetWebStorage(): void {
  restoreBrowserGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
}
