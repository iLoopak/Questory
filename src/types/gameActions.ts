// AS-07: domain action contracts, owned by the domain rather than by a panel.
//
// `useQueueActions` used to import `PlayingGameAction` from `components/QueuePanel`, and
// `useReviewModeActions` its action types from `components/ReviewModePanel` — a hook reaching into
// a UI module for a contract that is really about the domain. The types live here now; the panels
// re-export them, so every existing component prop keeps working unchanged.

/** What the user can do to a game that is currently being played, from the Plans compact rows. */
export type PlayingGameAction = 'move-to-backlog' | 'finished' | 'drop' | 'remove-from-playing';

/** A Quest Queue (review) decision. */
export type ReviewModeAction =
  | 'queue'
  | 'playing'
  | 'wishlist'
  | 'finished'
  | 'dropped'
  | 'ignore'
  | 'enrich'
  | 'find-artwork'
  | 'open-details'
  | 'skip'
  | 'note';

export type ReviewModeActionContext = {
  /** Active 20-game session batch. */
  queueGameIds?: string[];
  /** Full pending, unprocessed Quest Queue candidate order for the current source/filter. */
  pendingGameIds?: string[];
};
