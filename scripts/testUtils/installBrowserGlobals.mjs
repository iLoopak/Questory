/**
 * Installs the browser globals the test bundles need, BEFORE any of them are imported.
 *
 * This must be a plain .mjs loaded by the test runner rather than a module imported from
 * a test file: esbuild inlines each bundle's dependencies (Dexie included) and evaluates
 * them eagerly at bundle load, and Dexie snapshots `globalThis.indexedDB` /
 * `globalThis.IDBKeyRange` into `Dexie.dependencies` at ITS module init. Anything a test
 * file installs in its own top-level code would therefore be too late.
 *
 * The runner imports every test bundle into one Node process, so these globals are created
 * exactly once and shared — which also keeps the single (externalized) react-dom instance
 * bound to one document.
 */
import { JSDOM } from 'jsdom';
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from 'fake-indexeddb';

function defineGlobal(name, value) {
  // `navigator` and friends are getter-only on modern Node, so plain assignment throws.
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

// A real URL is required, or jsdom treats the origin as opaque and localStorage throws.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://questory.test' });
const { window } = dom;

defineGlobal('window', window);
defineGlobal('document', window.document);
defineGlobal('navigator', window.navigator);
defineGlobal('HTMLElement', window.HTMLElement);
defineGlobal('Node', window.Node);
defineGlobal('Event', window.Event);
defineGlobal('CustomEvent', window.CustomEvent);
defineGlobal('localStorage', window.localStorage);
defineGlobal('sessionStorage', window.sessionStorage);

// Dexie resolves these as bare globals (off globalThis, not off `window`), so install them
// there explicitly instead of using fake-indexeddb/auto, which prefers `window`.
defineGlobal('indexedDB', fakeIndexedDB);
defineGlobal('IDBKeyRange', FakeIDBKeyRange);

// jsdom implements no layout, so these are absent. Components call them during render/effects.
window.Element.prototype.scrollTo = function scrollTo() {};
window.Element.prototype.scrollIntoView = function scrollIntoView() {};
window.HTMLElement.prototype.scrollTo = function scrollTo() {};

// Opts React into act()-based state updates and silences its environment warning.
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// Some older test files install their own stub `window` (an in-memory localStorage shim).
// Keep a handle on the real jsdom window so `resetWebStorage()` can restore it — every test
// bundle is imported into the same process, so that stub would otherwise leak across files.
defineGlobal('__questoryTestWindow', window);

// Initialize react-dom NOW, while `window` is still the real jsdom window.
//
// react-dom runs its feature detection once, at module init: `canUseDOM` requires
// `window.document`, and it gates the `input`-event path on it. One of the older test bundles
// (backupStorage.test.ts) replaces `globalThis.window` with a bare localStorage stub that has
// no `document`. If react-dom happened to initialize after that, it would decide the DOM is
// unavailable and fall back to an IE-era onChange polyfill that calls `detachEvent()` — which
// jsdom does not implement, so every controlled-input change would throw. Loading it here pins
// the correct detection regardless of test file order.
await import('react-dom/client');
