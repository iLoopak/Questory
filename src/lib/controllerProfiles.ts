export type ControllerProfileId =
  | 'auto'
  | 'xbox'
  | 'playstation'
  | 'nintendo'
  | 'steam-deck'
  | 'retroid'
  | 'generic-android'
  | 'generic-hid';

export const controllerProfileIds: ControllerProfileId[] = [
  'auto',
  'xbox',
  'playstation',
  'nintendo',
  'steam-deck',
  'retroid',
  'generic-android',
  'generic-hid',
];

export type ButtonIconStyle = 'xbox' | 'playstation' | 'nintendo' | 'text';

export type ConfirmCancelConvention =
  | 'xbox'      // button index 0 (South) = confirm, index 1 (East) = cancel
  | 'nintendo'; // button index 1 (East) = confirm, index 0 (South) = cancel

export type ControllerQuirk =
  | 'swapped-ab'             // A and B are physically swapped vs W3C standard position
  | 'dpad-duplicates-stick'  // D-pad input also fires as left-stick axis
  | 'triggers-as-axes'       // L2/R2 appear in axes[], not buttons[] indices 6/7
  | 'noisy-left-stick'       // left stick has significant drift at rest
  | 'noisy-right-stick'
  | 'broken-l2'
  | 'broken-r2'
  | 'missing-start-label'
  | 'missing-select-label'
  | 'android-webview-b-close'; // B fires Android back-navigation in WebView

export type ControllerProfile = {
  id: ControllerProfileId;
  displayName: string;
  buttonIconStyle: ButtonIconStyle;
  confirmCancelConvention: ConfirmCancelConvention;
  defaultDeadzone: number;
  stickRepeatInitialMs: number;
  stickRepeatMs: number;
  scrollSpeedMultiplier: number;
  quirks: ControllerQuirk[];
  // null = use standard Gamepad API button indices 6/7 for triggers
  triggerLeftAxis: number | null;
  triggerRightAxis: number | null;
};

const profileCatalogue: Record<Exclude<ControllerProfileId, 'auto'>, ControllerProfile> = {
  xbox: {
    id: 'xbox',
    displayName: 'Xbox / XInput',
    buttonIconStyle: 'xbox',
    confirmCancelConvention: 'xbox',
    defaultDeadzone: 0.15,
    stickRepeatInitialMs: 200,
    stickRepeatMs: 120,
    scrollSpeedMultiplier: 1.0,
    quirks: [],
    triggerLeftAxis: null,
    triggerRightAxis: null,
  },
  playstation: {
    id: 'playstation',
    displayName: 'PlayStation',
    buttonIconStyle: 'playstation',
    confirmCancelConvention: 'xbox', // ✕ (index 0, South) = confirm, same physical position as Xbox A
    defaultDeadzone: 0.15,
    stickRepeatInitialMs: 200,
    stickRepeatMs: 120,
    scrollSpeedMultiplier: 1.0,
    quirks: [],
    triggerLeftAxis: null,
    triggerRightAxis: null,
  },
  nintendo: {
    id: 'nintendo',
    displayName: 'Nintendo',
    buttonIconStyle: 'nintendo',
    confirmCancelConvention: 'nintendo', // B (index 1, East) = confirm, A (index 0, South) = cancel
    defaultDeadzone: 0.15,
    stickRepeatInitialMs: 200,
    stickRepeatMs: 120,
    scrollSpeedMultiplier: 1.0,
    quirks: ['swapped-ab'],
    triggerLeftAxis: null,
    triggerRightAxis: null,
  },
  'steam-deck': {
    id: 'steam-deck',
    displayName: 'Steam Deck',
    buttonIconStyle: 'xbox',
    confirmCancelConvention: 'xbox',
    defaultDeadzone: 0.12,
    stickRepeatInitialMs: 200,
    stickRepeatMs: 100,
    scrollSpeedMultiplier: 1.0,
    quirks: [],
    triggerLeftAxis: null,
    triggerRightAxis: null,
  },
  retroid: {
    id: 'retroid',
    displayName: 'Retroid Handheld',
    buttonIconStyle: 'nintendo',
    confirmCancelConvention: 'nintendo',
    defaultDeadzone: 0.55,
    stickRepeatInitialMs: 240,
    stickRepeatMs: 150,
    scrollSpeedMultiplier: 1.0,
    quirks: ['triggers-as-axes', 'noisy-left-stick'],
    triggerLeftAxis: 2,
    triggerRightAxis: 5,
  },
  'generic-android': {
    id: 'generic-android',
    displayName: 'Android Handheld',
    buttonIconStyle: 'nintendo',
    confirmCancelConvention: 'nintendo',
    defaultDeadzone: 0.55,
    stickRepeatInitialMs: 240,
    stickRepeatMs: 150,
    scrollSpeedMultiplier: 1.0,
    quirks: ['triggers-as-axes', 'dpad-duplicates-stick', 'android-webview-b-close'],
    triggerLeftAxis: 2,
    triggerRightAxis: 5,
  },
  'generic-hid': {
    id: 'generic-hid',
    displayName: 'Generic HID Controller',
    buttonIconStyle: 'xbox',
    confirmCancelConvention: 'xbox',
    defaultDeadzone: 0.25,
    stickRepeatInitialMs: 200,
    stickRepeatMs: 130,
    scrollSpeedMultiplier: 1.0,
    quirks: [],
    triggerLeftAxis: null,
    triggerRightAxis: null,
  },
};

export type ControllerButtonLabels = {
  primary: string;
  cancel: string;
  leftFace: string;
  topFace: string;
};

export function getControllerButtonLabels(convention: ConfirmCancelConvention): ControllerButtonLabels {
  if (convention === 'nintendo') {
    return { primary: 'A', cancel: 'B', leftFace: 'Y', topFace: 'X' };
  }
  return { primary: 'A', cancel: 'B', leftFace: 'X', topFace: 'Y' };
}

export const controllerProfileDetectedEvent = 'questshelf:controller-profile-detected';

export function getProfile(id: Exclude<ControllerProfileId, 'auto'>): ControllerProfile {
  return profileCatalogue[id];
}

export function getProfileDisplayName(id: ControllerProfileId): string {
  if (id === 'auto') return 'Auto detect';
  return profileCatalogue[id].displayName;
}

// Returns the resolved concrete profile for a given id + optional detected gamepad id.
// When id is 'auto', falls back to detecting from gamepadId, then to generic-hid.
export function resolveProfile(
  id: ControllerProfileId,
  detectedId: ControllerProfileId | null = null,
): ControllerProfile {
  if (id !== 'auto') {
    return profileCatalogue[id];
  }
  if (detectedId && detectedId !== 'auto') {
    return profileCatalogue[detectedId];
  }
  return profileCatalogue['generic-hid'];
}

// Derives a profile id from the browser-reported gamepad.id string.
// Returns null when the id is unrecognized (caller falls back to generic-hid via resolveProfile).
export function detectProfileFromGamepadId(gamepadId: string): ControllerProfileId | null {
  const id = gamepadId.toLowerCase();

  if (
    id.includes('retroid') ||
    id.includes('r36s') ||
    id.includes('rg35xx') ||
    id.includes('0079') // common Retroid USB vendor id
  ) {
    return 'retroid';
  }

  if (id.includes('steam') || id.includes('valve')) {
    return 'steam-deck';
  }

  if (
    id.includes('xbox') ||
    id.includes('xinput') ||
    id.includes('045e') // Microsoft USB vendor id
  ) {
    return 'xbox';
  }

  if (
    id.includes('dualsense') ||
    id.includes('dualshock') ||
    id.includes('sony') ||
    id.includes('054c') // Sony USB vendor id
  ) {
    return 'playstation';
  }

  if (
    id.includes('nintendo') ||
    id.includes('pro controller') ||
    id.includes('057e') // Nintendo USB vendor id
  ) {
    return 'nintendo';
  }

  if (
    id.includes('anbernic') ||
    id.includes('ayn') ||
    id.includes('odin') ||
    id.includes('powkiddy') ||
    id.includes('gameforce') ||
    id.includes('rk2') ||
    id.includes('rk3')
  ) {
    return 'generic-android';
  }

  return null;
}
