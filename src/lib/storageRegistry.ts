export type QuestShelfStorageKey =
  | 'questshelf.games.v1'
  | 'questshelf.rawgMetadataCache.v1'
  | 'questshelf.rawgSettings.v1'
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
    purpose: 'Active queue platforms, platform queue entries, and per-platform limits.',
    scope: 'core',
    schema: 'PlatformQueueState.',
  },
  {
    backup: 'default',
    key: 'questshelf.reviewMode.v1',
    purpose: 'Review Mode ignored IDs, source, and stats.',
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
