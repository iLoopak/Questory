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

const primaryActions: Array<{
  action: ReviewModeAction;
  hint: string;
  label: string;
  tone: 'accent' | 'neutral' | 'danger' | 'quiet';
}> = [
  { action: 'queue', hint: 'Y', label: 'Add to Queue', tone: 'accent' },
  { action: 'playing', hint: 'A', label: 'Playing Now', tone: 'accent' },
  { action: 'wishlist', hint: 'X', label: 'Wishlist', tone: 'neutral' },
  { action: 'finished', hint: 'F', label: 'Finished', tone: 'neutral' },
  { action: 'dropped', hint: 'D', label: 'Dropped', tone: 'danger' },
  { action: 'ignore', hint: 'I', label: 'Ignore', tone: 'danger' },
  { action: 'skip', hint: 'B', label: 'Skip', tone: 'quiet' },
];

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
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [isQueuePickerOpen, setIsQueuePickerOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
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
    setHighlightedActionIndex(0);
    setIsQueuePickerOpen(false);
    setIsMoreOpen(false);
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

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) => (currentIndex + 1) % primaryActions.length);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedActionIndex((currentIndex) => (currentIndex + primaryActions.length - 1) % primaryActions.length);
        return;
      }

      if (event.key === 'Enter' || event.key.toLowerCase() === 'a') {
        event.preventDefault();
        performAction(activeGame, primaryActions[highlightedActionIndex].action);
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
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGame, highlightedActionIndex]);

  function advanceReview(game: Game, action: ReviewModeAction, note?: string, targetPlatform?: GamePlatform) {
    onAction(game, action, note, targetPlatform);
    setProcessedGameIds((currentIds) => new Set(currentIds).add(game.id));
    setHighlightedActionIndex(0);
    setIsQueuePickerOpen(false);
    setIsMoreOpen(false);
    setIsNoteOpen(false);
    setNoteDraft('');
  }

  function performAction(game: Game, action: ReviewModeAction) {
    if (action === 'queue') {
      setIsQueuePickerOpen(true);
      setIsMoreOpen(false);
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
        <header className="flex flex-col gap-3 border-b border-skyglass/15 bg-ink-950/95 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review Mode</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-white">{sourceLabel}</h2>
              <span className="rounded-md border border-mint/25 bg-mint/10 px-2.5 py-1 text-sm font-semibold text-mint">
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
              isMoreOpen={isMoreOpen}
              isNoteOpen={isNoteOpen}
              isQueuePickerOpen={isQueuePickerOpen}
              noteDraft={noteDraft}
              onAction={(action) => performAction(activeGame, action)}
              onAddToQueue={addToQueue}
              onHighlight={setHighlightedActionIndex}
              onMoreToggle={() => setIsMoreOpen((isOpen) => !isOpen)}
              onNoteDraftChange={setNoteDraft}
              onQueuePickerClose={() => setIsQueuePickerOpen(false)}
              onSubmitNote={submitNote}
              queuePlatforms={queuePlatforms}
            />
          ) : (
            <ReviewComplete
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
  isMoreOpen,
  isNoteOpen,
  isQueuePickerOpen,
  noteDraft,
  onAction,
  onAddToQueue,
  onHighlight,
  onMoreToggle,
  onNoteDraftChange,
  onQueuePickerClose,
  onSubmitNote,
  queuePlatforms,
}: {
  game: Game;
  highlightedActionIndex: number;
  isMoreOpen: boolean;
  isNoteOpen: boolean;
  isQueuePickerOpen: boolean;
  noteDraft: string;
  onAction: (action: ReviewModeAction) => void;
  onAddToQueue: (platform: GamePlatform) => void;
  onHighlight: (index: number) => void;
  onMoreToggle: () => void;
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

  return (
    <article className="qs-review-stage grid min-h-full gap-4 xl:grid-cols-[minmax(260px,42vh)_minmax(0,1fr)]">
      <div className="qs-review-cover overflow-hidden rounded-lg border border-white/10 bg-ink-900 shadow-panel">
        <div className="aspect-[2/3] h-full max-h-[min(58dvh,560px)] min-h-[260px]">
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
            </div>
          ) : (
            <div className="grid h-full place-items-center bg-ink-800 px-4 text-center">
              <div>
                <div className="mx-auto grid h-24 w-24 place-items-center rounded-md border border-white/10 bg-ink-950 text-4xl font-semibold text-mint">
                  {game.title.slice(0, 1).toUpperCase()}
                </div>
                <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">No cover</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-4">
        <header className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-mint/30 bg-mint/10 px-3 py-1.5 text-sm font-semibold text-mint">
              {game.platform}
            </span>
          </div>
          <h3 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">{game.title}</h3>
        </header>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {primaryActions.map((action, index) => (
            <button
              key={action.action}
              className={`qs-review-action min-h-16 rounded-md border px-4 py-3 text-left text-base font-semibold transition ${getActionClassName(
                action.tone,
                highlightedActionIndex === index,
              )}`}
              onClick={() => onAction(action.action)}
              onFocus={() => onHighlight(index)}
              type="button"
            >
              <span className="block">{action.label}</span>
              <span className="mt-1 block text-xs font-medium uppercase tracking-[0.12em] opacity-70">{action.hint}</span>
            </button>
          ))}
        </section>

        {isQueuePickerOpen ? (
          <section className="rounded-lg border border-mint/25 bg-mint/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-white">Choose queue</h4>
              <button
                className="min-h-10 rounded-md border border-white/10 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
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
                  className="min-h-12 rounded-md border border-mint/35 bg-ink-950/80 px-3 text-sm font-semibold text-mint transition hover:bg-mint hover:text-ink-950 focus-visible:bg-mint focus-visible:text-ink-950"
                  onClick={() => onAddToQueue(platform)}
                  type="button"
                >
                  {platform}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-white/10 bg-ink-900/70 p-3">
          <button
            className="min-h-11 w-full rounded-md border border-skyglass/15 px-3 text-left text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
            onClick={onMoreToggle}
            type="button"
          >
            More
          </button>

          {isMoreOpen ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {secondaryActions.map((action) => (
                <button
                  key={action.action}
                  className="min-h-11 rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
                  onClick={() => onAction(action.action)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          {isNoteOpen ? (
            <div className="mt-3 rounded-md border border-mint/20 bg-ink-950/80 p-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Quick note</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mint"
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  placeholder="First impression, backlog reason, drop reason..."
                  value={noteDraft}
                />
              </label>
              <button
                className="mt-2 min-h-11 rounded-md bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                disabled={!noteDraft.trim()}
                onClick={onSubmitNote}
                type="button"
              >
                Save note and continue
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </article>
  );
}

function ReviewComplete({
  sourceLabel,
  onOpenQueue,
  onReturnToLibrary,
  onReviewAnother,
}: {
  sourceLabel: string;
  onOpenQueue: () => void;
  onReturnToLibrary: () => void;
  onReviewAnother: () => void;
}) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-white/15 bg-ink-900/70 p-4 text-center">
      <div className="max-w-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review complete</div>
        <h3 className="mt-2 text-3xl font-semibold text-white">{sourceLabel} is clear</h3>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            className="min-h-11 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onReviewAnother}
            type="button"
          >
            Review another batch
          </button>
          <button
            className="min-h-11 rounded-md border border-mint/30 bg-mint px-4 text-sm font-semibold text-ink-950 transition hover:bg-mint/90"
            onClick={onOpenQueue}
            type="button"
          >
            Open Queue
          </button>
          <button
            className="min-h-11 rounded-md border border-skyglass/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
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
