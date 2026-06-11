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

type HltbApiGame = Record<string, unknown>;

type HltbSearchResult = {
  id?: string;
  title: string;
  mainHours?: number;
  mainExtraHours?: number;
  completionistHours?: number;
  allStylesHours?: number;
  allStylesCount?: number;
  sourceUrl?: string;
  steamAppId?: number;
  profileSteam?: string;
};

const HLTB_ORIGIN = 'https://howlongtobeat.com';
const HLTB_API_SEARCH_PATH = '/api/search';
const HLTB_API_SEARCH_URL = new URL(HLTB_API_SEARCH_PATH, HLTB_ORIGIN).toString();
const HLTB_SOURCE_BASE_URL = `${HLTB_ORIGIN}/game`;
const HLTB_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Dev/server-only HLTB bridge. The frontend talks to /api/hltb/search so browser
// code never calls howlongtobeat.com directly; this Node middleware owns the
// hltb-for-deck-style POST request to HowLongToBeat.
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

  const upstreamUrl = HLTB_API_SEARCH_URL;
  const upstreamMethod = 'POST';
  logHltbDevEndpoint('upstream url', { title, url: upstreamUrl, path: HLTB_API_SEARCH_PATH });
  logHltbDevEndpoint('request method', { title, method: upstreamMethod });

  const apiResponse = await fetch(upstreamUrl, {
    method: upstreamMethod,
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Content-Type': 'application/json',
      Origin: HLTB_ORIGIN,
      Referer: `${HLTB_ORIGIN}/`,
      'User-Agent': HLTB_BROWSER_USER_AGENT,
    },
    body: JSON.stringify(createHltbSearchPayload(title)),
  }).catch((error: unknown) => {
    throw toHltbDevEndpointError(error);
  });

  const responseContentType = apiResponse.headers.get('content-type') ?? '';
  logHltbDevEndpoint('response status', { title, status: apiResponse.status });
  logHltbDevEndpoint('response content-type', { title, contentType: responseContentType || '(none)' });

  const responseText = await apiResponse.text().catch((error: unknown) => {
    throw toHltbDevEndpointError(error);
  });
  const isJsonResponse = isHltbJsonContentType(responseContentType);
  if (!isJsonResponse && responseText.trim()) {
    logHltbDevEndpoint('non-JSON response preview', {
      title,
      status: apiResponse.status,
      contentType: responseContentType || '(none)',
      preview: responseText.trim().slice(0, 120),
    });
  }

  if (!isJsonResponse) {
    const error = classifyHltbNonJsonResponse(apiResponse.status, responseContentType, responseText, upstreamUrl);
    logHltbDevEndpoint('provider failure reason', error);
    sendHltbJson(response, error.status, error);
    return;
  }

  const parsed = parseHltbApiResponseJson(responseText, apiResponse.status, upstreamUrl, responseContentType);

  if (!apiResponse.ok) {
    const error = classifyHltbHttpError(apiResponse.status, parsed, upstreamUrl, responseContentType);
    logHltbDevEndpoint('provider failure reason', error);
    sendHltbJson(response, error.status, error);
    return;
  }

  const data = getHltbApiResponseData(parsed);
  if (!data) {
    const error = {
      message: 'HowLongToBeat returned an invalid response shape.',
      reason: 'invalid-response' as HltbProviderFailureReason,
      status: 502,
    };
    logHltbDevEndpoint('provider failure reason', error);
    sendHltbJson(response, error.status, error);
    return;
  }

  const results = data.map(mapHltbApiGame).filter((result): result is HltbSearchResult => Boolean(result));
  logHltbDevEndpoint('candidates count', { title, count: results.length });
  sendHltbJson(response, 200, { provider: 'howlongtobeat-api', results });
}

function createHltbSearchPayload(title: string) {
  return {
    searchType: 'games',
    searchTerms: title.split(' ').filter(Boolean),
    searchPage: 1,
    size: 50,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'name',
        rangeCategory: 'main',
        rangeTime: { min: 0, max: 0 },
        gameplay: {
          perspective: '',
          flow: '',
          genre: '',
        },
        modifier: 'hide_dlc',
      },
      users: {},
      filter: '',
      sort: 0,
      randomizer: 0,
    },
  };
}

function isHltbJsonContentType(contentType: string) {
  return /(^|[\s;])application\/(?:[\w.+-]+\+)?json(?:[\s;]|$)/i.test(contentType);
}

function parseHltbApiResponseJson(text: string, status: number, upstreamUrl: string, contentType: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw {
      message: `HowLongToBeat returned invalid JSON from ${upstreamUrl} (HTTP ${status}, content-type: ${contentType || 'unknown'})${error instanceof Error ? `: ${error.message}` : '.'}`,
      reason: 'parse' as HltbProviderFailureReason,
      status: status >= 400 ? status : 502,
    };
  }
}

function getHltbApiResponseData(value: unknown): HltbApiGame[] | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null;
  }

  return value.data.filter(isRecord);
}

function mapHltbApiGame(value: HltbApiGame): HltbSearchResult | null {
  const title = getString(value.game_name);
  if (!title) {
    return null;
  }

  const id = getString(value.game_id);
  const profileSteam = getString(value.profile_steam);

  return {
    id,
    title,
    mainHours: normalizeHltbSecondsToHours(value.comp_main),
    mainExtraHours: normalizeHltbSecondsToHours(value.comp_plus),
    completionistHours: normalizeHltbSecondsToHours(value.comp_100),
    allStylesHours: normalizeHltbSecondsToHours(value.comp_all),
    allStylesCount: getNumber(value.comp_all_count),
    sourceUrl: id ? `${HLTB_SOURCE_BASE_URL}/${id}` : undefined,
    steamAppId: getSteamAppId(profileSteam),
    profileSteam,
  };
}

function normalizeHltbSecondsToHours(value: unknown) {
  const seconds = getNumber(value);
  if (typeof seconds !== 'number' || seconds <= 0) {
    return undefined;
  }

  return Math.round((seconds / 3600) * 10) / 10;
}

function classifyHltbNonJsonResponse(status: number, contentType: string, text: string, upstreamUrl: string): { message: string; reason: HltbProviderFailureReason; status: number; upstreamUrl: string; upstreamStatus: number; upstreamContentType: string } {
  const responseLooksHtml = /<\s*!doctype|<\s*html/i.test(text);
  const upstreamContentType = contentType || 'unknown';

  if (status === 404 && responseLooksHtml) {
    return {
      message: `HLTB upstream returned 404 HTML. Check endpoint path. Upstream URL: ${upstreamUrl}; status: ${status}; content-type: ${upstreamContentType}.`,
      reason: 'unavailable',
      status: 502,
      upstreamUrl,
      upstreamStatus: status,
      upstreamContentType,
    };
  }

  return {
    message: `HowLongToBeat returned non-JSON data from ${upstreamUrl} (HTTP ${status}, content-type: ${upstreamContentType}).`,
    reason: 'parse',
    status: status >= 400 ? status : 502,
    upstreamUrl,
    upstreamStatus: status,
    upstreamContentType,
  };
}

function classifyHltbHttpError(status: number, data: unknown, upstreamUrl: string, contentType: string): { message: string; reason: HltbProviderFailureReason; status: number; upstreamUrl: string; upstreamStatus: number; upstreamContentType: string } {
  const upstreamContentType = contentType || 'unknown';
  const message = getHltbErrorMessage(data) ?? `HowLongToBeat request to ${upstreamUrl} failed with HTTP ${status} (content-type: ${upstreamContentType}).`;

  if (status === 403 || status === 429) {
    return { message, reason: 'blocked', status, upstreamUrl, upstreamStatus: status, upstreamContentType };
  }

  if (status >= 500) {
    return { message, reason: 'temporary', status, upstreamUrl, upstreamStatus: status, upstreamContentType };
  }

  return { message, reason: 'invalid-response', status, upstreamUrl, upstreamStatus: status, upstreamContentType };
}

function getHltbErrorMessage(data: unknown) {
  if (!isRecord(data)) {
    return undefined;
  }

  return getString(data.message) ?? getString(data.error);
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

function getSteamAppId(value: unknown) {
  const profileSteam = getString(value);
  if (!profileSteam) {
    return undefined;
  }

  const match = profileSteam.match(/\d+/);
  if (!match) {
    return undefined;
  }

  const appId = Number(match[0]);
  return Number.isFinite(appId) ? appId : undefined;
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

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
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
