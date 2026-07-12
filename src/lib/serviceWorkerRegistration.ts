import { registerSW } from 'virtual:pwa-register';
import { getRuntimeEnvironment } from './capacitorEnvironment';

/**
 * AS-11: the service worker is a browser/PWA concern only.
 *
 * A Capacitor build loads its assets from the native bundle, so a worker has nothing useful to do
 * there — and must not get between the WebView and those assets. Registration was already a no-op in
 * practice on Android (the scheme is not registerable); this makes it a decision rather than an
 * accident.
 *
 * `registerType: 'autoUpdate'` posts SKIP_WAITING once a new worker reaches `installed` — which, with
 * the atomic install this PR introduces, can only happen after its precache is COMPLETE. An open tab
 * keeps running its own build's chunks (the previous cache is retained for exactly that), so an
 * update never produces a mixed-version runtime.
 */
export function registerServiceWorker() {
  if (getRuntimeEnvironment().isNative) {
    return;
  }

  registerSW({
    immediate: true,
    onRegisterError: () => {
      // Offline support is a progressive enhancement; the app still works without registration.
    },
  });
}
