import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), hltbDevEndpointPlugin()],
  server: {
    proxy: {
      '/api/steam-store': {
        target: 'https://store.steampowered.com',
        changeOrigin: true,
        secure: true,
        headers: {
          accept: 'application/json,text/plain,*/*',
          origin: 'https://store.steampowered.com',
          referer: 'https://store.steampowered.com/',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36',
        },
        configure: (proxy) => {
          proxy.on('error', (error) => {
            const logger = Reflect.get(globalThis, 'console') as { error?: (...args: unknown[]) => void } | undefined;
            logger?.error?.('[QuestShelf Steam Store proxy]', error.message);
          });
        },
        rewrite: (path) => path.replace(/^\/api\/steam-store/, ''),
      },
      '/api/steam': {
        target: 'https://api.steampowered.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/steam/, ''),
      },
      '/api/itad': {
        target: 'https://api.isthereanydeal.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('error', (error) => {
            const logger = Reflect.get(globalThis, 'console') as { error?: (...args: unknown[]) => void } | undefined;
            logger?.error?.('[QuestShelf ITAD proxy]', error.message);
          });
        },
        rewrite: (path) => path.replace(/^\/api\/itad/, ''),
      },
    },
  },
});


type HltbProviderFailureReason = 'network' | 'cors-proxy' | 'blocked' | 'temporary' | 'invalid-response' | 'parse' | 'unavailable';

const HLTB_PROVIDER_ENDPOINT = {
  origin: 'https://howlongtobeat.com',
  searchPath: null,
  status: 'unavailable',
  reason: 'The old hltb-for-deck /api/search route now returns 404 HTML. A newer token-gated /api/find flow exists in community notes, but QuestShelf keeps HLTB disabled until that flow is verified for this provider.',
  candidateSearchPath: '/api/find',
  candidateInitPath: '/api/find/init',
} as const;

// Dev/server-only HLTB bridge. The frontend talks to /api/hltb/search so browser
// code never calls howlongtobeat.com directly. The upstream endpoint is an
// explicit provider constant above; when unverified, this middleware reports
// unavailability instead of retrying a known-broken path.
function hltbDevEndpointPlugin(): Plugin {
  return {
    name: 'questshelf-hltb-dev-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/hltb/search', (request, response) => {
        void handleHltbSearchRequest(request, response).catch((error: unknown) => {
          const { message, reason, status } = toHltbDevEndpointError(error);
          sendHltbJson(response, status, { message, reason });
        });
      });
    },
  };
}

async function handleHltbSearchRequest(
  request: { method?: string; url?: string; headers?: { host?: string }; on: (event: string, listener: (chunk?: unknown) => void) => void },
  response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void },
) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    sendHltbJson(response, 405, { message: 'HLTB search endpoint only supports GET or POST.', reason: 'invalid-response' });
    return;
  }

  const titleResult = await getHltbRequestTitle(request);
  if (titleResult.error) {
    sendHltbJson(response, titleResult.error.status, titleResult.error);
    return;
  }

  const title = titleResult.title;
  logHltbDevEndpoint('internal endpoint called', { title });
  logHltbDevEndpoint('provider endpoint status', HLTB_PROVIDER_ENDPOINT);

  const endpointError = getUnavailableHltbEndpointError();
  logHltbDevEndpoint('provider failure reason', endpointError);
  sendHltbJson(response, endpointError.status, endpointError);
}

function getUnavailableHltbEndpointError() {
  return {
    message: `HowLongToBeat provider endpoint is unavailable/outdated. ${HLTB_PROVIDER_ENDPOINT.reason}`,
    reason: 'unavailable' as HltbProviderFailureReason,
    status: 503,
    endpoint: {
      origin: HLTB_PROVIDER_ENDPOINT.origin,
      searchPath: HLTB_PROVIDER_ENDPOINT.searchPath,
      status: HLTB_PROVIDER_ENDPOINT.status,
      candidateSearchPath: HLTB_PROVIDER_ENDPOINT.candidateSearchPath,
      candidateInitPath: HLTB_PROVIDER_ENDPOINT.candidateInitPath,
    },
  };
}

async function getHltbRequestTitle(request: { method?: string; url?: string; headers?: { host?: string }; on: (event: string, listener: (chunk?: unknown) => void) => void }): Promise<{ title: string; error?: never } | { title?: never; error: { message: string; reason: HltbProviderFailureReason; status: number } }> {
  const requestUrl = new URL(request.url ?? '', `http://${request.headers?.host ?? 'localhost'}`);
  const queryTitle = requestUrl.searchParams.get('title')?.trim();
  if (queryTitle) {
    return { title: queryTitle };
  }

  if (request.method === 'POST') {
    const body = await readRequestBody(request).catch((error: unknown) => {
      throw toHltbDevEndpointError(error);
    });
    const parsedBody = parseHltbRequestBody(body);
    const bodyTitle = typeof parsedBody.title === 'string' ? parsedBody.title.trim() : '';
    if (bodyTitle) {
      return { title: bodyTitle };
    }
  }

  return {
    error: {
      message: 'HLTB search requires a non-empty title.',
      reason: 'invalid-response' as HltbProviderFailureReason,
      status: 400,
    },
  };
}

function parseHltbRequestBody(body: string): { title?: unknown } {
  if (!body.trim()) {
    return {};
  }

  const parsed = JSON.parse(body) as { title?: unknown };
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function readRequestBody(request: { on: (event: string, listener: (chunk?: unknown) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += typeof chunk === 'string' ? chunk : Buffer.from(chunk as ArrayBuffer).toString('utf8');
    });
    request.on('end', () => resolve(body));
    request.on('error', (error) => reject(error));
  });
}

function sendHltbJson(response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function toHltbDevEndpointError(error: unknown) {
  if (isHltbDevEndpointError(error)) {
    return error;
  }

  const endpointError = classifyHltbDevEndpointError(error);
  logHltbDevEndpoint('provider failure reason', endpointError);
  return endpointError;
}

function isHltbDevEndpointError(error: unknown): error is { message: string; reason: HltbProviderFailureReason; status: number } {
  return Boolean(error)
    && typeof error === 'object'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { status?: unknown }).status === 'number'
    && typeof (error as { reason?: unknown }).reason === 'string';
}

function classifyHltbDevEndpointError(error: unknown): { message: string; reason: HltbProviderFailureReason; status: number } {
  const message = error instanceof Error ? error.message : 'Unknown HowLongToBeat provider failure.';

  if (/JSON|Unexpected token|Unexpected end/i.test(message)) {
    return { message: `HLTB endpoint request parsing failed: ${message}`, reason: 'parse', status: 400 };
  }

  if (/timeout|network|socket|ECONN|ENOTFOUND|ETIMEDOUT|fetch/i.test(message)) {
    return { message: `HowLongToBeat network failure: ${message}`, reason: 'network', status: 502 };
  }

  if (/403|429|blocked|rate/i.test(message)) {
    return { message: `HowLongToBeat blocked or rate-limited the request: ${message}`, reason: 'blocked', status: 503 };
  }

  return { message: `HowLongToBeat provider failed: ${message}`, reason: 'temporary', status: 500 };
}

function getString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function logHltbDevEndpoint(label: string, details?: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } | undefined;
  if (label === 'provider failure reason') {
    logger?.warn?.(`[hltb] ${label}`, details ?? '');
    return;
  }
  logger?.debug?.(`[hltb] ${label}`, details ?? '');
}
