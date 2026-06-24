# Integration Proxy

Questory uses a stateless Vercel serverless integration proxy for provider APIs that are unreliable or unsafe to call directly from a production PWA or Android APK. Local Vite development may still use the existing Vite proxy, but deployed clients should route through `/api/integrations` (same-origin on Vercel) or `https://getquestory.vercel.app/api/integrations` from Android.

## Why this exists

Browser production builds and Android WebViews cannot rely on Vite development proxy rules. Direct calls to Steam, IsThereAnyDeal, RAWG, and SteamGridDB can fail because of CORS, redirects, transport restrictions, or provider-specific headers. The proxy gives Questory one production transport while keeping all routes stateless.

## Key handling

All provider keys are user-provided in Questory settings. The client sends the relevant key in the POST body for that one request. The proxy forwards the key upstream and never stores, caches, logs, or returns it in errors.

Do **not** configure server-side provider key env vars for Steam, ITAD, RAWG, or SteamGridDB.

## Vercel setup

Set only public client routing variables when needed:

```bash
VITE_INTEGRATIONS_PROXY_BASE_URL=https://getquestory.vercel.app/api/integrations
VITE_STEAM_PROXY_BASE_URL=https://getquestory.vercel.app/api/integrations/steam
```

For the Vercel-hosted PWA, same-origin `/api/integrations` is the default production base. Android APK builds should use the absolute production URL above so the WebView does not try to call a device-local path.

## Routes

Steam:

- `POST /api/integrations/steam/owned-games` with `apiKey`, `steamId64`
- `POST /api/integrations/steam/player-summary` with `apiKey`, `steamId64`
- `POST /api/integrations/steam/achievements` with `apiKey`, `steamId64`, `appId`

IsThereAnyDeal:

- `POST /api/integrations/itad/search` with `apiKey`, `title`, optional `results`
- `POST /api/integrations/itad/overview` with `apiKey`, `ids`, optional `country`

RAWG:

- `POST /api/integrations/rawg/request` with `apiKey`, `route`, optional `rawgId`, optional `params`
- Supported routes: `/games`, `/games/{id}`, `/games/{id}/screenshots`

SteamGridDB:

- `POST /api/integrations/steamgriddb/artwork` with `apiKey`, and either `steamAppId` or `title`; pass `mode: "candidates"` for candidate lists.

## Error format

Proxy errors are normalized and never include secrets:

```json
{
  "success": false,
  "provider": "steam",
  "error": "Missing Steam API key",
  "code": "MISSING_API_KEY"
}
```

Common codes include `MISSING_API_KEY`, `INVALID_API_KEY`, `RATE_LIMITED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `NO_RESULTS`, and `PROVIDER_ERROR`.

## Local development

Local Vite development keeps the existing Vite proxy behavior unless `VITE_INTEGRATIONS_PROXY_BASE_URL` is set. This lets developers test against production Vercel functions when needed without removing the fast local proxy path.

## Adding another provider route

1. Add a file under `/api/integrations/<provider>/<route>.js`.
2. Use `api/integrations/_shared/proxy.js` for POST enforcement, JSON body access, validation, timeouts, CORS, upstream fetches, and safe errors.
3. Accept user-provided keys only in the request body.
4. Never log key-bearing request bodies, upstream URLs, headers, or provider error bodies that may contain secrets.
5. Update the client to call `postIntegration()` in production and document the route here.
