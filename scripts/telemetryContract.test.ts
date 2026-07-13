/**
 * AS-17 — the client and the server describe the same telemetry, or the build fails.
 *
 * They did not. `discovery_recommendations_requested`, `recommendation_generation_completed` and
 * `recommendation_feedback` are emitted by the live app and did not exist in the server allowlist at
 * all: every one of them was answered with INVALID_EVENT_NAME in production, while the test suite
 * stayed green because no test had ever pushed a client payload through the real server validator.
 * The Discovery event also sent exact counts, which the server rejects and the privacy policy
 * forbids.
 *
 * These tests close the loop: the server schema is generated from the canonical contract and must
 * match the checked-in copy, every active event's representative payload is validated by the ACTUAL
 * `/api/telemetry` validator, and every event the source tree emits must be declared and active.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateEvent } from '../api/telemetry.js';
import telemetryHandler from '../api/telemetry.js';
import { buildTelemetrySchemaSource } from './telemetrySchemaSource.mjs';
import {
  analyticsSchemaVersion,
  telemetryEnvelopeFields,
  telemetryEventRegistry,
  telemetryRuntimes,
  telemetrySensitiveFields,
} from '../src/lib/analytics/telemetryContract';
import { activeAnalyticsEventNames, analyticsEventNames, reservedAnalyticsEventNames } from '../src/lib/analytics/types';
import { buildAnalyticsEvent, validateAnalyticsEvent } from '../src/lib/analytics/client';

const envelope = {
  schemaVersion: analyticsSchemaVersion,
  eventId: 'event-1',
  timestamp: '2026-07-12T00:00:00.000Z',
  appVersion: '0.1.0',
  runtime: 'browser',
  sessionId: 'session-1',
};

/** The payload the app would really send for an event, from the contract's own fixture. */
function sampleEvent(eventName: string): Record<string, unknown> {
  const schema = telemetryEventRegistry[eventName as keyof typeof telemetryEventRegistry] as { sample?: Record<string, unknown> };
  assert.ok(schema.sample, `${eventName} is active but declares no representative sample`);
  return { ...envelope, eventName, ...schema.sample };
}

/** Every event name the source tree actually emits — the ground truth the contract is checked against. */
function emittedEventNames(): Set<string> {
  const names = new Set<string>();

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(path) || path.endsWith('typetest.ts')) continue;

      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/(?:trackAnalyticsEvent|trackMinimalAnalyticsEvent|trackSessionAnalyticsEvent|buildAnalyticsEvent)\(\s*'([a-z_]+)'/g)) {
        names.add(match[1]);
      }
    }
  };

  walk('src');
  return names;
}

// ════════════════════════════════════════════════════════════════════════════════════
// Parity — one contract, no second list
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-17: the checked-in server schema is exactly what the canonical contract generates', () => {
  const generated = buildTelemetrySchemaSource({
    analyticsSchemaVersion,
    telemetryEnvelopeFields,
    telemetrySensitiveFields,
    telemetryRuntimes,
    telemetryEventRegistry,
  });

  assert.equal(
    readFileSync('api/telemetry-schema.js', 'utf8').replaceAll('\r\n', '\n'),
    generated.replaceAll('\r\n', '\n'),
    'api/telemetry-schema.js is stale — run `npm run generate:telemetry-schema`. The two registries may not be edited separately.',
  );
});

test('AS-17: every event the app emits is declared in the contract and marked active', () => {
  const emitted = emittedEventNames();
  assert.ok(emitted.size >= 12, 'the emitter scan found suspiciously few call sites');

  for (const eventName of emitted) {
    assert.ok(analyticsEventNames.includes(eventName as never), `${eventName} is emitted but not declared in the canonical contract`);
    assert.equal(
      telemetryEventRegistry[eventName as keyof typeof telemetryEventRegistry].status,
      'active',
      `${eventName} has a live emitter but is marked reserved`,
    );
  }

  // …and nothing claims to be live when it is not.
  for (const eventName of activeAnalyticsEventNames) {
    assert.ok(emitted.has(eventName), `${eventName} is marked active but nothing emits it — mark it reserved or remove it`);
  }
});

test('AS-17: reserved events are declared, accepted, and honestly labelled', () => {
  const emitted = emittedEventNames();
  assert.ok(reservedAnalyticsEventNames.length > 0);

  for (const eventName of reservedAnalyticsEventNames) {
    assert.equal(emitted.has(eventName), false, `${eventName} is marked reserved but something emits it`);
  }
});

test('AS-17: every active event is accepted by the REAL server validator', () => {
  for (const eventName of activeAnalyticsEventNames) {
    const event = sampleEvent(eventName);

    assert.doesNotThrow(() => validateEvent(event), `the server rejects the live payload for ${eventName}`);
    assert.equal(validateAnalyticsEvent(event), true, `the client rejects its own payload for ${eventName}`);
  }
});

test('AS-17: the three live recommendation and Discovery events are no longer INVALID_EVENT_NAME', () => {
  for (const eventName of ['discovery_recommendations_requested', 'recommendation_generation_completed', 'recommendation_feedback']) {
    const accepted = validateEvent(sampleEvent(eventName));
    assert.equal(accepted.eventName, eventName);
  }

  // The event name alone was never the whole problem: the payload has to be valid too.
  assert.throws(
    () => validateEvent({ ...envelope, eventName: 'discovery_recommendations_requested', source: 'discovery_inbox', requested_count: 10, returned_count: 4 }),
    (error: { code: string }) => error.code === 'UNSUPPORTED_FIELD',
    'the old exact-count payload must stay rejected',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════
// Validation rules
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-17: the server rejects unknown events, unknown properties, wrong types and missing required properties', () => {
  const valid = sampleEvent('discover_section_opened');

  assert.throws(() => validateEvent({ ...envelope, eventName: 'not_a_real_event' }), (error: { code: string }) => error.code === 'INVALID_EVENT_NAME');
  assert.throws(() => validateEvent({ ...valid, unexpected_property: 'x' }), (error: { code: string }) => error.code === 'UNSUPPORTED_FIELD');
  assert.throws(() => validateEvent({ ...valid, section: 42 }), (error: { code: string }) => error.code === 'INVALID_SECTION');
  assert.throws(() => validateEvent({ ...valid, section: 'a_section_that_does_not_exist' }), (error: { code: string }) => error.code === 'INVALID_SECTION');
  assert.throws(() => validateEvent({ ...envelope, eventName: 'discover_section_opened' }), (error: { code: string }) => error.code === 'INVALID_SECTION');
  assert.throws(() => validateEvent({ ...valid, schemaVersion: 1 }), (error: { code: string }) => error.code === 'INVALID_SCHEMA_VERSION');
  assert.throws(() => validateEvent({ ...valid, runtime: 'toaster' }), (error: { code: string }) => error.code === 'INVALID_RUNTIME');
});

test('AS-17: an optional property is accepted, and validated when present', () => {
  const withOptional = { ...sampleEvent('library_import_completed'), error_category: 'network' };
  assert.doesNotThrow(() => validateEvent(withOptional));

  assert.throws(
    () => validateEvent({ ...withOptional, error_category: 'cosmic_rays' }),
    (error: { code: string }) => error.code === 'INVALID_ERROR_CATEGORY',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════
// Privacy
// ════════════════════════════════════════════════════════════════════════════════════

test('AS-17: exact counts are rejected where a bucket is required — on both sides', () => {
  const exactCount = { ...sampleEvent('recommendation_generation_completed'), result_count_bucket: 7 };

  assert.throws(() => validateEvent(exactCount), (error: { code: string }) => error.code === 'INVALID_RESULT_COUNT_BUCKET');
  assert.equal(validateAnalyticsEvent(exactCount), false, 'the client must not even build a request carrying an exact count');

  // A bucket is fine.
  assert.doesNotThrow(() => validateEvent({ ...sampleEvent('recommendation_generation_completed'), result_count_bucket: '11_plus' }));
});

test('AS-17: the feedback rank is a bucket, not the position of the card the user pressed', () => {
  assert.throws(
    () => validateEvent({ ...sampleEvent('recommendation_feedback'), rank_bucket: 3 }),
    (error: { code: string }) => error.code === 'INVALID_RANK_BUCKET',
  );

  for (const rankBucket of ['top', 'middle', 'lower']) {
    assert.doesNotThrow(() => validateEvent({ ...sampleEvent('recommendation_feedback'), rank_bucket: rankBucket }));
  }
});

test('AS-17: titles, provider ids, user text and nested objects never reach the endpoint', () => {
  const valid = sampleEvent('recommendation_feedback');

  for (const [key, value] of [['gameTitle', 'Hades'], ['title', 'Hades'], ['gameId', 'game-1'], ['rawgId', 1234], ['notes', 'my private note'], ['text', 'typed by the user'], ['steamId', '76561198000000000']] as const) {
    assert.throws(
      () => validateEvent({ ...valid, [key]: value }),
      (error: { code: string }) => error.code === 'PRIVACY_FIELD_REJECTED',
      `${key} must be refused`,
    );
  }

  assert.throws(
    () => validateEvent({ ...valid, extra: { nested: true } }),
    (error: { code: string }) => error.code === 'UNSUPPORTED_FIELD',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════
// Endpoint behavior
// ════════════════════════════════════════════════════════════════════════════════════

function createApiResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}

async function callTelemetryApi({ method = 'POST', body = sampleEvent('recommendation_feedback') as unknown, envUrl = 'https://make.example.test/hook', contentLength, fetchImpl }: { method?: string; body?: unknown; envUrl?: string; contentLength?: number; fetchImpl?: typeof fetch } = {}) {
  const originalWebhook = process.env.QS_ANALYTICS_WEBHOOK_URL;
  const originalFetch = globalThis.fetch;
  if (envUrl === '') delete process.env.QS_ANALYTICS_WEBHOOK_URL;
  else process.env.QS_ANALYTICS_WEBHOOK_URL = envUrl;
  if (fetchImpl) globalThis.fetch = fetchImpl;

  const res = createApiResponse();
  try {
    await telemetryHandler(
      { method, body, headers: { 'content-length': String(contentLength ?? JSON.stringify(body).length) } },
      res,
    );
    return res;
  } finally {
    if (originalWebhook === undefined) delete process.env.QS_ANALYTICS_WEBHOOK_URL;
    else process.env.QS_ANALYTICS_WEBHOOK_URL = originalWebhook;
    globalThis.fetch = originalFetch;
  }
}

test('AS-17: a live recommendation event is forwarded server-side, with the secret never leaving the server', async () => {
  let forwardedBody: Record<string, unknown> | null = null;

  const res = await callTelemetryApi({
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://make.example.test/hook');
      forwardedBody = JSON.parse(String(init?.body));
      return new Response('accepted', { status: 200 });
    },
  });

  assert.equal(res.statusCode, 202);
  assert.equal(forwardedBody!.eventName, 'recommendation_feedback');
  assert.equal(forwardedBody!.rank_bucket, 'middle', 'only the bucket is forwarded');
  assert.doesNotMatch(JSON.stringify(res.body), /make\.example\.test|hook/i, 'the response never names the webhook destination');
});

test('AS-17: the endpoint is POST-only, size-limited, and sanitized when it fails', async () => {
  assert.equal((await callTelemetryApi({ method: 'GET' })).statusCode, 405);
  assert.equal((await callTelemetryApi({ body: 'not-json' })).statusCode, 400);
  assert.equal((await callTelemetryApi({ contentLength: 9001 })).statusCode, 413);

  const notConfigured = await callTelemetryApi({ envUrl: '' });
  assert.equal(notConfigured.statusCode, 503);
  assert.equal((notConfigured.body as { code: string }).code, 'TELEMETRY_NOT_CONFIGURED');

  const timedOut = await callTelemetryApi({ fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } });
  assert.equal(timedOut.statusCode, 504);

  const upstreamFailed = await callTelemetryApi({ fetchImpl: async () => new Response('upstream secret detail', { status: 500 }) });
  assert.equal(upstreamFailed.statusCode, 502);
  assert.doesNotMatch(JSON.stringify(upstreamFailed.body), /upstream secret detail/);
});

test('AS-17: the self-test event is a canonical event that the server accepts', () => {
  const selfTestEvent = buildAnalyticsEvent('telemetry_test_sent', { outcome: 'accepted' }, { now: () => new Date('2026-07-12T00:00:00.000Z') });

  assert.equal(telemetryEventRegistry.telemetry_test_sent.status, 'active');
  assert.doesNotThrow(() => validateEvent({ ...selfTestEvent }));
});
