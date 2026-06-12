import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onRegisterError: () => {
      // Offline support is a progressive enhancement; the app still works without registration.
    },
  });
}
