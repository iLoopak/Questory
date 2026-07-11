# Taste Profile

Taste Profile, shown in the UI as Gaming DNA, is Questory's editable preference model for recommendations. It is not a standalone recommendation engine. It is a user-controlled layer that helps Home, Discover, Discovery Inbox, contextual recommendations, and the release calendar interpret what the player tends to love, avoid, or want right now.

## Data Layers

Taste Profile is stored under `questshelf.tasteProfile.v1` and has three layers:

- `observed`: inferred from the game library, wishlist, play behavior, ratings, status, and recommendation feedback.
- `explicit`: corrections the user intentionally made, such as confirming a signal, adding a taste manually, or saying a signal is actually the opposite.
- `temporary`: short-lived interests for the current mood.

Recommendation scoring reads active signals only. Hidden, rejected, or expired signals are ignored.

## Triage Semantics

The triage UI intentionally separates "this inference is wrong" from "I want the opposite":

- `Not accurate`: suppresses the inferred signal. It hides/rejects that signal and does not create an opposite preference.
- `Dislike this` / `Actually like this`: creates an explicit opposite correction and hides the source inferred signal.
- `Yes`: promotes an observed signal into an explicit confirmed preference.
- `Pin`: keeps the signal visible and high priority without changing its sentiment.

This prevents a mistaken inference from becoming a strong negative or positive preference unless the user explicitly says so.

## Reset Semantics

Taste Profile has three distinct reset behaviors:

- `Recompute inferred taste`: rebuilds the observed layer from current games and recommendation feedback. Explicit and temporary layers are preserved.
- `Clear inferred taste`: clears the observed layer and pauses automatic inference. Observed signals stay empty until the user explicitly recomputes.
- `Reset all Taste Profile data`: clears observed, explicit, temporary, and prompt state.

The global Reset local data action is broader. It clears the Discovery Inbox, skipped/deferred inbox queues, recommendation feedback, recommendation exposure/fatigue, Taste Profile, and generated recommendation/release caches.

## Backup And Restore

Backup import has two modes:

- Replace restore: replaces backed-up user data and clears generated recommendation state.
- Merge restore: merges games and user-authored state, but does not merge generated inbox/cache/exposure state.

Taste Profile merge preserves explicit and temporary corrections from both local and backup data, then recomputes the observed layer from the merged game library. Generated Discovery Inbox state and recommendation exposure are disposable and are not imported.

## Stale Async Protection

Reset and restore invalidate in-flight Discovery Inbox and personal recommendation requests. If an older async request completes after reset, it is prevented from writing stale inbox, cache, or exposure state back into storage.

## Verification

Focused regression coverage lives in:

- `scripts/recommendations.test.ts`: Taste Profile triage, reset, recompute, and scoring semantics.
- `scripts/backupStorage.test.ts`: reset local data, replace restore, merge restore, and generated state cleanup.

