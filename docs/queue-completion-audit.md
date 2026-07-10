# Queue Completion State Audit

## Discovery Inbox

### Completion after triaging a non-empty inbox

Implementation: `DiscoveryInboxPanel` shows `QueueCompletionScreen` when the active inbox item is gone and the session had at least one item.

Session-scoped data exposed:

| Data | Source | Display |
| --- | --- | --- |
| Number triaged | `sessionReviewedCount` | Primary `Triaged` card and summary sentence |
| Added to Library | `sessionStats.library` | Included in `Added` total and non-zero outcome chip |
| Added to Wishlist | `sessionStats.wishlist` | Included in `Added` total and non-zero outcome chip |
| Added to Platform Plans | `sessionStats.plans` | Included in `Added` total and non-zero outcome chip |
| Ignored | `sessionStats.ignored` | Non-zero outcome chip |
| Remaining items | `items.length` at completion is zero for the loaded inbox batch | Represented as `queue-empty` for the loaded inbox |

Not applicable in Discovery Inbox: marked Playing, Finished, Dropped, Skipped.

### Empty/exhausted state

Implementation: `InboxEmpty` appears when there is no active item and the session never triaged an item (`totalCount === 0`). It does not expose session counters because no session occurred.

## Quest Queue

### Batch completion

Implementation: `ReviewModePanel` shows `QueueCompletionScreen` when the current session batch is exhausted and at least one session game existed.

Session-scoped data exposed:

| Data | Source | Display |
| --- | --- | --- |
| Number reviewed | `completedCount` | Primary `Reviewed` card and summary sentence |
| Added to Plans | `actionStats.queued` | Included in `Committed` total and non-zero outcome chip |
| Playing Now | `actionStats.playing` | Included in `Committed` total and non-zero outcome chip |
| Added to Wishlist | `actionStats.wishlisted` | Included in `Committed` total and non-zero outcome chip |
| Finished | `actionStats.finished` | Included in `Committed` total and non-zero outcome chip |
| Dropped | `actionStats.dropped` | Non-zero outcome chip only |
| Ignored | `actionStats.ignored` | Non-zero outcome chip only |
| Skipped | `actionStats.skipped` | Non-zero outcome chip only |
| Remaining items | `fullRemainingCount` | Drives `batch-complete` vs `queue-empty` footer/actions |
| Batch vs fully empty | `remainingCount === 0` | `batch-complete` offers next batch; `queue-empty` offers navigation |

`Committed` intentionally excludes Dropped, Ignored, and Skipped because those are not active positive outcomes.

### Empty/exhausted state without a session

Implementation: `ReviewSourceEmpty` appears when the selected Quest Queue source has no session games at startup or after filters/source changes. It does not expose session counters because no batch was completed.
