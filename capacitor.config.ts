import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.questshelf.handheld',
  appName: 'QuestShelf',
  webDir: 'dist',
  backgroundColor: '#050a12',
  plugins: {
    SplashScreen: {
      backgroundColor: '#050a12',
      launchAutoHide: true,
      launchFadeOutDuration: 220,
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#050a12',
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
