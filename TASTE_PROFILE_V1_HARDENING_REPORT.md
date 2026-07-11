# Taste Profile v1 Hardening Report

Date: 2026-07-11

## Scope

This pass audited the newly merged Gaming DNA / Taste Profile v1 feature on `main`, focusing on user correction semantics, reset/restore behavior, generated recommendation state, and stale async writes after cleanup.

## Findings And Fixes

- Rejection semantics were hardened. `Not accurate` now suppresses a mistaken observed signal without creating an opposite explicit preference.
- Explicit opposite corrections are now separate. The user must choose the opposite action to create a strong explicit like/dislike.
- Observed reset semantics were clarified in code:
  - recompute inferred taste rebuilds observed signals and preserves explicit/temporary layers;
  - clear inferred taste clears observed signals and pauses automatic inference;
  - reset all Taste Profile data clears every Taste Profile layer and prompt state.
- Reset local data now centrally clears generated recommendation state, including Discovery Inbox, deferred/skipped inbox queues, recommendation feedback, recommendation exposure, Taste Profile, and stale recommendation/release caches.
- Discovery Inbox and personal recommendation request flows now guard against stale async writes after reset or cache clear.
- Backup replace restore clears generated recommendation state.
- Backup merge restore preserves user-authored Taste Profile layers, recomputes observed taste from merged games, deduplicates recommendation feedback, and skips generated inbox/exposure state.
- Discovery Inbox storage now exposes a central reconciliation path and reset invalidation primitive.

## Real Library Verification

No `.local-data/questory-backup.json` file was present in this workspace during the audit, so no private-library aggregate verification was performed. The hardening was verified through deterministic fixtures and regression tests.

## Regression Coverage Added

- Rejecting observed love/avoid signals does not create opposite preferences.
- Explicit opposite correction creates the opposite explicit signal only when requested.
- Clearing inferred taste pauses automatic recomputation.
- Explicit and temporary taste layers survive recompute.
- Reset all Taste Profile data clears observed, explicit, temporary, and prompt state.
- Hidden/rejected signals do not influence recommendation scoring.
- Reset local data clears Taste Profile, Discovery Inbox, recommendation feedback/exposure, and generated caches.
- Replace restore clears disposable generated recommendation state.
- Merge restore preserves explicit/temporary Taste Profile corrections, recomputes observed taste, deduplicates feedback, and skips generated inbox/exposure state.

## Verification Commands

- `npm test`
- `npm run build`

