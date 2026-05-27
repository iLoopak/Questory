type CapacitorCoreModule = {
  Capacitor?: {
    getPlatform: () => string;
    isNativePlatform: () => boolean;
  };
};

type StatusBarModule = {
  StatusBar: {
    hide: () => Promise<void>;
    setBackgroundColor: (options: { color: string }) => Promise<void>;
    setOverlaysWebView: (options: { overlay: boolean }) => Promise<void>;
    setStyle: (options: { style: 'DARK' | 'LIGHT' }) => Promise<void>;
  };
  Style?: {
    Dark: 'DARK';
    Light: 'LIGHT';
  };
};

type AppModule = {
  App: {
    addListener: (eventName: 'appStateChange' | 'resume', listenerFunc: (state?: { isActive: boolean }) => void) => Promise<{
      remove: () => Promise<void>;
    }>;
  };
};

const capacitorCoreModuleName = '@capacitor/core';
const statusBarModuleName = '@capacitor/status-bar';
const appModuleName = '@capacitor/app';
const systemBarColor = '#050a12';

export async function configureHandheldImmersiveMode() {
  if (!(await isNativeAndroid())) {
    return;
  }

  await applyFullscreenStatusBar();
  window.addEventListener('focus', applyFullscreenStatusBar);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void applyFullscreenStatusBar();
    }
  });

  const app = await getAppPlugin();
  await app?.App.addListener('resume', () => void applyFullscreenStatusBar());
  await app?.App.addListener('appStateChange', (state) => {
    if (state?.isActive) {
      void applyFullscreenStatusBar();
    }
  });
}

async function applyFullscreenStatusBar() {
  const statusBar = await getStatusBarPlugin();

  if (!statusBar) {
    return;
  }

  try {
    await statusBar.StatusBar.setStyle({ style: statusBar.Style?.Dark ?? 'DARK' });
    await statusBar.StatusBar.setBackgroundColor({ color: systemBarColor });
    await statusBar.StatusBar.setOverlaysWebView({ overlay: true });
    await statusBar.StatusBar.hide();
  } catch {
    // Immersive mode is a progressive Android enhancement; the app shell remains usable if a device denies it.
  }
}

async function isNativeAndroid() {
  const capacitorCore = await getCapacitorCore();
  return Boolean(capacitorCore?.Capacitor?.isNativePlatform() && capacitorCore.Capacitor.getPlatform() === 'android');
}

async function getCapacitorCore(): Promise<CapacitorCoreModule | null> {
  try {
    return (await import(/* @vite-ignore */ capacitorCoreModuleName)) as CapacitorCoreModule;
  } catch {
    return null;
  }
}

async function getStatusBarPlugin(): Promise<StatusBarModule | null> {
  try {
    return (await import(/* @vite-ignore */ statusBarModuleName)) as StatusBarModule;
  } catch {
    return null;
  }
}

async function getAppPlugin(): Promise<AppModule | null> {
  try {
    return (await import(/* @vite-ignore */ appModuleName)) as AppModule;
  } catch {
    return null;
  }
}
