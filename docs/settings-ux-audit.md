# QuestShelf Settings UX/UI Audit

**Date:** 2026-06-21
**Scope:** All 8 settings categories and their constituent panels.
**Format:** Critical / Medium / Nice-to-Have findings, plus Top 10 before Community Alpha.

---

## Critical Issues

### C-1 — `window.prompt()` used for all destructive and editing confirmations

**Problem:** Three separate settings flows use `window.prompt()`:
- `DataManagementPanel`: "Reset Local Data" prompts `"Type RESET..."` to confirm
- `DataManagementPanel`: Backup restore prompts `"Type MERGE or REPLACE"` to choose mode
- `PlatformsSettingsPanel` / `QueuePlatformManagementRow.renamePlatform()`: uses `window.prompt()` to get the new name

**Why it matters:** `window.prompt()` is completely broken in Android WebViews (silently returns `null` in some Capacitor builds), impossible to use with a controller (no hardware keyboard mapping), non-focus-manageable (breaks screen readers), and visually jarring — a browser-native dialog inside a polished custom UI. On the target device (Retroid, Android handheld), this makes "Reset Data" and "Rename Platform" completely inaccessible.

**Recommended solution:** Replace each with a small `ViewportModal` confirmation dialog — the pattern already exists in the codebase. For destructive actions: a modal with a labelled text input and a styled confirm button. For platform rename: a modal with a pre-filled input and "Rename" / "Cancel" buttons.

**Effort:** Medium — 3 instances, same pattern each time.

---

### C-2 — Data & Backup: Reset button is placed at the header level, adjacent to Backup

**Problem:** In `DataManagementPanel`, "Export Backup" (mint/primary) and "Reset Local Data" (red/destructive) are both rendered as header-level action buttons in close visual proximity. On a touch screen or with a controller navigating linearly, the destructive reset is only one action away from a safe operation.

**Why it matters:** Accidental data wipe during Community Alpha is catastrophic — users haven't been using the app long enough to have backup habits. Once `window.prompt()` is replaced with a proper modal (C-1), spatial proximity becomes the only guard.

**Recommended solution:** Move "Reset Local Data" below all backup/export actions, in its own "Danger zone" subsection with a red border, extra spacing, and a clear heading. Never co-locate it with affirmative actions.

**Effort:** Low — layout change only.

---

## Medium Issues

### M-1 — Appearance category is severely overloaded

**Problem:** `AppearanceSettingsPanel` is a single, enormously long panel that mixes five distinct concerns:
- Visual theme (Classic / Neon Deck) + accent colors + Neon gradient controls
- Language / locale select
- Android landscape lock toggle
- Controller layout select + controller debug toggle

`NavigationVisibilitySettingsPanel` is also placed *above* `AppearanceSettingsPanel` in the same category, adding a sixth distinct concern to the same scroll container.

**Why it matters:** Users looking for language settings won't find them in "Appearance." Controller settings belong with platform/hardware configuration. The nav visibility panel logically belongs in Personalization. The result is a category that takes 3–4 scrolls to traverse and groups unrelated settings by co-location rather than logic.

**Recommended solution:**
1. Move Language to the top of the Appearance panel or into Personalization.
2. Move Controller layout, Landscape lock, and Controller debug into a "Controls" subsection or new category.
3. Move `NavigationVisibilitySettingsPanel` to Personalization.

**Effort:** Low–Medium.

---

### M-2 — SteamGridDB uses explicit Save/Clear while RAWG and ITAD auto-save

**Problem:** `RawgSettingsPanel` and `IsThereAnyDealSettingsPanel` both auto-save via `useEffect` on every keystroke. `SteamGridDbSettingsPanel` requires explicit "Save" and "Clear" button clicks. If a user types a key and navigates away without saving, the key is silently discarded.

**Why it matters:** Inconsistent mental model across three nearly identical API key panels. Users will expect the same auto-save behavior they learned from RAWG. Additionally, "Clear" sits immediately next to "Save" and "Test" with no confirmation dialog.

**Recommended solution:** Align SteamGridDB with RAWG/ITAD and auto-save on input. If the explicit test-before-save flow is intentional, at minimum show a yellow "Unsaved changes" indicator when `draftApiKey !== savedSettings.apiKey`.

**Effort:** Low.

---

### M-3 — RAWG has no connection test

**Problem:** `SteamGridDbSettingsPanel` has a "Test connection" button that makes a real API call. `SteamSettingsPanel` has a full test connection workflow. `RawgSettingsPanel` has only a help modal — no way to verify the key actually works.

**Why it matters:** RAWG is the single most critical integration (metadata enrichment for all non-Steam games). If a user enters an invalid key, the only failure signal is a toast error buried on a specific game's enrichment attempt.

**Recommended solution:** Add a "Test API key" button that calls a lightweight RAWG endpoint (e.g. search for "Portal") and shows a success or error message inline — consistent with the SteamGridDB pattern.

**Effort:** Low.

---

### M-4 — ITAD has no connection test or status indicator

**Problem:** `IsThereAnyDealSettingsPanel` is just an API key input and an attribution note. No status badge, no test button, no help modal. All three other key-based integrations (RAWG, SteamGridDB, Steam) have at minimum a status indicator.

**Why it matters:** If the ITAD key is wrong, the only failure signal is missing price data somewhere in the Wishlist UI — with no indication of why. Community alpha users will not know where to start debugging.

**Recommended solution:** Add a `SettingsStatusBlock` (already exists in `SettingsSection.tsx`) showing "Configured" / "Missing" based on whether a key is set. Optionally add a lightweight test button.

**Effort:** Low.

---

### M-5 — Platform bulk management buttons have misleading labels

**Problem:** `PlatformsSettingsPanel` has three bulk action buttons:
- "Enable multiple" — actually enables **all** platforms at once with no selection step
- "Disable multiple" — actually disables **all** platforms at once with no selection step
- "Reorder multiple A-Z" — sorts all active platforms alphabetically

The first two imply a multi-select UI will appear; instead they immediately apply to all platforms with no confirmation.

**Why it matters:** A user expecting "Enable multiple" to open a multi-select will instead silently activate every platform they ever added, affecting Platform Plans immediately.

**Recommended solution:** Rename to "Enable all" and "Disable all". Consider adding a brief confirmation or at minimum a tooltip explaining the action affects all platforms.

**Effort:** Low.

---

### M-6 — Steam game import list has no search or filter

**Problem:** After a successful Steam connection test, `SteamImportSection` renders the user's full owned game list (potentially 500–1000+ games) in a `max-h-[560px]` scrollable container with no search, sort, or filter. "Select all" and "Deselect all" are the only bulk tools.

**Why it matters:** A user who wants to selectively import 20 specific games from a 400-game library must manually scroll through the entire list. Selective import is an extremely common first-run action during Community Alpha.

**Recommended solution:** Add a search input above the game list that filters visible rows by title. A "recently played first" toggle would also help since those are the most import-relevant games.

**Effort:** Medium.

---

### M-7 — Retro import: no preview of resolved titles

**Problem:** `RetroImportPanel` shows a scan table with raw cleaned titles from ROM filenames. There is no indication of what `resolveRetroTitle` will generate as search candidates, nor any "will search for: X" preview column.

**Why it matters:** Users importing ROMs like `"Legend of Zelda, The - The Minish Cap (USA) (Rev 1).gba"` see the cleaned title in the scan table, but metadata enrichment will search for `"The Legend of Zelda: The Minish Cap"`. Without any preview, users can't catch incorrect resolutions before importing.

**Recommended solution:** Add an optional "Resolved search title" column or tooltip in the scan table. `resolveRetroTitle` is a pure synchronous function that can be called during the scan step.

**Effort:** Medium — requires passing the resolver result through the scan pipeline.

---

### M-8 — HLTB panel has no troubleshooting path

**Problem:** `HltbSettingsPanel` renders only two lines of text: a settings description and a proxy note. There is no status indicator, no test button, no link to the HLTB website, and no indication of what to do when HLTB playtime data is unavailable.

**Why it matters:** HLTB failures are completely opaque. If the proxy is down or the CORS workaround breaks, users see nothing — no how-to-beat times appear and there is no signal of why. During Community Alpha this will generate support questions.

**Recommended solution:** Add a "Test HLTB lookup" button that searches for a known game and shows the response status. Add a link to howlongtobeat.com. Optionally expose the proxy/endpoint URL if configurable.

**Effort:** Low–Medium.

---

### M-9 — Category descriptions are defined but never rendered

**Problem:** `src/config/settings.ts` defines `description` and `shortDescription` for all 8 categories. Neither field is rendered anywhere in `SettingsView.tsx` — the category list shows only icon + label.

**Why it matters:** A new user looking at "Integrations" has no idea what they will find inside. Community alpha users exploring unfamiliar settings must click into each category to understand it.

**Recommended solution:** Show `shortDescription` below each category label in the sidebar list. Show `description` in the category header as a subtitle below the breadcrumb title.

**Effort:** Low — additive JSX change only.

---

### M-10 — NavigationVisibilitySettingsPanel is rendered before AppearanceSettingsPanel

**Problem:** In `SettingsView.tsx`, the Appearance category renders `NavigationVisibilitySettingsPanel` first, then `AppearanceSettingsPanel`. Navigation visibility controls which nav items appear — logically a personalization/layout concern — and it visually dominates the top of the Appearance screen before the user even sees the theme picker.

**Why it matters:** Users opening "Appearance" expecting theme/color controls are immediately confronted with a nav visibility checkbox grid. The ordering misrepresents what the category is primarily about.

**Recommended solution:** Either reverse the render order (theme/colors first, nav visibility below), or move `NavigationVisibilitySettingsPanel` to the Personalization category where identity, avatar, and display preferences already live.

**Effort:** Low.

---

## Nice-to-Have

### N-1 — Data & Backup: file restore picker may break on Android
`DataManagementPanel` uses a hidden `<input type="file">` for backup restore. The `accept=".json"` filter is unreliable in Android WebViews. The retro importer's `RetroFolderPicker` plugin approach is the better model for Android, or a paste-based JSON fallback could work for web.

### N-2 — SteamGridDB "Clear" button has no confirmation
"Clear" immediately wipes the saved API key with a single click. Its rose-on-hover styling is a weak signal. A short confirmation step (or `window.confirm` as minimum) would prevent accidental key loss.

### N-3 — Controller debug checkbox is visually buried
The controller debug toggle is the last item in `AppearanceSettingsPanel`, after language, landscape lock, and controller layout. It should be in a labeled "Developer" or "Debug" subsection, or removed from alpha builds entirely.

### N-4 — About panel: version number is hardcoded
`AboutSettingsPanel` renders `Version 0.1.0` as a string literal. This should be a build constant (e.g. `import.meta.env.VITE_APP_VERSION`) so version display reflects actual builds without manual edits.

### N-5 — Steam: "Ignored games" expand/collapse is inconsistent with advanced diagnostics
`IgnoredSteamGamesSection` uses manual `useState` + text "Expand / Collapse" buttons. The "Advanced connection diagnostics" section below it uses native `<details>/<summary>`. Both should use the same pattern.

### N-6 — Wishlist: bookmarklet textarea is always visible
`WishlistSettingsPanel` renders a read-only `textarea` with the full bookmarklet code inline. On mobile this takes significant vertical space for content users need only once. It could live inside a collapsed `<details>` or be replaced with just the "Copy bookmarklet" button (which is already present).

### N-7 — Personalization: manual featured game list stays open after selection
After selecting a game from the "Manual featured game" dropdown, the search list remains visible. Selecting a game should collapse the list automatically.

### N-8 — Platform identity fields use nested `<details>` inside card rows
`QueuePlatformManagementRow` uses a nested `<details>/<summary>` for identity fields (accent color, artwork URL, platform tag) — the only place in settings where `<details>` appears nested inside a card row. An inline expand or "Edit" button pattern would be more consistent with the rest of the settings UI.

### N-9 — No "last backed up" timestamp in Data & Backup
There is no indicator of when the user last exported a backup. A "Last backup: never" or "Last backup: 3 days ago" note would nudge alpha users to maintain backup habits.

### N-10 — Analytics consent is buried in the last settings category
The anonymous analytics opt-in lives at the end of the "About" panel, the last of 8 categories. For Community Alpha where usage data matters, this could be surfaced during onboarding or in an earlier, more visible category.

---

## Top 10 Before Community Alpha

| # | Issue | Panels Affected | Effort |
|---|-------|-----------------|--------|
| 1 | **Replace all `window.prompt()` calls with `ViewportModal` dialogs** — Data reset, backup restore mode, platform rename. Completely broken on Android WebView and controllers. | DataManagementPanel, PlatformsSettingsPanel | Medium |
| 2 | **Move "Reset Local Data" into a Danger Zone subsection** — Separate it spatially from safe Backup/Export actions to prevent accidental wipe. | DataManagementPanel | Low |
| 3 | **Add RAWG connection test** — Verify API key works before users attempt game enrichment. Matches the SteamGridDB and Steam patterns. | RawgSettingsPanel | Low |
| 4 | **Fix Platform bulk action labels** — "Enable multiple" / "Disable multiple" → "Enable all" / "Disable all" with no intermediate selection step expected. | PlatformsSettingsPanel | Low |
| 5 | **Render category short descriptions in the sidebar** — The data already exists in `settings.ts`; showing it helps new alpha users navigate without clicking every category. | SettingsView | Low |
| 6 | **Add ITAD status badge** — At minimum, show "Configured" / "Missing" to match the other integration panels. | IsThereAnyDealSettingsPanel | Low |
| 7 | **Align SteamGridDB to auto-save** — Or add an unsaved-changes indicator. Users trained by RAWG/ITAD will navigate away without saving. | SteamGridDbSettingsPanel | Low |
| 8 | **Resolve Appearance category overload** — Move Controller layout, Landscape lock, and Controller debug out of AppearanceSettingsPanel. Move Language to top. Move NavigationVisibilitySettingsPanel to Personalization. | AppearanceSettingsPanel, SettingsView | Medium |
| 9 | **Show resolved title preview in Retro scan table** — Let users see what RAWG will search for before importing, surfacing bad resolutions early. | RetroImportPanel | Medium |
| 10 | **Add Steam game list search/filter** — Large Steam libraries make selective import unusable without filtering. This is the most common first-run Community Alpha action for Steam users. | SteamSettingsPanel | Medium |

---

## Panel Coverage Summary

| Panel | Key Issues |
|-------|------------|
| SettingsView (shell) | Category descriptions not shown; mobile layout is fine |
| RawgSettingsPanel | No connection test; auto-save works correctly |
| SteamSettingsPanel | Game import list needs search; overall pattern is strong |
| SteamGridDbSettingsPanel | Save/Clear inconsistent with RAWG/ITAD auto-save |
| HltbSettingsPanel | Too minimal; no test, no troubleshooting path |
| IsThereAnyDealSettingsPanel | No status indicator; no connection test |
| AppearanceSettingsPanel | Severely overloaded; wrong category for language/controller settings |
| NavigationVisibilitySettingsPanel | Wrong category; wrong render order within Appearance |
| PersonalizationSettingsPanel | Manual game dropdown stays open after selection |
| PlatformsSettingsPanel | `window.prompt()` for rename; misleading bulk action labels |
| WishlistSettingsPanel | Bookmarklet textarea wastes space; overall flow is well-designed |
| DataManagementPanel | `window.prompt()` for all confirmations; Reset too close to Backup |
| RetroImportPanel | No title resolver preview; Android handling is good |
| AboutSettingsPanel | Hardcoded version string; analytics buried in last category |
