import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.questshelf.handheld',
  appName: 'QuestShelf',
  webDir: 'dist',
  backgroundColor: '#050a12',
  android: {
    backgroundColor: '#050a12',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#050a12',
      launchAutoHide: true,
      launchShowDuration: 900,
      launchFadeOutDuration: 220,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
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
