/**
 * AS-17: compile-time guards. This file is never imported at runtime; `tsc -b tsconfig.app.json`
 * (i.e. `npm run build`) is what checks it. Each `@ts-expect-error` fails the build if the payload it
 * marks ever STOPS being an error — so the contract cannot quietly loosen back into accepting exact
 * counts, undeclared properties or unknown events.
 */
import { buildAnalyticsEvent, trackAnalyticsEvent } from './client';

// A correct payload, for contrast.
trackAnalyticsEvent('discovery_recommendations_requested', {
  source: 'discovery_inbox',
  requested_count_bucket: '6_10',
  returned_count_bucket: '1_5',
});

// @ts-expect-error an exact count is not a bucket — the privacy rule, enforced by the compiler.
trackAnalyticsEvent('discovery_recommendations_requested', { source: 'discovery_inbox', requested_count_bucket: 10, returned_count_bucket: 4 });

// @ts-expect-error an undeclared property is not part of any event's contract.
trackAnalyticsEvent('discover_section_opened', { section: 'recommendations', gameTitle: 'Hades' });

// @ts-expect-error a required property may not be omitted.
trackAnalyticsEvent('recommendation_feedback', { surface: 'discover' });

// @ts-expect-error a value outside the declared enum is not accepted.
trackAnalyticsEvent('recommendation_feedback', { surface: 'discover', feedback_type: 'loved_it', source_category: 'affinity', fallback_tier: 'none', rank_bucket: 'top', engine_version: '5.0.0', scoring_version: '5.0.0' });

// @ts-expect-error an event that is not in the canonical registry does not exist.
trackAnalyticsEvent('recommendation_liked', { surface: 'discover' });

// @ts-expect-error the rank is a bucket, never the index of the card the user pressed.
buildAnalyticsEvent('recommendation_feedback', { surface: 'discover', feedback_type: 'hide', source_category: 'seed', fallback_tier: 'none', rank_bucket: 2, engine_version: '5.0.0', scoring_version: '5.0.0' });
