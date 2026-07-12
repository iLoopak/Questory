/**
 * A minimal ServiceWorkerGlobalScope, so the REAL generated worker can be run against a fake network
 * and a fake CacheStorage. The worker under test is rendered from the same template Vite emits, with
 * a real manifest — the install/activate/fetch contract this PR is about only exists in that file.
 */
import { readFileSync } from 'node:fs';
import { buildPrecacheManifest, renderServiceWorker } from '../../packages/vite-plugin-pwa/precache.js';

export type FakeResponse = {
  ok: boolean;
  status: number;
  type: string;
  body: string;
  url: string;
  clone: () => FakeResponse;
};

export function response(body: string, { status = 200, type = 'basic', url = '' } = {}): FakeResponse {
  const value: FakeResponse = {
    ok: status >= 200 && status < 300,
    status,
    type,
    body,
    url,
    clone: () => ({ ...value, clone: value.clone }),
  };
  return value;
}

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();

  async put(request: string | { url: string }, value: FakeResponse) {
    this.entries.set(toPath(request), value);
  }

  async match(request: string | { url: string }) {
    return this.entries.get(toPath(request)) ?? undefined;
  }

  async keys() {
    return [...this.entries.keys()].map((path) => ({ url: `https://questory.test${path}` }));
  }
}

export class FakeCacheStorage {
  /** Insertion-ordered, exactly like the real CacheStorage — activation relies on that order. */
  readonly caches = new Map<string, FakeCache>();

  async open(name: string) {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const cache = new FakeCache();
    this.caches.set(name, cache);
    return cache;
  }

  async keys() {
    return [...this.caches.keys()];
  }

  async delete(name: string) {
    return this.caches.delete(name);
  }

  async match(request: string | { url: string }) {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

function toPath(request: string | { url: string }): string {
  const raw = typeof request === 'string' ? request : request.url;
  return raw.startsWith('http') ? new URL(raw).pathname : raw;
}

export type ServiceWorkerScope = {
  caches: FakeCacheStorage;
  cacheName: string;
  /** Fires `install`; rejects exactly when the real installation would fail. */
  install: () => Promise<void>;
  activate: () => Promise<void>;
  fetch: (request: { url: string; mode?: string; method?: string }) => Promise<FakeResponse | undefined>;
  message: (data: unknown) => Promise<void>;
  skipWaitingCalls: number;
  claimCalls: number;
};

export type ServiceWorkerHarnessOptions = {
  assets: string[];
  /** The network. A path that is missing, or mapped to 'error', is offline. */
  server: Map<string, FakeResponse | 'error'>;
  caches?: FakeCacheStorage;
};

export function createServiceWorker({ assets, server, caches: cacheStorage = new FakeCacheStorage() }: ServiceWorkerHarnessOptions): ServiceWorkerScope {
  const template = readFileSync('packages/vite-plugin-pwa/sw-template.js', 'utf8');
  const version = buildPrecacheManifest({ bundleFiles: assets.map((asset) => asset.replace(/^\//, '')) }).version;
  const source = renderServiceWorker(template, { assets, version });

  const listeners = new Map<string, ((event: never) => void)[]>();
  const scope = { skipWaitingCalls: 0, claimCalls: 0, cacheName: `questory-precache-${version}` } as ServiceWorkerScope;

  const self = {
    location: { origin: 'https://questory.test' },
    addEventListener: (type: string, listener: (event: never) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting: async () => { scope.skipWaitingCalls += 1; },
    clients: { claim: async () => { scope.claimCalls += 1; } },
  };

  const fetchImpl = async (request: { url: string } | string) => {
    const path = toPath(request as { url: string });
    const entry = server.get(path);
    if (!entry || entry === 'error') throw new TypeError(`Failed to fetch ${path}`);
    return entry;
  };

  class FakeRequest {
    url: string;
    method = 'GET';
    constructor(url: string) {
      this.url = url.startsWith('http') ? url : `https://questory.test${url}`;
    }
  }

  const FakeResponseCtor = { error: () => response('', { status: 0, type: 'error' }) };

  const run = new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', `${source}\nreturn null;`);
  run(self, cacheStorage, fetchImpl, FakeRequest, FakeResponseCtor, URL);

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    const responses: Promise<FakeResponse>[] = [];
    const fullEvent = {
      ...event,
      waitUntil: (promise: Promise<unknown>) => { waits.push(promise); },
      respondWith: (promise: Promise<FakeResponse>) => { responses.push(promise); },
    };

    for (const listener of listeners.get(type) ?? []) (listener as (value: unknown) => void)(fullEvent);
    await Promise.all(waits);
    return responses[0];
  };

  scope.caches = cacheStorage;
  scope.install = async () => { await dispatch('install', {}); };
  scope.activate = async () => { await dispatch('activate', {}); };
  scope.fetch = async (request) => {
    const url = request.url.startsWith('http') ? request.url : `https://questory.test${request.url}`;
    const responsePromise = await dispatch('fetch', { request: { ...request, url, method: request.method ?? 'GET' } });
    return responsePromise ? await responsePromise : undefined;
  };
  scope.message = async (data) => { await dispatch('message', { data, ports: [] }); };

  return scope;
}
