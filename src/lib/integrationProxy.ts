import { getRuntimeEnvironment } from './capacitorEnvironment';

export type IntegrationProviderId = 'rawg' | 'steam' | 'itad' | 'steamgriddb';
export type IntegrationProvider = 'Steam' | 'RAWG' | 'ITAD' | 'SteamGridDB';
export type IntegrationTransport = 'vite-dev-proxy' | 'vercel-integration-proxy' | 'direct-fetch';
export type IntegrationErrorKind = 'missing-key' | 'invalid-key' | 'rate-limited' | 'timeout' | 'network' | 'provider' | 'malformed-response' | 'aborted' | 'unsupported-route';

type RouteDefinition = { requiresKey: boolean; parse: (value: unknown) => unknown };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const envelope = (value: unknown) => {
  const row = object(value);
  return row && 'response' in row && row.response !== null && typeof row.response === 'object' ? row : null;
};

/** Small explicit contract for the routes Questory actually calls. */
export const integrationRouteMap = {
  rawg: {
    request: { requiresKey: true, parse: envelope },
  },
  steam: {
    'owned-games': { requiresKey: true, parse: envelope },
    'player-summary': { requiresKey: true, parse: envelope },
    'recently-played': { requiresKey: true, parse: envelope },
    achievements: { requiresKey: true, parse: (value: unknown) => {
      const row = object(value);
      return row && object(row.schema) && object(row.playerAchievements) ? row : null;
    } },
  },
  itad: {
    search: { requiresKey: true, parse: (value: unknown) => {
      const row = envelope(value);
      if (!row || !Array.isArray(row.response)) return null;
      return row.response.every((item) => {
        const result = object(item);
        return result && typeof result.id === 'string' && typeof result.title === 'string';
      }) ? row : null;
    } },
    overview: { requiresKey: true, parse: (value: unknown) => {
      const row = envelope(value);
      const response = row ? object(row.response) : null;
      return response && (response.prices === undefined || Array.isArray(response.prices)) ? row : null;
    } },
  },
  steamgriddb: {
    artwork: { requiresKey: true, parse: object },
  },
} as const satisfies Record<IntegrationProviderId, Record<string, RouteDefinition>>;

export type IntegrationRoute<P extends IntegrationProviderId> = keyof typeof integrationRouteMap[P] & string;
export type IntegrationRouteName = 'request' | 'owned-games' | 'player-summary' | 'recently-played' | 'achievements' | 'search' | 'overview' | 'artwork';
export type IntegrationRequestOptions = { signal?: AbortSignal; timeoutMs?: number };

export class IntegrationBoundaryError extends Error {
  constructor(
    message: string,
    public readonly kind: IntegrationErrorKind,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'IntegrationBoundaryError';
  }
}

export type IntegrationRequestDiagnostic = {
  provider: IntegrationProvider;
  route: string;
  transport: IntegrationTransport;
  environment: string;
  httpStatus?: number | null;
  responseSummary?: string;
  errorKind?: IntegrationErrorKind;
  durationBucket: '<1s' | '1-5s' | '5-15s' | '15s+';
  retryable: boolean;
  createdAt: string;
};

const defaultProductionBaseUrl = 'https://getquestory.vercel.app/api/integrations';
const defaultTimeoutMs = 20_000;
const maxResponseBytes = 2_000_000;
const diagnostics: IntegrationRequestDiagnostic[] = [];

export function getIntegrationProxyBaseUrl() {
  return (import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim() || defaultProductionBaseUrl).replace(/\/$/, '');
}

export function getIntegrationEnvironmentLabel() {
  const runtime = getRuntimeEnvironment();
  if (runtime.isAndroid) return import.meta.env.PROD ? 'Android APK production' : 'Android APK development';
  return import.meta.env.PROD ? 'production' : 'development';
}

export function getIntegrationTransport(_provider?: string): IntegrationTransport {
  if (import.meta.env.DEV && !import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim()) return 'vite-dev-proxy';
  return 'vercel-integration-proxy';
}

export function getIntegrationProxyRequestUrl(provider: string, route: string) {
  return `${getIntegrationProxyBaseUrl()}/${provider}/${route}`;
}

export function recordIntegrationDiagnostic(entry: Omit<IntegrationRequestDiagnostic, 'createdAt'>) {
  const diagnostic = { ...entry, createdAt: new Date().toISOString() };
  diagnostics.unshift(diagnostic);
  diagnostics.splice(25);
  console.info('[Integration]', {
    provider: diagnostic.provider,
    route: diagnostic.route,
    transport: diagnostic.transport,
    environment: diagnostic.environment,
    httpStatus: diagnostic.httpStatus,
    responseSummary: diagnostic.responseSummary,
    errorKind: diagnostic.errorKind,
    durationBucket: diagnostic.durationBucket,
    retryable: diagnostic.retryable,
  });
}

export function getIntegrationDiagnostics() { return [...diagnostics]; }

export function summarizeIntegrationResponse(payload: unknown) {
  if (payload == null) return 'Empty response body.';
  if (Array.isArray(payload)) return `Array response with ${payload.length} item(s).`;
  if (typeof payload === 'object') return `Object response with keys: ${Object.keys(payload as Record<string, unknown>).slice(0, 8).join(', ') || 'none'}.`;
  return `Unexpected ${typeof payload} response.`;
}

export async function postIntegration<T>(
  provider: IntegrationProviderId,
  route: IntegrationRouteName,
  body: Record<string, unknown>,
  options: IntegrationRequestOptions = {},
): Promise<T> {
  const definition = (integrationRouteMap[provider] as Record<string, RouteDefinition>)[route];
  if (!definition) throw new IntegrationBoundaryError('This integration route is not supported.', 'unsupported-route', 'UNSUPPORTED_ROUTE');
  if (definition.requiresKey && typeof body.apiKey === 'string' && !body.apiKey.trim()) {
    throw new IntegrationBoundaryError('This integration needs an API key.', 'missing-key', 'MISSING_API_KEY');
  }

  const startedAt = Date.now();
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; timeoutController.abort(); }, options.timeoutMs ?? defaultTimeoutMs);
  const signal = composeAbortSignals(options.signal, timeoutController.signal);
  const baseDiagnostic = {
    provider: providerLabel(provider), route, transport: getIntegrationTransport(provider), environment: getIntegrationEnvironmentLabel(),
  };

  try {
    const response = await fetch(getIntegrationProxyRequestUrl(provider, route), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    const contentLength = Number(response.headers?.get?.('content-length') ?? 0);
    if (contentLength > maxResponseBytes) throw malformed('Integration response was too large.', response.status);
    const payload = await readJsonBody(response);

    if (!response.ok) throw mapServerError(payload, response.status);
    const parsed = definition.parse(payload);
    if (parsed === null) throw malformed('Integration returned an unexpected response.', response.status);
    recordIntegrationDiagnostic({ ...baseDiagnostic, httpStatus: response.status, responseSummary: summarizeIntegrationResponse(parsed), durationBucket: durationBucket(Date.now() - startedAt), retryable: false });
    return parsed as T;
  } catch (error) {
    const mapped = mapBoundaryError(error, timedOut, options.signal?.aborted === true);
    recordIntegrationDiagnostic({ ...baseDiagnostic, httpStatus: mapped.status, errorKind: mapped.kind, responseSummary: 'Response rejected at integration boundary.', durationBucket: durationBucket(Date.now() - startedAt), retryable: isRetryable(mapped.kind) });
    throw mapped;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonBody(text: string, status: number): unknown {
  if (!text.trim()) throw malformed('Integration returned an empty response.', status);
  try { return JSON.parse(text); } catch { throw malformed('Integration returned malformed JSON.', status); }
}

async function readJsonBody(response: Response): Promise<unknown> {
  // Real Fetch responses use text so HTML, empty and oversized bodies are distinguishable. The
  // json fallback preserves compatibility with the repository's established minimal fetch fakes.
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (text.length > maxResponseBytes) throw malformed('Integration response was too large.', response.status);
    return parseJsonBody(text, response.status);
  }
  if (typeof response.json === 'function') {
    try { return await response.json(); } catch { throw malformed('Integration returned malformed JSON.', response.status); }
  }
  throw malformed('Integration returned an empty response.', response.status);
}

function mapServerError(payload: unknown, status: number): IntegrationBoundaryError {
  const row = object(payload);
  const code = typeof row?.code === 'string' ? row.code : 'PROXY_ERROR';
  if (code === 'INVALID_API_KEY' || status === 401 || status === 403) return new IntegrationBoundaryError('The provider did not accept this API key.', 'invalid-key', code, status);
  if (code === 'RATE_LIMITED' || status === 429) return new IntegrationBoundaryError('The provider is rate limiting requests.', 'rate-limited', code, status);
  if (code === 'PROVIDER_TIMEOUT' || status === 504) return new IntegrationBoundaryError('The provider request timed out.', 'timeout', code, status);
  return new IntegrationBoundaryError('The integration provider returned an error.', 'provider', code, status);
}

function mapBoundaryError(error: unknown, timedOut: boolean, callerAborted: boolean): IntegrationBoundaryError {
  if (error instanceof IntegrationBoundaryError) return error;
  if (timedOut) return new IntegrationBoundaryError('The integration request timed out.', 'timeout', 'CLIENT_TIMEOUT');
  if (callerAborted) return new IntegrationBoundaryError('The integration request was cancelled.', 'aborted', 'ABORTED');
  if (typeof (error as { name?: unknown })?.name === 'string' && (error as { name: string }).name === 'AbortError') return new IntegrationBoundaryError('The integration request was cancelled.', 'aborted', 'ABORTED');
  return new IntegrationBoundaryError('The integration request could not reach the server.', 'network', 'NETWORK_ERROR');
}

function malformed(message: string, status?: number) { return new IntegrationBoundaryError(message, 'malformed-response', 'MALFORMED_RESPONSE', status); }
function providerLabel(provider: IntegrationProviderId): IntegrationProvider { return provider === 'rawg' ? 'RAWG' : provider === 'itad' ? 'ITAD' : provider === 'steamgriddb' ? 'SteamGridDB' : 'Steam'; }
function durationBucket(ms: number): IntegrationRequestDiagnostic['durationBucket'] { return ms < 1000 ? '<1s' : ms < 5000 ? '1-5s' : ms < 15000 ? '5-15s' : '15s+'; }
function isRetryable(kind: IntegrationErrorKind) { return ['rate-limited', 'timeout', 'network', 'provider', 'malformed-response'].includes(kind); }
function composeAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signals.filter(Boolean).forEach((signal) => signal?.aborted ? abort() : signal?.addEventListener('abort', abort, { once: true }));
  return controller.signal;
}

console.info('[Integration startup]', {
  environment: getIntegrationEnvironmentLabel(), proxyBaseUrl: getIntegrationProxyBaseUrl(), transport: getIntegrationTransport(),
  viteProxyEnvPresent: Boolean(import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim()),
});
