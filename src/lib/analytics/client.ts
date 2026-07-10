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
const telemetryDebugStorageKey = 'questshelf.telemetryDebug.v1';

export type AnalyticsConfig = {
  enabled: boolean;
  endpointUrl: string;
};

export type TrackAnalyticsOptions = {
  importSource?: AnalyticsImportSource;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type TelemetryDebugResult = {
  sent: boolean;
  telemetryEnabled: boolean;
  endpointConfigured: boolean;
  requestHost: string | null;
  status?: number;
  responseText?: string;
  error?: string;
  configProblem?: string;
};

export function getAnalyticsConfig(): AnalyticsConfig {
  return {
    enabled: import.meta.env.VITE_QS_ANALYTICS_ENABLED === 'true',
    endpointUrl: (import.meta.env.VITE_QS_ANALYTICS_ENDPOINT_URL ?? '/api/telemetry').trim() || '/api/telemetry',
  };
}

/**
 * Returns a human-readable reason the build-time analytics config is unusable, or
 * null when it is fully configured. Single source of truth for isAnalyticsConfigured
 * and the dev-only diagnostics below, so the boolean and the explanation never drift.
 */
export function describeAnalyticsConfigProblem(config: AnalyticsConfig): string | null {
  if (config.enabled !== true) return 'VITE_QS_ANALYTICS_ENABLED is not "true" in this build';
  if (!config.endpointUrl) return 'VITE_QS_ANALYTICS_ENDPOINT_URL is empty in this build';
  if (config.endpointUrl.includes('example.invalid')) return 'VITE_QS_ANALYTICS_ENDPOINT_URL is still the example.invalid placeholder';
  return null;
}

export function isAnalyticsConfigured(config: AnalyticsConfig) {
  return describeAnalyticsConfigProblem(config) === null;
}

// Dev-only diagnostics. Analytics failures are silent by design in production, which
// also makes a misconfigured/disabled build indistinguishable from a working one.
// These logs (gated on Vite dev mode or an explicit local debug flag) surface
// *why* nothing was sent, without always-on production logging.
export function isTelemetryDebugMode() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qsTelemetryDebug') === '1') {
      window.localStorage.setItem(telemetryDebugStorageKey, '1');
      return true;
    }
    return window.localStorage.getItem(telemetryDebugStorageKey) === '1';
  } catch {
    return false;
  }
}

function analyticsDebug(message: string, ...details: unknown[]) {
  if (isTelemetryDebugMode()) console.debug('[Questory analytics]', message, ...details);
}

function analyticsWarn(message: string) {
  if (isTelemetryDebugMode()) console.warn('[Questory analytics]', message);
}

function getSafeEndpointLabel(endpointUrl: string) {
  if (endpointUrl.startsWith('/')) return endpointUrl;
  try {
    return new URL(endpointUrl).host;
  } catch {
    return null;
  }
}

async function readSafeResponseText(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType || /^(text\/|application\/(json|problem\+json))/.test(contentType)) {
    return (await response.text()).slice(0, 500);
  }
  return `[response body omitted: ${contentType}]`;
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
    analyticsWarn(`Enabled by the user but no event can be sent: ${configProblem}. Set VITE_QS_ANALYTICS_ENABLED=true and configure the server-side QS_ANALYTICS_WEBHOOK_URL in Vercel.`);
    return;
  }

  // Gate 3: payload allowlist. Guards against ever sending unexpected fields.
  if (!validateAnalyticsEvent(event)) {
    analyticsDebug('Event failed validation; not sent', event);
    return;
  }

  try {
    analyticsDebug(`Sending "${event.eventName}"`, { endpoint: getSafeEndpointLabel(config.endpointUrl) });
    const response = await fetcher(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      keepalive: true,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) {
      analyticsWarn(`Endpoint returned HTTP ${response.status} for "${event.eventName}". Check /api/telemetry function logs and the server-side Make webhook configuration.`);
    } else {
      analyticsDebug(`Sent "${event.eventName}"`);
    }
  } catch (error) {
    // Network errors are silent in production and must never affect app behavior.
    analyticsDebug('Send failed — failing silently', error);
  }
}


export async function runTelemetrySelfTest(fetcher: typeof fetch = fetch, config = getAnalyticsConfig()): Promise<TelemetryDebugResult> {
  const settings = loadAnalyticsSettings();
  const configProblem = describeAnalyticsConfigProblem(config);
  const result: TelemetryDebugResult = {
    sent: false,
    telemetryEnabled: settings.isAnalyticsEnabled,
    endpointConfigured: !configProblem,
    requestHost: getSafeEndpointLabel(config.endpointUrl),
    configProblem: configProblem ?? undefined,
  };

  analyticsDebug('Telemetry self-test starting', result);

  if (!settings.isAnalyticsEnabled) {
    analyticsDebug('Telemetry self-test skipped: telemetry disabled by user', result);
    return result;
  }

  if (configProblem) {
    analyticsWarn(`Telemetry self-test skipped: ${configProblem}. Vercel production builds must define VITE_QS_ANALYTICS_ENABLED=true and the Vercel function must define QS_ANALYTICS_WEBHOOK_URL.`);
    return result;
  }

  const event = buildAnalyticsEvent('telemetry_test', {
    librarySize: 0,
    wishlistSize: 0,
    platformCount: 0,
    playingCount: 0,
    queueCount: 0,
  });

  try {
    analyticsDebug(`Sending "${event.eventName}"`, { endpoint: getSafeEndpointLabel(config.endpointUrl) });
    const response = await fetcher(config.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      keepalive: true,
      cache: 'no-store',
      credentials: 'omit',
    });
    result.sent = true;
    result.status = response.status;
    result.responseText = await readSafeResponseText(response);
    analyticsDebug('Telemetry self-test completed', result);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    analyticsWarn(`Telemetry self-test failed before an HTTP response was visible. Likely network, CSP, offline, ad-blocking, or service-worker interference. Endpoint: ${result.requestHost ?? 'unavailable'}. Error: ${result.error}`);
  }

  return result;
}

export function installTelemetryDebugSelfTest() {
  if (typeof window === 'undefined' || !isTelemetryDebugMode()) return;
  window.questShelfTelemetrySelfTest = () => runTelemetrySelfTest();
  analyticsDebug('Telemetry self-test installed. Run window.questShelfTelemetrySelfTest() from DevTools. Add ?qsTelemetryDebug=1 once on Vercel to enable this debug hook.');
}

export function trackAnalyticsEvent(eventName: AnalyticsEventName, counts: AnalyticsCounts, options: TrackAnalyticsOptions = {}) {
  const event = buildAnalyticsEvent(eventName, counts, options);
  void sendAnalyticsEvent(event, getAnalyticsConfig(), options.fetcher ?? fetch);
}
