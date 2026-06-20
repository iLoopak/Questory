# QuestShelf Community Alpha Readiness Audit

**Date:** 2026-06-20
**Auditor:** Community Alpha tester perspective
**Scope:** Trust, polish, consistency, confidence, perceived completeness

This audit evaluates whether QuestShelf feels ready to be shared publicly with early adopters. It does not evaluate code quality or bugs — only user perception.

---

## Summary Assessment

| Dimension | Score | Notes |
|---|---|---|
| Trust | 6/10 | Silent failures and permanently-dismissible hints undermine it |
| Polish | 7/10 | Main flows look finished; onboarding edges are rough |
| Consistency | 5/10 | "Platform Plans" naming alone drops this significantly |
| Confidence | 6/10 | Good first-day flow, weak post-action feedback |
| Perceived completeness | 7/10 | Core loop is solid; Recommendations and sync feel bolted on |

**Verdict:** Close, but items 1, 2, and 7 should be fixed before any public link is shared — they are all copy changes that take under an hour and directly affect the first 10 minutes of a new user's experience.

---

## Must Fix Before Alpha

### 1. "Platform Plans" has three names in the same UI
`Queue`, `Platform Backlog`, and `Platform Plans` are all used across nav labels, i18n keys, button text, and toast messages. A first-time user landing on "Platform Plans" after seeing "Queue" in a toast saying "Open Platform Backlog" will think they are looking at different features.

**Screens affected:** QueuePanel, toast notifications, HomePanel sidebar widget

---

### 2. Onboarding Steam step copy is cold and technical
The in-step status text is hardcoded: `"Enter your Steam API key and SteamID64, then import your library."` — no warmth, no explanation of why, no reassurance about privacy. Compared to the polished onboarding header, this reads like a developer note left in production.

**Screen affected:** OnboardingChecklist — Steam step

---

### 3. "Reviewing more games improves recommendations" is a dead-end promise
The Quest Queue widget on Home says this, but clicking through to Recommendations gives no visible confirmation that reviewing did anything. Users who review 20 games and see the same suggestions will feel misled.

**Screen affected:** HomePanel Quest Queue widget (line 468–471), RecommendationPanel

---

### 4. Dismissed hints are gone forever
The "What are Platform Plans?" hint in Platform Plans and the review hint in Quest Queue can be dismissed but cannot be recalled. There is no Settings toggle, no re-trigger path. A new user who dismisses too fast has no recovery short of clearing localStorage.

**Screens affected:** QueuePanel hint, ReviewModePanel hint

---

### 5. Quest Queue action cards don't explain consequences
Swiping right/left performs Drop, Wishlist, and Plan actions with no in-screen summary of what just happened after each card. The completion screen is the only feedback, and only appears at the end of a full batch session.

**Screen affected:** ReviewModePanel

---

### 6. Quest Queue completion screen lacks a clear primary CTA
After reviewing all games, the completion state shows session stats — but it is not immediately clear what to do next. Users who finish reviewing may not realise their Platform Plans just filled up and are waiting for them.

**Screen affected:** ReviewModePanel — ReviewComplete component

---

### 7. WorkflowOrientationStrip uses stiff phrasing
Shipped in Wave 2. `'What you are actively playing.'` reads like machine translation. Should be `'What you're actively playing.'`

**Screen affected:** HomePanel — WorkflowOrientationStrip

---

## Should Fix Before Alpha

### 8. Onboarding doesn't distinguish required from optional steps
Steam Connect is optional (Skip exists) but is visually identical to required steps. New users without a Steam account will feel like they are failing setup rather than simply skipping an optional integration.

**Screen affected:** OnboardingChecklist

---

### 9. Home greetings give no direction when counts are zero
If a user has 0 games queued and 0 currently playing, the greeting falls back to a generic string with no forward direction. The Home screen should orient a new user, not just greet them.

**Screen affected:** HomePanel — greeting logic

---

### 10. "Send pool to Quest Queue" uses unexplained terminology
"Pool" does not appear anywhere else in the UI. Users do not know what they are sending or where. Should use established vocabulary consistent with the rest of the app.

**Screen affected:** RecommendationPanel — toolbar action menu

---

### 11. Platform Plans active game limit has no help text
The "Future active limit" input field has no tooltip or explanation. Power users will understand; everyone else will ignore it or set it incorrectly and not know why games stop moving.

**Screen affected:** QueuePanel — per-platform settings

---

### 12. Sync failure produces no visible feedback
Steam achievement sync and playtime refresh can fail silently. The maintenance sheet closes, nothing updates, and no error state is shown. Users will assume the feature is broken or that the app is unreliable.

**Screen affected:** HomePanel — SyncMaintenanceSheet

---

### 13. "Reroll recommendation" has no mental model anchor
"Reroll" is a tabletop/RPG term. Users outside that context will wonder if clicking it deletes something or resets their preferences. The action needs a plain-language label or tooltip.

**Screen affected:** RecommendationPanel — toolbar

---

### 14. WorkflowOrientationStrip has no auto-dismiss logic
It is designed as a one-time orientation aid but shows to every library user until manually dismissed. There is no logic to suppress it after the user has clearly oriented themselves (e.g. visited all four main sections). Users who reset localStorage will see it again indefinitely.

**Screen affected:** HomePanel — WorkflowOrientationStrip

---

## Can Wait Until Beta

### 15. Recommendations feature feels nascent overall
Filtering by mood, platform, and available time works, but the pool logic is never explained. It functions as a nice-to-have bonus rather than a core feature. Acceptable for alpha.

### 16. Stats display is read-only and light
No editing, export, or deeper insights beyond game counts. Additive for alpha; not a perceived gap.

### 17. Retro ROM import is clearly marked experimental
The onboarding step is labeled optional and the copy is honest about limitations. Acceptable to ship.

### 18. Czech translations may lag on new Wave 2 strings
A few new strings added in Wave 2 are correctly translated, but edge cases in toasts may remain English-only in the Czech locale. Unlikely to affect early alpha testers.

### 19. No empty state for zero platforms AND zero library games
Brand-new users who skip Steam and visit Platform Plans immediately land in a dead end. Not a crash, but a low-confidence moment. Low priority since the onboarding flow steers users away from this path.

### 20. "Next milestone" card on Home is one-dimensional
`"Review X more games"` is the only milestone type. At high game counts this card becomes meaningless. Not an alpha concern.

---

## Feature Areas by Perceived Completeness

| Feature | Status |
|---|---|
| Library (import, browse, filter) | Ready |
| Quest Queue (triage, decisions) | Ready with minor copy gaps |
| Platform Plans (backlog per platform) | Ready — naming consistency needed |
| Playing Now (active game tracking) | Ready |
| Home (dashboard, orientation) | Ready — stiff phrase in new strip |
| Onboarding | Near-ready — Steam step copy needs warmth |
| Wishlist + Deals | Functional — no loading state during sync |
| Recommendations | Feels early — "pool" copy and reroll confuse |
| Sync (Steam achievements, playtime) | Fragile — silent failures undermine trust |
| Settings | Functional — advanced features lack help text |
