import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketCount } from '../src/lib/analytics/buckets';
import { defaultAnalyticsSettings, analyticsSettingsStorageKey } from '../src/lib/analytics/settings';
import { isAnalyticsConfigured, sendAnalyticsEvent, validateAnalyticsEvent } from '../src/lib/analytics/client';
import type { MinimalAnalyticsEvent } from '../src/lib/analytics/types';

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

test('placeholder config prevents sending', () => {
  assert.equal(isAnalyticsConfigured({ enabled: true, webhookUrl: 'https://example.invalid/questshelf-analytics', analyticsKey: 'replace-with-alpha-analytics-key' }), false);
});

test('importSource rejected on non-import events', () => {
  assert.equal(validateAnalyticsEvent({ ...baseEvent, importSource: 'steam' }), false);
});

test('unknown fields rejected', () => {
  assert.equal(validateAnalyticsEvent({ ...baseEvent, rawCount: 10 }), false);
});

test('no send when local setting is disabled', async () => {
  installLocalStorage(defaultAnalyticsSettings);
  let calls = 0;
  await sendAnalyticsEvent(baseEvent, { enabled: true, webhookUrl: 'https://analytics.example.test/hook', analyticsKey: 'real-test-key' }, async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });
  assert.equal(calls, 0);
});

test('send failures are swallowed', async () => {
  installLocalStorage({ schemaVersion: 1, isAnalyticsEnabled: true, hasSeenAnalyticsNotice: true, updatedAt: '2026-06-19T00:00:00.000Z' });
  await assert.doesNotReject(() => sendAnalyticsEvent(baseEvent, { enabled: true, webhookUrl: 'https://analytics.example.test/hook', analyticsKey: 'real-test-key' }, async () => {
    throw new Error('network failed');
  }));
});
