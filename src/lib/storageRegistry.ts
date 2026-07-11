export type QuestShelfStorageKey =
  | 'questshelf.achievementCounters.v1'
  | 'questshelf.games.v1'
  | 'questshelf.rawgMetadataCache.v1'
  | 'questshelf.screenshots.v1'
  | 'questshelf.personalRecommendations.v1'
  | 'questshelf.personalRecommendations.v2'
  | 'questshelf.releaseCalendar.v2'
  | 'questshelf.rawgSettings.v1'
  | 'questshelf.steamGridDbSettings.v1'
  | 'questshelf.isThereAnyDealSettings.v1'
  | 'questshelf.steamIgnoredGames.v1'
  | 'questshelf.steamSettings.v1'
  | 'questshelf.libraryFilters.v1'
  | 'questshelf.wishlistFilters.v1'
  | 'questshelf.onboarding.v1'
  | 'questshelf.platformQueues.v1'
  | 'questshelf.playActivity.v1'
  | 'questshelf.reviewMode.v1'
  | 'questshelf.syncFolderSettings.v1'
  | 'questshelf.installHintDismissed.v1'
  | 'questshelf.landscapeLock.v1'
  | 'questshelf.settingsCategory.v1'
  | 'questshelf.themePreference.v1'
  | 'questshelf.accentColor.v1'
  | 'questshelf.secondaryAccentColor.v1'
  | 'questshelf.neonButtonGradientBalance.v1'
  | 'questshelf.neonButtonGradientMidpoint.v1'
  | 'questshelf.gradientOrientation.v1'
  | 'questshelf.appTemplate.v1'
  | 'questshelf.appPersonalization.v1'
  | 'questshelf.shelfIdentity.v1'
  | 'questshelf.languagePreference.v1'
  | 'questshelf.navigationVisibility.v1'
  | 'questshelf.homeWidgets.v1'
  | 'questshelf.analyticsSettings.v1'
  | 'questshelf.storageIssues.v1';

export type StorageKeyScope = 'core' | 'integration' | 'device' | 'ui' | 'recovery';

/**
 * Where a key's data lives. 'kv' = the JSON-per-key localStorage + Capacitor Preferences
 * path (the default). 'collection' = an IndexedDB-backed store; such keys are NOT mirrored
 * to / hydrated from Capacitor Preferences. `questshelf.games.v1` (Wave 3),
 * `questshelf.rawgMetadataCache.v1` (Wave 4), and `questshelf.playActivity.v1` (Wave 4b)
 * are 'collection'; they keep their key names so backups stay compatible.
 */
export type StorageKeyStore = 'kv' | 'collection';

export type StorageKeyDescriptor = {
  backup: 'default' | 'optional' | 'never';
  key: QuestShelfStorageKey;
  purpose: string;
  scope: StorageKeyScope;
  schema: string;
  store?: StorageKeyStore;
};

export const storageKeyRegistry: StorageKeyDescriptor[] = [
  {
    backup: 'default',
    key: 'questshelf.achievementCounters.v1',
    purpose: 'Event-based achievement counters: active days, session opens, Quest Runner stats, backup events, playing streak.',
    scope: 'core',
    schema: 'AchievementCounters.',
  },
  {
    backup: 'default',
    key: 'questshelf.games.v1',
    purpose: 'Library and Wishlist game records. Wave 3: stored in the IndexedDB game store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape.',
    scope: 'core',
    schema: 'Game[] normalized by gameStorage.',
    store: 'collection',
  },
  {
    backup: 'default',
    key: 'questshelf.rawgMetadataCache.v1',
    purpose: 'Local RAWG search/detail cache. Wave 4: stored per-record in the IndexedDB rawgMetadataCache store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape.',
    scope: 'core',
    schema: 'Record<string, RawgMetadataCacheEntry>.',
    store: 'collection',
  },

  {
    backup: 'never',
    key: 'questshelf.screenshots.v1',
    purpose: 'RAWG screenshot URL cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'core',
    schema: 'Record<string, { urls: string[]; provider: string; cachedAt: number }>.',
    store: 'collection',
  },
  {
    backup: 'never',
    key: 'questshelf.personalRecommendations.v2',
    purpose: 'Personal discovery recommendation cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'core',
    schema: 'Recommendation cache entry keyed by profile fingerprint.',
    store: 'collection',
  },
  {
    backup: 'never',
    key: 'questshelf.releaseCalendar.v2',
    purpose: 'Personalized release calendar cache. Stored in IndexedDB appCaches; legacy localStorage blobs are migrated and removed.',
    scope: 'core',
    schema: 'Release calendar cache entry keyed by profile fingerprint/date range.',
    store: 'collection',
  },
  {
    backup: 'default',
    key: 'questshelf.steamIgnoredGames.v1',
    purpose: 'Steam App IDs intentionally skipped during import/sync.',
    scope: 'core',
    schema: 'IgnoredSteamGame[].',
  },
  {
    backup: 'default',
    key: 'questshelf.libraryFilters.v1',
    purpose: 'Last Library filter/sort state.',
    scope: 'core',
    schema: 'CollectionFilters object.',
  },
  {
    backup: 'default',
    key: 'questshelf.wishlistFilters.v1',
    purpose: 'Last Wishlist filter/sort state.',
    scope: 'core',
    schema: 'CollectionFilters object.',
  },
  {
    backup: 'default',
    key: 'questshelf.onboarding.v1',
    purpose: 'First-run setup progress.',
    scope: 'core',
    schema: 'OnboardingState.',
  },
  {
    backup: 'default',
    key: 'questshelf.platformQueues.v1',
    purpose: 'Active platforms, platform plan entries, and per-platform limits.',
    scope: 'core',
    schema: 'PlatformQueueState.',
  },

  {
    backup: 'default',
    key: 'questshelf.playActivity.v1',
    purpose: 'Daily play intent activity records for games marked as played today. Wave 4b: stored per-record in the IndexedDB playActivity store; this blob is a read-only import fallback kept inert (not mirrored to Preferences). Still the backup export/import shape.',
    scope: 'core',
    schema: 'PlayActivityRecord[] normalized by playActivityStorage.',
    store: 'collection',
  },
  {
    backup: 'default',
    key: 'questshelf.reviewMode.v1',
    purpose: 'Quest Queue ignored IDs, source, and stats.',
    scope: 'core',
    schema: 'ReviewModeState.',
  },
  {
    backup: 'optional',
    key: 'questshelf.rawgSettings.v1',
    purpose: 'RAWG API key.',
    scope: 'integration',
    schema: 'RawgSettings.',
  },
  {
    backup: 'optional',
    key: 'questshelf.steamGridDbSettings.v1',
    purpose: 'SteamGridDB API key.',
    scope: 'integration',
    schema: 'SteamGridDbSettings.',
  },
  {
    backup: 'optional',
    key: 'questshelf.isThereAnyDealSettings.v1',
    purpose: 'IsThereAnyDeal API key.',
    scope: 'integration',
    schema: 'IsThereAnyDealSettings.',
  },
  {
    backup: 'optional',
    key: 'questshelf.steamSettings.v1',
    purpose: 'Steam API key, SteamID64, and optional wishlist URL.',
    scope: 'integration',
    schema: 'SteamSettings.',
  },
  {
    backup: 'never',
    key: 'questshelf.syncFolderSettings.v1',
    purpose: 'Device-specific auto-backup settings.',
    scope: 'device',
    schema: 'SyncFolderSettings.',
  },
  {
    backup: 'never',
    key: 'questshelf.installHintDismissed.v1',
    purpose: 'PWA install hint dismissal.',
    scope: 'ui',
    schema: 'String boolean.',
  },
  {
    backup: 'never',
    key: 'questshelf.landscapeLock.v1',
    purpose: 'Preferred Android landscape lock setting.',
    scope: 'device',
    schema: 'String boolean.',
  },
  {
    backup: 'never',
    key: 'questshelf.settingsCategory.v1',
    purpose: 'Last opened Settings category.',
    scope: 'ui',
    schema: 'Settings category string.',
  },
  {
    backup: 'never',
    key: 'questshelf.themePreference.v1',
    purpose: 'Light, Dark, or System appearance preference.',
    scope: 'ui',
    schema: '\'light\' | \'dark\' | \'system\'.',
  },
  {
    backup: 'never',
    key: 'questshelf.accentColor.v1',
    purpose: 'Custom app-wide primary accent color preference.',
    scope: 'ui',
    schema: 'Lowercase #rrggbb string or empty for default.',
  },
  {
    backup: 'never',
    key: 'questshelf.secondaryAccentColor.v1',
    purpose: 'Custom Neon secondary accent color preference.',
    scope: 'ui',
    schema: 'Lowercase #rrggbb string or empty for default.',
  },
  {
    backup: 'never',
    key: 'questshelf.neonButtonGradientBalance.v1',
    purpose: 'Custom Neon CTA/button gradient primary-secondary balance.',
    scope: 'ui',
    schema: 'Integer 0-100, default 50 when absent.',
  },
  {
    backup: 'never',
    key: 'questshelf.neonButtonGradientMidpoint.v1',
    purpose: 'Custom Neon CTA/button gradient transition midpoint/spread.',
    scope: 'ui',
    schema: 'Integer 0-100, default 50 when absent.',
  },
  {
    backup: 'never',
    key: 'questshelf.gradientOrientation.v1',
    purpose: 'Custom primary-secondary accent gradient orientation.',
    scope: 'ui',
    schema: '\'horizontal\' | \'vertical\' | \'diagonal-down\' | \'diagonal-up\', default diagonal-down when absent.',
  },
  {
    backup: 'never',
    key: 'questshelf.appTemplate.v1',
    purpose: 'Selected visual app template.',
    scope: 'ui',
    schema: '\'classic\' | \'neon-deck\'.',
  },
  {
    backup: 'default',
    key: 'questshelf.appPersonalization.v1',
    purpose: 'Library owner nickname used for personalized app titles.',
    scope: 'ui',
    schema: 'AppPersonalizationSettings.',
  },
  {
    backup: 'default',
    key: 'questshelf.shelfIdentity.v1',
    purpose: 'Shelf Identity personalization fields for shelf name and avatar selection.',
    scope: 'core',
    schema: 'ShelfIdentitySettings with shelfName, shelfAvatar, avatarSelection, customAvatarDataUrl, and selectedActiveBadgeId only; unlocked badges.',
  },
  {
    backup: 'never',
    key: 'questshelf.languagePreference.v1',
    purpose: 'Selected app language.',
    scope: 'ui',
    schema: '\'en\' | \'cs\'.',
  },
  {
    backup: 'never',
    key: 'questshelf.navigationVisibility.v1',
    purpose: 'Top navigation section visibility preferences.',
    scope: 'ui',
    schema: 'Record of configurable navigation section IDs to booleans.',
  },
  {
    backup: 'never',
    key: 'questshelf.homeWidgets.v1',
    purpose: 'Home screen widget visibility preferences.',
    scope: 'ui',
    schema: 'Record of configurable Home widget IDs to booleans.',
  },
  {
    backup: 'never',
    key: 'questshelf.analyticsSettings.v1',
    purpose: 'Local anonymous analytics opt-in/out and notice settings.',
    scope: 'device',
    schema: 'AnalyticsSettings.',
  },
  {
    backup: 'never',
    key: 'questshelf.storageIssues.v1',
    purpose: 'Best-effort record of storage parse/write issues for recovery UI.',
    scope: 'recovery',
    schema: 'LocalStorageIssue[].',
  },
];

export const coreBackupStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'default')
  .map((descriptor) => descriptor.key);

export const integrationBackupStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'optional')
  .map((descriptor) => descriptor.key);

export const deviceOnlyStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.backup === 'never')
  .map((descriptor) => descriptor.key);

// Keys mirrored to / hydrated from Capacitor Preferences. Collection-backed keys
// (IndexedDB) are excluded: their data must not round-trip through Preferences.
export const persistentStorageKeys = storageKeyRegistry
  .filter((descriptor) => descriptor.store !== 'collection')
  .map((descriptor) => descriptor.key);
