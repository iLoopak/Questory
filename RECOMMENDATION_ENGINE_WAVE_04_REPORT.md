# Recommendation Engine Wave 4 Report

## 1. Executive summary

Wave 4 focused on cleanup and hardening rather than another recommendation-quality redesign. The work added a shared recommendation state model, schema-validated personal recommendation cache entries, shared in-flight request reuse, stale-response protection, partial stage-failure handling, detail-page convergence on the canonical taste utilities, restore cache cleanup, privacy-safe aggregate telemetry, development performance diagnostics, and canonical architecture documentation.

## 2. Baseline verified

The current post-Wave-3 implementation was inspected directly. Home, Discover, and Discovery Inbox already use `fetchPersonalRecommendationsResult`. Wave 1 and Wave 2 reports were not present in this checkout; Wave 3 was present and matched the current final-selection implementation.

## 3. Obsolete code removed

The duplicate contextual recommendation tag taxonomy and custom profile-affinity scorer were removed from `contextualRecommendationsService.ts`. Detail recommendations now reuse the canonical generic-tag, distinctive-tag, profile, franchise, and scoring utilities.

The deprecated Wave 1 compatibility module `src/lib/personalizedRecommendations.ts` and its legacy-only test file `scripts/homeRecommendations.test.ts` were removed. Production callers were already using the consolidated service.

`src/lib/recommendationEngine.ts` remains intentionally isolated for the local backlog picker UI, not the Home/Discover discovery engine.

## 4. Canonical architecture

`docs/RECOMMENDATION_ENGINE.md` is now the canonical current architecture document. Historical wave reports remain history; new development should use the doc as the starting point.

## 5. Game-detail convergence

Game-detail recommendations remain anchored to the current game, but now reuse canonical:

- user profile construction;
- generic and distinctive tag suppression;
- profile positive and negative affinity scoring;
- franchise normalization;
- title/RAWG exclusion behavior.

## 6. Readiness and UI state model

Added `src/lib/recommendationState.ts` with shared states for `notConfigured`, `hydrating`, `coldStart`, `loading`, `ready`, `partial`, `empty`, `error`, and `stale`.

Home and Discover now consume the shared state/copy model instead of hardcoding incompatible empty-state wording.

## 7. Cache schema and lifecycle

Personal recommendation cache entries now include an explicit schema version and expiry time. Cached entries are validated before use and discarded safely when malformed, incompatible, expired, or missing required candidate display fields.

Force refresh still bypasses cache. Invalid cache does not partially hydrate recommendations.

## 8. Backup restore behavior

Backup restore, merge restore, and full reset now clear both the personal recommendation cache and the contextual recommendation in-memory cache. This prevents pre-restore personal/detail recommendations from surviving a library replacement.

## 9. Concurrency and request deduplication

The personal recommendation service now reuses identical in-flight requests. The React hook tracks request IDs so stale async responses cannot overwrite newer results.

## 10. Offline and partial-failure behavior

Candidate stages now fail independently. A failed RAWG stage is recorded as a partial failure and does not discard successful candidates from other stages.

The engine can still backfill from stale cache when the existing policy allows it.

## 11. Runtime diagnostics

Development diagnostics now include cache status, partial failure count, and aggregate performance timings for profile build, cache reads/writes, candidate stages, final diversity selection, and total generation.

## 12. Optional telemetry

Added `recommendation_generation_completed` to the consent-gated analytics schema. It records only aggregate buckets/categories: outcome, result-count bucket, duration bucket, cache status, partial-failure bucket, and fallback tier.

No titles, RAWG IDs, Steam IDs, tags, seeds, fingerprints, URLs, or secrets are emitted.

## 13. Performance findings

No private large-library backup was available, so only automated fixture performance was verified. The service now records timings in development diagnostics to support future local profiling.

## 14. Accessibility findings

The Home refresh control already has an accessible label. Development diagnostics remain inside a native `details`/`summary`, which is keyboard accessible. No broad UI redesign was performed.

## 15. Responsive/device findings

No browser/device matrix was run in this pass. The existing Home horizontal shelf and Discover responsive grid were left structurally unchanged.

## 16. Data-contract cleanup

Canonical personal recommendation source, scored-candidate, and fallback-tier types are now exported from the personal recommendation service so other recommendation surfaces can avoid duplicate unions.

## 17. Documentation changes

Added `docs/RECOMMENDATION_ENGINE.md`.

## 18. Tests added or updated

Added tests for:

- shared readiness/state interpretation;
- cache schema validation and malformed payload rejection;
- analytics schema coverage for the new aggregate recommendation telemetry event.

Existing contextual, scoring, final-selection, backup, and recommendation tests continue to run through the same suite.

## 19. Commands run and results

- `npm test`: passed, 99/99 tests.
- `npm run build`: passed. Vite emitted the existing large-chunk warning.

## 20. Anonymized real-library verification

`.local-data/questory-backup.json` was not present in this checkout, so private real-library verification could not be run.

## 21. Known limitations

- Personal recommendation cache storage key remains `questshelf.personalRecommendations.v2`; compatibility is enforced by payload schema version rather than a new key name.
- Restore cleanup is triggered synchronously for in-memory contextual state and asynchronously for IndexedDB personal cache cleanup.
- Game-detail recommendations still use a detail-specific score shape because current-game similarity is intentionally primary.
- Browser/device responsive verification was not automated in this pass.

## 22. Remaining future work

- Add controlled async tests for in-flight request dedupe with mocked RAWG delays.
- Add an anonymized private regression fixture when a safe local backup is available.
- Consider surfacing partial/stale state visually in Discover beyond empty-state copy.
- Add browser-level accessibility checks for recommendation shelves.

## 23. Manual verification checklist

- Home and Discover show the same ordered personal recommendation IDs for the same profile.
- RAWG-not-configured copy is consistent.
- Cold-start copy is consistent.
- Detail recommendations do not promote games from disliked tags/genres.
- Backup restore does not briefly show pre-restore recommendation results.
- Rapid Home/Discover route changes do not duplicate visible fetch work.
- Telemetry remains silent without analytics consent.
- Production UI does not show debug diagnostics.
