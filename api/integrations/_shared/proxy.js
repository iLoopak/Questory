export const DEFAULT_TIMEOUT_MS = 10000;
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-QuestShelf-SteamGridDb-Key',
};
export function sendJson(res, status, body) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }
  return false;
}
export function requirePost(req, res, provider) {
  if (req.method !== 'POST') { sendError(res, provider, 405, 'Use POST for integration proxy requests.', 'METHOD_NOT_ALLOWED'); return false; }
  return true;
}
export function getBody(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
export function requireString(body, name, provider, label = name) {
  const value = typeof body[name] === 'string' ? body[name].trim() : String(body[name] ?? '').trim();
  if (!value) throw Object.assign(new Error(`Missing ${label}`), { status: 400, code: `MISSING_${name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}` });
  return value;
}
export function sendError(res, provider, status, error, code, extra = {}) { sendJson(res, status, { success: false, provider, error, code, ...extra }); }
export function classifyStatus(provider, status) {
  if (status === 401 || status === 403) return { code: 'INVALID_API_KEY', error: `${provider} rejected the API key or denied access.` };
  if (status === 404) return { code: 'NO_RESULTS', error: `${provider} returned no results.` };
  if (status === 429) return { code: 'RATE_LIMITED', error: `${provider} rate limit reached.` };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', error: `${provider} is temporarily unavailable.` };
  return { code: 'PROVIDER_ERROR', error: `${provider} request failed.` };
}
export async function upstreamJson(provider, url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
    if (!response.ok) {
      const status = classifyStatus(provider, response.status);
      throw Object.assign(new Error(status.error), { status: response.status, code: status.code, body });
    }
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error(`${provider} request timed out.`), { status: 504, code: 'PROVIDER_TIMEOUT' });
    if (error?.status) throw error;
    throw Object.assign(new Error(`${provider} request failed before a response was received.`), { status: 502, code: 'PROVIDER_UNAVAILABLE' });
  } finally { clearTimeout(timeout); }
}
export async function endpoint(req, res, provider, handler) {
  if (handleOptions(req, res) || !requirePost(req, res, provider)) return;
  try { sendJson(res, 200, await handler(getBody(req))); }
  catch (error) { sendError(res, provider, error.status || 500, error.message || 'Integration proxy error.', error.code || 'PROXY_ERROR'); }
}
