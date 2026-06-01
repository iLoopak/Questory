const landscapeLockPreferenceKey = 'questshelf.landscapeLock.v1';

export function loadLandscapeLockPreference() {
  if (typeof window === 'undefined') {
    return true;
  }

  return window.localStorage.getItem(landscapeLockPreferenceKey) !== 'false';
}

export function saveLandscapeLockPreference(isEnabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(landscapeLockPreferenceKey, isEnabled ? 'true' : 'false');
}
