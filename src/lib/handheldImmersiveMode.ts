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

type NavigationBarModule = {
  NavigationBar?: {
    setColor?: (options: { color: string; darkButtons?: boolean }) => Promise<void>;
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
const navigationBarModuleName = '@capacitor/navigation-bar';
const screenOrientationModuleName = '@capacitor/screen-orientation';
const darkSystemBarColor = '#0d0c0c';
const lightSystemBarColor = '#faf7f5';
const landscapeLockPreferenceKey = 'questshelf.landscapeLock.v1';

export async function configureHandheldImmersiveMode() {
  if (!(await isNativeAndroid())) {
    return;
  }

  await applyFullscreenStatusBar();
  await applyLandscapePreference();
  window.addEventListener('focus', applyFullscreenStatusBar);
  window.addEventListener('questshelf:theme-change', () => void applyFullscreenStatusBar());
  window.addEventListener('questshelf:landscape-lock-change', () => void applyLandscapePreference());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void applyFullscreenStatusBar();
      void applyLandscapePreference();
    }
  });

  const app = await getAppPlugin();
  await app?.App.addListener('resume', () => {
    void applyFullscreenStatusBar();
    void applyLandscapePreference();
  });
  await app?.App.addListener('appStateChange', (state) => {
    if (state?.isActive) {
      void applyFullscreenStatusBar();
      void applyLandscapePreference();
    }
  });
}

async function applyFullscreenStatusBar() {
  const statusBar = await getStatusBarPlugin();

  if (!statusBar) {
    return;
  }

  try {
    const resolvedTheme = getResolvedDocumentTheme();
    const barColor = resolvedTheme === 'light' ? lightSystemBarColor : darkSystemBarColor;

    await statusBar.StatusBar.setStyle({
      style: resolvedTheme === 'light' ? (statusBar.Style?.Light ?? 'LIGHT') : (statusBar.Style?.Dark ?? 'DARK'),
    });
    await statusBar.StatusBar.setBackgroundColor({ color: barColor });
    await statusBar.StatusBar.setOverlaysWebView({ overlay: true });
    await statusBar.StatusBar.hide();
    await applyNavigationBarColor(barColor, resolvedTheme === 'light');
  } catch {
    // Immersive mode is a progressive Android enhancement; the app shell remains usable if a device denies it.
  }
}

async function applyLandscapePreference() {
  if (window.localStorage.getItem(landscapeLockPreferenceKey) === 'false') {
    return;
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
    };
    await orientation.lock?.('landscape');
    return;
  } catch {
    // Some WebViews require a native plugin or user gesture for orientation locks.
  }

  try {
    const orientation = (await import(/* @vite-ignore */ screenOrientationModuleName)) as {
      ScreenOrientation?: { lock: (options: { orientation: 'landscape' }) => Promise<void> };
    };
    await orientation.ScreenOrientation?.lock({ orientation: 'landscape' });
  } catch {
    // Optional plugin support: the manifest/config still prefer landscape when the plugin is absent.
  }
}

async function applyNavigationBarColor(color: string, darkButtons: boolean) {
  try {
    const navigationBar = (await import(/* @vite-ignore */ navigationBarModuleName)) as NavigationBarModule;
    await navigationBar.NavigationBar?.setColor?.({ color, darkButtons });
  } catch {
    // Navigation bar color support depends on the optional native plugin and Android API level.
  }
}

function getResolvedDocumentTheme() {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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
