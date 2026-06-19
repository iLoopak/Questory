export const analyticsSettingsStorageKey = 'questshelf.analyticsSettings.v1';

export type AnalyticsSettings = {
  schemaVersion: 1;
  isAnalyticsEnabled: boolean;
  hasSeenAnalyticsNotice: boolean;
  updatedAt: string;
};

export const defaultAnalyticsSettings: AnalyticsSettings = {
  schemaVersion: 1,
  isAnalyticsEnabled: false,
  hasSeenAnalyticsNotice: false,
  updatedAt: '',
};

function normalizeAnalyticsSettings(value: unknown): AnalyticsSettings {
  if (!value || typeof value !== 'object') return defaultAnalyticsSettings;
  const candidate = value as Partial<AnalyticsSettings>;
  return {
    schemaVersion: 1,
    isAnalyticsEnabled: candidate.isAnalyticsEnabled === true,
    hasSeenAnalyticsNotice: candidate.hasSeenAnalyticsNotice === true,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
  };
}

export function loadAnalyticsSettings(): AnalyticsSettings {
  if (typeof window === 'undefined') return defaultAnalyticsSettings;
  try {
    const rawValue = window.localStorage.getItem(analyticsSettingsStorageKey);
    if (!rawValue) return defaultAnalyticsSettings;
    return normalizeAnalyticsSettings(JSON.parse(rawValue));
  } catch {
    return defaultAnalyticsSettings;
  }
}

export function saveAnalyticsSettings(settings: AnalyticsSettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(analyticsSettingsStorageKey, JSON.stringify(normalizeAnalyticsSettings(settings)));
  } catch {
    // Analytics settings are best-effort and must not break app behavior.
  }
}

export function updateAnalyticsEnabled(isAnalyticsEnabled: boolean) {
  const nextSettings: AnalyticsSettings = {
    ...loadAnalyticsSettings(),
    isAnalyticsEnabled,
    hasSeenAnalyticsNotice: true,
    updatedAt: new Date().toISOString(),
  };
  saveAnalyticsSettings(nextSettings);
  return nextSettings;
}
