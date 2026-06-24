import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.questshelf.handheld',
  appName: 'Questory',
  webDir: 'dist',
  backgroundColor: '#0d0c0c',
  android: {
    backgroundColor: '#0d0c0c',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0d0c0c',
      launchAutoHide: true,
      launchShowDuration: 900,
      launchFadeOutDuration: 220,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
    },
    StatusBar: {
      backgroundColor: '#0d0c0c',
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
