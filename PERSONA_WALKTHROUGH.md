# QuestShelf Community Alpha — Five-Persona First-Hour Walkthrough

**Date:** 2026-06-20
**Method:** Code-informed persona simulation
**Scope:** First 60 minutes, new findings only (previous audit items excluded)

---

## Steam Hoarder (1500+ games)

**Arrives:** Pastes credentials, hits Import, walks away. Returns to find 1500 games waiting.

**First 10 minutes:** Import goes fine. Gets to Home and sees Quest Queue Remaining: 1500. Reads the counter and immediately does the math: 20-game batches = 75 sessions minimum to review everything. Closes the number, doesn't open Quest Queue.

**Minutes 10–40:** Tries Platform Plans instead. Creates a Steam platform. Zero games in it. Realises games don't flow in automatically — they have to be triaged one by one through Quest Queue. Goes back and opens Quest Queue out of obligation. Reviews 20 games, gets the completion screen. Sees "1480 still waiting." That number stings.

**Minutes 40–60:** Either commits to the loop long-term (rare), or tabs away looking for a bulk import or "add all games to this platform" button that doesn't exist.

- ✓ **Delight:** Import completes with a real count. "Imported 1487 Steam games" feels like a milestone, not a warning.
- ✗ **Confusion:** The 20-game batch limit appears with no explanation. Users don't know if it's a free-tier restriction, a design choice, or a bug. No copy explains why the session ends.
- ⚠ **Abandonment:** The gap between "I imported everything" and "I need to manually decide on each game" is too large with no bridge. No bulk-assign, no "start with just your recently played" shortcut visible on first visit.

---

## Steam Deck Owner (200–400 games)

**Arrives:** Imports quickly, picks Neon theme ("Arcade glow and deck-style panels" — lands perfectly), creates a "Steam Deck Now" custom platform.

**First 10 minutes:** Opens Quest Queue. Swipes right on first game — game disappears. No platform picker appears. Doesn't know if it went to Steam or Steam Deck Now. Checks Platform Plans. Game is in Steam, not Steam Deck Now. Now has to manually move it.

**Minutes 10–40:** Learns that the BacklogPlatformPicker only appears when tapping the "Add to Platform Plans" button, not on swipe. Adjusts workflow to button-tap instead of swipe. But the swipe still works and silently assigns to the wrong platform. Friction compounds across 20 games.

**Minutes 40–60:** Completion screen shows "9 added to Platform Plans." User goes to Platform Plans and finds them split between Steam (6) and Steam Deck Now (3) — wrong. Has to reorder/move games manually. Settles in once they understand the model, but lost trust in swipe.

- ✓ **Delight:** Neon theme pitch is the best-targeted copy in the whole app for this persona. Converts immediately.
- ✗ **Confusion:** Swipe and button-tap produce different flows (with vs without platform picker) but look identical in the hint copy. No visual distinction between the two.
- ⚠ **Abandonment:** Discovering wrong platform assignments after a full 20-game batch means either ignoring the error (inconsistent data) or re-doing the session. Both outcomes damage trust in the triage loop.

---

## Retro Enthusiast (50–200 ROMs, no Steam)

**Arrives:** Skips Steam step immediately. Goes to Library — empty. Reads the empty state. It mentions Steam import and manual add. No mention of ROM import. Starts adding games manually one by one.

**First 10 minutes:** Adds three ROMs by hand. Realises this will take an hour for 100 games. Goes to Settings looking for something better. Eventually finds Settings → Retro. Relief. Folder picker works. 85 ROMs imported in one shot.

**Minutes 10–40:** No cover images. Placeholder initials on every card. Tries "Refresh Metadata" via bulk action expecting RAWG to fill covers. RAWG returns "no match" for 80% of retro titles. No explanation of why — just empty results. User assumes the metadata feature is broken.

**Minutes 40–60:** Gives up on covers. Tracks games locally anyway — notes, tags, status. Creates a "SNES" Platform Plan. Triages 20 games in Quest Queue. Mostly satisfied, but feels like a second-class user compared to Steam importers.

- ✓ **Delight:** Settings → Retro → folder picker is genuinely powerful. One folder scan, 85 games, zero cloud dependencies. This persona will tell friends.
- ✗ **Confusion:** Library empty state only shows Steam-centric paths forward. The single biggest entry point for this persona (ROM import) is invisible from the first screen they land on after skipping onboarding.
- ⚠ **Abandonment:** RAWG silently returning no results for retro titles with no "retro games aren't supported by this source" explanation. Feels broken, not intentional. User may assume the whole enrichment system is down.

---

## Casual Gamer (20–30 games, just wants to play tonight)

**Arrives:** Skips most of onboarding. Gets to Home. It's empty. Reads the Getting Started guidance. Adds 4 games manually. Marks one as Playing Now. Home shows it. Done in 8 minutes.

**First 10 minutes:** Notices the Quest Queue Remaining counter on the hero bar showing "4." Doesn't know what it means. Taps it. Quest Queue opens and shows the first game — the one they just marked as Playing Now. This game is already their active game. Why is it in a triage queue?

**Minutes 10–40:** Reviews one game in Quest Queue. Presses "Playing Now" on it (already playing it). Confused why they're being asked to decide on a game the app already knows they're playing. Clicks back. Ignores Quest Queue. Home looks correct. Returns occasionally to add notes or check active games.

**Minutes 40–60:** Sees "Next from Your Plans" section on Home — empty, because they never created Platform Plans. Section title implies there should be something there. Feels like a gap, not a feature. No CTA appears under it because there are no plans configured.

- ✓ **Delight:** Home → Continue Playing with one big game card is immediately useful. No complexity needed. This persona has what they came for within 5 minutes.
- ✗ **Confusion:** The hero bar Quest Queue counter counts Playing Now games as "still waiting for review." The casual gamer already told the app what they're playing — seeing it counted as unreviewed feels like the app isn't listening.
- ⚠ **Abandonment:** "Next from Your Plans" section on Home sitting permanently empty with no guidance creates the impression the app is half-finished. This persona won't create Platform Plans. An empty section with a confident title reads as broken, not optional.

---

## Console-First Player (PS5/Xbox, no Steam)

**Arrives:** Skips Steam step. Adds 4–5 PS5 games manually. Creates a "PlayStation 5" Platform Plan. Adds games to it. Marks one Playing Now. Everything works.

**First 10 minutes:** Looks at game cards in Platform Plans. Every card shows a placeholder letter — no cover art. Checks game detail. Sees a cover URL field but it's empty. Realises covers require manual URLs. Spends 10 minutes finding and pasting box art URLs for 3 games. The fourth game's URL throws a broken image.

**Minutes 10–40:** Gives up on covers for now. Creates "Xbox" plan for 3 games. Both platform columns now visible. Reorders games within PS5 column. Notices there's no visible "last played" tracking without Steam. Adds progress notes manually. Works but feels labour-intensive.

**Minutes 40–60:** Clicks Recommendations tab out of curiosity. Recommendations engine returns results filtered to Platform Plans entries — games they already said they want to play. Feels circular ("recommend me things I already said I want?"). Closes Recommendations. Returns to Platform Plans as their main view. Settled and functional, but left wondering what Recommendations is actually for.

- ✓ **Delight:** Custom platform name + accent color + artwork preset for PlayStation creates a clean, personalised board. Reordering within a platform column feels natural and satisfying.
- ✗ **Confusion:** Placeholder letter covers (large "E" for Elden Ring) look like an error state, not a design choice. No copy anywhere says covers are optional or that they auto-load from Steam.
- ⚠ **Abandonment:** Manual cover URL entry for 30 console games is 30–60 minutes of unrewarded work. If the user stops halfway, the library looks permanently half-finished every time they return.

---

## Cross-Persona Gap Summary

| Gap | Personas affected | Perceived impact |
|---|---|---|
| Quest Queue batch limit unexplained | Hoarder, Deck Owner | Looks like a paywall or bug |
| Swipe vs button-tap produce different platform-picker flows | Deck Owner, Hoarder | Silent data corruption |
| Library empty state is Steam-only; ROM import not mentioned | Retro, Console | Discovery failure for 2 of 5 personas |
| Playing Now games counted as "unreviewed" in hero counter | Casual | "App isn't listening" |
| "Next from Your Plans" section empty with no CTA | Casual | Looks broken, not optional |
| Placeholder covers look like error states, not a design choice | Console, Retro | Perceived incompleteness |
| Recommendations feels circular for small/manual libraries | Console, Casual | Feature appears pointless |
| RAWG "no match" for retro titles gives no explanation | Retro | Feature appears broken |
