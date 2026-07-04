# QuestShelf Bug Audit
_Audit date: 2026-06-24 — read-only analysis, no code modified_

---

# Critical

## C1 — `importGames` Always Returns Empty Array (Retro Import Silently Fails)

- **Severity**: Critical
- **Affected Files**: `src/features/app/AppController.tsx` ~lines 690–734
- **Root Cause**: `importGames` captures a local variable `createdGames` and sets it inside a `setGames` functional updater callback. React executes that callback asynchronously after the render cycle; the function returns `createdGames` synchronously before the callback has run. The return value is always `[]`.
- **Reproduction Steps**: Import a retro library via Settings → Retro. The import visually succeeds (games appear) but `handleRetroImportGames` receives an empty array, so `setLastRetroImportGameIds([])`, the analytics event, and `markOnboardingItemComplete('retro-import')` all silently do nothing. The onboarding checklist item never checks off.
- **Recommended Fix**: Extract the created games inside the functional updater and return them via a ref or a separate state update, or restructure `importGames` to compute the new games array outside `setGames` and use the pre-computed list both for the state update (`setGames(prev => [...prev, ...newGames])`) and as the return value.

---

## C2 — `refreshSteamPlaytime` Discards Concurrent Game Mutations (Data Loss)

- **Severity**: Critical
- **Affected Files**: `src/features/app/useAppSyncActions.ts` ~line 369
- **Root Cause**: `refreshSteamPlaytime` is an `async` function that builds `result.games` from the `games` closure captured at call time, then does `setGames(result.games)` — a direct (non-functional) state replacement. Any game adds, removes, or edits the user makes while the Steam API request is in flight are silently overwritten when the async call resolves.
- **Reproduction Steps**: Trigger a Steam playtime refresh. While it is loading, add or edit a game manually. When the sync completes, the manual change disappears.
- **Recommended Fix**: Change to `setGames((currentGames) => mergePlaytimeIntoGames(currentGames, result))` using a functional updater that merges only the playtime fields rather than replacing the entire array.

---

## C3 — `importSteamWishlistItems` Discards Concurrent Game Mutations (Data Loss)

- **Severity**: Critical
- **Affected Files**: `src/features/app/useAppSyncActions.ts` ~line 658
- **Root Cause**: Same non-functional `setGames(nextGames)` pattern as C2. `nextGames` is derived from the stale `games` closure captured when the import started. Concurrent mutations are lost on resolution.
- **Reproduction Steps**: Start a Steam wishlist import. Add a game manually mid-import. The manual addition is gone when the import resolves.
- **Recommended Fix**: Use `setGames((currentGames) => mergeWishlistItems(currentGames, newItems))`.

---

## C4 — `importSteamWishlistHtmlItems` Discards Concurrent Game Mutations (Data Loss)

- **Severity**: Critical
- **Affected Files**: `src/features/app/useAppSyncActions.ts` ~line 744
- **Root Cause**: Identical to C3 — direct `setGames(nextGames)` after an async HTML-parse import.
- **Reproduction Steps**: Use the HTML wishlist import path. Same race condition as C3.
- **Recommended Fix**: Same as C3 — functional updater that merges rather than replaces.

---

# High

## H1 — `nextReviewCandidate` useMemo Missing `reviewModeState` Dependency (Stale Next-Game After Review)

- **Severity**: High
- **Affected Files**: `src/components/HomePanel.tsx` ~lines 113–127
- **Root Cause**: The `nextReviewCandidate` memo reads `reviewModeState.reviewedGames` inside its computation but the dependency array only lists `[games, ignoredReviewGameIds, reviewQueueOrder]`. After the user reviews a game, `reviewModeState` changes but the memo does not recompute, so the Home panel continues showing the already-reviewed game as the next candidate until a `games` state change happens to trigger a recompute.
- **Reproduction Steps**: Open Review Mode on the Home panel. Review (keep/skip) a game. The "next up" card still shows the just-reviewed game until something else updates `games`.
- **Recommended Fix**: Add `reviewModeState` (or `reviewModeState.reviewedGames`) to the dependency array.

---

## H2 — `pickNewlyUnlockedAchievement` Side Effect Inside `useMemo` (Double-Write + Achievement Race)

- **Severity**: High
- **Affected Files**: `src/components/HomePanel.tsx` ~lines 227–235, 2165–2176
- **Root Cause**: `pickNewlyUnlockedAchievement` calls `setSeenAchievementGhostIds(...)` (a `localStorage` write) and is invoked from inside a `useMemo` callback. React's StrictMode double-invokes memos during development, causing the "seen" set to be written twice. More critically, the memo marks achievements seen eagerly on every `games`/`queueState`/`reviewModeState` change, racing with `AppController`'s own achievement notification dispatch logic and potentially suppressing ghost notifications before they fire.
- **Reproduction Steps**: Unlock a new achievement while in StrictMode or while other state changes occur around the same time. The ghost notification either fires twice or not at all.
- **Recommended Fix**: Move the `setSeenAchievementGhostIds` call out of the memo and into a `useEffect` that runs after the component confirms the ghost was shown.

---

## H3 — `handleReviewAction('queue')` Always Increments `queueCandidates` Stat Even When No Platform Selected

- **Severity**: High
- **Affected Files**: `src/hooks/useReviewModeActions.ts` ~lines 190–196
- **Root Cause**: `recordReviewDecision('queueCandidates')` is called unconditionally in the `queue` branch. The `if (targetPlatform) { addGameToQueue(...) }` guard only prevents adding the game to the actual queue when no platform is chosen, but the stats counter increments regardless. Over time the "games queued" stat is inflated by every no-platform queue action.
- **Reproduction Steps**: Trigger a "queue" review decision without selecting a platform. Check review stats — `queueCandidates` count increases even though no queue entry was created.
- **Recommended Fix**: Move `recordReviewDecision('queueCandidates')` inside the `if (targetPlatform)` guard.

---

# Medium

## M1 — `addGameToQueue` Applies Platform Tag When Queue Entry Is Removed, Not Added

- **Severity**: Medium
- **Affected Files**: `src/hooks/useQueueActions.ts` ~lines 74–86
- **Root Cause**: When a game's status is `'Playing'` and its platform matches the target platform, `addGameToPlatformQueue` removes the existing queue entry rather than adding one (the early-out toggle behavior). However the `getPlatformTag` lookup and the subsequent `setGames` that applies the platform tag runs before this conditional check. The platform tag is incorrectly applied to the game even when the actual queue operation was a removal.
- **Reproduction Steps**: Add a game that is already "Playing" on its queued platform to the queue a second time. The toggle removes it from the queue but the game still gets the platform tag written back to it.
- **Recommended Fix**: Move the platform-tag application inside the branch that confirms the game was actually added (not removed), or check the return value of `addGameToPlatformQueue` before applying the tag.

---

## M2 — `removeQueueGame` Reads `targetPlatform` From Stale Closure

- **Severity**: Medium
- **Affected Files**: `src/hooks/useQueueActions.ts` ~lines 151–159
- **Root Cause**: `removeQueueGame` derives `entry?.targetPlatform` from `platformQueueState` captured in the closure at render time. `setPlatformQueueState` uses the functional form (correct) but the `targetPlatform` lookup used for tag removal is still stale if `platformQueueState` was updated by a concurrent action between renders.
- **Reproduction Steps**: Trigger rapid queue additions and removals in quick succession. In rare cases the wrong platform tag may be removed from a game (or no tag removed at all) because the entry lookup used a stale snapshot.
- **Recommended Fix**: Derive `targetPlatform` inside the `setPlatformQueueState` functional updater using the `currentState` argument rather than from the closure.

---

## M3 — `loadAchievementCounters()` Called Inside `useMemo` on Every Relevant State Change

- **Severity**: Medium
- **Affected Files**: `src/components/HomePanel.tsx` ~lines 227–234
- **Root Cause**: The `questShelfAchievements` memo calls `loadAchievementCounters()` (a synchronous `localStorage.getItem` + JSON parse) inside the memo body. The memo depends on `games`, `queueState`, and `reviewModeState`, so this storage read runs every time the user interacts with their library or queue — potentially dozens of times per session.
- **Reproduction Steps**: Open devtools → Performance, record while doing library actions. The `localStorage.getItem` call for achievement counters appears on every game state change.
- **Recommended Fix**: Read achievement counters once at mount with `useState(() => loadAchievementCounters())` and update them via a targeted effect that only fires when relevant achievement-unlocking actions complete.

---

## M4 — Spurious `analyticsCounts` Dependency Causes Analytics Effects to Re-run on Every Game Mutation

- **Severity**: Medium
- **Affected Files**: `src/features/app/AppController.tsx` ~lines 529–557
- **Root Cause**: `analyticsCounts` is derived from `games` state (counts library sizes, completion counts, etc.) and is listed as a dependency of analytics tracking `useEffect`s. Because `analyticsCounts` is a freshly computed object, it changes reference on every `games` mutation. Each mutation re-runs the analytics effects. The session dedup ref prevents actual double-sends but the effects still fire and run their comparison logic on every game change.
- **Reproduction Steps**: Add or edit a game — all analytics effects run immediately, not just on session start.
- **Recommended Fix**: Either memoize `analyticsCounts` with `useMemo` and compare by value, or remove it from the dependency arrays and instead track the analytics event once on mount using a ref guard.

---

## M5 — `useOnboardingController` Calls `loadOnboardingState()` Twice at Mount

- **Severity**: Medium
- **Affected Files**: `src/features/onboarding/useOnboardingController.ts` ~lines 18–25
- **Root Cause**: Two separate `useState` initializer functions both call `loadOnboardingState()` independently. This is two synchronous `localStorage.getItem` + JSON parse calls on every mount when one is sufficient.
- **Reproduction Steps**: Inspect on mount — `loadOnboardingState` is called twice.
- **Recommended Fix**: Call `loadOnboardingState()` once into a local variable before the first `useState` and pass the result to both initializers.

---

## M6 — `useCollectionViewMode` Saves With Stale `collectionType` on First `collectionType` Change

- **Severity**: Medium
- **Affected Files**: `src/hooks/useCollectionUiState.ts` ~lines 37–44
- **Root Cause**: The `useEffect` that saves `viewMode` uses `activeViewModeCollectionRef.current` as the storage key. When `collectionType` changes, two effects fire: first the save effect (with the old ref value still pointing to the previous collection type), then the `collectionType` effect (which updates the ref). A view mode change made in the last render before navigation is saved under the wrong collection key.
- **Reproduction Steps**: Be on Library in List View. Switch to Wishlist. In some render orderings, the List View setting gets written to the Wishlist storage key.
- **Recommended Fix**: Pass `collectionType` directly as an argument to `saveCollectionViewMode` inside the save effect rather than relying on `activeViewModeCollectionRef.current`, which may lag by one render.

---

# Low

## L1 — Bare `localStorage.getItem` Without Error Handling in `QueuePanel` Hint State

- **Severity**: Low
- **Affected Files**: `src/components/QueuePanel.tsx` ~lines 86, 222
- **Root Cause**: `showQueueHint` is initialized with a bare `localStorage.getItem('qs-queue-hint-v1')` (no try/catch, no `typeof window` guard). `dismissQueueHint` writes directly without error handling. In environments where storage is blocked (strict private browsing, storage quota exceeded), this throws uncaught exceptions.
- **Recommended Fix**: Wrap both reads and writes in try/catch, consistent with the pattern used by `saveCollectionFilters` and other storage utilities elsewhere in the codebase.

---

## L2 — `HomePanel` `progressDismissed` / `workflowStripDismissed` Initialized Without Error Handling

- **Severity**: Low
- **Affected Files**: `src/components/HomePanel.tsx` ~lines 203–207
- **Root Cause**: Both `useState` initializers call `localStorage.getItem(...)` directly without try/catch. Same risk as L1 — uncaught exception if storage is blocked or quota is exceeded.
- **Recommended Fix**: Wrap in try/catch or extract into a shared `safeLocalStorageGet` helper.

---

## L3 — Undo Snapshot Stores Full `games` Array in `sessionStorage` (Large Library Risk)

- **Severity**: Low
- **Affected Files**: `src/hooks/useQuestShelfNotifications.ts`, `src/lib/undoHistoryStorage.ts`
- **Root Cause**: Every undoable action serializes the entire `games` array to `sessionStorage`. For users with large libraries (500+ games with full metadata and artwork URLs), each snapshot can be several hundred kilobytes. Multiple pending undo actions multiply this. `sessionStorage` has a 5 MB limit; hitting it throws a `QuotaExceededError` which is unhandled in `undoHistoryStorage`.
- **Recommended Fix**: Store only the diff (changed game IDs and their previous values) rather than the full array, or add try/catch around `sessionStorage.setItem` with graceful degradation (disable undo for that action if storage is full).

---

## L4 — `saveReviewModeState` Fires Synchronously on Every Review State Update Without Debouncing

- **Severity**: Low
- **Affected Files**: `src/hooks/useReviewModeActions.ts`
- **Root Cause**: A `useEffect` keyed on `[reviewModeState]` calls `saveReviewModeState` (a synchronous `localStorage.setItem`) on every state update. In a rapid-review session (user swiping quickly), this triggers a blocking localStorage write on each review action.
- **Recommended Fix**: Debounce the save (300–500 ms), matching the debounce pattern used for game saves in `useAppPersistence`.

---

## L5 — `analyticsSettings` Read at Hook Body Scope (Not Reactive to Settings Changes)

- **Severity**: Low
- **Affected Files**: `src/features/onboarding/useOnboardingController.ts` ~line 27
- **Root Cause**: `const analyticsSettings = loadAnalyticsSettings()` is called at the top of the hook body, not inside a `useState` initializer or `useMemo`. It reads from storage once on every render but its value is not reactive — if analytics settings change during the session, the `completedOnboardingItemIds` memo (which depends on `analyticsSettings.hasSeenAnalyticsNotice`) will not recompute until some other state triggers a re-render.
- **Recommended Fix**: Hoist into `useState(() => loadAnalyticsSettings())` and update via a targeted effect or settings-change subscription.

---

_Total findings: 4 Critical · 3 High · 6 Medium · 5 Low_
