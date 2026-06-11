import { useEffect, useState } from 'react';
import { isNativeAndroidRuntime } from '../lib/capacitorEnvironment';
import { useI18n } from '../i18n';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const installDismissedKey = 'questshelf.installHintDismissed.v1';

export function PwaStatusBanner({ appTitle = 'QuestShelf' }: { appTitle?: string }) {
  const { t } = useI18n();
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [isNativeAndroid] = useState(() => isNativeAndroidRuntime());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());
  const [isInstallDismissed, setIsInstallDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(installDismissedKey) === 'true';
  });

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  function dismissInstallHint() {
    window.localStorage.setItem(installDismissedKey, 'true');
    setIsInstallDismissed(true);
  }

  async function installApp() {
    if (!installPrompt) {
      dismissInstallHint();
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === 'dismissed') {
      dismissInstallHint();
    }
  }

  if (!isOnline) {
    return (
      <div className="rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
        {t('pwa.offline')}
      </div>
    );
  }

  if (isNativeAndroid || isInstalled || isInstallDismissed) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-ink-900 px-3 py-2 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
      <span>{t('pwa.installHint').replace('{appTitle}', appTitle)}</span>
      <div className="flex gap-2">
        <button className="h-8 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint" onClick={installApp} type="button">
          Install {appTitle}
        </button>
        <button className="h-8 rounded-md border border-white/10 px-3 text-sm text-slate-300" onClick={dismissInstallHint} type="button">
          Not now
        </button>
      </div>
    </div>
  );
}

function isStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches;
}
