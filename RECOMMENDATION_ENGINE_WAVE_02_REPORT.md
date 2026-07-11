# Recommendation Engine Wave 2 Report

## 1. Executive summary

Wave 2 moves the shared personal recommendation engine from basic bounded overlap toward a relevance model that is normalized by dimension, resistant to weak backlog volume, and more transparent in diagnostics. Home, Discover, and Discovery Inbox remain on the same live service introduced in Wave 1.

The main changes are:

- Bounded score dimensions for genre, tag, developer, franchise/series, platform, seed similarity, quality, recency, negative taste, and source adjustment.
- Compressed profile frequency weights so hundreds of weak owned/planned games cannot drown out a few strongly liked games.
- Stronger positive weighting for demonstrated preference: favorites, 5-star and 4-star finished games, meaningful playtime, and currently playing games.
- Bounded negative modeling for low-rated finished and dropped games across genres, tags, developers, and repeated franchise evidence.
- Deterministic, diversified seed selection using signal strength, rating, playtime, activity recency, metadata completeness, and stable IDs.
- Similar-game requests now use the diversified seed set, and a bounded RAWG series stage uses the strongest seed anchors.
- Recommendation reasons now prefer actual strongest distinctive score signals.

## 2. Wave 1 baseline verified

Verified in the current code after the Wave 1 merge:

- Home, Discover, and Discovery Inbox import `usePersonalizedRecommendations` / `fetchPersonalRecommendationsResult` from the shared advanced service path.
- The old `src/lib/personalizedRecommendations.ts` has no production callers and remains only for legacy focused tests.
- `buildUserProfile` suppresses internal/storefront/plumbing tags before profile scoring.
- The hook and service share `profileFingerprint`.
- Backup restore/merge/reset clear personal recommendation caches.
- Recommendation cache uses `questshelf.personalRecommendations.v2`.

`RECOMMENDATION_ENGINE_WAVE_01_REPORT.md` was requested as input but is not present in this checkout. I verified Wave 1 behavior directly from the merged implementation and `RECOMMENDATION_ENGINE_AUDIT.md`.

## 3. Final scoring model

Each candidate receives:

```text
total =
  genre affinity
+ tag affinity
+ developer affinity
+ franchise/series affinity
+ platform affinity
+ seed similarity
+ candidate quality
+ recency
+ negative taste penalty
+ source adjustment
```

The model uses normalized overlap against top profile signals. Raw profile frequency is compressed with `log1p(weight) * 4` before ranking signals, so volume helps but does not grow without bound.

## 4. Score dimension caps and rationale

- Genre affinity: 0-50. Broad but important taste axis; broad genres receive lower information value.
- Tag affinity: 0-36. Distinctive tags are specific enough to matter, but cannot dominate every other dimension.
- Developer affinity: 0-18. Strong enough for repeated studio preference, bounded to avoid one studio taking over.
- Franchise/series affinity: 0-18. Requires repeated profile evidence unless the candidate came from a RAWG series endpoint.
- Platform affinity: 0-10. Helps fit user hardware without becoming a taste proxy.
- Seed similarity: 0-24. Rewards candidates close to strong anchors without making a single seed decisive.
- Quality: 0-12. Combines Metacritic, RAWG rating, and rating-count confidence.
- Recency: 0-4. Small freshness nudge only.
- Negative penalty: 0 to -40. Strong enough to matter, bounded so one dislike cannot erase multiple positive signals.
- Source adjustment: -8 to +8. Labels fallback/trending/source confidence without replacing relevance.

## 5. Positive taste weighting

`getRecommendationSignalWeight` now reflects demonstrated preference:

- Favorites and 5-star finished games are strongest.
- 4-star finished games, currently playing games, and high playtime are strong but bounded.
- 3-star finished games are weakly positive.
- Wishlist and planned games shape intent, but are weaker than proven enjoyment.
- Ownership alone is only a tiny signal.

## 6. Negative taste weighting

Low-rated finished games and dropped games create negative genre, tag, developer, and franchise signals. Negative overlap is scored independently by dimension and capped. Repeated distinctive dislikes increase the penalty, while one disliked broad-genre game does not suppress an entire genre when stronger liked distinctive evidence exists.

## 7. Seed-selection algorithm

Seeds are selected from positive, RAWG-linked games only. Low-rated and dropped games are excluded.

Ranking order:

1. Positive signal strength
2. Rating
3. Playtime
4. Meaningful activity recency
5. Metadata completeness
6. Stable ID/title key

## 8. Seed diversification strategy

The selector first chooses at most one seed per meaningful taste cluster, then fills remaining slots by rank. Clusters prefer distinctive tags, then repeated series keys, then primary genre, then developer, then platform. The live engine selects up to eight seeds, queries similar games for the strongest six, and queries RAWG series for the strongest three.

## 9. Developer affinity

Developer names are normalized consistently and scored via bounded overlap. Repeated liked developers increase scores, and dropped/low-rated developer overlap contributes bounded negative penalties. Developer candidate generation by RAWG query was not added because the current API wrapper does not expose a reliable developer lookup/id search path; scoring is implemented safely where RAWG results contain developer metadata.

## 10. Franchise / series affinity

Profile franchise affinity uses conservative normalized series keys and only activates for repeated positive or negative evidence. RAWG `/game-series` candidates receive bounded series affinity through their source context. This avoids relying solely on one liked title while still rewarding reliable series responses.

## 11. Candidate-generation changes

- Similar-game stage now uses diversified seeds instead of arbitrary first seeds.
- Similar-game requests are capped to six seed anchors and twelve results per seed.
- Series requests are capped to three seed anchors and eight results per seed.
- Seed diagnostics record selected and skipped seeds with cluster and reason.
- One seed cannot dominate because candidate stages dedupe IDs and the existing source/genre diversity limits still apply.

## 12. Recommendation reason changes

Reasons now prefer supported score signals:

- Series affinity when the candidate comes from a enjoyed series.
- Developer affinity when developer score is strong.
- Seed similarity for strong similar-game candidates.
- Distinctive tag preferences before broad genre wording.
- Quality wording only when quality contribution is high.

Internal tags and generic plumbing tags are not used in reasons.

## 13. Diagnostic changes

Development diagnostics now include:

- Per-candidate normalized score breakdown.
- Positive genre, tag, developer, and franchise matches.
- Negative genre, tag, developer, and franchise matches.
- Seed/source influence.
- Selected and skipped seed diagnostics.
- Top positive and negative profile signals.
- Score distribution before final selection.

Diagnostics remain development-only and do not change ordering.

## 14. Tests added or updated

Added focused coverage for:

- Score dimension caps.
- Distinctive tags beating broad/generic matches.
- Highly rated games outweighing hundreds of weak backlog signals.
- Low-rated and dropped negative overlap.
- Broad disliked genres not over-suppressing distinctive positive matches.
- Mixed positive/negative score transparency.
- Deterministic seed ranking, rating/playtime tie behavior, and exclusion of low-rated seeds.
- Seed cluster diversification and bounded seed counts.
- Developer positive and negative affinity.
- Repeated-evidence franchise affinity and cap behavior.
- Recommendation reasons using real distinctive signals and excluding generic/internal tags.

## 15. Commands run and results

- `npm test`: passed, 94/94 tests.
- `npm run build`: passed. Vite still reports the pre-existing large chunk warning.

## 16. Anonymized real-library before/after comparison

The private local backup path `.local-data/questory-backup.json` was not present in this checkout, so no real-library replay was possible here.

Expected aggregate behavior is covered by synthetic tests:

- Weak backlog volume no longer outranks highly rated focused taste signals.
- Low-rated and dropped overlap creates bounded penalties.
- Selected seeds are deterministic and cluster-diversified rather than import-order driven.
- Generic/internal tags cannot appear in top taste tags or recommendation reasons.

## 17. Known limitations

- Developer query generation was not implemented because the current RAWG wrapper does not safely expose developer lookup identifiers.
- Franchise affinity uses repeated normalized series keys and RAWG series-source context; richer explicit franchise metadata would be more reliable.
- Diagnostics intentionally avoid dumping full library contents.
- The old `src/lib/personalizedRecommendations.ts` remains for legacy tests only.

## 18. Remaining Wave 3 work

- Result-level franchise/genre saturation beyond the existing lightweight diversity filter.
- Broader fallback redesign.
- More robust explicit franchise metadata storage.
- Optional developer candidate generation after reliable RAWG developer identifiers are available.
- UI polish for diagnostics if deeper local tuning is needed.

## 19. Manual verification checklist

- Home and Discover use the same ordered shared recommendation IDs.
- Discovery Inbox request-more path uses the same service.
- Refresh bypasses the cache.
- Owned, wishlist, planned, resolved, and inbox games are excluded.
- Reasons do not mention internal tags.
- Dev diagnostics show score dimensions and seeds.
- Real-library replay should be run when `.local-data/questory-backup.json` is available.
