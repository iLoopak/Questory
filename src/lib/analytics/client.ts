import { getRuntimeEnvironment } from '../capacitorEnvironment';
import { bucketCount } from './buckets';
import { loadAnalyticsSettings } from './settings';
import {
  analyticsEventNames,
  analyticsImportSources,
  analyticsRuntimeValues,
  analyticsSchemaVersion,
  countBuckets,
  type AnalyticsCounts,
  type AnalyticsEventName,
  type AnalyticsImportSource,
  type AnalyticsRuntime,
  type MinimalAnalyticsEvent,
} from './types';

const appVersion = '0.1.0';

const allowedEventNames = new Set<string>(analyticsEventNames);
const allowedImportSources = new Set<string>(analyticsImportSources);
const allowedRuntimes = new Set<string>(analyticsRuntimeValues);
const allowedCountBuckets = new Set<string>(countBuckets);
const allowedBaseFields = new Set([
  'schemaVersion',
  'eventName',
  'eventId',
  'timestamp',
  'appVersion',
  'runtime',
  'librarySizeBucket',
  'wishlistSizeBucket',
  'platformCountBucket',
  'playingCountBucket',
  'queueCountBucket',
]);
const allowedImportFields = new Set([...allowedBaseFields, 'importSource']);

export type AnalyticsConfig = {
  enabled: boolean;
  webhookUrl: string;
  analyticsKey: string;
};

export type TrackAnalyticsOptions = {
  importSource?: AnalyticsImportSource;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export function getAnalyticsConfig(): AnalyticsConfig {
  return {
    enabled: import.meta.env.VITE_QS_ANALYTICS_ENABLED === 'true',
    webhookUrl: import.meta.env.VITE_QS_ANALYTICS_WEBHOOK_URL ?? '',
    analyticsKey: import.meta.env.VITE_QS_ANALYTICS_KEY ?? '',
  };
}

export function isAnalyticsConfigured(config: AnalyticsConfig) {
  return (
    config.enabled === true &&
    Boolean(config.webhookUrl) &&
    !config.webhookUrl.includes('example.invalid') &&
    Boolean(config.analyticsKey) &&
    config.analyticsKey !== 'replace-with-alpha-analytics-key'
  );
}

export function getAnalyticsRuntime(): AnalyticsRuntime {
  try {
    const environment = getRuntimeEnvironment();
    if (environment.isAndroid) return 'android';
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
    if (!environment.isNative) return 'web';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

export function buildAnalyticsEvent(
  eventName: AnalyticsEventName,
  counts: AnalyticsCounts,
  options: Pick<TrackAnalyticsOptions, 'importSource' | 'now'> = {},
): MinimalAnalyticsEvent {
  const event: MinimalAnalyticsEvent = {
    schemaVersion: analyticsSchemaVersion,
    eventName,
    eventId: crypto.randomUUID(),
    timestamp: (options.now?.() ?? new Date()).toISOString(),
    appVersion,
    runtime: getAnalyticsRuntime(),
    librarySizeBucket: bucketCount(counts.librarySize),
    wishlistSizeBucket: bucketCount(counts.wishlistSize),
    platformCountBucket: bucketCount(counts.platformCount),
    playingCountBucket: bucketCount(counts.playingCount),
    queueCountBucket: bucketCount(counts.queueCount),
  };

  if (eventName === 'import_completed' && options.importSource) {
    event.importSource = options.importSource;
  }

  return event;
}

export function validateAnalyticsEvent(value: unknown): value is MinimalAnalyticsEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<MinimalAnalyticsEvent>;
  if (event.schemaVersion !== analyticsSchemaVersion) return false;
  if (!event.eventName || !allowedEventNames.has(event.eventName)) return false;
  const allowedFields = event.eventName === 'import_completed' ? allowedImportFields : allowedBaseFields;
  if (Object.keys(event).some((key) => !allowedFields.has(key))) return false;
  if (event.eventName !== 'import_completed' && 'importSource' in event) return false;
  if (event.importSource !== undefined && !allowedImportSources.has(event.importSource)) return false;
  return (
    typeof event.eventId === 'string' && event.eventId.length > 0 &&
    typeof event.timestamp === 'string' && event.timestamp.length > 0 &&
    typeof event.appVersion === 'string' && event.appVersion.length > 0 &&
    typeof event.runtime === 'string' && allowedRuntimes.has(event.runtime) &&
    typeof event.librarySizeBucket === 'string' && allowedCountBuckets.has(event.librarySizeBucket) &&
    typeof event.wishlistSizeBucket === 'string' && allowedCountBuckets.has(event.wishlistSizeBucket) &&
    typeof event.platformCountBucket === 'string' && allowedCountBuckets.has(event.platformCountBucket) &&
    typeof event.playingCountBucket === 'string' && allowedCountBuckets.has(event.playingCountBucket) &&
    typeof event.queueCountBucket === 'string' && allowedCountBuckets.has(event.queueCountBucket)
  );
}

export async function sendAnalyticsEvent(event: MinimalAnalyticsEvent, config = getAnalyticsConfig(), fetcher: typeof fetch = fetch) {
  if (!isAnalyticsConfigured(config) || !loadAnalyticsSettings().isAnalyticsEnabled || !validateAnalyticsEvent(event)) return;

  try {
    await fetcher(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QS-Analytics-Key': config.analyticsKey,
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Analytics must fail silently and never break app behavior.
  }
}

export function trackAnalyticsEvent(eventName: AnalyticsEventName, counts: AnalyticsCounts, options: TrackAnalyticsOptions = {}) {
  const event = buildAnalyticsEvent(eventName, counts, options);
  void sendAnalyticsEvent(event, getAnalyticsConfig(), options.fetcher ?? fetch);
}
