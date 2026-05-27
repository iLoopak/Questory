import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.questshelf.handheld',
  appName: 'QuestShelf',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    StatusBar: {
      backgroundColor: '#050a12',
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
