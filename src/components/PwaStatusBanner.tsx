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
      <div className="hidden rounded-md border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-100 sm:block">
        {t('pwa.offline')}
      </div>
    );
  }

  if (isNativeAndroid || isInstalled || isInstallDismissed) {
    return null;
  }

  return (
    <button
      aria-label={t('pwa.installHint').replace('{appTitle}', appTitle)}
      className="h-8 shrink-0 rounded-md border border-mint/30 bg-mint/10 px-2 text-xs font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow sm:px-3"
      onClick={installApp}
      onContextMenu={(event) => {
        event.preventDefault();
        dismissInstallHint();
      }}
      title={`Install ${appTitle}`}
      type="button"
    >
      Install
    </button>
  );
}

function isStandaloneMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches;
}
