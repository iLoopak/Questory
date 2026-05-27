import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { configureHandheldImmersiveMode } from './lib/handheldImmersiveMode';
import { hydrateLocalStorageFromPreferences } from './lib/localPersistence';
import { persistentStorageKeys } from './lib/persistentStorageKeys';
import { registerServiceWorker } from './lib/serviceWorkerRegistration';
import './styles.css';

registerServiceWorker();
void configureHandheldImmersiveMode();
await hydrateLocalStorageFromPreferences([...persistentStorageKeys]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
