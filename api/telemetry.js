const telemetryProvider = 'telemetry';
const MAX_BODY_BYTES = 8192;
const UPSTREAM_TIMEOUT_MS = 5000;
const allowedEventNames = new Set(['app_open','first_run_completed','import_completed','quest_queue_opened','platform_plans_opened','backup_exported','backup_imported','telemetry_test']);
const allowedImportSources = new Set(['steam','wishlist_html','retro','backup','manual','unknown']);
const allowedRuntimes = new Set(['web','android','pwa','unknown']);
const allowedBuckets = new Set(['0','1','2-5','6-10','11-25','26-50','51-100','101-250','251-500','501-1000','1000+']);
const baseFields = new Set(['schemaVersion','eventName','eventId','timestamp','appVersion','runtime','librarySizeBucket','wishlistSizeBucket','platformCountBucket','playingCountBucket','queueCountBucket']);
const importFields = new Set([...baseFields, 'importSource']);

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function fail(status, code, error) {
  const err = new Error(error);
  err.status = status;
  err.code = code;
  return err;
}

function normalizeWebhookUrl(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function getBodySize(req) {
  const header = req.headers?.['content-length'];
  const parsed = Number(Array.isArray(header) ? header[0] : header);
  if (Number.isFinite(parsed)) return parsed;
  try { return Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8'); } catch { return 0; }
}

function validateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'INVALID_BODY', 'Telemetry request body must be a JSON object.');
  const eventName = body.eventName;
  if (body.schemaVersion !== 1) throw fail(400, 'INVALID_SCHEMA_VERSION', 'Unsupported telemetry schema version.');
  if (typeof eventName !== 'string' || !allowedEventNames.has(eventName)) throw fail(400, 'INVALID_EVENT_NAME', 'Unsupported telemetry event name.');
  const allowed = eventName === 'import_completed' ? importFields : baseFields;
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw fail(400, 'UNSUPPORTED_FIELD', 'Telemetry payload contains unsupported fields.');
  if (eventName !== 'import_completed' && 'importSource' in body) throw fail(400, 'UNSUPPORTED_FIELD', 'Telemetry payload contains unsupported fields.');
  if (body.importSource !== undefined && !allowedImportSources.has(body.importSource)) throw fail(400, 'INVALID_IMPORT_SOURCE', 'Unsupported telemetry import source.');
  for (const key of ['eventId', 'timestamp', 'appVersion']) if (typeof body[key] !== 'string' || body[key].length < 1 || body[key].length > 128) throw fail(400, `INVALID_${key.toUpperCase()}`, 'Telemetry payload contains invalid string fields.');
  if (!allowedRuntimes.has(body.runtime)) throw fail(400, 'INVALID_RUNTIME', 'Unsupported telemetry runtime.');
  for (const key of ['librarySizeBucket','wishlistSizeBucket','platformCountBucket','playingCountBucket','queueCountBucket']) if (!allowedBuckets.has(body[key])) throw fail(400, 'INVALID_COUNT_BUCKET', 'Unsupported telemetry count bucket.');
  return body;
}

async function forwardToMake(event, webhookUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!response.ok) return { accepted: false, upstreamStatus: response.status };
    return { accepted: true, upstreamStatus: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, provider: telemetryProvider, code: 'METHOD_NOT_ALLOWED', error: 'Use POST for telemetry requests.' });
  }

  try {
    if (getBodySize(req) > MAX_BODY_BYTES) throw fail(413, 'PAYLOAD_TOO_LARGE', 'Telemetry payload is too large.');
    const webhookUrl = normalizeWebhookUrl(process.env.QS_ANALYTICS_WEBHOOK_URL || process.env.MAKE_TELEMETRY_WEBHOOK_URL);
    if (!webhookUrl || webhookUrl.includes('example.invalid')) throw fail(503, 'TELEMETRY_NOT_CONFIGURED', 'Telemetry forwarding is not configured.');
    const parsedUrl = new URL(webhookUrl);
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw fail(503, 'TELEMETRY_NOT_CONFIGURED', 'Telemetry forwarding is not configured.');
    const event = validateEvent(req.body);
    const result = await forwardToMake(event, parsedUrl.toString());
    if (!result.accepted) return sendJson(res, 502, { success: false, provider: telemetryProvider, code: 'UPSTREAM_REJECTED', status: result.upstreamStatus, error: 'Telemetry endpoint rejected the event.' });
    return sendJson(res, 202, { success: true, provider: telemetryProvider, accepted: true, status: result.upstreamStatus });
  } catch (error) {
    if (error?.name === 'AbortError') return sendJson(res, 504, { success: false, provider: telemetryProvider, code: 'UPSTREAM_TIMEOUT', error: 'Telemetry endpoint timed out.' });
    const status = error?.status || 500;
    return sendJson(res, status, { success: false, provider: telemetryProvider, code: error?.code || 'TELEMETRY_ERROR', error: status >= 500 ? 'Telemetry forwarding failed.' : error.message });
  }
}
