import { Capacitor } from '@capacitor/core';

export type RuntimeEnvironment = {
  isAndroid: boolean;
  isNative: boolean;
  platform: string;
};

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  return {
    isAndroid: isNative && platform === 'android',
    isNative,
    platform,
  };
}

export function isNativeAndroidRuntime() {
  return getRuntimeEnvironment().isAndroid;
}
