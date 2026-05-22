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

No PSN, IGDB, achievements, Capacitor, backend, accounts, auto-sync, or remote sync are included yet.

## Steam Integration Foundation

QuestShelf includes a Settings section for an early Steam integration foundation. It stores the Steam Web API key and SteamID64 locally in the browser and can test the Steam API connection.

The test action calls:

- `getOwnedGames()`
- `getRecentlyPlayedGames()`

The returned Steam games are mapped into the local `Game` model for preview in a debug panel, but they are not written into the local library yet.

To use the test connection:

1. Get a Steam Web API key from <https://steamcommunity.com/dev/apikey>.
2. Find your SteamID64 from your Steam profile URL or a Steam ID lookup tool.
3. Open QuestShelf Settings.
4. Enter the API key and SteamID64.
5. Click **Test Steam connection**.

Steam profile privacy can prevent owned or recently played game data from being returned.

During this foundation phase the Steam test runs directly from the browser. If the browser or Steam blocks the request, QuestShelf shows the API failure state instead of silently syncing.

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
