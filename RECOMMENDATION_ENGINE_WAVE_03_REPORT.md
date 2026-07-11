# Recommendation Engine Wave 3 Report

## 1. Executive summary

Wave 3 adds a deterministic final selection layer on top of the Wave 2 scoring model. The recommendation engine still scores candidates by personalized relevance first, then applies a bounded reranking pass that keeps the final shelf from being dominated by one genre, franchise, developer, source, seed, fallback tier, or near-duplicate edition.

The main implementation is in `src/services/personalRecommendationsService.ts`, with focused regression coverage in `scripts/recommendations.test.ts`.

## 2. Wave 2 baseline verified

Wave 2's normalized scoring model remains in place:

- Positive and negative genre, tag, franchise, developer, platform, quality, recency, source, seed, and ownership signals are still calculated before final selection.
- Deterministic seed selection remains the upstream source of personalized candidate generation.
- The same `fetchPersonalRecommendationsResult` path continues to feed both recommendation surfaces through `usePersonalizedRecommendations`.

`RECOMMENDATION_ENGINE_WAVE_01_REPORT.md` was not present in the checkout during this pass. `RECOMMENDATION_ENGINE_WAVE_02_REPORT.md` was present and used as the immediate implementation baseline.

## 3. Final diversity-selection architecture

Wave 3 replaces the earlier simple genre/source filter with `selectFinalRecommendationCandidates`. The selector receives already-scored candidates and returns:

- the selected candidates in stable final order;
- final-selection diagnostics for selected and rejected candidates;
- before/after counts by source, primary genre, franchise, developer, fallback tier, and taste cluster;
- duplicate suppression records;
- relaxation steps used.

This keeps final diversity decisions separate from core relevance scoring.

## 4. Reranking algorithm

Candidates are first sorted by Wave 2 score and stable RAWG ID tie-breakers. The final selector then greedily chooses candidates using a bounded adjusted score:

- repeat primary genre: `-4`
- repeat franchise: `-6`
- repeat developer: `-3`
- source already represented several times: `-3`
- repeat seed: `-4`
- broad fallback: `-10`
- new taste cluster: `+4`

The original relevance score remains the dominant signal. Very weak candidates are not promoted only to satisfy diversity.

## 5. Genre saturation rules

Primary genre is capped during final selection:

- initial cap: 3 per primary genre;
- relaxed cap: 4 per primary genre when the shelf cannot otherwise fill.

Unknown genre metadata is not treated as a shared genre bucket.

## 6. Franchise saturation rules

Franchise keys are capped during final selection:

- initial cap: 2 per franchise;
- relaxed hard cap: 3 per franchise.

The logic uses the existing franchise normalization and avoids grouping unrelated unknown titles into invented franchises.

## 7. Developer saturation rules

Developer keys are capped during final selection:

- initial cap: 2 per developer;
- relaxed cap: 3 per developer.

Very broad platform-holder/publisher-like developer names are ignored for this cap so they do not create noisy grouping.

## 8. Source balancing

Candidate sources are collapsed into stable source categories:

- seed;
- affinity;
- intent;
- fallback.

The source cap starts at 5 and relaxes to 7 if needed. This prevents one collection strategy from filling the entire shelf while still allowing enough candidates when the pool is narrow.

## 9. Seed balancing

Seed-derived recommendations track the originating seed stable key. The seed cap starts at 2 and relaxes to 3, preventing one liked game from producing most of the final recommendations.

## 10. Near-duplicate suppression

The final selector suppresses duplicates before cap decisions:

- exact duplicate RAWG IDs keep the stronger or richer candidate;
- edition-like title duplicates are collapsed using an edition-normalized title;
- sequels remain separate because sequel numerals remain part of the canonical title.

Suppressed duplicates are emitted in final-selection diagnostics.

## 11. Taste-cluster diversity

The selector derives lightweight taste clusters from distinctive positive tags and genres. Examples include turn-based RPG, deckbuilder, soulslike, metroidvania, top distinctive tags, and top genres.

Candidates that introduce a new taste cluster receive a small bounded bonus. This is intentionally smaller than the base relevance score so it broadens strong shelves without turning the selector into random variety.

## 12. Fallback waterfall

Fallback tiers are now explicit:

- `tier0-personalized`: strong seed, tag, developer, or franchise personalization;
- `tier1-taste-quality`: personalized candidate with weaker direct anchors;
- `tier2-adjacent`: broad-discovery candidate with some taste overlap;
- `tier3-broad`: trending or broad fallback.

Tier 3 broad fallback receives a penalty and fallback candidates are capped, so generic popular games fill gaps but do not dominate a personalized shelf.

## 13. Cap-relaxation strategy

The selector fills the shelf through deterministic relaxation steps:

1. soft caps: genre 3, franchise 2, developer 2, source 5, seed 2, fallback 2, minimum score 10;
2. relax source and seed caps: source 6, seed 3;
3. relax developer caps: developer 3, minimum score 8;
4. relax genre caps: genre 4, fallback 3;
5. relax franchise hard cap: franchise 3, source 7, seed 3, fallback 3, minimum score 4.

This makes saturation behavior predictable while still returning enough recommendations for sparse libraries.

## 14. Stability behavior

The final selector uses deterministic sorting and stable tie-breakers:

- score descending;
- RAWG ID ascending;
- title as the last tie-breaker.

Tests verify identical input sets produce the same final order even when the incoming array order changes.

## 15. Recommendation reason changes

The user-facing recommendation reason remains based on Wave 2 scoring signals. Wave 3 does not rewrite public prose. Instead, final selection decisions are added to diagnostics so the UI can later expose or debug diversity decisions without changing current copy.

## 16. Diagnostic changes

`RecommendationCandidateDiagnostics` now includes:

- original score;
- final selection score;
- diversity adjustment;
- primary genre;
- franchise;
- developer;
- taste clusters;
- primary seed;
- cap decisions;
- relaxation step;
- selection reason.

The debug report now includes a `finalSelection` object with aggregate before/after counts and duplicate suppression records.

## 17. Tests added or updated

New regression coverage was added for:

- primary genre caps;
- preserving high-relevance candidates over weak diversity-only candidates;
- franchise and developer caps;
- unknown franchise/developer metadata not grouping unrelated titles;
- source and seed balancing;
- fallback capping and broad fallback labeling;
- near-duplicate edition suppression while preserving sequels;
- deterministic final selection independent of input order.

## 18. Commands run and results

- `npm test`: passed, 102/102 tests.
- `npm run build`: passed. Vite emitted the existing large chunk warning.

## 19. Anonymized real-library before/after comparison

The private backup verification could not be run because `.local-data/questory-backup.json` is not present in this checkout.

Expected before/after behavior from deterministic fixtures:

- before Wave 3, a high-scoring single genre/source/seed could dominate the final shelf;
- after Wave 3, the shelf preserves the strongest candidates while capping repeated genre, franchise, developer, source, seed, and fallback patterns;
- near-duplicate editions are collapsed before final selection, while sequels remain eligible.

## 20. Known limitations

- Franchise detection still depends on title/slug heuristics, so some series names may be missed or over-normalized.
- Developer grouping uses the first developer only.
- Taste clusters are intentionally lightweight and based on existing tag/genre metadata.
- The selector records diagnostics but does not yet expose final-selection explanations in the UI.
- Real-library validation remains pending until a private backup file is available.

## 21. Remaining Wave 4 hygiene or UX work

- Add UI-facing debug tooling for final-selection reasons.
- Consider a private, anonymized regression fixture once backup data is available.
- Tune franchise and developer normalization with real examples.
- Evaluate whether final diversity diagnostics should be visible in admin/dev panels only.
- Consider richer taste-cluster extraction from longer-term profile history.

## 22. Manual verification checklist

- Open Home recommendations and confirm the shelf is not dominated by one genre, franchise, developer, or seed.
- Open Discover recommendations and confirm it uses the same recommendation behavior as Home.
- Confirm known liked-game series still surface, but do not fill the whole shelf.
- Confirm generic trending fallback appears only when personalized candidates are sparse.
- Confirm repeated editions collapse and sequels can still appear.
- Confirm diagnostic output includes `finalSelection` when recommendation debug mode is enabled.
