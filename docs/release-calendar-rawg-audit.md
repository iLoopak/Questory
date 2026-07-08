# Personalized Release Calendar RAWG Audit

Questory uses RAWG's `GET /games` list endpoint for release-calendar data because it supports the same list-result fields already used by Discover and accepts release-date filtering directly.

## Endpoint and parameters

- Endpoint: `GET https://api.rawg.io/api/games` via Questory's RAWG integration proxy.
- Date range: `dates=YYYY-MM-DD,YYYY-MM-DD` for upcoming windows such as today through 30, 60, or 90 days.
- Ordering: `ordering=released` for soonest releases first, or `ordering=-released` for newest/recently released feeds.
- Platform narrowing: `platforms=4,187,...` where RAWG platform ids are inferred from the user's active library/platform signals.
- Personalization narrowing: optional `genres=<comma-separated RAWG genre slugs>` is used as a second, smaller page when the user's profile has strong genres.
- Quality filters available: `metacritic=min,max` is supported by the shared RAWG query helper, but the release calendar does not require it because many upcoming games have no critic score yet.
- Other supported filters already available in the helper: `tags=<comma-separated tag slugs>`, `ordering`, `page_size`.

## Response fields used

RAWG list responses provide enough data to render compact upcoming cards without detail calls:

- `id`, `name`, `slug`
- `released`
- `background_image`
- `platforms[].platform.name`
- `genres[].name`
- `tags[].slug/name`
- `rating`, `ratings_count`
- `metacritic`

The release calendar deliberately avoids per-game detail requests in the feed path so opening Discover does not create an API-call burst.

## Fetch strategy

Questory fetches one base page for the full upcoming window, plus at most one genre-focused page when profile genres exist. Both use `page_size` caps and are cached daily per profile fingerprint/date range/ignore-list state.

## Personalization strategy

The ranking layer scores upcoming results with positive signals from highly rated finished games, currently playing games, wishlist/planned games, preferred genres/tags/developers/platforms, and platform affinity. It subtracts confidence for dropped or low-rated genre/tag matches and excludes owned, wishlisted, dropped, finished, and ignored RAWG ids from the rendered section.
