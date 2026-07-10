# Questory anonymous telemetry audit

_Scope: optional anonymous analytics only. Telemetry remains disabled by default and only sends after the local in-app opt-in is enabled._

## Current architecture and event flow

| Stage | Implementation | Behavior |
| --- | --- | --- |
| Consent storage | `src/lib/analytics/settings.ts` | `questshelf.analyticsSettings.v1` in `localStorage`; defaults off; string values are normalized with `=== true`, so string `"false"` is not truthy. |
| Toggle UI | `src/components/settings/AboutSettingsPanel.tsx` | Settings → About → Anonymous usage analytics calls `updateAnalyticsEnabled`; the next event reads storage immediately, so no reload is required. |
| Event creation | `src/lib/analytics/client.ts` | `buildAnalyticsEvent()` emits only event name, random per-event ID, timestamp, app version, runtime, and coarse count buckets; `import_completed` may include an enum import source. |
| Client transport | `src/lib/analytics/client.ts` | If opted in and build-enabled, posts JSON to same-origin `/api/telemetry` (or `VITE_QS_ANALYTICS_ENDPOINT_URL` override), with `cache:'no-store'`, `credentials:'omit'`, and `keepalive:true`. No Make.com URL or key is exposed to the browser. |
| Server transport | `api/telemetry.js` | Vercel function accepts POST only, validates a strict payload schema/size, forwards to Make.com using server-only `QS_ANALYTICS_WEBHOOK_URL`, times out after 5s, and returns safe status JSON. |
| PWA/service worker | `public/sw.js` | Service worker ignores every non-GET request and every `/api/` path, so telemetry POSTs are not cached or intercepted. |

## Events currently emitted

Session-de-duped events: `app_open`, `first_run_completed`, `quest_queue_opened`, `platform_plans_opened`.
Action events: `import_completed` with source (`steam`, `wishlist_html`, `retro`, `backup`, `manual`, `unknown`), `backup_exported`, `backup_imported`.
Diagnostics event: `telemetry_test` from the debug/test helper.

Events emitted before telemetry is enabled are intentionally dropped; optional telemetry does not backfill pre-consent activity. Disabling telemetry stops new sends immediately because every send reads the saved setting at send time.

## Confirmed bugs / likely failure points found

1. **Browser-to-Make.com CORS/preflight risk.** The previous direct browser request used `Content-Type: application/json` plus `x-make-apikey`, forcing a CORS preflight that Make.com custom webhooks commonly do not satisfy. Browser/PWA sends could fail before the POST reached Make.com.
2. **Webhook secret exposed by design.** Any `VITE_QS_ANALYTICS_WEBHOOK_URL` and `VITE_QS_ANALYTICS_KEY` value is embedded into the client bundle and discoverable.
3. **Production configuration was easy to silently miss.** `.env.production` did not configure telemetry, `.env.example` used disabled placeholders, and Vite variables are build-time only. An opted-in user on a build without the required vars produced no request.
4. **Response status visibility was limited.** Direct sends were fire-and-forget and safe, but downstream failures were hard to distinguish from opt-out, blocked requests, or missing config without enabling debug mode.

## Fix implemented

Questory now uses the preferred same-origin Vercel proxy architecture. The browser sends only to `/api/telemetry`; the Vercel function forwards to the Make.com webhook server-side. This avoids exposing the Make webhook URL, avoids browser-to-Make CORS, allows strict validation, provides safer statuses, and keeps the service worker out of the path.

## Privacy review

The payload allowlist rejects unexpected fields such as titles, notes, tags, account IDs, Steam IDs, URLs, paths, search queries, user input, and persistent user IDs. The current `eventId` is a random per-event UUID, not a stable installation/person identifier, which favors privacy over user-level aggregation.

## Required environment variables

### Vercel Preview/Production build environment

- `VITE_QS_ANALYTICS_ENABLED=true`
- Optional: `VITE_QS_ANALYTICS_ENDPOINT_URL=/api/telemetry` only if the endpoint is not mounted at the default path.

### Vercel Preview/Production runtime/function environment

- `QS_ANALYTICS_WEBHOOK_URL=<your Make.com custom webhook URL>`

Do not use the old `VITE_QS_ANALYTICS_WEBHOOK_URL` or `VITE_QS_ANALYTICS_KEY`; they expose secrets in the browser bundle and are no longer used by the client.

## Manual verification

### Local development

1. Run with a Vercel-compatible local server if testing the serverless function (for example `vercel dev`) and set `QS_ANALYTICS_WEBHOOK_URL` in the local environment.
2. Set `VITE_QS_ANALYTICS_ENABLED=true` before starting the dev server.
3. Open Settings → About, enable Anonymous usage analytics, then add `?qsTelemetryDebug=1` to the URL.
4. Click **Send telemetry test**. DevTools Network should show `POST /api/telemetry` with a small JSON payload and no Make.com URL or secret header.
5. Console/debug output should show enabled/configured/sent/status details without a full webhook URL.

### Vercel Preview and Production

1. Add `VITE_QS_ANALYTICS_ENABLED=true` for the target environment and redeploy (Vite reads it at build time).
2. Add `QS_ANALYTICS_WEBHOOK_URL` for the same target environment; redeploy/restart functions as needed.
3. Visit the deployment with `?qsTelemetryDebug=1`, opt in, and click **Send telemetry test**.
4. Browser Network should show `POST /api/telemetry` returning `202` for accepted forwarding, `503` if the function env var is missing, `502` for upstream rejection, or `504` for timeout.
5. Vercel Function logs should show invocation of `/api/telemetry` but must not print the webhook URL.
6. Make.com webhook history should show the `telemetry_test` payload after an HTTP-accepted request. A `202` confirms transport acceptance by the proxy/upstream HTTP response, not guaranteed downstream scenario processing.

### Installed PWA

1. Install the deployed PWA after the new deployment is live.
2. Open it once online to receive the latest service worker/app bundle.
3. Enable telemetry and run the test. Network should still show `POST /api/telemetry`; `public/sw.js` bypasses non-GET and `/api/` requests.
4. Toggle telemetry off and repeat tracked actions; no new telemetry POST should appear.

### Offline / blocked request

1. Enable telemetry, turn DevTools Network offline, then click the telemetry test.
2. The test should report a failed/blocked request; normal app UI should continue working.
3. With an ad blocker or CSP issue, expect a failed request in Network/console diagnostics, not app breakage.

## Remaining limitations

- Telemetry remains best-effort and does not retry; events may be dropped during offline/background/browser suspension. This is intentional for optional telemetry.
- `VITE_QS_ANALYTICS_ENABLED` is still build-time; changing it in Vercel requires a redeploy.
- The proxy performs validation and timeout handling but not durable rate limiting. Vercel/platform-level protections should be used if abuse appears.
