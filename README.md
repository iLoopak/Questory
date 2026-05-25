# QuestShelf

QuestShelf is a local-first game library foundation built with React, Vite, TypeScript, and Tailwind CSS.

## Features

- Responsive dark app shell with placeholder navigation.
- Typed local `Game` model.
- Seeded sample games.
- Browser `localStorage` persistence.
- Game cards with cover image, playtime, tags, notes, and last played date.
- Filter by platform, status, and tag.
- Search by title.
- Change game status directly from the library.
- Steam connector foundation in Settings.
- Local Steam Web API key and SteamID64 storage.
- Steam connection test with raw debug output and mapped game previews.
- Controlled Steam import with selectable games and duplicate protection.
- Optional RAWG metadata enrichment for individual games.
- Focused game detail view with editable local tracking and read-only Steam/RAWG metadata.
- Metadata enrichment workflow for larger libraries with batch processing and manual match review.
- Local Recommendation Engine v1 for choosing what to play next.

No PSN, IGDB, achievements, Capacitor, backend, accounts, auto-enrichment, auto-sync, or remote sync are included yet.

## Steam Integration Foundation

QuestShelf includes a Settings section for an early Steam integration foundation. It stores the Steam Web API key and SteamID64 locally in the browser and can test the Steam API connection.

The test action calls:

- `getOwnedGames()`
- `getRecentlyPlayedGames()`

The returned Steam games are mapped into the local `Game` model for preview in a debug panel, but they are not written into the local library yet.

Steam import stays local-first:

- Use **Test Steam connection** to load owned games.
- Select individual Steam games, or use **Select all** and **Deselect all**.
- Click **Import selected** to add selected games to the local library.
- Games already in the library with the same Steam App ID are marked as **Already in library** and are not duplicated.
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
5. Click **Test Steam connection**.

Steam profile privacy can prevent owned or recently played game data from being returned.

During this foundation phase the Steam test runs directly from the browser. If the browser or Steam blocks the request, QuestShelf shows the API failure state instead of silently syncing.

## RAWG Metadata Foundation

QuestShelf includes an optional RAWG integration in Settings. The RAWG API key is stored locally in the browser.

To enrich one game:

1. Get a RAWG API key from <https://rawg.io/apidocs>.
2. Open QuestShelf Settings and enter the RAWG API key.
3. In the Library, click **Find metadata** on a game card.
4. Pick the correct RAWG match.

QuestShelf fetches details for the selected match and stores metadata locally on that game, including RAWG ID, genres, RAWG tags, developers, publishers, release date, Metacritic score, average playtime, background image, metadata source, and update time.

RAWG enrichment does not overwrite manually edited fields such as status, notes, custom tags, or cover image.

## Game Detail View

Open a game from the Library with **Details** to review one title in a focused view. The detail screen keeps local user tracking separate from imported metadata:

- **My tracking** is editable and stores status, custom tags, and notes in local storage.
- **Steam data** is read-only and shows Steam App ID, store URL, import source, and import time when available.
- **RAWG metadata** is read-only and shows enriched fields such as genres, tags, developers, publishers, release date, Metacritic, average playtime, background image, and metadata update time when available.

Imported and enriched metadata is not edited directly from this screen.

## Metadata Enrichment Workflow

Open **Metadata** to review games that are missing RAWG metadata. The workflow stays local-first and only runs when started by the user.

- Use **Find metadata** on one game to search RAWG and auto-save only high-confidence matches.
- Use **Review matches** when confidence is too low and pick the correct RAWG result manually.
- Use **Skip** for games to revisit later or **Mark as manually managed** for games that should not be enriched automatically.
- Use **Enrich all** or **Enrich selected** to process a lightweight queue without freezing the UI.
- Use **Stop enrichment** to halt an active batch after the current item finishes.

Automatic confidence scoring considers exact title match, normalized title similarity, platform similarity, and release year similarity when a release year is available. Successful RAWG matches are cached locally in the browser and reused for the same normalized title. Enrichment only writes RAWG metadata fields and does not overwrite local user-owned fields such as status, tags, notes, or cover image.

## Recommendation Engine v1

Open **Recommendation** to get a local **What should I play?** pick. The engine does not call AI or any external API.

Inputs:

- Available time: 15 min, 30 min, 1 hour, or long session.
- Mood: brain off, story, grind, challenge, or comfort.
- Preferred platform: any platform or a specific local platform.
- Include finished games: enabled or disabled.

The recommendation score uses local status, last played date, playtime, RAWG average playtime, genres, RAWG tags, custom tags, and platform. It prefers games already marked `Playing`, games not played recently, mood matches, and games that fit the selected session length. It penalizes completed games unless enabled, dropped games, and missing RAWG metadata without excluding those games entirely.

The main recommendation card shows the selected game, cover, platform, status, playtime, matching reasons, and confidence score. **Reroll** moves to the next best candidate, **Mark as Playing** updates local tracking, and **Open Detail** opens the focused game detail view.

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
