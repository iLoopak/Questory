export const analyticsSchemaVersion = 1 as const;

export const analyticsEventNames = [
  'app_open',
  'first_run_completed',
  'import_completed',
  'quest_queue_opened',
  'platform_plans_opened',
  'backup_exported',
  'backup_imported',
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type AnalyticsSchemaVersion = typeof analyticsSchemaVersion;

export const analyticsRuntimeValues = ['web', 'android', 'pwa', 'unknown'] as const;
export type AnalyticsRuntime = (typeof analyticsRuntimeValues)[number];

export const analyticsImportSources = ['steam', 'wishlist_html', 'retro', 'backup', 'manual', 'unknown'] as const;
export type AnalyticsImportSource = (typeof analyticsImportSources)[number];

export const countBuckets = ['0', '1', '2-5', '6-10', '11-25', '26-50', '51-100', '101-250', '251-500', '501-1000', '1000+'] as const;
export type CountBucket = (typeof countBuckets)[number];

export type MinimalAnalyticsEvent = {
  schemaVersion: AnalyticsSchemaVersion;
  eventName: AnalyticsEventName;
  eventId: string;
  timestamp: string;
  appVersion: string;
  runtime: AnalyticsRuntime;
  librarySizeBucket: CountBucket;
  wishlistSizeBucket: CountBucket;
  platformCountBucket: CountBucket;
  playingCountBucket: CountBucket;
  queueCountBucket: CountBucket;
  importSource?: AnalyticsImportSource;
};

export type AnalyticsCounts = {
  librarySize: number;
  wishlistSize: number;
  platformCount: number;
  playingCount: number;
  queueCount: number;
};
