import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const questshelfThemeColor = '#030612';
const questshelfBackgroundColor = '#030612';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'manifest.webmanifest',
      includeAssets: ['favicon.ico', 'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/favicon-48.png', 'icons/questshelf-icon-180.png'],
      manifest: {
        name: 'QuestShelf',
        short_name: 'QuestShelf',
        description: 'A local-first game library, metadata, and recommendation shelf.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: questshelfThemeColor,
        background_color: questshelfBackgroundColor,
        icons: [
          {
            src: '/icons/questshelf-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/questshelf-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/questshelf-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/questshelf-icon-180.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
        ],
        categories: ['games', 'utilities', 'entertainment'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    hltbDevEndpointPlugin(),
    psnConnectPlugin(),
  ],
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
      '/api/psn-trophy': {
        target: 'https://m.np.playstation.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('error', (error) => {
            const logger = Reflect.get(globalThis, 'console') as { error?: (...args: unknown[]) => void } | undefined;
            logger?.error?.('[QuestShelf PSN trophy proxy]', error.message);
          });
        },
        rewrite: (path) => path.replace(/^\/api\/psn-trophy/, ''),
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

// Dev/server-only PSN auth bridge. The browser sends the NPSSO token here;
// the server performs the OAuth redirect exchange (which requires following a
// custom-scheme redirect — something browsers cannot do) and returns the tokens.
function psnConnectPlugin(): Plugin {
  return {
    name: 'questshelf-psn-connect',
    configureServer(server) {
      server.middlewares.use('/api/psn/connect', (request, response) => {
        void handlePsnConnectRequest(request, response).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'PSN connect failed.';
          sendPsnJson(response, 500, { message });
        });
      });
    },
  };
}

const PSN_CLIENT_ID = '09515159-7237-4370-9b4a-3806334d89ca';
// Base64 of clientId:clientSecret — these are the public PSN mobile app credentials
// used by psn-api and multiple open-source PSN tools.
const PSN_BASIC_AUTH = 'Basic MDk1MTUxNTktNzIzNy00MzcwLTliNGEtMzgwNjMzNGQ4OWNhOnVjWkVQNEMzQzBVM1VOdFJnNVdBNVkyVjI=';
const PSN_REDIRECT_URI = 'com.scee.psxandroid.scearp://redirect';

async function handlePsnConnectRequest(
  request: { method?: string; on: (event: string, listener: (chunk?: unknown) => void) => void },
  response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void },
) {
  if (request.method !== 'POST') {
    sendPsnJson(response, 405, { message: 'PSN connect only accepts POST.' });
    return;
  }

  const body = await readRequestBody(request);
  const parsed = parseJson(body) as { npssoToken?: unknown };
  const npssoToken = typeof parsed.npssoToken === 'string' ? parsed.npssoToken.trim() : '';

  if (!npssoToken) {
    sendPsnJson(response, 400, { message: 'npssoToken is required.' });
    return;
  }

  const code = await exchangeNpssoForCode(npssoToken);
  const tokens = await exchangeCodeForTokens(code);
  const onlineId = await getPsnOnlineId(tokens.access_token).catch(() => '');

  sendPsnJson(response, 200, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    onlineId,
  });
}

async function exchangeNpssoForCode(npssoToken: string): Promise<string> {
  const authorizeUrl = new URL('https://ca.account.sony.com/api/authz/v3/oauth/authorize');
  authorizeUrl.searchParams.set('access_type', 'offline');
  authorizeUrl.searchParams.set('client_id', PSN_CLIENT_ID);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'psn:mobile.v2.core psn:clientapp');
  authorizeUrl.searchParams.set('redirect_uri', PSN_REDIRECT_URI);

  const authorizeResponse = await fetch(authorizeUrl.toString(), {
    redirect: 'manual',
    headers: {
      Cookie: `npsso=${npssoToken}`,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  const location = authorizeResponse.headers.get('location') ?? '';
  if (!location.includes('code=')) {
    throw new Error('NPSSO token is invalid or expired. Get a fresh token from my.playstation.com.');
  }

  const locationUrl = new URL(location.replace('com.scee.psxandroid.scearp://', 'https://placeholder/'));
  const code = locationUrl.searchParams.get('code');
  if (!code) {
    throw new Error('PSN auth code not found in redirect response.');
  }

  return code;
}

async function exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const tokenResponse = await fetch('https://ca.account.sony.com/api/authz/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: PSN_BASIC_AUTH,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: PSN_REDIRECT_URI,
      grant_type: 'authorization_code',
      token_format: 'jwt',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`PSN token exchange failed with HTTP ${tokenResponse.status}.`);
  }

  return tokenResponse.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

async function getPsnOnlineId(accessToken: string): Promise<string> {
  const profileResponse = await fetch('https://us-prof.np.community.playstation.net/userProfile/v1/users/me/profile2?fields=onlineId', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileResponse.ok) return '';

  const data = await profileResponse.json() as { profile?: { onlineId?: string } };
  return data?.profile?.onlineId ?? '';
}

function sendPsnJson(response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('access-control-allow-origin', '*');
  response.end(JSON.stringify(body));
}

function parseJson(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
