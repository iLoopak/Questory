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

/**
 * Returns a human-readable reason the build-time analytics config is unusable, or
 * null when it is fully configured. Single source of truth for isAnalyticsConfigured
 * and the dev-only diagnostics below, so the boolean and the explanation never drift.
 */
export function describeAnalyticsConfigProblem(config: AnalyticsConfig): string | null {
  if (config.enabled !== true) return 'VITE_QS_ANALYTICS_ENABLED is not "true" in this build';
  if (!config.webhookUrl) return 'VITE_QS_ANALYTICS_WEBHOOK_URL is empty in this build';
  if (config.webhookUrl.includes('example.invalid')) return 'VITE_QS_ANALYTICS_WEBHOOK_URL is still the example.invalid placeholder';
  if (!config.analyticsKey) return 'VITE_QS_ANALYTICS_KEY is empty in this build';
  if (config.analyticsKey === 'replace-with-alpha-analytics-key') return 'VITE_QS_ANALYTICS_KEY is still the placeholder value';
  return null;
}

export function isAnalyticsConfigured(config: AnalyticsConfig) {
  return describeAnalyticsConfigProblem(config) === null;
}

// Dev-only diagnostics. Analytics failures are silent by design in production, which
// also makes a misconfigured/disabled build indistinguishable from a working one.
// These logs (gated on Vite dev mode) surface *why* nothing was sent, without any
// production logging.
function analyticsDebug(message: string, ...details: unknown[]) {
  if (import.meta.env.DEV) console.debug('[Questory analytics]', message, ...details);
}

function analyticsWarn(message: string) {
  if (import.meta.env.DEV) console.warn('[Questory analytics]', message);
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
  // Gate 1: user opt-in. Disabled by default; the common, correct no-send case.
  if (!loadAnalyticsSettings().isAnalyticsEnabled) return;

  // Gate 2: build-time config. When the user opted in but the build has no valid
  // config, nothing is sent — the exact silent gap that makes telemetry "not fire".
  const configProblem = describeAnalyticsConfigProblem(config);
  if (configProblem) {
    analyticsWarn(`Enabled by the user but no event can be sent: ${configProblem}. Set the VITE_QS_ANALYTICS_* env vars (see .env.example).`);
    return;
  }

  // Gate 3: payload allowlist. Guards against ever sending unexpected fields.
  if (!validateAnalyticsEvent(event)) {
    analyticsDebug('Event failed validation; not sent', event);
    return;
  }

  try {
    const response = await fetcher(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-make-apikey': config.analyticsKey,
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
    if (!response.ok) {
      analyticsWarn(`Endpoint returned HTTP ${response.status} for "${event.eventName}". Check the webhook URL/API key and that it allows CORS + a custom header from this origin.`);
    } else {
      analyticsDebug(`Sent "${event.eventName}"`);
    }
  } catch (error) {
    // Network error or (most often on web) a blocked CORS preflight. Silent in prod.
    analyticsDebug('Send failed (network or CORS preflight) — failing silently', error);
  }
}

export function trackAnalyticsEvent(eventName: AnalyticsEventName, counts: AnalyticsCounts, options: TrackAnalyticsOptions = {}) {
  const event = buildAnalyticsEvent(eventName, counts, options);
  void sendAnalyticsEvent(event, getAnalyticsConfig(), options.fetcher ?? fetch);
}
