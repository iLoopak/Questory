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
  HowLongToBeat?: new (minSimilarity?: number) => {
    search: (title: string) => Promise<unknown[] | null>;
  };
  default?: HltbPackageModule;
};

// Dev/server-only bridge for howlongtobeat-js. The package depends on Node
// request/parsing libraries and cannot be safely imported into the Vite browser
// bundle, so the frontend talks to /api/hltb/search instead.
function hltbDevEndpointPlugin(): Plugin {
  return {
    name: 'questshelf-hltb-dev-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/hltb/search', async (request, response) => {
        if (request.method !== 'POST') {
          sendHltbJson(response, 405, { message: 'HLTB search endpoint only supports POST.', reason: 'invalid-response' });
          return;
        }

        try {
          const body = await readRequestBody(request);
          const parsedBody = JSON.parse(body || '{}') as { title?: unknown };
          const title = typeof parsedBody.title === 'string' ? parsedBody.title.trim() : '';

          if (!title) {
            sendHltbJson(response, 400, { message: 'HLTB search requires a non-empty title.', reason: 'invalid-response' });
            return;
          }

          const hltbModule = await loadHowLongToBeatJs();
          const HowLongToBeat = hltbModule.HowLongToBeat ?? hltbModule.default?.HowLongToBeat;

          if (!HowLongToBeat) {
            sendHltbJson(response, 503, {
              message: 'howlongtobeat-js did not expose a HowLongToBeat class in this runtime.',
              reason: 'unavailable',
            });
            return;
          }

          const client = new HowLongToBeat(0);
          const results = await client.search(title);
          sendHltbJson(response, 200, { provider: 'howlongtobeat-js', results: Array.isArray(results) ? results : [] });
        } catch (error) {
          const { message, reason, status } = classifyHltbDevEndpointError(error);
          sendHltbJson(response, status, { message, reason });
        }
      });
    },
  };
}

async function loadHowLongToBeatJs(): Promise<HltbPackageModule> {
  const importDependency = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<HltbPackageModule>;
  return importDependency('howlongtobeat-js');
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

function classifyHltbDevEndpointError(error: unknown): { message: string; reason: HltbProviderFailureReason; status: number } {
  const message = error instanceof Error ? error.message : 'Unknown howlongtobeat-js runtime failure.';

  if (/cannot find package|cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return {
      message: 'howlongtobeat-js is not installed. Run npm install before using HLTB sync in dev/server mode.',
      reason: 'unavailable',
      status: 503,
    };
  }

  if (/timeout|network|socket|ECONN|ENOTFOUND|ETIMEDOUT|fetch/i.test(message)) {
    return { message: `howlongtobeat-js network failure: ${message}`, reason: 'network', status: 502 };
  }

  if (/403|429|blocked|rate/i.test(message)) {
    return { message: `HowLongToBeat blocked or rate-limited howlongtobeat-js: ${message}`, reason: 'blocked', status: 503 };
  }

  return { message: `howlongtobeat-js failed at runtime: ${message}`, reason: 'temporary', status: 500 };
}
