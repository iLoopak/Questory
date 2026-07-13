import assert from 'node:assert/strict';
import test from 'node:test';
import { IntegrationBoundaryError, postIntegration } from '../src/lib/integrationProxy';
import { getIntegrationSettingsRevision, resetIntegrationSettingsRevision } from '../src/lib/integrationSettingsRevision';
import { saveRawgSettings } from '../src/lib/rawgSettingsStorage';
import { getStorageAdapter, setStorageAdapter, type StorageAdapter } from '../src/lib/storageAdapter';
import { applyItadSyncResults } from '../src/features/integrations/itad/useItadDealSync';
import type { Game } from '../src/types/game';

const originalFetch = globalThis.fetch;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function expectKind(kind: IntegrationBoundaryError['kind']) {
  return (error: unknown) => error instanceof IntegrationBoundaryError && error.kind === kind;
}

test.afterEach(() => { globalThis.fetch = originalFetch; });

test('AS-19: valid route fixture is parsed and safe unknown fields are tolerated', async () => {
  globalThis.fetch = async () => json({ response: { results: [], next: null }, ignored: 'safe-extra' });
  const result = await postIntegration<{ response: { results: unknown[] } }>('rawg', 'request', { apiKey: 'key' });
  assert.deepEqual(result.response.results, []);
});

test('AS-19: missing field, wrong nested type, HTML, malformed JSON and empty bodies are rejected', async () => {
  for (const response of [
    json({ unexpected: true }),
    json({ response: { not: 'an array' } }),
    new Response('<html>proxy error</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('{broken', { status: 200 }),
    new Response('', { status: 200 }),
  ]) {
    globalThis.fetch = async () => response;
    await assert.rejects(postIntegration('itad', 'search', { apiKey: 'key', title: 'Game' }), expectKind('malformed-response'));
  }
});

test('AS-19: client timeout aborts the underlying request and manual abort stays distinct', async () => {
  let timeoutAborted = false;
  globalThis.fetch = async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { timeoutAborted = true; reject(new DOMException('aborted', 'AbortError')); });
  });
  await assert.rejects(postIntegration('rawg', 'request', { apiKey: 'key' }, { timeoutMs: 5 }), expectKind('timeout'));
  assert.equal(timeoutAborted, true);

  const controller = new AbortController();
  const pending = postIntegration('rawg', 'request', { apiKey: 'key' }, { signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(pending, expectKind('aborted'));
});

test('AS-19: server timeout envelope maps safely without exposing its body', async () => {
  globalThis.fetch = async () => json({ code: 'PROVIDER_TIMEOUT', error: 'upstream secret-bearing details' }, 504);
  await assert.rejects(postIntegration('steam', 'owned-games', { apiKey: 'key', steamId64: '1' }), (error: unknown) => {
    assert.ok(error instanceof IntegrationBoundaryError);
    assert.equal(error.kind, 'timeout');
    assert.equal(error.message.includes('secret-bearing'), false);
    return true;
  });
});

test('AS-19: settings owner returns normalized current values and publishes add, replace and clear', () => {
  const values = new Map<string, string>();
  const previous = getStorageAdapter();
  const adapter: StorageAdapter = {
    readLocal: (key) => values.get(key) ?? null, writeLocal: (key, value) => { values.set(key, value); },
    removeLocal: (key) => { values.delete(key); }, localKeys: () => [...values.keys()], readDurable: async () => null,
    writeDurable: async () => {}, removeDurable: async () => {}, hasDurableBackend: async () => false,
  };
  setStorageAdapter(adapter);
  resetIntegrationSettingsRevision();
  try {
    assert.deepEqual(saveRawgSettings({ apiKey: ' first ' }), { apiKey: ' first ' });
    assert.equal(getIntegrationSettingsRevision(), 1);
    assert.deepEqual(saveRawgSettings({ apiKey: 'second' }), { apiKey: 'second' });
    assert.equal(getIntegrationSettingsRevision(), 2);
    assert.deepEqual(saveRawgSettings({ apiKey: '' }), { apiKey: '' });
    assert.equal(getIntegrationSettingsRevision(), 3);
  } finally { setStorageAdapter(previous); }
});

test('AS-19: failed ITAD attempt does not overwrite successful freshness', () => {
  const game: Game = { id: 'g', title: 'Game', platform: 'PC', status: 'Want to play', coverImage: '', playtimeHours: 0, tags: [], lastPlayedAt: null, notes: '', collectionType: 'wishlist', itadLastSyncedAt: '2026-07-01T00:00:00.000Z' };
  const [updated] = applyItadSyncResults([game], [{ gameId: 'g', status: 'failed' }], '2026-07-12T00:00:00.000Z');
  assert.equal(updated.itadLastSyncedAt, '2026-07-01T00:00:00.000Z');
  assert.equal(updated.itadLastSyncAttemptAt, '2026-07-12T00:00:00.000Z');
});
