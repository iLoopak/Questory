import { useEffect, useMemo, useState } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import { getReviewSourceLabel, reviewSourceOptions, type ReviewSource } from '../lib/reviewModeStorage';
import type { Game, GamePlatform } from '../types/game';

export type ReviewModeAction =
  | 'queue'
  | 'playing'
  | 'wishlist'
  | 'finished'
  | 'dropped'
  | 'ignore'
  | 'enrich'
  | 'open-details'
  | 'skip'
  | 'note';

type ReviewModePanelProps = {
  games: Game[];
  ignoredGameIds: Set<string>;
  queuePlatforms: GamePlatform[];
  source: ReviewSource;
  onAction: (game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) => void;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onRestoreIgnored: () => void;
  onSourceChange: (source: ReviewSource) => void;
};

const anyPlatform = 'Any platform';

const negativeActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: string;
  label: string;
  tone: 'danger' | 'quiet';
}> = [
  { action: 'ignore', hint: 'D-pad ←', icon: '🚫', label: 'Ignore', tone: 'danger' },
  { action: 'dropped', hint: 'D-pad ←', icon: '⌄', label: 'Drop', tone: 'danger' },
  { action: 'skip', hint: 'B', icon: '↷', label: 'Skip', tone: 'quiet' },
];

const positiveActions: Array<{
  action: ReviewModeAction;
  hint: string;
  icon: string;
  label: string;
  tone: 'accent' | 'neutral';
}> = [
  { action: 'queue', hint: 'Y', icon: '+', label: 'Queue', tone: 'accent' },
  { action: 'playing', hint: 'A', icon: '▶', label: 'Playing', tone: 'accent' },
  { action: 'wishlist', hint: 'X', icon: '♡', label: 'Wishlist', tone: 'neutral' },
  { action: 'finished', hint: '✓', icon: '✓', label: 'Finished', tone: 'neutral' },
];

const decisionActions = [...negativeActions, ...positiveActions];
const firstPositiveActionIndex = negativeActions.length;

type ReviewActionStats = {
  dropped: number;
  ignored: number;
  playing: number;
  queued: number;
  wishlisted: number;
};

const emptyReviewActionStats: ReviewActionStats = {
  dropped: 0,
  ignored: 0,
  playing: 0,
  queued: 0,
  wishlisted: 0,
};

const secondaryActions: Array<{ action: ReviewModeAction; label: string }> = [
  { action: 'open-details', label: 'View Details' },
  { action: 'enrich', label: 'Find info' },
  { action: 'note', label: 'Add Note' },
];

export function ReviewModePanel({
  games,
  ignoredGameIds,
  queuePlatforms,
  source,
  onAction,
  onOpenQueue,
  onReturnToLibrary,
  onRestoreIgnored,
  onSourceChange,
}: ReviewModePanelProps) {
  const [processedGameIds, setProcessedGameIds] = useState<Set<string>>(() => new Set());
  const [reviewHistory, setReviewHistory] = useState<Array<{ action: ReviewModeAction; gameId: string }>>([]);
  const [actionStats, setActionStats] = useState<ReviewActionStats>(emptyReviewActionStats);
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(firstPositiveActionIndex);
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [isQueuePickerOpen, setIsQueuePickerOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const platformOptions = useMemo(() => {
    return Array.from(new Set(games.map((game) => game.platform))).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [games]);

  const sourceGames = useMemo(() => {
    return games
      .filter((game) => matchesReviewSource(game, source))
      .filter((game) => selectedPlatform === anyPlatform || game.platform === selectedPlatform)
      .filter((game) => !ignoredGameIds.has(game.id))
      .sort(compareReviewGames);
  }, [games, ignoredGameIds, selectedPlatform, source]);

  const reviewQueue = useMemo(() => {
    return sourceGames.filter((game) => !processedGameIds.has(game.id));
  }, [processedGameIds, sourceGames]);

  const activeGame = reviewQueue[0] ?? null;
  const sourceLabel = getReviewSourceLabel(source);
  const completedCount = sourceGames.length - reviewQueue.length;
  const totalCount = sourceGames.length;
  const progressLabel = totalCount === 0 ? '0 / 0' : `${Math.min(completedCount + 1, totalCount)} / ${totalCount}`;

  useEffect(() => {
    setProcessedGameIds(new Set());
    setReviewHistory([]);
    setActionStats(emptyReviewActionStats);
    setHighlightedActionIndex(firstPositiveActionIndex);
    setIsQueuePickerOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
  }, [selectedPlatform, source]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (!activeGame) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) =>
          currentIndex >= firstPositiveActionIndex
            ? firstPositiveActionIndex + ((currentIndex - firstPositiveActionIndex + 1) % positiveActions.length)
            : firstPositiveActionIndex,
        );
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) =>
          currentIndex < firstPositiveActionIndex ? (currentIndex + 1) % negativeActions.length : 0,
        );
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) => {
          const direction = event.key === 'ArrowDown' ? 1 : -1;

          if (currentIndex >= firstPositiveActionIndex) {
            const positiveIndex = currentIndex - firstPositiveActionIndex;
            return firstPositiveActionIndex + ((positiveIndex + direction + positiveActions.length) % positiveActions.length);
          }

          return (currentIndex + direction + negativeActions.length) % negativeActions.length;
        });
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        performAction(activeGame, decisionActions[highlightedActionIndex].action);
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        performAction(activeGame, 'playing');
        return;
      }

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        performAction(activeGame, 'skip');
        return;
      }

      if (event.key.toLowerCase() === 'x') {
        event.preventDefault();
        performAction(activeGame, 'wishlist');
        return;
      }

      if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        performAction(activeGame, 'queue');
        return;
      }

      if (event.key === ']' || event.key === 'PageDown') {
        event.preventDefault();
        performAction(activeGame, 'skip');
        return;
      }

      if (event.key === '[' || event.key === 'PageUp') {
        event.preventDefault();
        showPreviousGame();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, highlightedActionIndex, reviewHistory]);

  function advanceReview(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) {
    onAction(game, action, note, targetPlatform);
    setProcessedGameIds((currentIds) => new Set(currentIds).add(game.id));
    setReviewHistory((currentHistory) => [...currentHistory, { action, gameId: game.id }]);
    setActionStats((currentStats) => getNextActionStats(currentStats, action));
    setHighlightedActionIndex(firstPositiveActionIndex);
    setIsQueuePickerOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
  }

  function showPreviousGame() {
    setReviewHistory((currentHistory) => {
      const previousReview = currentHistory.at(-1);

      if (!previousReview) {
        return currentHistory;
      }

      setProcessedGameIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(previousReview.gameId);
        return nextIds;
      });
      setActionStats((currentStats) => getPreviousActionStats(currentStats, previousReview.action));

      return currentHistory.slice(0, -1);
    });
  }

  function performAction(game: Game, action: ReviewModeAction) {
    if (action === 'queue') {
      setIsQueuePickerOpen(true);
        return;
    }

    if (action === 'note') {
      setIsNoteOpen(true);
      return;
    }

    if (action === 'open-details') {
      onAction(game, action);
      return;
    }

    advanceReview(game, action);
  }

  function submitNote() {
    if (!activeGame || !noteDraft.trim()) {
      return;
    }

    advanceReview(activeGame, 'note', noteDraft.trim());
  }

  function addToQueue(platform: GamePlatform) {
    if (!activeGame) {
      return;
    }

    advanceReview(activeGame, 'queue', undefined, platform);
  }

  return (
    <section className="qs-review-shell overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/90 lg:h-[calc(100vh-116px)]">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-col gap-3 border-b border-skyglass/10 bg-ink-950/80 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review Mode</div>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Reviewing {sourceLabel}</h2>
                <p className="text-xs text-slate-400">One game. One decision.</p>
              </div>
              <span className="rounded-full border border-mint/25 bg-mint/10 px-3 py-1 text-sm font-semibold text-mint">
                {progressLabel}
              </span>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(150px,190px)_minmax(140px,170px)_auto]">
            <label className="sr-only" htmlFor="review-source">
              Review batch
            </label>
            <select
              className="h-11 rounded-md border border-skyglass/15 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
              id="review-source"
              value={source}
              onChange={(event) => onSourceChange(event.target.value as ReviewSource)}
            >
              {reviewSourceOptions.map((option) => (
                <option key={option} value={option}>
                  {getReviewSourceLabel(option)}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="review-platform">
              Platform
            </label>
            <select
              className="h-11 rounded-md border border-skyglass/15 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
              id="review-platform"
              value={selectedPlatform}
              onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform | typeof anyPlatform)}
            >
              {[anyPlatform, ...platformOptions].map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>

            {ignoredGameIds.size > 0 ? (
              <button
                className="min-h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                onClick={onRestoreIgnored}
                type="button"
              >
                Restore ignored
              </button>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {activeGame ? (
            <FocusedReviewCard
              game={activeGame}
              highlightedActionIndex={highlightedActionIndex}
              isNoteOpen={isNoteOpen}
              isQueuePickerOpen={isQueuePickerOpen}
              noteDraft={noteDraft}
              onAction={(action) => performAction(activeGame, action)}
              onAddToQueue={addToQueue}
              onHighlight={setHighlightedActionIndex}
              onNoteDraftChange={setNoteDraft}
              onQueuePickerClose={() => setIsQueuePickerOpen(false)}
              onSubmitNote={submitNote}
              queuePlatforms={queuePlatforms}
            />
          ) : (
            <ReviewComplete
              actionStats={actionStats}
              reviewedCount={completedCount}
              sourceLabel={sourceLabel}
              onOpenQueue={onOpenQueue}
              onReturnToLibrary={onReturnToLibrary}
              onReviewAnother={() => onSourceChange('backlog')}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FocusedReviewCard({
  game,
  highlightedActionIndex,
  isNoteOpen,
  isQueuePickerOpen,
  noteDraft,
  onAction,
  onAddToQueue,
  onHighlight,
  onNoteDraftChange,
  onQueuePickerClose,
  onSubmitNote,
  queuePlatforms,
}: {
  game: Game;
  highlightedActionIndex: number;
  isNoteOpen: boolean;
  isQueuePickerOpen: boolean;
  noteDraft: string;
  onAction: (action: ReviewModeAction) => void;
  onAddToQueue: (platform: GamePlatform) => void;
  onHighlight: (index: number) => void;
  onNoteDraftChange: (value: string) => void;
  onQueuePickerClose: () => void;
  onSubmitNote: () => void;
  queuePlatforms: GamePlatform[];
}) {
  const coverSources = getGameCoverSources(game);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);
  const activeCoverSource = coverSources[coverSourceIndex];

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [game.id]);

  const quickFacts = [
    game.releaseDate || game.released ? `Released ${game.releaseDate ?? game.released}` : null,
    game.genres?.length ? game.genres.slice(0, 3).join(' · ') : null,
    game.developers?.length ? game.developers.slice(0, 2).join(' · ') : null,
    game.steamReviewInfo ?? null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <article className="qs-review-stage min-h-full" data-swipe-left="negative" data-swipe-right="positive">
      <section className="qs-review-zone qs-review-zone-negative" aria-label="Negative review actions">
        <div className="qs-review-zone-label">Discard</div>
        <div className="grid gap-2">
          {negativeActions.map((action, index) => (
            <button
              key={action.action}
              className={`qs-review-action qs-review-action-side min-h-16 rounded-xl border px-4 py-3 text-left text-base font-semibold transition ${getActionClassName(
                action.tone,
                highlightedActionIndex === index,
              )}`}
              onClick={() => onAction(action.action)}
              onFocus={() => onHighlight(index)}
              type="button"
            >
              <span className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-lg">{action.icon}</span>
                <span>
                  <span className="block">{action.label}</span>
                  <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] opacity-70">{action.hint}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="qs-review-hero" aria-label={`${game.title} review card`}>
        <div className="qs-review-cover overflow-hidden rounded-[1.35rem] border border-white/10 bg-ink-900 shadow-panel">
          <div className="aspect-[2/3] h-full min-h-[300px]">
            {activeCoverSource ? (
              <div className="relative h-full">
                {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
                <img
                  alt=""
                  className={`h-full w-full object-cover transition-opacity duration-300 ${
                    isCoverLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  decoding="async"
                  loading="lazy"
                  onError={() => {
                    setIsCoverLoaded(false);
                    setCoverSourceIndex((currentIndex) => currentIndex + 1);
                  }}
                  onLoad={() => setIsCoverLoaded(true)}
                  src={activeCoverSource}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950 via-ink-950/76 to-transparent p-4 pt-16">
                  <span className="inline-flex rounded-full border border-mint/30 bg-ink-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-mint backdrop-blur">
                    {game.platform}
                  </span>
                  <h3 className="mt-2 text-3xl font-semibold leading-tight text-white drop-shadow-lg sm:text-4xl">
                    {game.title}
                  </h3>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center bg-ink-800 px-4 text-center">
                <div>
                  <div className="mx-auto grid h-28 w-28 place-items-center rounded-2xl border border-white/10 bg-ink-950 text-5xl font-semibold text-mint">
                    {game.title.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="mt-5 inline-flex rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-mint">
                    {game.platform}
                  </span>
                  <h3 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">{game.title}</h3>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="qs-gamepad-hints mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          <span>L1/R1 Previous / Next</span>
          <span>•</span>
          <span>D-pad Left discard</span>
          <span>•</span>
          <span>D-pad Right keep</span>
        </div>

        {isQueuePickerOpen ? (
          <section className="mt-3 rounded-2xl border border-mint/25 bg-mint/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-white">Choose queue platform</h4>
              <button
                className="min-h-10 rounded-lg border border-white/10 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                onClick={onQueuePickerClose}
                type="button"
              >
                Cancel
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {queuePlatforms.map((platform) => (
                <button
                  key={platform}
                  className="min-h-12 rounded-lg border border-mint/35 bg-ink-950/80 px-3 text-sm font-semibold text-mint transition hover:bg-mint hover:text-ink-950 focus-visible:bg-mint focus-visible:text-ink-950"
                  onClick={() => onAddToQueue(platform)}
                  type="button"
                >
                  {platform}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <details className="mt-3 rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-sm text-slate-300">
          <summary className="cursor-pointer select-none font-semibold text-slate-100">Details</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Metadata</div>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {quickFacts.length ? quickFacts.map((fact) => <li key={fact}>{fact}</li>) : <li>No enrichment metadata yet.</li>}
                {game.tags.length ? <li>Tags: {game.tags.slice(0, 6).join(', ')}</li> : null}
                {game.notes ? <li>Notes saved</li> : null}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Advanced</div>
              <div className="mt-2 grid gap-2">
                {secondaryActions.map((action) => (
                  <button
                    key={action.action}
                    className="min-h-11 rounded-lg border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                    onClick={() => onAction(action.action)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isNoteOpen ? (
            <div className="mt-3 rounded-xl border border-mint/20 bg-ink-950/80 p-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Quick note</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  placeholder="First impression, backlog reason, drop reason..."
                  value={noteDraft}
                />
              </label>
              <button
                className="mt-2 min-h-11 rounded-lg bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                disabled={!noteDraft.trim()}
                onClick={onSubmitNote}
                type="button"
              >
                Save note and continue
              </button>
            </div>
          ) : null}
        </details>
      </section>

      <section className="qs-review-zone qs-review-zone-positive" aria-label="Positive review actions">
        <div className="qs-review-zone-label">Keep</div>
        <div className="grid gap-2">
          {positiveActions.map((action, actionIndex) => {
            const index = firstPositiveActionIndex + actionIndex;

            return (
              <button
                key={action.action}
                className={`qs-review-action qs-review-action-side min-h-16 rounded-xl border px-4 py-3 text-left text-base font-semibold transition ${getActionClassName(
                  action.tone,
                  highlightedActionIndex === index,
                )}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-lg">{action.icon}</span>
                  <span>
                    <span className="block">{action.label}</span>
                    <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] opacity-70">{action.hint}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </article>
  );
}

function ReviewComplete({
  actionStats,
  reviewedCount,
  sourceLabel,
  onOpenQueue,
  onReturnToLibrary,
  onReviewAnother,
}: {
  actionStats: ReviewActionStats;
  reviewedCount: number;
  sourceLabel: string;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onReviewAnother: () => void;
}) {
  const completionStats = [
    { label: 'Reviewed', value: reviewedCount },
    { label: 'Queued', value: actionStats.queued },
    { label: 'Playing', value: actionStats.playing },
    { label: 'Wishlisted', value: actionStats.wishlisted },
    { label: 'Dropped', value: actionStats.dropped },
    { label: 'Ignored', value: actionStats.ignored },
  ];

  return (
    <div className="grid min-h-full place-items-center rounded-[1.5rem] border border-white/10 bg-ink-900/70 p-5 text-center">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review complete</div>
        <h3 className="mt-2 text-3xl font-semibold text-white">{sourceLabel} is clear</h3>
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {completionStats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-ink-950/70 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</dt>
              <dd className="mt-2 text-3xl font-semibold text-white">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint px-5 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={onOpenQueue}
            type="button"
          >
            Open Queue
          </button>
          <button
            className="min-h-12 rounded-xl border border-mint/30 bg-mint/10 px-5 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onReviewAnother}
            type="button"
          >
            Review another batch
          </button>
          <button
            className="min-h-12 rounded-xl border border-skyglass/15 px-5 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onReturnToLibrary}
            type="button"
          >
            Return to Library
          </button>
        </div>
      </div>
    </div>
  );
}

function getNextActionStats(currentStats: ReviewActionStats, action: ReviewModeAction): ReviewActionStats {
  if (action === 'queue') {
    return { ...currentStats, queued: currentStats.queued + 1 };
  }

  if (action === 'playing') {
    return { ...currentStats, playing: currentStats.playing + 1 };
  }

  if (action === 'wishlist') {
    return { ...currentStats, wishlisted: currentStats.wishlisted + 1 };
  }

  if (action === 'dropped') {
    return { ...currentStats, dropped: currentStats.dropped + 1 };
  }

  if (action === 'ignore') {
    return { ...currentStats, ignored: currentStats.ignored + 1 };
  }

  return currentStats;
}

function getPreviousActionStats(currentStats: ReviewActionStats, action: ReviewModeAction): ReviewActionStats {
  if (action === 'queue') {
    return { ...currentStats, queued: Math.max(0, currentStats.queued - 1) };
  }

  if (action === 'playing') {
    return { ...currentStats, playing: Math.max(0, currentStats.playing - 1) };
  }

  if (action === 'wishlist') {
    return { ...currentStats, wishlisted: Math.max(0, currentStats.wishlisted - 1) };
  }

  if (action === 'dropped') {
    return { ...currentStats, dropped: Math.max(0, currentStats.dropped - 1) };
  }

  if (action === 'ignore') {
    return { ...currentStats, ignored: Math.max(0, currentStats.ignored - 1) };
  }

  return currentStats;
}

function matchesReviewSource(game: Game, source: ReviewSource) {
  if (source === 'backlog') {
    return game.collectionType === 'library' && game.status !== 'Finished' && game.status !== 'Dropped';
  }

  if (source === 'recent-imports') {
    return Boolean(game.importedAt);
  }

  if (source === 'wishlist') {
    return game.collectionType === 'wishlist';
  }

  if (source === 'missing-metadata') {
    return game.metadataSource !== 'rawg' && !game.metadataManualManagedAt;
  }

  if (source === 'retro') {
    return game.externalSource === 'retro-rom';
  }

  if (source === 'steam') {
    return game.externalSource === 'steam' || game.externalSource === 'steam-wishlist' || typeof game.steamAppId === 'number';
  }

  if (source === 'manual') {
    return game.externalSource === 'manual';
  }

  return game.collectionType === 'library' && game.playtimeHours === 0 && !game.lastPlayedAt;
}

function compareReviewGames(firstGame: Game, secondGame: Game) {
  return getGameTime(secondGame.importedAt ?? secondGame.updatedAt) - getGameTime(firstGame.importedAt ?? firstGame.updatedAt);
}

function getGameTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() || 0 : 0;
}

function getActionClassName(tone: 'accent' | 'neutral' | 'danger' | 'quiet', isHighlighted: boolean) {
  if (isHighlighted) {
    return 'border-mint/70 bg-mint text-ink-950 shadow-glow';
  }

  if (tone === 'accent') {
    return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20';
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }

  if (tone === 'quiet') {
    return 'border-skyglass/15 bg-ink-900/60 text-slate-300 hover:bg-white/10 hover:text-white';
  }

  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}
