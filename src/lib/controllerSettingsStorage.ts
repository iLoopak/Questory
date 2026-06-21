import { loadLocalJson, savePersistedJson } from './localPersistence';
import { type ControllerProfileId, controllerProfileIds } from './controllerProfiles';

export type ControllerSettings = {
  profileId: ControllerProfileId;
};

const controllerSettingsStorageKey = 'questshelf.controllerSettings.v1';
const legacyLayoutKey = 'questshelf.controllerLayout.v1';

export const controllerSettingsChangedEvent = 'questshelf:controller-settings-change';

const defaultControllerSettings: ControllerSettings = {
  profileId: 'auto',
};

function normalizeControllerSettings(value: unknown): ControllerSettings {
  if (!value || typeof value !== 'object') {
    return defaultControllerSettings;
  }

  const raw = value as Partial<ControllerSettings>;
  const profileId: ControllerProfileId =
    typeof raw.profileId === 'string' && controllerProfileIds.includes(raw.profileId as ControllerProfileId)
      ? (raw.profileId as ControllerProfileId)
      : defaultControllerSettings.profileId;

  return { profileId };
}

// Maps the legacy 3-value layout preference to a profile id.
function migrateLayoutPreference(stored: string | null): ControllerProfileId {
  if (stored === 'nintendo') return 'nintendo';
  if (stored === 'xbox') return 'xbox';
  return 'auto';
}

export function loadControllerSettings(): ControllerSettings {
  const existing = typeof window !== 'undefined'
    ? window.localStorage.getItem(controllerSettingsStorageKey)
    : null;

  if (existing) {
    try {
      return normalizeControllerSettings(JSON.parse(existing));
    } catch {
      // fall through to migration
    }
  }

  // First load: derive profile from legacy controllerLayout.v1 if present.
  if (typeof window !== 'undefined') {
    const legacyLayout = window.localStorage.getItem(legacyLayoutKey);
    if (legacyLayout) {
      const migrated: ControllerSettings = {
        profileId: migrateLayoutPreference(legacyLayout),
      };
      saveControllerSettings(migrated);
      return migrated;
    }
  }

  return defaultControllerSettings;
}

export function saveControllerSettings(settings: ControllerSettings): void {
  savePersistedJson(controllerSettingsStorageKey, settings);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ControllerSettings>(controllerSettingsChangedEvent, { detail: settings }),
    );
  }
}
