# Optional Telemetry Audit

_Scope: optional anonymous analytics only. No new events added; no app behavior changed. Diagnostics are dev-only._

## Architecture (current)

| Concern | Where | Notes |
| --- | --- | --- |
| User opt-in state | `src/lib/analytics/settings.ts` (`questshelf.analyticsSettings.v1` in localStorage) | Default **off**; persisted; `backup:'never'` in `storageRegistry` (device-scoped consent, not synced). |
| Toggle UI | `src/components/settings/AboutSettingsPanel.tsx` | "Anonymous usage analytics" switch → `updateAnalyticsEnabled`. |
| Build config | `getAnalyticsConfig()` reads `import.meta.env.VITE_QS_ANALYTICS_ENABLED / _WEBHOOK_URL / _KEY` | **Build-time**, inlined by Vite at `npm run build`. |
| Event creation | `buildAnalyticsEvent()` | Random `eventId` per event, bucketed counts. |
| Send | `sendAnalyticsEvent()` → `POST` webhook, header `x-make-apikey`, `Content-Type: application/json`, `keepalive:true` | Fire-and-forget, no retry, try/catch swallows errors. |
| Call sites | `AppController.tsx` (`app_open`, `first_run_completed`, `quest_queue_opened`, `platform_plans_opened`, `import_completed`, `backup_exported/imported`) | Session events de-duped per session. |

Send requires **all three** gates: build config valid **AND** user opted in **AND** payload passes the allowlist validator.

## Root cause — why telemetry may not be firing

**Primary (configuration gap, silent):** the `VITE_QS_ANALYTICS_*` vars are **not set in any committed build config**. `.env.production` only defines the integrations proxy URL; `.env.example` holds disabled placeholders (`false`, `example.invalid`, `replace-with-alpha-analytics-key`) and **Vite does not load `.env.example`**. Unless the three vars are injected via the **Vercel build environment** (and the Android build shell), `getAnalyticsConfig()` yields `{enabled:false, webhookUrl:'', analyticsKey:''}` → `isAnalyticsConfigured()` is `false` → `sendAnalyticsEvent` returns before any request — **even when the user has opted in.** There was previously **no diagnostic**, so this is invisible.

**Secondary (would fail even if configured — web/PWA):** the browser send is a cross-origin `POST` with `Content-Type: application/json` **and** a custom `x-make-apikey` header. Both force a **CORS preflight (OPTIONS)**. A Make.com custom webhook does not return CORS headers by default, so the browser blocks the request; `fetch` rejects and the error is swallowed. `response.ok` was also never checked, so a `401/403` (bad key) or disabled scenario was equally invisible.

**Retry/blocking:** none needed — fire-and-forget with `keepalive` is appropriate. Failures never block the UI and never throw (confirmed: `void send(...)` + try/catch; `buildAnalyticsEvent` runs before the network call).

## Reproduction

1. Deploy/build without the three `VITE_QS_ANALYTICS_*` vars (current state) → enable analytics in Settings → perform tracked actions → **no network request** (DevTools Network shows nothing to the webhook).
2. Even with the vars set to a raw Make webhook, on web/PWA the `OPTIONS` preflight fails (no `Access-Control-Allow-Origin`/`-Headers`) → the `POST` never leaves the browser.

## Affected environments

- **Local dev:** off unless a developer adds `.env` / `.env.development` with the vars (`.env.example` is not auto-loaded).
- **Vercel web/PWA:** off unless the vars are set in Vercel env; if set, still blocked by CORS unless the endpoint allows it.
- **Android/Capacitor:** off unless the vars are set in the Android build. A WebView `fetch` is still CORS-governed, but the app origin differs and behavior varies; not verifiable without a configured endpoint. `runtime` correctly reports `android` via `getRuntimeEnvironment()`.

## Privacy review — no personal data (goal 10) ✅

Payload is a strict allowlist (`validateAnalyticsEvent` rejects any extra key): `schemaVersion, eventName, eventId (random UUID, not a stable user id), timestamp, appVersion, runtime, five *count buckets* (coarse ranges, not exact), optional importSource enum`. **No** notes, titles, email/user IDs, library contents, ROM paths, or backup contents. Counts are bucketed; `eventId` is per-event, so there is no cross-event user tracking.

## Fix implemented (low-risk, in this PR)

Original production send behavior was unchanged in that audit; current deployed-PWA troubleshooting adds explicit debug visibility (`src/lib/analytics/client.ts`), gated on `import.meta.env.DEV` or the per-device `?qsTelemetryDebug=1` flag:

- `describeAnalyticsConfigProblem(config)` — single source of truth for `isAnalyticsConfigured`; names the exact missing/placeholder env var.
- `sendAnalyticsEvent` now logs, in dev/debug mode only, the precise skip reason (opted-out is silent; **enabled-but-misconfigured warns**; invalid event debug-logs) and checks `response.ok` to warn on non-2xx / CORS. No production logging.
- `.env.example` documents that these are build-time vars (Vercel env / Android build shell), not runtime, and that the endpoint must allow the cross-origin POST (CORS for `content-type` + `x-make-apikey`).

## Still requires external configuration (no secrets in repo)

1. Set in the **Vercel** project (and Android build environment), **not committed**:
   - `VITE_QS_ANALYTICS_ENABLED=true`
   - `VITE_QS_ANALYTICS_WEBHOOK_URL=<your Make webhook URL>`
   - `VITE_QS_ANALYTICS_KEY=<your Make API key>`
2. Make the endpoint reachable from the browser — **recommended:** route telemetry through a first-party same-origin proxy (mirroring the existing `/api/integrations` proxy) that forwards to Make server-side. This avoids CORS entirely and keeps the Make key off the client. Otherwise, configure the webhook to return CORS headers allowing the app origin and the `x-make-apikey`/`content-type` headers.

## Acceptance criteria

- Disabled → no request. ✅ (unchanged; test: _no send when local setting is disabled_)
- Enabled + valid config → event reaches endpoint. ✅ (unchanged; test: _x-make-apikey header_)
- Enabled + invalid/missing config → dev-only diagnostic, app continues. ✅ (new)
- Failures never affect app usage. ✅ (tests: _send failures swallowed_, _non-2xx never throws or blocks_)
- Android/Capacitor explicitly documented. ✅ (above)
- Report states status + what's fixed vs. needs external config. ✅ (this doc)

## Vercel/PWA telemetry self-test

A debug-only self-test is available for deployed browser/PWA diagnosis without adding ongoing tracking. To enable it on a Vercel deployment, open the app once with `?qsTelemetryDebug=1`; this stores a local debug flag on that device. Then either:

- Open Settings → About → Anonymous usage analytics and click **Send telemetry test**; or
- Run `window.questShelfTelemetrySelfTest()` in DevTools Console.

The self-test sends exactly one `telemetry_test` event only if the in-app anonymous analytics opt-in is enabled and the Vite build contains valid `VITE_QS_ANALYTICS_*` values. It logs the opt-in state, whether an endpoint is configured, the webhook host (never the full secret URL), HTTP status, safe text responses, and caught network/CORS/offline errors. Telemetry fetches use `POST`, `Content-Type: application/json`, `cache: 'no-store'`, and no credentials so service-worker/app-shell caches should not serve or store them.

For Vercel production builds, confirm these variables are set in Vercel Project → Settings → Environment Variables before deploying: `VITE_QS_ANALYTICS_ENABLED=true`, `VITE_QS_ANALYTICS_WEBHOOK_URL`, and `VITE_QS_ANALYTICS_KEY`. Vite inlines these at build time; changing them after a deploy requires a redeploy. `.env.production` must not contain the Make webhook or key.
