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

type HltbPackageModule = {
  HowLongToBeat?: HltbPackageConstructor;
  default?: HltbPackageModule;
};

type HltbProviderOptions = {
  apiKey?: string;
};

type HltbPackageClient = {
  minimumSimilarity?: unknown;
  search: (title: string) => Promise<unknown[] | null>;
};

type HltbPackageConstructor = new (options?: HltbProviderOptions | number) => HltbPackageClient;

// Dev/server-only bridge for howlongtobeat-js. The package depends on Node
// request/parsing libraries and cannot be safely imported into the Vite browser
// bundle, so the frontend talks to /api/hltb/search instead.
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

  const hltbModule = await loadHowLongToBeatJs().catch((error: unknown) => {
    throw toHltbDevEndpointError(error);
  });
  const HowLongToBeat = hltbModule.HowLongToBeat ?? hltbModule.default?.HowLongToBeat;

  if (!HowLongToBeat) {
    const error = {
      message: 'howlongtobeat-js did not expose a HowLongToBeat class in this runtime.',
      reason: 'unavailable' as HltbProviderFailureReason,
      status: 503,
    };
    logHltbDevEndpoint('provider failure', error);
    sendHltbJson(response, error.status, error);
    return;
  }

  const client = createHowLongToBeatClient(HowLongToBeat);
  const results = await client.search(title).catch((error: unknown) => {
    throw toHltbDevEndpointError(error);
  });
  const safeResults = Array.isArray(results) ? results : [];
  logHltbDevEndpoint('provider package result count', { title, count: safeResults.length });
  sendHltbJson(response, 200, { provider: 'howlongtobeat-js', results: safeResults });
}

function createHowLongToBeatClient(HowLongToBeat: HltbPackageConstructor, config?: HltbProviderOptions | null): HltbPackageClient {
  const providerOptions = config ?? {};
  logHltbDevEndpoint('provider init options', sanitizeHltbProviderOptions(providerOptions));

  const client = new HowLongToBeat(providerOptions);

  // howlongtobeat-js 1.0.x used a numeric constructor argument for the minimum
  // similarity threshold. Newer option-based builds expect a config object
  // instead. Passing {} prevents option-based builds from reading apiKey from a
  // null config, and this normalization keeps the older numeric build returning
  // all candidates like the previous new HowLongToBeat(0) call did.
  if (Object.prototype.hasOwnProperty.call(client, 'minimumSimilarity') && typeof client.minimumSimilarity !== 'number') {
    client.minimumSimilarity = 0;
  }

  return client;
}

function sanitizeHltbProviderOptions(options: HltbProviderOptions) {
  return {
    hasApiKey: Boolean(options.apiKey?.trim()),
  };
}

async function loadHowLongToBeatJs(): Promise<HltbPackageModule> {
  const importDependency = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<HltbPackageModule>;
  return importDependency('howlongtobeat-js');
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
  logHltbDevEndpoint('provider failure', endpointError);
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
  const message = error instanceof Error ? error.message : 'Unknown howlongtobeat-js runtime failure.';

  if (/cannot find package|cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return {
      message: 'howlongtobeat-js is not installed. Run npm install before using HLTB sync in dev/server mode.',
      reason: 'unavailable',
      status: 503,
    };
  }

  if (/JSON|Unexpected token|Unexpected end/i.test(message)) {
    return { message: `HLTB endpoint request parsing failed: ${message}`, reason: 'parse', status: 400 };
  }

  if (/timeout|network|socket|ECONN|ENOTFOUND|ETIMEDOUT|fetch/i.test(message)) {
    return { message: `howlongtobeat-js network failure: ${message}`, reason: 'network', status: 502 };
  }

  if (/403|429|blocked|rate/i.test(message)) {
    return { message: `HowLongToBeat blocked or rate-limited howlongtobeat-js: ${message}`, reason: 'blocked', status: 503 };
  }

  return { message: `howlongtobeat-js failed at runtime: ${message}`, reason: 'temporary', status: 500 };
}

function logHltbDevEndpoint(label: string, details?: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } | undefined;
  if (label === 'provider failure') {
    logger?.warn?.(`[hltb] ${label}`, details ?? '');
    return;
  }
  logger?.debug?.(`[hltb] ${label}`, details ?? '');
}
