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
    steamGridDbDevEndpointPlugin(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
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

function logHltbDevEndpoint(label: string, details?: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } | undefined;
  if (label === 'provider failure reason') {
    logger?.warn?.(`[hltb] ${label}`, details ?? '');
    return;
  }
  logger?.debug?.(`[hltb] ${label}`, details ?? '');
}


type SteamGridDbImage = { url?: string; width?: number; height?: number; nsfw?: boolean; humor?: boolean; style?: string; score?: number; type?: string; mime?: string };
type SteamGridDbResponse = { data?: unknown };
type SteamGridDbProviderStatus = {
  status: 'success' | 'no-artwork' | 'invalid-key' | 'rate-limited' | 'endpoint-unavailable' | 'provider-error' | 'network-error';
  httpStatus?: number;
  message?: string;
};

const steamGridDbCache = new Map<string, { cachedAt: number; body: unknown }>();
const steamGridDbCandidatesCache = new Map<string, { cachedAt: number; body: unknown }>();
const STEAMGRIDDB_CACHE_MS = 24 * 60 * 60 * 1000;

function steamGridDbDevEndpointPlugin(): Plugin {
  return {
    name: 'questshelf-steamgriddb-dev-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/steamgriddb/artwork', (request, response) => {
        void handleSteamGridDbArtworkRequest(request, response).catch((error: unknown) => {
          const providerStatus = classifySteamGridDbProviderStatus(error);
          const statusCode = providerStatus.status === 'invalid-key'
            ? 401
            : providerStatus.status === 'rate-limited'
              ? 429
              : providerStatus.status === 'endpoint-unavailable'
                ? 503
                : providerStatus.status === 'network-error'
                  ? 502
                  : 502;
          sendHltbJson(response, statusCode, {
            status: providerStatus.status,
            message: providerStatus.message ?? 'SteamGridDB request failed.',
          });
        });
      });
    },
  };
}

async function handleSteamGridDbArtworkRequest(
  request: { method?: string; url?: string; headers?: { host?: string; 'x-questshelf-steamgriddb-key'?: string | string[] } },
  response: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void },
) {
  if (request.method !== 'GET') {
    sendHltbJson(response, 405, { message: 'SteamGridDB artwork endpoint only supports GET.' });
    return;
  }

  const apiKey = getSteamGridDbRequestApiKey(request);
  const requestUrl = new URL(request.url ?? '', `http://${request.headers?.host ?? 'localhost'}`);
  const steamAppId = requestUrl.searchParams.get('steamAppId')?.trim();
  const title = requestUrl.searchParams.get('title')?.trim();
  const lookup = steamAppId ? 'steam-app-id' : 'title';
  logSteamGridDbDevEndpoint('artwork request', { hasApiKey: Boolean(apiKey), lookup });
  if (!apiKey) {
    sendHltbJson(response, 503, { status: 'missing-key', message: 'SteamGridDB API key is not configured.' });
    return;
  }

  const mode = requestUrl.searchParams.get('mode');
  const cacheKey = `${steamAppId ?? ''}:${title ?? ''}`.toLowerCase();
  if (mode === 'candidates') {
    const candidatesCacheKey = `candidates:${cacheKey}`;
    const cachedCandidates = steamGridDbCandidatesCache.get(candidatesCacheKey);
    if (cachedCandidates && Date.now() - cachedCandidates.cachedAt < STEAMGRIDDB_CACHE_MS) {
      sendHltbJson(response, 200, cachedCandidates.body);
      return;
    }
  } else {
    const cached = steamGridDbCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < STEAMGRIDDB_CACHE_MS) {
      sendHltbJson(response, 200, cached.body);
      return;
    }
  }

  const gameId = steamAppId ? await getSteamGridDbGameIdBySteamAppId(apiKey, steamAppId, lookup) : title ? await getSteamGridDbGameIdByTitle(apiKey, title, lookup) : null;
  if (!gameId) {
    sendHltbJson(response, 404, { status: 'no-game-match', message: 'No SteamGridDB match found.' });
    return;
  }

  const [portraitGrids, landscapeGrids, heroes, logos, icons] = await Promise.all([
    requestSteamGridDbImagesSafely(apiKey, `/grids/game/${gameId}`, lookup, { dimensions: '600x900,342x482' }),
    requestSteamGridDbImagesSafely(apiKey, `/grids/game/${gameId}`, lookup, { dimensions: '920x430,460x215,1920x620' }),
    requestSteamGridDbImagesSafely(apiKey, `/heroes/game/${gameId}`, lookup, { dimensions: '1920x620' }),
    requestSteamGridDbImagesSafely(apiKey, `/logos/game/${gameId}`, lookup),
    requestSteamGridDbImagesSafely(apiKey, `/icons/game/${gameId}`, lookup),
  ]);

  if (mode === 'candidates') {
    const candidatesBody = {
      gameId,
      cover: formatSteamGridDbCandidates(portraitGrids.images),
      wideCover: formatSteamGridDbCandidates(landscapeGrids.images),
      hero: formatSteamGridDbCandidates(heroes.images),
      logo: formatSteamGridDbCandidates(logos.images),
      icon: formatSteamGridDbCandidates(icons.images),
    };
    const hasAnyCandidates = Object.values(candidatesBody).some((v) => Array.isArray(v) && v.length > 0);
    if (!hasAnyCandidates) {
      sendHltbJson(response, 404, { status: 'no-artwork', message: 'SteamGridDB found the game but did not return usable artwork.' });
      return;
    }
    const candidatesCacheKey = `candidates:${cacheKey}`;
    steamGridDbCandidatesCache.set(candidatesCacheKey, { cachedAt: Date.now(), body: candidatesBody });
    sendHltbJson(response, 200, candidatesBody);
    return;
  }

  const body = {
    coverImage: pickSteamGridDbImage(portraitGrids.images, 'portrait'),
    wideCoverImage: pickSteamGridDbImage(landscapeGrids.images, 'landscape'),
    heroImage: pickSteamGridDbImage(heroes.images, 'hero'),
    logoImage: pickSteamGridDbImage(logos.images, 'logo'),
    iconImage: pickSteamGridDbImage(icons.images, 'icon'),
    artworkSource: 'steamgriddb',
    artworkSourceMetadata: { steamGridDb: { gameId, lookup, refreshedAt: new Date().toISOString() } },
    providerStatus: {
      portrait: portraitGrids.providerStatus,
      landscape: landscapeGrids.providerStatus,
      hero: heroes.providerStatus,
      logo: logos.providerStatus,
      icon: icons.providerStatus,
    },
  };
  const hasArtwork = [body.coverImage, body.wideCoverImage, body.heroImage, body.logoImage, body.iconImage].some(Boolean);
  if (!hasArtwork) {
    sendHltbJson(response, 404, { ...body, status: 'no-artwork', message: 'SteamGridDB found the game but did not return usable artwork.' });
    return;
  }
  steamGridDbCache.set(cacheKey, { cachedAt: Date.now(), body });
  sendHltbJson(response, 200, body);
}

function getSteamGridDbRequestApiKey(request: { headers?: { 'x-questshelf-steamgriddb-key'?: string | string[] } }) {
  const headerValue = request.headers?.['x-questshelf-steamgriddb-key'];
  const savedApiKey = normalizeSteamGridDbDevApiKey(Array.isArray(headerValue) ? headerValue[0] : headerValue);
  return savedApiKey || normalizeSteamGridDbDevApiKey(process.env.STEAMGRIDDB_API_KEY || process.env.VITE_STEAMGRIDDB_API_KEY);
}

async function getSteamGridDbGameIdBySteamAppId(apiKey: string, steamAppId: string, lookup: string) {
  const response = await requestSteamGridDb<SteamGridDbResponse>(apiKey, `/games/steam/${encodeURIComponent(steamAppId)}`, {}, lookup);
  const data = response.data as { id?: number } | undefined;
  return typeof data?.id === 'number' ? data.id : null;
}

async function getSteamGridDbGameIdByTitle(apiKey: string, title: string, lookup: string) {
  const response = await requestSteamGridDb<SteamGridDbResponse>(apiKey, '/search/autocomplete/' + encodeURIComponent(title), {}, lookup);
  const first = Array.isArray(response.data) ? (response.data[0] as { id?: number } | undefined) : undefined;
  return typeof first?.id === 'number' ? first.id : null;
}

async function requestSteamGridDbImagesSafely(apiKey: string, path: string, lookup: string, params: Record<string, string> = {}) {
  try {
    const images = await requestSteamGridDbImages(apiKey, path, params, lookup);
    return { images, providerStatus: { status: images.length ? 'success' : 'no-artwork' } satisfies SteamGridDbProviderStatus };
  } catch (error: unknown) {
    const providerStatus = classifySteamGridDbProviderStatus(error);
    logSteamGridDbDevEndpoint('category failure', { lookup, path, providerStatus });
    return { images: [], providerStatus };
  }
}

async function requestSteamGridDbImages(apiKey: string, path: string, params: Record<string, string> = {}, lookup = 'unknown') {
  const response = await requestSteamGridDb<SteamGridDbResponse>(apiKey, path, { types: 'static', ...params }, lookup);
  return Array.isArray(response.data) ? (response.data as SteamGridDbImage[]) : [];
}

async function requestSteamGridDb<T>(apiKey: string, path: string, params: Record<string, string> = {}, lookup = 'unknown'): Promise<T> {
  const url = new URL(`https://www.steamgriddb.com/api/v2${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
  } catch (error: unknown) {
    logSteamGridDbDevEndpoint('provider network failure', { lookup, path, message: error instanceof Error ? error.message : 'unknown network error' });
    throw Object.assign(new Error('SteamGridDB network request failed.'), { providerStatus: 'network-error' });
  }
  logSteamGridDbDevEndpoint('provider response', { lookup, path, status: response.status });
  if (response.status === 404) return { data: [] } as T;
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('SteamGridDB rejected the API key.'), { providerStatus: 'invalid-key', httpStatus: response.status });
  if (response.status === 429) throw Object.assign(new Error('SteamGridDB rate limit reached.'), { providerStatus: 'rate-limited', httpStatus: response.status });
  if (response.status >= 500) throw Object.assign(new Error(`SteamGridDB returned ${response.status}.`), { providerStatus: 'endpoint-unavailable', httpStatus: response.status });
  if (!response.ok) throw Object.assign(new Error(`SteamGridDB returned ${response.status}.`), { providerStatus: 'provider-error', httpStatus: response.status });
  return (await response.json()) as T;
}

function normalizeSteamGridDbDevApiKey(value: string | undefined) {
  return (value ?? '').trim().replace(/^Bearer\s+/i, '').trim();
}

function classifySteamGridDbProviderStatus(error: unknown): SteamGridDbProviderStatus {
  const maybeStatus = error && typeof error === 'object' ? error as { providerStatus?: unknown; httpStatus?: unknown; message?: unknown } : {};
  const status = typeof maybeStatus.providerStatus === 'string' ? maybeStatus.providerStatus : 'provider-error';
  return {
    status: isSteamGridDbProviderStatus(status) ? status : 'provider-error',
    httpStatus: typeof maybeStatus.httpStatus === 'number' ? maybeStatus.httpStatus : undefined,
    message: typeof maybeStatus.message === 'string' ? maybeStatus.message : undefined,
  };
}

function isSteamGridDbProviderStatus(status: string): status is SteamGridDbProviderStatus['status'] {
  return ['success', 'no-artwork', 'invalid-key', 'rate-limited', 'endpoint-unavailable', 'provider-error', 'network-error'].includes(status);
}

function logSteamGridDbDevEndpoint(label: string, details?: unknown) {
  const logger = Reflect.get(globalThis, 'console') as { debug?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void } | undefined;
  if (/failure/i.test(label)) {
    logger?.warn?.(`[steamgriddb] ${label}`, details ?? '');
    return;
  }
  logger?.debug?.(`[steamgriddb] ${label}`, details ?? '');
}

function formatSteamGridDbCandidates(images: SteamGridDbImage[], limit = 24): Array<{ url: string; width?: number; height?: number }> {
  return images
    .filter((image) => image.url && /^https?:\/\//i.test(image.url) && !image.nsfw && !image.humor && (image.type === 'static' || image.mime !== 'image/gif'))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map(({ url, width, height }) => ({ url: url!, width, height }));
}

function pickSteamGridDbImage(images: SteamGridDbImage[], usage: 'portrait' | 'landscape' | 'hero' | 'logo' | 'icon') {
  const filtered = images.filter((image) => image.url && !image.nsfw && !image.humor && (image.type === 'static' || image.mime !== 'image/gif'));
  const scored = filtered.sort((a, b) => getSteamGridDbImageScore(b, usage) - getSteamGridDbImageScore(a, usage));
  return scored[0]?.url;
}

function getSteamGridDbImageScore(image: SteamGridDbImage, usage: 'portrait' | 'landscape' | 'hero' | 'logo' | 'icon') {
  const width = image.width || 0;
  const height = image.height || 1;
  const ratio = width / height;
  const target = usage === 'portrait' ? 2 / 3 : usage === 'hero' ? 1920 / 620 : usage === 'icon' || usage === 'logo' ? 1 : 920 / 430;
  return (image.score ?? 0) + Math.min(width, 1920) / 1000 - Math.abs(ratio - target) * 3;
}
