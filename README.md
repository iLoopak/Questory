# QuestShelf

QuestShelf is a local-first game library foundation built with React, Vite, TypeScript, and Tailwind CSS.

## Features

- Responsive dark app shell with placeholder navigation.
- Typed local `Game` model.
- Empty library by default for new users.
- Optional development-only demo games.
- First-run onboarding checklist for setup essentials.
- Browser `localStorage` persistence.
- Game cards with cover image, playtime, tags, notes, and last played date.
- Manual game creation for non-Steam, physical, retro, Android, and custom-platform games.
- Separate local Wishlist collection for platform-agnostic future games.
- Compact Library and Wishlist toolbar with search, source, enrichment, platform, status, tag, quick filters, and sorting.
- Manual Steam wishlist sync into the general local Wishlist collection.
- Change game status directly from the library.
- Steam connector foundation in Settings.
- Local Steam Web API key and SteamID64 storage.
- Steam connection test with raw debug output and mapped game previews.
- Controlled Steam import with selectable games and duplicate protection.
- Optional RAWG metadata enrichment for individual games.
- Focused game detail view with editable local tracking and read-only Steam/RAWG metadata.
- Metadata enrichment workflow for larger libraries with batch processing and manual match review.
- Local Recommendation Engine v1 for choosing what to play next.
- Local Stats dashboard for backlog progress, playtime, platform/source breakdowns, and metadata coverage.
- Installable PWA foundation with app manifest, local app-shell offline support, and a small offline indicator.
- Capacitor-ready Android handheld foundation with fullscreen status bar handling and mirrored native Preferences persistence.
- QuestShelf visual branding with the official neon teal app icon, favicon, PWA icons, and console-style dark theme.

No PSN, IGDB, achievements, backend, accounts, auto-enrichment, auto-sync, or remote sync are included yet.

## First-Run Onboarding

QuestShelf shows a compact checklist on first launch to guide initial setup without requiring accounts.

- Users can skip the checklist and reopen it later from Settings.
- Checklist progress is stored locally with the rest of QuestShelf data.
- Items are completed when users add a manual game, configure Steam credentials, test Steam, import Steam games, configure RAWG, enrich metadata, create a Wishlist item, or export a backup.
- The checklist links to the official Steam API key page, a SteamID64 lookup page, and RAWG API docs.
- QuestShelf never stores real API keys in README files or source code. Keys are only entered by the user and saved locally in browser/native storage.

## Local Library Data

QuestShelf starts with an empty local library. It does not automatically insert placeholder games on startup.

Use **Add game** in the Library or Wishlist to create a local manual game without Steam or RAWG credentials. Manual games support title, platform, status, playtime, cover URL, tags, and notes. If **Other** is selected as the platform, QuestShelf stores the custom platform text on that game.

Manual games are stored in the same browser `localStorage` library as imported games with `externalSource: "manual"` and an import timestamp. They are never affected by Steam import, Steam duplicates, or the ignored Steam games list. RAWG metadata can still be added later from the Metadata workflow.

For development and testing, optional demo games live in `src/data/mockGames.ts`. In Vite development mode, Settings includes a **Load demo data** action. Settings also includes **Remove demo games**, which removes only known placeholder IDs and preserves user-created games and Steam-imported games.

## Wishlist

QuestShelf has a separate **Wishlist** tab for games that are not owned or actively tracked yet. Wishlist entries use the same local `Game` model as library entries, with `collectionType: "wishlist"`.

- Existing saved games without `collectionType` are safely migrated to `collectionType: "library"`.
- Steam owned import always creates `library` games, not Wishlist items.
- Wishlist items support title, platform, cover image, tags, notes, Steam App ID, RAWG metadata, and manual source data.
- Optional Wishlist planning fields include priority, expected playtime, price target, release date, and store URL.
- Library and Wishlist have separate search/filter state and separate counts.
- Library cards can be copied into Wishlist with **Add to Wishlist**.
- Wishlist cards can be promoted with **Move to Library** or deleted with **Remove Wishlist**.
- RAWG enrichment works on Wishlist entries because the metadata workflow reads both collections.
- Steam wishlist sync is manual and feeds the general Wishlist collection without treating those items as owned games.

Steam wishlist sync is available from the Wishlist view with **Sync Steam Wishlist**. It uses the SteamID64 already saved in Steam Settings and imports public Steam wishlist entries into the general QuestShelf Wishlist collection, not the owned Library. If Steam redirects your SteamID64 wishlist to a custom profile URL, paste that public wishlist URL into **Steam wishlist URL** in Settings so QuestShelf can sync from the stable `id/...` wishlist path directly.

- Steam wishlist items are saved locally with Steam App ID, Steam store URL, cover art, release date, price, discount, review summary, and sync timestamps when Steam provides them.
- Existing Wishlist items with the same Steam App ID are refreshed with sync metadata, but user-owned fields such as notes, tags, and priority are preserved.
- Games already present in the Library are shown as skipped and are not duplicated into Wishlist.
- Ignored Steam App IDs are skipped during wishlist sync.
- Wishlist items can still be moved to Library, removed, opened on Steam, or enriched with RAWG metadata.
- Steam wishlist sync requires a public Steam wishlist/profile. The Steam Store wishlist endpoint is less official and less stable than the Steam Web API owned-games endpoint.
- Local development routes wishlist requests through the Vite `/api/steam-store` proxy when needed for browser/CORS behavior.

## Library Filtering and Sorting

Library and Wishlist each have their own compact toolbar for browsing larger collections. Filters can be combined across title search, platform, status, source, RAWG enrichment state, tags, and quick chips such as **Playing**, **Paused**, **Missing metadata**, and **Played > 0h**.

Sort options include title, recently played, most or least playtime, recently imported, metadata missing first, and status. QuestShelf stores the last used Library and Wishlist filters locally in browser `localStorage`, so the view is restored on the next launch without sending anything to a server.

The active summary shows how many games are visible out of the full collection. In multi-select mode, **Select all visible** applies only to the currently filtered result set.

## PWA Install and Offline Behavior

QuestShelf includes a basic Progressive Web App setup so it can be installed from supported desktop and Android browsers.

To install:

1. Run the production build and preview it, or deploy the built app over HTTPS.
2. Open QuestShelf in Chrome, Edge, or another PWA-capable browser.
3. Use the browser install action, or the in-app **Install QuestShelf** hint when the browser exposes the install prompt.

The PWA manifest uses:

- App name and short name: `QuestShelf`
- Display mode: `standalone`
- Orientation: landscape-friendly
- SVG app icons generated from the QuestShelf icon direction for favicon, app shell, and PWA manifest usage
- Dark navy background and neon teal theme color

Offline support is intentionally app-shell focused:

- The app shell, manifest, and local placeholder icons are cached by the service worker after the app has loaded.
- The local library continues to work offline because game data is stored in browser `localStorage`.
- Steam and RAWG actions require network access and will show their existing error states when offline or unavailable.
- External Steam and RAWG images may depend on the browser cache and are not guaranteed to be available offline.

Known limitations:

- Service worker registration is skipped during Vite development mode.
- The first offline launch is only reliable after the production app has been loaded at least once.
- Browser install support varies, especially on iOS and embedded webviews.
- This PWA layer does not add cloud sync, accounts, or a backend.

## Android Handheld / Capacitor Notes

QuestShelf includes a lightweight Capacitor configuration for Android handheld packaging:

- `capacitor.config.ts` points Capacitor at the Vite production build in `dist`.
- `@capacitor/status-bar` is used to hide the Android status bar on native Android and re-apply the setting after focus/resume.
- The app uses safe-area CSS variables so edge-to-edge screens, rounded corners, and display cutouts have padding available when the WebView exposes it.
- System bar color is set to QuestShelf's dark navy background when Android briefly reveals system UI.

Typical Android build flow:

```bash
npm run build
npx cap sync android
npx cap open android
```

The app also mirrors local game data into Capacitor Preferences when the native plugin is available. Browser `localStorage` remains the fast startup/cache layer, while native Preferences provides a more durable Android storage layer for the saved library and user-owned game metadata such as status, notes, tags, playtime, ratings, favorites, and completion fields. Existing browser data is migrated into Preferences the first time the native app starts.

Steam and RAWG API calls still require network access. The locally saved library, Wishlist, notes, tags, statuses, Stats, and recommendations remain usable offline after data has been loaded.

## Visual Branding

QuestShelf uses the provided app icon direction as the source brand asset. The icon files live in `public/icons/`:

- `questshelf-icon.svg`: favicon, header logo, and general PWA icon.
- `questshelf-maskable.svg`: maskable PWA icon using the same artwork with a full safe-area background.

The UI theme follows the icon with a near-black/deep navy background, restrained neon teal accents, blue-gray borders, soft glow focus states, and glassy console-style panels. Neon teal is reserved for active states, primary actions, badges, and focus treatment so the app stays readable on handheld screens.

## Steam Integration Foundation

QuestShelf includes a Settings section for an early Steam integration foundation. It stores the Steam Web API key and SteamID64 locally in the browser and can test the Steam API connection.

In local development, Steam API calls go through the Vite dev proxy:

- Frontend base path: `/api/steam`
- Proxy target: `https://api.steampowered.com`
- Example rewrite: `/api/steam/IPlayerService/GetOwnedGames/v0001/` becomes `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`
- Steam Store wishlist proxy base path: `/api/steam-store`
- Steam Store wishlist proxy target: `https://store.steampowered.com`

Run the app with `npm run dev` so Vite can serve that proxy. If the Steam test shows a proxy/CORS error, restart the dev server after checking `vite.config.ts`. The direct Steam API URL is kept only as a production placeholder; a deployed app will still need a safe proxy/backend before real production Steam sync.

The test action calls:

- `getOwnedGames()`
- `getRecentlyPlayedGames()`

The returned Steam games are mapped into the local `Game` model for preview in a debug panel, but they are not written into the local library yet.

Steam import stays local-first:

- Use **Test Steam connection** to load owned games.
- Select individual Steam games, or use **Select all** and **Deselect all**.
- Click **Import selected** to add selected games to the local library.
- Games already in the library with the same Steam App ID are marked as **Already in library** and are not duplicated.
- Steam games can be removed from the library and optionally ignored so the same Steam App ID is skipped during future imports.
- Ignored Steam games are stored locally, listed in Settings, and can be restored from the ignored list.
- Imported games default to platform `Steam`, status `Want to play`, and tags `imported` and `steam`.
- Games with recent Steam playtime default to `Playing`.
- QuestShelf stores Steam metadata locally on imported games, including Steam App ID, external source, Steam store URL, and import time.
- Importing never overwrites manually edited local game fields.
- Steam game covers prefer Steam library artwork, then fall back to header art, capsule art, and finally a local placeholder if images cannot load.

To use the test connection:

1. Get a Steam Web API key from <https://steamcommunity.com/dev/apikey>.
2. Find your SteamID64 from your Steam profile URL or a Steam ID lookup tool.
3. Open QuestShelf Settings.
4. Enter the API key and SteamID64.
5. Optionally paste your public Steam wishlist URL if Steam redirects your profile to a vanity URL such as `https://store.steampowered.com/wishlist/id/loopak/`.
6. Click **Test Steam connection**.

Steam profile privacy can prevent owned or recently played game data from being returned.

During this foundation phase the Steam test runs directly from the browser. If the browser or Steam blocks the request, QuestShelf shows the API failure state instead of silently syncing.

## RAWG Metadata Foundation

QuestShelf includes an optional RAWG integration in Settings. The RAWG API key is stored locally in the browser.

To enrich one game:

1. Get a RAWG API key from <https://rawg.io/apidocs>.
2. Open QuestShelf Settings and enter the RAWG API key.
3. Open Metadata and click **Find metadata** on a game row.
4. Pick the correct RAWG match.

QuestShelf fetches details for the selected match and stores metadata locally on that game, including RAWG ID, genres, RAWG tags, developers, publishers, release date, Metacritic score, average playtime, background image, metadata source, and update time.

RAWG enrichment does not overwrite manually edited fields such as status, notes, or custom tags. If a non-Steam game has no cover image, an empty cover image, or one of the generated local placeholder covers, QuestShelf can use the RAWG background image as a cover fallback. User-provided cover URLs and Steam artwork are preserved. The game detail view also includes **Use RAWG image as cover** when a RAWG background image is available and the current cover is safe to replace.

## Game Detail View

Open a game from the Library with **Details** to review one title in a focused view. The detail screen keeps local user tracking separate from imported metadata:

- **My tracking** is editable and stores status, custom tags, and notes in local storage.
- **Steam data** is read-only and shows Steam App ID, store URL, import source, and import time when available.
- **RAWG metadata** is read-only and shows enriched fields such as genres, tags, developers, publishers, release date, Metacritic, average playtime, background image, and metadata update time when available.

Imported and enriched metadata is not edited directly from this screen, except for the explicit **Use RAWG image as cover** action for manual/non-Steam games that still have an empty or generated placeholder cover.

## Metadata Enrichment Workflow

Open **Metadata** to review games that are missing RAWG metadata. The workflow stays local-first and only runs when started by the user.

- Use **Find metadata** on one game to search RAWG and auto-save only high-confidence matches.
- Use **Accept suggested match** for medium-confidence matches, or **Choose different match** to pick another RAWG result manually.
- Use **Skip** for games to revisit later or **Mark as manually managed** for games that should not be enriched automatically.
- Use **Enrich all** or **Enrich selected** to process a lightweight queue without freezing the UI.
- Use **Stop enrichment** to halt an active batch after the current item finishes.

Automatic confidence scoring considers normalized title similarity, platform similarity, and release year similarity when a release year is available. Title normalization lowercases names, removes punctuation/trademark marks, and strips common edition or platform suffixes such as GOTY, Deluxe Edition, Remastered, Complete Edition, Steam, Switch, PlayStation, and Xbox.

Matching uses three tiers:

- `90%+`: auto-applied during enrichment.
- `70-89%`: shown as a suggested match that must be accepted or changed manually.
- Below `70%`: requires manual selection.

RAWG search tries the exact title first, then the normalized title, then the title without subtitle text after a colon or dash. Successful RAWG matches are cached locally in the browser and reused for the same normalized title. Enrichment only writes RAWG metadata fields and does not overwrite local user-owned fields such as status, tags, notes, or cover image.

## Recommendation Engine v1

Open **Recommendation** to get a local **What should I play?** pick. The engine does not call AI or any external API.

Inputs:

- Available time: 15 min, 30 min, 1 hour, or long session.
- Mood: brain off, story, grind, challenge, or comfort.
- Preferred platform: any platform or a specific local platform.
- Include finished games: enabled or disabled.
- Include Wishlist items: disabled by default.

The recommendation score uses local status, last played date, playtime, RAWG average playtime, genres, RAWG tags, custom tags, and platform. It prefers games already marked `Playing`, games not played recently, mood matches, and games that fit the selected session length. It penalizes completed games unless enabled, dropped games, and missing RAWG metadata without excluding those games entirely.

The main recommendation card shows the selected game, cover, platform, status, playtime, matching reasons, and confidence score. **Reroll** moves to the next best candidate, **Mark as Playing** updates local tracking, and **Open Detail** opens the focused game detail view.

## Stats Dashboard

Open **Stats** to review the local backlog dashboard. Stats use only the games saved in this browser and never call external APIs.

The dashboard supports three scopes:

- **Library only**
- **Wishlist only**
- **All**

Stats include Library and Wishlist totals, status counts, total tracked playtime, finished percentage, active backlog count, played-but-unfinished games, never-played games, platform breakdown, source breakdown, and RAWG enrichment coverage.

QuestShelf also shows useful local lists such as top played games, recently played games, longest paused games, recently imported games, and games missing metadata. Charts are intentionally lightweight CSS bars instead of a chart dependency so the dashboard stays fast on handheld screens and large libraries.

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview Production Build

```bash
npm run preview
```
