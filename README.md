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
