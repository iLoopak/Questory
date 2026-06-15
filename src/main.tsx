import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureAndroidGamepadShortcuts } from './lib/androidGamepadShortcuts';
import { configureHandheldImmersiveMode } from './lib/handheldImmersiveMode';
import { hydrateLocalStorageFromPreferences } from './lib/localPersistence';
import { persistentStorageKeys } from './lib/persistentStorageKeys';
import {
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
