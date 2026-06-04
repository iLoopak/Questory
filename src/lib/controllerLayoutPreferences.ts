import { getRuntimeEnvironment } from './capacitorEnvironment';
import { loadLocalJson, savePersistedJson } from './localPersistence';

export const controllerLayouts = ['auto', 'xbox', 'nintendo'] as const;
export type ControllerLayoutPreference = (typeof controllerLayouts)[number];
export type ResolvedControllerLayout = 'xbox' | 'nintendo';

const controllerLayoutStorageKey = 'questshelf.controllerLayout.v1';

export function loadControllerLayoutPreference(): ControllerLayoutPreference {
  const stored = loadLocalJson<ControllerLayoutPreference>(controllerLayoutStorageKey, 'auto', (value) => controllerLayouts.includes(value as ControllerLayoutPreference) ? value as ControllerLayoutPreference : 'auto');
  return controllerLayouts.includes(stored) ? stored : 'auto';
}

export function saveControllerLayoutPreference(preference: ControllerLayoutPreference) {
  savePersistedJson(controllerLayoutStorageKey, preference);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ControllerLayoutPreference>('questshelf:controller-layout-change', { detail: preference }));
  }
}

export function resolveControllerLayout(preference: ControllerLayoutPreference): ResolvedControllerLayout {
  if (preference === 'xbox' || preference === 'nintendo') {
    return preference;
  }

  const environment = getRuntimeEnvironment();
  return environment.isAndroid ? 'nintendo' : 'xbox';
}

export function getControllerButtonLabels(preference: ControllerLayoutPreference) {
  const layout = resolveControllerLayout(preference);

  if (layout === 'nintendo') {
    return {
      primary: 'A',
      cancel: 'B',
      leftFace: 'Y',
      topFace: 'X',
    };
  }

  return {
    primary: 'A',
    cancel: 'B',
    leftFace: 'X',
    topFace: 'Y',
  };
}
