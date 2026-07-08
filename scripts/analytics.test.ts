import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketCount } from '../src/lib/analytics/buckets';
import { defaultAnalyticsSettings, analyticsSettingsStorageKey } from '../src/lib/analytics/settings';
import { isAnalyticsConfigured, runTelemetrySelfTest, sendAnalyticsEvent, validateAnalyticsEvent } from '../src/lib/analytics/client';
import type { MinimalAnalyticsEvent } from '../src/lib/analytics/types';
import { runPlatformQueueUniquenessRegressionAssertions } from '../src/lib/platformQueueStorage.regression';

const baseEvent: MinimalAnalyticsEvent = {
  schemaVersion: 1,
  eventName: 'app_open',
  eventId: 'event-1',
  timestamp: '2026-06-19T00:00:00.000Z',
  appVersion: '0.1.0',
  runtime: 'web',
  librarySizeBucket: '1',
  wishlistSizeBucket: '2-5',
  platformCountBucket: '1',
  playingCountBucket: '0',
  queueCountBucket: '6-10',
};

function installLocalStorage(settings = defaultAnalyticsSettings) {
  const store = new Map<string, string>();
  if (settings) store.set(analyticsSettingsStorageKey, JSON.stringify(settings));
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
  } as unknown as Window & typeof globalThis;
}

function enableLocalAnalytics() {
  installLocalStorage({ schemaVersion: 1, isAnalyticsEnabled: true, hasSeenAnalyticsNotice: true, updatedAt: '2026-06-19T00:00:00.000Z' });
}

const configuredAnalytics = {
  enabled: true,
  webhookUrl: 'https://analytics.example.test/hook',
  analyticsKey: 'real-test-key',
};

test('bucketCount boundaries', () => {
  assert.equal(bucketCount(-1), '0');
  assert.equal(bucketCount(0), '0');
  assert.equal(bucketCount(1), '1');
  assert.equal(bucketCount(2), '2-5');
  assert.equal(bucketCount(5), '2-5');
  assert.equal(bucketCount(6), '6-10');
  assert.equal(bucketCount(10), '6-10');
  assert.equal(bucketCount(11), '11-25');
  assert.equal(bucketCount(25), '11-25');
  assert.equal(bucketCount(26), '26-50');
  assert.equal(bucketCount(50), '26-50');
  assert.equal(bucketCount(51), '51-100');
  assert.equal(bucketCount(100), '51-100');
  assert.equal(bucketCount(101), '101-250');
  assert.equal(bucketCount(250), '101-250');
  assert.equal(bucketCount(251), '251-500');
  assert.equal(bucketCount(500), '251-500');
  assert.equal(bucketCount(501), '501-1000');
  assert.equal(bucketCount(1000), '501-1000');
  assert.equal(bucketCount(1001), '1000+');
});

test('analytics disabled by default', () => {
  assert.equal(defaultAnalyticsSettings.isAnalyticsEnabled, false);
  assert.equal(defaultAnalyticsSettings.hasSeenAnalyticsNotice, false);
});

test('placeholder config prevents sending', async () => {
  enableLocalAnalytics();
  const placeholderConfigs = [
    { enabled: false, webhookUrl: 'https://analytics.example.test/hook', analyticsKey: 'real-test-key' },
    { enabled: true, webhookUrl: '', analyticsKey: 'real-test-key' },
    { enabled: true, webhookUrl: 'https://example.invalid/questshelf-analytics', analyticsKey: 'real-test-key' },
    { enabled: true, webhookUrl: 'https://analytics.example.test/hook', analyticsKey: '' },
    { enabled: true, webhookUrl: 'https://analytics.example.test/hook', analyticsKey: 'replace-with-alpha-analytics-key' },
  ];

  for (const config of placeholderConfigs) {
    let calls = 0;
    assert.equal(isAnalyticsConfigured(config), false);
    await sendAnalyticsEvent(baseEvent, config, async () => {
      calls += 1;
      return new Response(null, { status: 200 });
    });
    assert.equal(calls, 0);
  }
});

test('importSource validation', () => {
  assert.equal(validateAnalyticsEvent({ ...baseEvent, importSource: 'steam' }), false);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'steam' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'wishlist_html' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'retro' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'backup' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'manual' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'unknown' }), true);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'import_completed', importSource: 'steam_url' }), false);
});

test('payload field validation rejects private and free-text fields', () => {
  for (const field of ['rawCount', 'gameTitle', 'notes', 'tags', 'accountId', 'steamId', 'externalId', 'url', 'filePath', 'searchQuery', 'userInput', 'persistentId']) {
    assert.equal(validateAnalyticsEvent({ ...baseEvent, [field]: 'private' }), false, `${field} should be rejected`);
  }
  assert.equal(validateAnalyticsEvent({ ...baseEvent, eventName: 'removed_event' }), false);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, runtime: 'desktop' }), false);
  assert.equal(validateAnalyticsEvent({ ...baseEvent, librarySizeBucket: '1001' }), false);
});

test('no send when local setting is disabled', async () => {
  installLocalStorage(defaultAnalyticsSettings);
  let calls = 0;
  await sendAnalyticsEvent(baseEvent, configuredAnalytics, async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });
  assert.equal(calls, 0);
});

test('telemetry self-test does not send when local setting is disabled', async () => {
  installLocalStorage(defaultAnalyticsSettings);
  let calls = 0;
  const result = await runTelemetrySelfTest(async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });
  assert.equal(calls, 0);
  assert.equal(result.sent, false);
  assert.equal(result.telemetryEnabled, false);
});

test('telemetry self-test sends one privacy-safe POST with no-store cache', async () => {
  enableLocalAnalytics();
  let calls = 0;
  const result = await runTelemetrySelfTest(async (url, init) => {
    calls += 1;
    assert.equal(url, configuredAnalytics.webhookUrl);
    assert.equal(init?.method, 'POST');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['x-make-apikey'], 'real-test-key');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.credentials, 'omit');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.eventName, 'telemetry_test');
    assert.equal(Object.hasOwn(body, 'gameTitle'), false);
    assert.equal(Object.hasOwn(body, 'notes'), false);
    return new Response('ok', { status: 202, headers: { 'content-type': 'text/plain' } });
  }, configuredAnalytics);
  assert.equal(calls, 1);
  assert.equal(result.sent, true);
  assert.equal(result.status, 202);
  assert.equal(result.requestHost, 'analytics.example.test');
  assert.equal(result.responseText, 'ok');
});

test('x-make-apikey header is used for Make.com API key auth', async () => {
  enableLocalAnalytics();
  await sendAnalyticsEvent(baseEvent, configuredAnalytics, async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers['x-make-apikey'], 'real-test-key');
    assert.equal(headers['X-QS-Analytics-Key'], undefined);
    assert.equal(headers['Content-Type'], 'application/json');
    return new Response(null, { status: 200 });
  });
});

test('send failures are swallowed', async () => {
  enableLocalAnalytics();
  await assert.doesNotReject(() => sendAnalyticsEvent(baseEvent, configuredAnalytics, async () => {
    throw new Error('network failed');
  }));
});

test('a non-2xx response never throws or blocks', async () => {
  enableLocalAnalytics();
  let calls = 0;
  await assert.doesNotReject(() => sendAnalyticsEvent(baseEvent, configuredAnalytics, async () => {
    calls += 1;
    return new Response('nope', { status: 500 });
  }));
  assert.equal(calls, 1);
});

test('platform queue regression assertions', () => {
  runPlatformQueueUniquenessRegressionAssertions();
});
