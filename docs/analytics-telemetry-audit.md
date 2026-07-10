# Questory anonymous telemetry schema

Optional telemetry is disabled by default. When a user opts in, the browser sends a small JSON event to `/api/telemetry`; the Vercel function validates a strict allowlist and forwards to Make.com with the server-only `QS_ANALYTICS_WEBHOOK_URL`.

## Architecture and consent

- Client: `src/lib/analytics/client.ts` builds schema-versioned events, validates them locally, rate-limits best-effort sends, and drops failures silently.
- Registry: `src/lib/analytics/types.ts` defines every event, required/optional fields, enum values, and schema version (`2`).
- Buckets: `src/lib/analytics/buckets.ts` converts exact counts/durations/errors into broad product-safe categories.
- Server: `api/telemetry.js` rejects unknown events, unknown fields, malformed enum values, oversized bodies, and privacy-sensitive field names before forwarding.
- Consent: `questshelf.analyticsSettings.v1` remains local, disabled by default, and read immediately before every send. Disabling telemetry stops new sends without a queue or backfill.

## Privacy rules

Never send game titles, provider IDs, Steam account IDs, names, email addresses, user-entered platform/collection names, free-form text, artwork/screenshot URLs, API keys, webhook URLs, backup/library contents, achievement names, raw third-party messages, or stack traces. Use booleans, enums, broad buckets, outcomes, source categories, runtime categories, and sanitized error categories only.

## Buckets

- `library_size_bucket`: `empty`, `1_25`, `26_100`, `101_300`, `301_1000`, `1000_plus`.
- General item buckets: `zero`, `1_10`, `11_50`, `51_200`, `201_500`, `500_plus`.
- Duplicate/failed buckets: `zero`, `1_10`, `11_50`, `51_plus`.
- Duration buckets: `under_2s`, `2_10s`, `10_30s`, `30_120s`, `over_120s`.
- Queue positions: `early`, `middle`, `late`.
- Safe errors: `network`, `timeout`, `authentication`, `rate_limit`, `provider_unavailable`, `invalid_response`, `parsing`, `storage`, `unsupported`, `unknown`.

## Event matrix

| Event | Trigger | Properties | Product question |
|---|---|---|---|
| `app_session_started` | First ready app session | install/runtime/library/onboarding buckets | Are PWA/browser sessions and library sizes different? |
| `onboarding_completed` / `onboarding_reset` | Onboarding outcome | completion/integration buckets | Do users complete onboarding? |
| `telemetry_enabled` / `telemetry_disabled` / `telemetry_test_sent` | Consent/test outcome | source/outcome | Is optional telemetry understandable and working? |
| `library_import_started` / `library_import_completed` | Import workflows | source/outcome/count/duration/error buckets | Which import methods are used and fail? |
| `integration_connected` | Integration setup | integration/outcome/error | Which integrations are used? |
| `sync_started` / `sync_completed` | Sync workflows | sync type/scope/outcome/count/duration/error | Where do syncs fail? |
| `game_added` / `game_status_changed` / `game_rating_saved` / `bulk_action_completed` | Game management outcomes | destination/source/status/rating/action buckets | How do users maintain libraries without identifying games? |
| `quest_queue_started` / `quest_queue_action` / `quest_queue_batch_completed` | Quest Queue workflow | source/action/count/position/duration buckets | Is Quest Queue central and what outcomes are common? |
| `quest_queue_screenshot_opened` | Screenshot engagement in queue | source | Are screenshots useful in queue decisions? |
| `platform_plan_created` / `platform_plan_updated` / `platform_plan_opened` / `platform_plan_game_reordered` | Platform Plan workflows | method/change/count/current/artwork/reorder enums | Are users creating and using plans? |
| `discover_section_opened` | Deliberate discover navigation | section | Which discovery areas matter? |
| `recommendation_impression` / `recommendation_action` | Aggregated recommendation groups/actions | surface/type/count/action/position | Which recommendation surfaces lead to action? |
| `release_calendar_generated` | Calendar generation | count/personalization/outcome | Is release calendar useful and populated? |
| `game_detail_opened` / `game_detail_section_used` / `artwork_changed` | Game detail meaningful use | source/feature booleans/section/action/artwork source | Do details, screenshots, achievements, recommendations get used? |
| `home_widget_used` / `play_today_generated` | Home dashboard actions | widget/action/outcome/candidate bucket | Which home widgets are useful? |
| `achievements_sync_completed` / `achievements_timeline_opened` | Achievement features | outcome/count/duration/source/error | Are achievement workflows reliable? |
| `backup_export_completed` / `backup_restore_completed` | Backup/restore outcome | outcome/count/duration/migration/error | Are backup and restore reliable? |
| `appearance_changed` / `library_view_changed` / `language_changed` | Product-relevant preferences | theme/view/language | Which broad UI preferences matter? |
| `operation_failed` | Safe aggregate operational failure | operation/error/recoverable/runtime | Which major operations fail most? |

## Example Make.com payloads

```json
{"schemaVersion":2,"eventName":"app_session_started","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"browser","sessionId":"ephemeral-uuid","install_mode":"browser_tab","library_size_bucket":"26_100","has_completed_onboarding":true,"telemetry_schema_version":2}
{"schemaVersion":2,"eventName":"library_import_completed","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"browser","source":"steam","outcome":"success","imported_count_bucket":"51_200","duplicate_count_bucket":"1_10","duration_bucket":"10_30s"}
{"schemaVersion":2,"eventName":"sync_completed","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"pwa","sync_type":"metadata","outcome":"partial_success","changed_count_bucket":"11_50","failed_count_bucket":"1_10","duration_bucket":"30_120s","error_category":"provider_unavailable"}
{"schemaVersion":2,"eventName":"quest_queue_batch_completed","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"browser","queue_source":"library","initial_count_bucket":"11_50","processed_count_bucket":"1_10","skipped_count_bucket":"zero","completion_state":"exited_early","duration_bucket":"2_10s"}
{"schemaVersion":2,"eventName":"recommendation_action","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"browser","surface":"home","recommendation_type":"personal","action":"added_to_wishlist","position_bucket":"top"}
{"schemaVersion":2,"eventName":"backup_restore_completed","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"browser","outcome":"success","restored_count_bucket":"51_200","duration_bucket":"10_30s","migration_required":false}
{"schemaVersion":2,"eventName":"operation_failed","eventId":"uuid","timestamp":"2026-07-10T12:00:00.000Z","appVersion":"0.1.0","runtime":"capacitor_android","operation":"storage_write","error_category":"storage","recoverable":true}
```

## How to add an event safely

1. Add it to `telemetryEventRegistry` with required/optional fields and enums.
2. Add or reuse bucket helpers; never pass exact counts or raw strings when a bucket is enough.
3. Instrument a single workflow owner; avoid render effects unless guarded once per session.
4. Add tests for valid payloads, invalid enums, unknown fields, and privacy-sensitive fields.
5. Update this matrix and Make.com examples.

## Local and production validation

- Run `npm test` for registry, client, server endpoint, consent, and transport tests.
- In local dev, enable `VITE_QS_ANALYTICS_ENABLED=true` and use `/api/telemetry` with a mocked or local endpoint; do not call the real Make.com webhook from tests.
- In production, set only server-side `QS_ANALYTICS_WEBHOOK_URL`, opt in from Settings, run the telemetry test, and verify Make.com receives schema-versioned flat payloads. Function logs must not include webhook URLs or full rejected payloads.
