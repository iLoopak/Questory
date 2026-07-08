import { getRuntimeEnvironment } from './capacitorEnvironment';

export type IntegrationProvider = 'Steam' | 'RAWG' | 'ITAD' | 'SteamGridDB';
export type IntegrationTransport = 'vite-dev-proxy' | 'vercel-integration-proxy' | 'direct-fetch';

export type IntegrationRequestDiagnostic = {
  provider: IntegrationProvider;
  transport: IntegrationTransport;
  environment: string;
  requestUrl: string;
  httpStatus?: number | null;
  responseSummary?: string;
  errorDetails?: string;
  createdAt: string;
};

const defaultProductionBaseUrl = 'https://getquestory.vercel.app/api/integrations';
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
  console.info('[Integration]', `\nProvider: ${diagnostic.provider}\nTransport: ${diagnostic.transport}\nEnvironment: ${diagnostic.environment}\nRequest URL:\n${diagnostic.requestUrl}`, {
    httpStatus: diagnostic.httpStatus,
    responseSummary: diagnostic.responseSummary,
    errorDetails: diagnostic.errorDetails,
  });
}

export function getIntegrationDiagnostics() {
  return [...diagnostics];
}

export function summarizeIntegrationResponse(payload: unknown) {
  if (payload == null) return 'Empty response body.';
  if (Array.isArray(payload)) return `Array response with ${payload.length} item(s).`;
  if (typeof payload === 'object') return `Object response with keys: ${Object.keys(payload as Record<string, unknown>).slice(0, 8).join(', ') || 'none'}.`;
  return String(payload).slice(0, 240);
}

function providerLabel(provider: string): IntegrationProvider {
  if (provider === 'rawg') return 'RAWG';
  if (provider === 'itad') return 'ITAD';
  if (provider === 'steamgriddb') return 'SteamGridDB';
  return 'Steam';
}

export async function postIntegration<T>(provider: string, route: string, body: Record<string, unknown>): Promise<T> {
  const url = getIntegrationProxyRequestUrl(provider, route);
  const baseDiagnostic = {
    provider: providerLabel(provider),
    transport: getIntegrationTransport(provider),
    environment: getIntegrationEnvironmentLabel(),
    requestUrl: url,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* ignore */ }
  recordIntegrationDiagnostic({ ...baseDiagnostic, httpStatus: response.status, responseSummary: summarizeIntegrationResponse(payload) });
  if (!response.ok) {
    const errorBody = payload && typeof payload === 'object' ? payload as { error?: unknown; code?: unknown } : {};
    throw Object.assign(new Error(typeof errorBody.error === 'string' ? errorBody.error : `Integration proxy request failed with HTTP ${response.status}.`), {
      status: response.status,
      code: typeof errorBody.code === 'string' ? errorBody.code : 'PROXY_ERROR',
    });
  }
  return payload as T;
}

console.info('[Integration startup]', {
  environment: getIntegrationEnvironmentLabel(),
  proxyBaseUrl: getIntegrationProxyBaseUrl(),
  transport: getIntegrationTransport(),
  viteProxyEnvPresent: Boolean(import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim()),
});
