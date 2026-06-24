export type IntegrationTransport = 'vite-dev-proxy' | 'vercel-integration-proxy' | 'direct-fetch';

const defaultProductionBaseUrl = '/api/integrations';

export function getIntegrationProxyBaseUrl() {
  return (import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim() || defaultProductionBaseUrl).replace(/\/$/, '');
}

export function getIntegrationTransport(provider?: string): IntegrationTransport {
  if (import.meta.env.DEV && !import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim()) return 'vite-dev-proxy';
  const baseUrl = getIntegrationProxyBaseUrl();
  if (baseUrl.includes('/api/integrations')) return 'vercel-integration-proxy';
  return provider === 'steam-store' ? 'direct-fetch' : 'vercel-integration-proxy';
}

export async function postIntegration<T>(provider: string, route: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getIntegrationProxyBaseUrl()}/${provider}/${route}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* ignore */ }
  if (!response.ok) {
    const errorBody = payload && typeof payload === 'object' ? payload as { error?: unknown; code?: unknown } : {};
    throw Object.assign(new Error(typeof errorBody.error === 'string' ? errorBody.error : `Integration proxy request failed with HTTP ${response.status}.`), {
      status: response.status,
      code: typeof errorBody.code === 'string' ? errorBody.code : 'PROXY_ERROR',
    });
  }
  return payload as T;
}
