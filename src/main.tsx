import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureAndroidGamepadShortcuts } from './lib/androidGamepadShortcuts';
import { configureHandheldImmersiveMode } from './lib/handheldImmersiveMode';
import { hydrateLocalStorageFromPreferences } from './lib/localPersistence';
import { persistentStorageKeys } from './lib/persistentStorageKeys';
import { initGameRepository } from './lib/gameStorage';
import {
  accentColorStorageKey,
  appTemplateStorageKey,
  applyAccentColorPreference,
  applyAppTemplatePreference,
  applyThemePreference,
  loadAccentColorPreference,
  loadAppTemplatePreference,
  loadNeonButtonGradientBalancePreference,
  loadSecondaryAccentColorPreference,
  loadThemePreference,
} from './lib/themePreferences';
import { registerServiceWorker } from './lib/serviceWorkerRegistration';
import './styles.css';

registerServiceWorker();
void configureHandheldImmersiveMode();
const removeAndroidGamepadShortcuts = configureAndroidGamepadShortcuts();
window.addEventListener('beforeunload', removeAndroidGamepadShortcuts, { once: true });

void startApp();

async function startApp() {
  // In dev mode, any previously-registered service worker (e.g. from a past preview build
  // or from when devOptions.enabled was temporarily set in VitePWA config) will serve all
  // same-origin assets cache-first. That means old, pre-fix JS runs after every dev-server
  // restart — the root cause of dev-only persistence bugs. Unregister all SWs before React
  // mounts so the Vite dev server always wins.
  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      console.debug('[Dev] Unregistering', registrations.length, 'stale service worker(s) to prevent cached-JS persistence bugs.');
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  }

  // Boot-time persistence diagnostics (dev only). Logged before React renders so we can see
  // exactly what is (or is not) in localStorage before any app code runs.
  if (import.meta.env.DEV) {
    const raw = window.localStorage.getItem('questshelf.games.v1');
    let gamesLoadedCount = 0;
    try { gamesLoadedCount = Array.isArray(JSON.parse(raw ?? 'null')) ? (JSON.parse(raw!) as unknown[]).length : 0; } catch { /* */ }
    console.debug('[Persistence:boot] gamesLoadedCount:', gamesLoadedCount);
    console.debug('[Persistence:boot] persistedRawLength:', raw?.length ?? 0);
    console.debug('[Persistence:boot] localStorageKeyUsed: questshelf.games.v1');
    console.debug('[Persistence:boot] environment:', import.meta.env.MODE);
    console.debug('[Persistence:boot] origin:', window.location.origin);
  }

  await hydrateLocalStorageFromPreferences([...persistentStorageKeys]);

  // Wave 2: open the IndexedDB game store and run the one-time legacy import before
  // React renders, so the synchronous loadGames() first paint reads a correct snapshot.
  // The repository degrades to the legacy blob internally if IndexedDB is unavailable,
  // so this never blocks boot.
  try {
    await initGameRepository();
  } catch {
    // Repository initialization is internally resilient; never block boot on it.
  }

  // First-launch detection: if the template key has never been written, this is a clean
  // install. Seed the neon-deck green accent so new users get Green / Blue as default
  // rather than the classic orange. Existing users keep their stored preferences untouched.
  try {
    if (!window.localStorage.getItem(appTemplateStorageKey) && !window.localStorage.getItem(accentColorStorageKey)) {
      window.localStorage.setItem(accentColorStorageKey, '#22c55e');
    }
  } catch {
    // Ignore unavailable storage — the in-memory default is fine.
  }

  const appTemplatePreference = loadAppTemplatePreference();

  applyAppTemplatePreference(appTemplatePreference);
  applyThemePreference(loadThemePreference(), appTemplatePreference);
  applyAccentColorPreference(
    loadAccentColorPreference(),
    loadSecondaryAccentColorPreference(),
    loadNeonButtonGradientBalancePreference(),
  );

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
