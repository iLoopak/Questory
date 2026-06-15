export type QuestShelfStorageKey =
  | 'questshelf.games.v1'
  | 'questshelf.rawgMetadataCache.v1'
  | 'questshelf.rawgSettings.v1'
  | 'questshelf.isThereAnyDealSettings.v1'
  | 'questshelf.steamIgnoredGames.v1'
  | 'questshelf.steamSettings.v1'
  | 'questshelf.libraryFilters.v1'
  | 'questshelf.wishlistFilters.v1'
  | 'questshelf.onboarding.v1'
  | 'questshelf.platformQueues.v1'
  | 'questshelf.reviewMode.v1'
  | 'questshelf.syncFolderSettings.v1'
  | 'questshelf.installHintDismissed.v1'
  | 'questshelf.landscapeLock.v1'
  | 'questshelf.settingsCategory.v1'
  | 'questshelf.themePreference.v1'
  | 'questshelf.accentColor.v1'
  | 'questshelf.secondaryAccentColor.v1'
  | 'questshelf.neonButtonGradientBalance.v1'
  | 'questshelf.appTemplate.v1'
  | 'questshelf.appPersonalization.v1'
  | 'questshelf.shelfIdentity.v1'
  | 'questshelf.languagePreference.v1'
  | 'questshelf.navigationVisibility.v1'
  | 'questshelf.storageIssues.v1';

export type StorageKeyScope = 'core' | 'integration' | 'device' | 'ui' | 'recovery';

export type StorageKeyDescriptor = {
  backup: 'default' | 'optional' | 'never';
  key: QuestShelfStorageKey;
  purpose: string;
  scope: StorageKeyScope;
  schema: string;
};

export const storageKeyRegistry: StorageKeyDescriptor[] = [
  {
    backup: 'default',
    key: 'questshelf.games.v1',
    purpose: 'Library and Wishlist game records.',
    scope: 'core',
    schema: 'Game[] normalized by gameStorage.',
  },
  {
    backup: 'default',
    key: 'questshelf.rawgMetadataCache.v1',
    purpose: 'Local RAWG search/detail cache.',
    scope: 'core',
    schema: 'Record<string, RawgMetadataCacheEntry>.',
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
    schema: 'ShelfIdentitySettings with shelfName, shelfAvatar, avatarSelection, customAvatarDataUrl, and selectedActiveBadgeId only; unlocked badges and featured game are computed from library and queue data.',
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

export const persistentStorageKeys = storageKeyRegistry.map((descriptor) => descriptor.key);
