# Recommendation Engine Architecture

This is the canonical implementation note for Questory recommendations. Historical wave reports remain useful context, but this document describes the current system.

## Data flow

Home, Discover, and Discovery Inbox use `fetchPersonalRecommendationsResult` from `src/services/personalRecommendationsService.ts`. The hook `usePersonalizedRecommendations` applies the shared readiness model and reuses the same service result across mounted surfaces.

Game-detail "Because You Liked This" recommendations use `fetchContextualRecommendations`. They remain anchored to the current game, but reuse the canonical user profile, generic-tag suppression, negative affinity scoring, RAWG slug handling, and exclusion behavior.

Release calendar recommendations use their own date-window ranking because the product question is different: upcoming games rather than evergreen discovery.

## Taste profile

`src/lib/userProfile.ts` owns the canonical profile builder:

- positive and negative game signals;
- generic tag suppression;
- distinctive tag weighting;
- genre, tag, developer, franchise, platform, quality, and recency inputs;
- shared profile fingerprinting.

No Home or Discover component builds a separate taste profile.

## Candidate generation and scoring

The personal engine builds candidates from seed similarity, series, affinity, planned/wishlist intent, recent activity, second-order suggestions, broad discovery, and trending fallback. Candidates are scored with bounded dimensions, then passed through deterministic final selection.

The detail engine fetches current-game suggested, series, tag-pool, and genre-pool candidates. Current-game similarity remains primary, while canonical profile scoring acts as a secondary reranker and negative-signal guardrail.

## Final selection

The final selector applies deterministic caps for primary genre, franchise, developer, source category, seed, fallback tier, near-duplicate editions, and taste clusters. Relaxation steps fill sparse shelves without allowing weak candidates to replace clearly stronger relevant candidates.

## Cache lifecycle

Personal recommendation cache entries live under `questshelf.personalRecommendations.v2` in IndexedDB app caches. Payloads include an explicit schema version and expiry time and are validated before use. Invalid, expired, or incompatible entries are discarded safely.

Force refresh bypasses cache. Backup restore, merge restore, and full local reset clear personal and contextual recommendation runtime state.

## Runtime state

`src/lib/recommendationState.ts` defines shared states:

- `notConfigured`
- `hydrating`
- `coldStart`
- `loading`
- `ready`
- `partial`
- `empty`
- `error`
- `stale`

Home and Discover may render different layouts, but they use the same state interpretation and user-facing copy.

## Concurrency

The hook prevents unmounted or stale request responses from overwriting newer results. The service reuses identical in-flight personal recommendation requests so Home and Discover do not duplicate generation work when they mount together.

## Diagnostics and telemetry

Development diagnostics include aggregate pipeline counts, final-selection summaries, cache status, partial-failure counts, and performance timings. Debug diagnostics may include internal candidate detail and are development-only.

Optional telemetry uses the existing consent-gated analytics client. The recommendation generation event contains only aggregate buckets and categories: no titles, IDs, user tags, seeds, fingerprints, API keys, or URLs.

## Intentional surface differences

Home: compact "Recommended for You" shelf for quick discovery.

Discover: larger personalized grid using the same personal recommendation result.

Discovery Inbox: requests batches from the same personal engine and stores user-triage state separately.

Game Detail: contextual recommendations anchored to the open game, with canonical user taste as a secondary signal.

Release Calendar: upcoming-date personalization, intentionally separate from evergreen discovery scoring.
