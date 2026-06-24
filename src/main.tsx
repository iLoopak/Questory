import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureAndroidGamepadShortcuts } from './lib/androidGamepadShortcuts';
import { configureHandheldImmersiveMode } from './lib/handheldImmersiveMode';
import { hydrateLocalStorageFromPreferences } from './lib/localPersistence';
import { persistentStorageKeys } from './lib/persistentStorageKeys';
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
  await hydrateLocalStorageFromPreferences([...persistentStorageKeys]);

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
