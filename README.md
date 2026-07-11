# Questory

**Questory is a local-first gaming backlog planner for people with too many games, too many platforms, and not enough actual play time.**

It is not trying to be a launcher, a social network, or a perfectly finished product yet. It is an early-alpha project focused on turning a messy pile of owned games, wishlist games, retro imports, and “I should play that someday” guilt into a more playful plan.

## Screenshot / preview

Questory does not currently include full app screenshots in the repository. The existing checked-in images are app icons, splash art, and placeholder cover assets.

Suggested screenshot locations for a public README update:

```text
docs/screenshots/home.png
docs/screenshots/library.png
docs/screenshots/quest-queue.png
docs/screenshots/platform-plans.png
```

When screenshots are added, this section can become:

```md
![Questory Home](docs/screenshots/home.png)
![Questory Library](docs/screenshots/library.png)
```

## What is Questory?

Questory is a backlog-first game planning app. The main idea is simple:

- collect your games in one local shelf,
- import what you can from Steam or other sources,
- triage the pile instead of staring at it,
- keep active games visible,
- plan by platform,
- and make backlog maintenance feel a little more like a game.

The app runs as a React/Vite web app, can be installed as a PWA, and includes Capacitor Android project support for APK builds. User data is stored locally in the browser/native app storage, with JSON backup/export tools for portability.

## Why I built it / the backlog problem

A lot of game tracking tools are great at cataloging, launching, reviewing, or social sharing. My problem was more specific:

> I already own too many games. I keep buying more. I forget what I was playing. I bounce between Steam, handhelds, retro folders, wishlists, and notes. Then I spend my limited free time choosing instead of playing.

Questory is built around that feeling. It is meant to help answer:

- What am I playing right now?
- What should I play next on this platform?
- Which imported games still need a quick yes/no decision?
- What is worth keeping, dropping, wishlisting, or moving into a plan?
- Which games are missing artwork, metadata, playtime context, or achievement progress?

## Features

These are grouped honestly based on the current codebase. “Available now” means there is working UI/storage logic in the app today. “Experimental / WIP” means the feature exists but has limitations, depends on local/dev proxy behavior, or is still foundation-level.

### Available now

- **Local-first Library and Wishlist** — manual game creation, separate Library/Wishlist collections, local persistence, backup/export/import, restore/merge validation, and reset tools.
- **Library and Wishlist browsing** — search, platform/status/source/tag/enrichment filters, quick filters, sorting, visible counts, and multi-select/bulk actions.
- **Steam owned-library import foundation** — local Steam API key + SteamID64 settings, connection test, selectable owned-game import, duplicate protection, ignored Steam App IDs, Steam artwork fallbacks, and local Steam metadata storage.
- **Manual Steam Wishlist import** — bookmarklet/text/HTML/appid based import assistant for Steam wishlist pages, with duplicate protection and local Wishlist entries.
- **Quest Queue / Review Mode** — a one-game-at-a-time triage flow for processing imported/backlog/recent games into status changes, Platform Plans, Wishlist, ignores, or other actions.
- **Quest Queue batch review support** — review state, queue ordering, ignored review items, restore ignored items, and source switching for backlog/recent imports.
- **Platform Plans** — platform-specific queues, active platform selection, per-platform limits, reordering, moving entries between platforms, and “play now” actions.
- **Home active gameplay dashboard** — focused current-game view, quick notes, daily play logging, Steam playtime refresh hooks, and active gameplay management in one place.
- **Recommendations** — local “What should I play?” recommendations based on status, playtime, last played date, HLTB/RAWG-style metadata when available, platform, mood, and session length.
- **Gaming DNA / Taste Profile** — a guided taste-profile wizard that reads your shelf, explains strong likes/dislikes with game evidence, lets you triage taste signals with Quest Queue-style swipes, add current moods, and apply manual corrections that feed recommendations.
- **Stats dashboard** — local backlog totals, progress, playtime, platform/source breakdowns, metadata coverage, and useful lists.
- **RAWG metadata enrichment** — user-provided RAWG API key, per-game search, suggested/manual matches, batch enrichment, local cache, and safe writes that avoid overwriting user-owned tracking fields.
- **Metadata/artwork refresh tools** — artwork audit, missing-artwork buckets, Steam/RAWG/user artwork priority, generated fallback covers, bulk repair actions, and per-game artwork refresh paths.
- **Steam achievements display/sync support** — Steam achievement fields are stored on games, shown in details/cards/widgets, and can be synced for eligible Steam games through app actions.
- **Questory achievements** — local achievement registry and progress display for Questory milestones such as imports, queue activity, wishlist growth, retro support, Steam connection, and other app usage.
- **Daily Quest and Achievement Quiz** — local mini-challenge/quiz modules with storage, modal/card UI, artwork reveal/guess components, and weekly summaries.
- **Retro library import** — retro ROM import panel, platform detection/override, ROM metadata fields, Android folder picker support, and options to send imported retro games into Quest Queue.
- **Data portability** — JSON backup download/import, merge/replace flows, integration-key exclusion by default, local reset protections, and sync-folder/auto-backup foundation where browser APIs allow it.
- **Installable PWA foundation** — manifest, service worker registration for production builds, offline app-shell caching, install/status banner, icons, splash art, and iOS Add to Home Screen notes.
- **Theme and Neon Deck UI** — dark/light/follow-device theme support, tokenized surfaces, accent personalization, handheld-friendly navigation, and console-style “Neon Deck” visual treatment.
- **Android / Capacitor project support** — Capacitor config, Android project, native Preferences mirroring, status bar handling, launcher resources, backup export/folder picker plugins, and APK build flow.

### Experimental / WIP

- **Production Steam sync** — Steam works through the Vite dev proxy locally. A deployed public web app still needs a safe production proxy/backend for reliable Steam API calls and CORS handling.
- **Automatic Steam Wishlist sync** — still present under advanced/experimental paths, but the recommended flow is the manual bookmarklet/text import because Steam can rate-limit or reject automatic wishlist endpoint requests.
- **IsThereAnyDeal wishlist deals** — settings and deal sync logic exist for Wishlist pricing, but it depends on an API key/proxy/network and should be treated as early integration work.
- **HowLongToBeat data** — HLTB fields, badges, caching, search helpers, and bulk sync hooks exist, but provider availability/proxy behavior may vary.
- **SteamGridDB artwork** — settings and provider code exist for artwork lookup/testing, but it is still an optional integration path rather than required core functionality.
- **Sync Folder / Auto Backup** — useful where the File System Access API is available, but browser/mobile support is uneven and Android may need more native file picker/storage work.
- **Android handheld polish** — the Capacitor project exists and the app is APK-capable, but mobile/handheld behavior still needs real-device testing.
- **Daily Quest / Achievement Quiz polish** — the local feature modules exist, but they should be considered playful early experiments until the UX is proven with users.

### Planned / ideas

Grounded in the current direction of the app:

- safer hosted Steam/RAWG/ITAD/HLTB proxy story for public deployments,
- more screenshots and onboarding docs for early testers,
- better multi-device backup/sync flows without requiring accounts,
- more review-mode sources and triage shortcuts,
- improved Platform Plans for handheld/console rotation,
- stronger Android APK distribution notes,
- more robust metadata/artwork matching and conflict handling,
- better accessibility/gamepad testing,
- richer Questory achievement tuning,
- and UX feedback loops for backlog-heavy players.

## How it works

1. **Start with an empty shelf.** Questory does not create a fake library for normal users.
2. **Add or import games.** Add games manually, import owned Steam games, import Steam wishlist entries manually, or import retro ROM lists.
3. **Clean up the shelf.** Use filters, metadata enrichment, artwork repair, details editing, and bulk actions.
4. **Triage the backlog.** Use Quest Queue / Review Mode to make quick decisions instead of endlessly scrolling.
5. **Shape your Gaming DNA.** Review the taste signals Questory infers from your shelf, correct the ones that feel wrong, and add temporary moods for what you want right now.
6. **Plan by platform.** Send games into Platform Plans, set active platforms, reorder queues, and keep active game limits realistic.
7. **Play something.** Use Home, Recommendations, Daily Quest, stats, and achievements to keep momentum.
8. **Back up your data.** Export/import JSON backups or use the sync-folder foundation where supported.

## Why not just Playnite / Backloggd / spreadsheets?

### Playnite

Playnite is excellent if your main need is a powerful launcher and PC library manager. Questory is aiming at a different center of gravity: **planning, triage, and backlog decisions first**. It does not try to replace a launcher.

### Backloggd

Backloggd is great for social/review-style game tracking. Questory is more personal and local-first: **what should I play, what should I drop, what belongs in the queue, and what am I actively playing now?**

### Spreadsheets

Spreadsheets are flexible, but they are manual and easy to abandon. Questory tries to turn the same tracking work into a guided, playful workflow with queues, cards, artwork, filters, stats, and tiny achievement/review loops.

## Project status

Questory is **early alpha / work in progress**.

Expect rough edges:

- features may move or change,
- local data shapes may evolve,
- integrations may fail depending on API keys, privacy settings, proxies, CORS, or rate limits,
- Android builds need more device testing,
- and the README may be ahead of the public polish level while still being grounded in actual code.

Feedback is very welcome, especially from people with large backlogs across Steam, consoles, handhelds, retro libraries, and wishlists.

## Try it / install

Questory currently runs from source or a static deployment of the built web app.

Requirements:

- Node.js / npm
- Git
- Optional: Android Studio for APK builds
- Optional API keys for integrations:
  - Steam Web API key for Steam owned-library features
  - RAWG API key for metadata enrichment
  - IsThereAnyDeal API key for wishlist deal checks
  - SteamGridDB API key for optional artwork lookup

Install dependencies:

```bash
npm install
```

## Local development

Run the Vite dev server:

```bash
npm run dev
```

Local development is the best place to test Steam/ITAD/HLTB-style proxied API calls because Vite can serve configured dev proxies.

Steam development proxy notes:

- Frontend base path: `/api/steam`
- Proxy target: `https://api.steampowered.com`
- Example rewrite: `/api/steam/IPlayerService/GetOwnedGames/v0001/` becomes `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`
- Steam Store wishlist proxy base path: `/api/steam-store`
- Steam Store wishlist proxy target: `https://store.steampowered.com`

If Steam test/import actions show proxy or CORS errors, restart the dev server and check `vite.config.ts`. A public deployed app will still need a safe proxy/backend before real production Steam sync can be considered reliable.

## Build

Create a production build:

```bash
npm run build
```

The static production output is written to `dist/`.

Preview the production build locally:

```bash
npm run preview
```

Use preview mode for PWA smoke tests because it serves the built app shell and service worker. Service worker registration is skipped in Vite development mode.

Run the lightweight test command currently defined in `package.json`:

```bash
npm test
```

## PWA

Questory is configured as an installable Progressive Web App for static hosting and iOS Safari **Add to Home Screen** installs.

The PWA manifest uses:

- App name and short name: `Questory`
- Start URL and scope: `/`
- Display mode: `standalone`
- Dark/neon app colors using the Questory dark navy shell
- PNG app icons generated from the Questory source icon

Offline support is intentionally app-shell focused:

- the app shell, manifest, icons, splash/brand image, and local placeholder covers are cached after the app has loaded,
- built JS/CSS and same-origin assets are cached on first request,
- the local library keeps working offline because game data is stored locally,
- Steam, RAWG, IsThereAnyDeal, HLTB, SteamGridDB, and other remote actions still require network/API access,
- external images may depend on browser cache and are not guaranteed offline.

### Add Questory to iPhone Home Screen

1. Deploy Questory over HTTPS or open an HTTPS preview URL in **Safari** on iPhone.
2. Tap Safari's **Share** button.
3. Choose **Add to Home Screen**.
4. Confirm the name **Questory** and tap **Add**.
5. Launch Questory from the new Home Screen icon.

Known iOS PWA limitations:

- iOS uses Safari's manual **Add to Home Screen** flow; Chromium's `beforeinstallprompt` install button is not exposed on iPhone.
- Web push, background execution, storage persistence, and service worker behavior vary by iOS version and storage pressure.
- First offline launch is only reliable after the production app has loaded at least once.
- The PWA layer does not add cloud sync, accounts, or a backend.

## Android / APK

Questory includes a Capacitor Android project for handheld/APK packaging.

Typical Android build flow:

```bash
npm run build
npx cap sync android
npx cap open android
```

There is also a helper script that builds, syncs Capacitor, and refreshes Android launcher icons:

```bash
npm run android:prepare
```

Android notes:

- `capacitor.config.ts` points Capacitor at the Vite production build in `dist`.
- `@capacitor/status-bar` is used to hide/re-apply the Android status bar on native Android.
- Local game data is mirrored into Capacitor Preferences when the native plugin is available.
- Browser `localStorage` remains the fast startup/cache layer.
- Existing browser data is migrated into Preferences the first time the native app starts.
- Steam and RAWG API calls still require network access.
- The saved Library, Wishlist, notes, tags, statuses, Stats, recommendations, and local planning flows remain usable offline after data is loaded.
- After `npx cap sync android`, run `npm run android:sync-icons` or `npm run android:prepare` so prepared resources overwrite generated Android launcher icons before building the APK.

## Deployment

Questory does not require a custom server for the app shell. Deploy the `dist/` folder produced by `npm run build` to any static host.

### Vercel

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

### Cloudflare Pages

- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`

After deploy, open the HTTPS production URL on iPhone Safari and use **Share → Add to Home Screen** to install the standalone PWA.

Important deployment caveat: the static app shell can be hosted anywhere, but production API integrations such as Steam may need a secure proxy/backend. Do not put private API keys into source code or public README files.

## Data storage, backup, and recovery

Questory is local-first.

Known storage areas include:

- Library and Wishlist game records
- RAWG metadata cache
- ignored Steam games
- Library/Wishlist filters
- onboarding progress
- Platform Plans / queue state
- Quest Queue review state
- integration settings such as Steam, RAWG, IsThereAnyDeal, and SteamGridDB keys
- theme/navigation/device preferences
- achievement counters and play activity

Backup behavior:

- Normal backups include core user data.
- Steam/RAWG/integration keys are excluded by default.
- Integration settings are included only when explicitly enabled.
- Imported backups are validated before restore.
- Replace/restore flows require typed confirmation.
- Merge import avoids duplicates by local ID, Steam App ID, RAWG ID, ROM path/URI, or normalized title/platform fallback.
- Corrupted local JSON falls back to safe defaults and records warnings rather than silently wiping data.

## Feedback / contributing

Reddit feedback, issues, bug reports, and feature requests are welcome.

Especially useful feedback:

- “I have a giant backlog and this flow helped / did not help.”
- “This triage step is confusing.”
- “This would make Platform Plans more useful.”
- “This import/sync failed with my real library.”
- “This is too much friction before I can play something.”
- “This would make the Android/handheld experience better.”

If you open an issue, please include:

- browser/device/OS,
- whether you are using the web app, PWA, or Android build,
- whether the problem involves Steam/RAWG/ITAD/HLTB/SteamGridDB,
- and any safe, non-secret error text.

Never paste real API keys into GitHub issues, Reddit comments, screenshots, or logs.

## License

No license file is currently included in this repository. Until a license is added, assume all rights are reserved by the project owner.
