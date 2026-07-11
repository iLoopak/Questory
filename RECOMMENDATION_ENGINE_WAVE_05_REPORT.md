# Recommendation Engine Wave 5 Report

## 1. Executive summary

Wave 5 adds the first user-feedback and calibration layer on top of the stabilized recommendation engine. It introduces explicit feedback actions, persisted feedback storage, limited recommendation controls, bounded exploration and fatigue behavior, local outcome attribution, quality metrics, synthetic benchmark profiles, versioned engine/scoring constants, calibration tooling, and privacy-safe telemetry schema coverage.

## 2. Post-Wave-4 baseline verified

The current code uses the shared personal recommendation service for Home, Discover, and Discovery Inbox. Detail recommendations remain contextual but use canonical profile/tag/scoring utilities. Wave 1 and Wave 2 reports were not present in this checkout; Wave 3, Wave 4, and `docs/RECOMMENDATION_ENGINE.md` were present.

## 3. Quality metrics defined

`docs/RECOMMENDATION_ENGINE.md` now documents quality metrics for coverage, relevance proxies, diversity, stability/freshness, and confidence. `src/lib/recommendationQuality.ts` computes aggregate quality summaries for development diagnostics.

## 4. Recommendation feedback model

Feedback types are distinct:

- `hide`: exact-game hide only.
- `not_interested`: exact exclusion plus mild bounded metadata penalty.
- `less_like_this`: exact exclusion plus stronger bounded metadata penalty.
- `already_played`: exact exclusion without dislike semantics.
- `more_like_this`: bounded positive signal where used.

## 5. Feedback persistence and restore behavior

Feedback is stored in `questshelf.recommendationFeedback.v1`, schema-normalized, and included in backups. Transient exposure/fatigue records live in `questshelf.recommendationExposure.v1` and are not backed up.

## 6. Feedback integration into scoring

The personal engine excludes exact hidden/already-played candidates and applies bounded metadata penalties/bonuses for broader feedback. Feedback is included in the recommendation fingerprint so shelves refresh safely after user feedback.

## 7. User-facing feedback actions

Discover recommendation cards now expose feedback in the existing overflow menu:

- Not interested
- Show less like this
- Already played
- Hide recommendation

The selected item is removed immediately and the recommendation cache is cleared.

## 8. Personalization controls

Settings now includes a compact recommendation preferences section with:

- Familiar / Balanced / Exploratory discovery style
- Prefer newer releases
- Reduce franchise repetition
- Reset recommendation cache
- Reset feedback
- Undo recent feedback

No duration control was added because RAWG list candidates do not provide reliable duration data.

## 9. Exploration behavior

Exploration remains bounded and taste-connected. Broad-discovery candidates only receive exploratory treatment when they still match at least one meaningful taste dimension. Familiar mode penalizes adjacent exploration; Exploratory mode gives it a small bounded bonus.

## 10. Exposure and fatigue behavior

Returned shelves record local exposure counts. Repeated exposure after several appearances adds a bounded fatigue penalty, allowing comparable alternatives to rotate without random shelf churn.

## 11. Outcome attribution

Local exposure records can now be marked when a recommendation is promoted to Wishlist, Plans, or Library from Discover or Discovery Inbox. This is local attribution only and does not claim causation.

## 12. Synthetic benchmark suite

Added `src/lib/recommendationBenchmarks.ts` with 14 synthetic benchmark profiles covering small libraries, imported backlogs, JRPG/turn-based, soulslike, strategy/management, eclectic, dropped/low-rated, wishlist/plans, platform profiles, sparse metadata, franchise preference, negative franchise preference, and conflicting signals.

## 13. Golden quality assertions

Tests now assert benchmark profile properties, feedback normalization semantics, cache validation, and reduced-franchise final-selection behavior.

## 14. Versioning strategy

Added explicit versions in `src/lib/recommendationConfig.ts`:

- engine version: `5.0.0`
- scoring version: `5.0.0`
- cache schema version: `3`

These are used in diagnostics, feedback, fingerprints, and telemetry schema.

## 15. Central configuration

`src/lib/recommendationConfig.ts` centralizes cache TTL, attribution window, feedback weights, fatigue penalties, exploration bounds, and version constants.

## 16. Calibration tooling

Added `scripts/recommendation-calibration.mjs`. It reports aggregate synthetic benchmark summaries and, if `.local-data/questory-backup.json` exists, private backup aggregate counts only.

## 17. Optional telemetry changes

Added consent-gated `recommendation_feedback` telemetry with only categorical fields: surface, feedback type, source category, fallback tier, rank bucket, engine version, and scoring version.

No titles, IDs, tags, developers, franchises, fingerprints, account IDs, URLs, or secrets are sent.

## 18. Tests added or updated

Updated tests for:

- recommendation feedback normalization;
- synthetic benchmark profile properties;
- reduced franchise repetition preference;
- telemetry schema coverage for recommendation feedback.

## 19. Commands run and results

- `npm test`: passed, 102/102 tests.
- `npm run build`: passed. Vite emitted the existing large-chunk warning.
- `node scripts/recommendation-calibration.mjs`: passed; private backup was not present.

## 20. Anonymized real-library calibration

`.local-data/questory-backup.json` was not present, so private calibration could not run. The calibration script reported only synthetic benchmark aggregates and `privateBackup.present=false`.

## 21. Known limitations

- Feedback actions are currently exposed in Discover cards; Home receives the engine effect after refresh but does not show its own compact feedback menu.
- Outcome attribution currently covers promotion to Wishlist, Plans, and Library, not later Finished/Dropped transitions.
- Exposure fatigue is local-only and not backed up by design.
- Duration preference was intentionally not implemented because candidate payloads lack reliable duration.

## 22. Future tuning process

Future scoring changes should:

- update `recommendationConfig.ts`;
- bump scoring version for weight changes;
- run synthetic benchmarks;
- optionally run private calibration locally with aggregate-only output;
- add property assertions before changing production weights.

## 23. Manual verification checklist

- Open Discover and submit each feedback type from a recommendation overflow menu.
- Confirm the exact game disappears immediately.
- Refresh recommendations and confirm hidden/already-played games do not return.
- Submit "Show less like this" and confirm related candidates are reduced but broad genres are not wiped out.
- Toggle Familiar/Exploratory and confirm adjacent broad-discovery share changes conservatively.
- Toggle reduced franchise repetition and confirm series clustering decreases.
- Open Settings -> Personalization and undo feedback.
- Confirm telemetry stays disabled without analytics consent.
- Confirm production UI does not show development diagnostics.
