import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import {
  getReviewSourceLabel,
  reviewSourceOptions,
  type ReviewSource,
  type ReviewStats,
} from '../lib/reviewModeStorage';
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
  source: ReviewSource;
  stats: ReviewStats;
  onAction: (game: Game, action: ReviewModeAction, note?: string) => void;
  onReturnToLibrary: () => void;
  onRestoreIgnored: () => void;
  onSourceChange: (source: ReviewSource) => void;
};

const primaryActions: Array<{
  action: ReviewModeAction;
  hint: string;
  label: string;
  tone: 'accent' | 'neutral' | 'danger';
}> = [
  { action: 'queue', hint: 'Y', label: 'Add to Queue', tone: 'accent' },
  { action: 'playing', hint: 'A', label: 'Playing', tone: 'accent' },
  { action: 'wishlist', hint: 'X', label: 'Wishlist', tone: 'neutral' },
  { action: 'finished', hint: 'F', label: 'Finished', tone: 'neutral' },
  { action: 'dropped', hint: 'D', label: 'Dropped', tone: 'danger' },
  { action: 'ignore', hint: 'I', label: 'Ignore', tone: 'danger' },
];

const secondaryActions: Array<{ action: ReviewModeAction; label: string }> = [
  { action: 'note', label: 'Add Note' },
  { action: 'enrich', label: 'Enrich' },
  { action: 'open-details', label: 'Open Details' },
  { action: 'skip', label: 'Skip for Later' },
];

const anyPlatform = 'Any platform';

export function ReviewModePanel({
  games,
  ignoredGameIds,
  source,
  stats,
  onAction,
  onReturnToLibrary,
  onRestoreIgnored,
  onSourceChange,
}: ReviewModePanelProps) {
  const [processedGameIds, setProcessedGameIds] = useState<Set<string>>(() => new Set());
  const [highlightedActionIndex, setHighlightedActionIndex] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState<GamePlatform | typeof anyPlatform>(anyPlatform);
  const [noteDraft, setNoteDraft] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [sessionStats, setSessionStats] = useState<ReviewStats>(() => ({
    dropped: 0,
    enriched: 0,
    ignored: 0,
    queueCandidates: 0,
    reviewed: 0,
    wishlisted: 0,
  }));

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
  const remainingCount = reviewQueue.length;

  useEffect(() => {
    setProcessedGameIds(new Set());
    setHighlightedActionIndex(0);
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

  function performAction(game: Game, action: ReviewModeAction, note?: string) {
    if (action === 'note') {
      setIsNoteOpen(true);
      return;
    }

    onAction(game, action, note);
    setProcessedGameIds((currentIds) => new Set(currentIds).add(game.id));
    setIsNoteOpen(false);
    setNoteDraft('');

    setSessionStats((currentStats) => updateReviewStats(currentStats, action));
  }

  function submitNote() {
    if (!activeGame || !noteDraft.trim()) {
      return;
    }

    performAction(activeGame, 'note', noteDraft.trim());
  }

  return (
    <section className="qs-review-shell min-w-0 overflow-hidden rounded-lg border border-skyglass/15 bg-ink-950/80 lg:h-[calc(100vh-116px)]">
      <div className="grid h-full min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-skyglass/15 bg-ink-950/90 p-3 lg:border-b-0 lg:border-r">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review Mode</div>
            <h2 className="mt-1 text-xl font-semibold text-white">One game at a time</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Process the backlog fast, then move on.</p>
          </div>

          <div className="mt-4 rounded-md border border-skyglass/15 bg-ink-900/70 p-3">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>{sourceLabel}</span>
              <span className="font-semibold text-white">
                {totalCount === 0 ? '0 / 0' : `${Math.min(completedCount + 1, totalCount)} / ${totalCount}`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950">
              <div
                className="h-full rounded-full bg-mint transition-all"
                style={{ width: `${totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">{remainingCount} remaining this pass</div>
          </div>

          <div className="mt-4 grid gap-2">
            {reviewSourceOptions.map((option) => (
              <button
                key={option}
                className={`min-h-11 rounded-md border px-3 text-left text-sm font-semibold transition ${
                  option === source
                    ? 'border-mint/50 bg-mint/15 text-white shadow-glow'
                    : 'border-skyglass/15 bg-ink-900/70 text-slate-300 hover:border-mint/30 hover:bg-mint/10 hover:text-white'
                }`}
                onClick={() => onSourceChange(option)}
                type="button"
              >
                {getReviewSourceLabel(option)}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-skyglass/15 bg-ink-900 px-3 text-sm text-white outline-none transition focus:border-mint"
              value={selectedPlatform}
              onChange={(event) => setSelectedPlatform(event.target.value as GamePlatform | typeof anyPlatform)}
            >
              {[anyPlatform, ...platformOptions].map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <ReviewStat label="Reviewed" value={stats.reviewed} />
            <ReviewStat label="Queued" value={stats.queueCandidates} />
            <ReviewStat label="Wishlist" value={stats.wishlisted} />
            <ReviewStat label="Dropped" value={stats.dropped} />
          </div>

          {ignoredGameIds.size > 0 ? (
            <button
              className="mt-4 min-h-11 w-full rounded-md border border-skyglass/15 px-3 text-sm font-semibold text-slate-200 transition hover:bg-mint/10 hover:text-white"
              onClick={onRestoreIgnored}
              type="button"
            >
              Restore review ignored ({ignoredGameIds.size})
            </button>
          ) : null}
        </aside>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-4">
          {activeGame ? (
            <ReviewCard
              game={activeGame}
              highlightedActionIndex={highlightedActionIndex}
              isNoteOpen={isNoteOpen}
              noteDraft={noteDraft}
              onAction={(action) => performAction(activeGame, action)}
              onHighlight={setHighlightedActionIndex}
              onNoteDraftChange={setNoteDraft}
              onSubmitNote={submitNote}
            />
          ) : (
            <ReviewComplete
              sourceLabel={sourceLabel}
              stats={sessionStats}
              onReturnToLibrary={onReturnToLibrary}
              onReviewAnother={() => onSourceChange('backlog')}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({
  game,
  highlightedActionIndex,
  isNoteOpen,
  noteDraft,
  onAction,
  onHighlight,
  onNoteDraftChange,
  onSubmitNote,
}: {
  game: Game;
  highlightedActionIndex: number;
  isNoteOpen: boolean;
  noteDraft: string;
  onAction: (action: ReviewModeAction) => void;
  onHighlight: (index: number) => void;
  onNoteDraftChange: (value: string) => void;
  onSubmitNote: () => void;
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
    <article className="grid min-h-full gap-4 xl:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-900 shadow-panel">
        <div className="aspect-[2/3] max-h-[min(70dvh,620px)]">
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
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-md border border-white/10 bg-ink-950 text-3xl font-semibold text-mint">
                  {game.title.slice(0, 1).toUpperCase()}
                </div>
                <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">No cover</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <header className="rounded-lg border border-white/10 bg-ink-900/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Now reviewing</div>
          <h3 className="mt-2 text-3xl font-semibold text-white">{game.title}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{game.platform}</Badge>
            <Badge>{game.collectionType === 'wishlist' ? 'Wishlist' : 'Library'}</Badge>
            <Badge>{game.status}</Badge>
            <Badge>{game.playtimeHours}h played</Badge>
            {game.externalSource ? <Badge>{formatSource(game.externalSource)}</Badge> : null}
          </div>
        </header>

        <section className="rounded-lg border border-white/10 bg-ink-900/80 p-4">
          <h4 className="text-sm font-semibold text-white">Metadata summary</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ReviewField label="Metadata" value={game.metadataSource === 'rawg' ? 'RAWG enriched' : 'Needs enrichment'} />
            <ReviewField label="Released" value={game.released ?? game.releaseDate ?? 'Unknown'} />
            <ReviewField label="Average playtime" value={game.averagePlaytime ? `${game.averagePlaytime}h` : 'Unknown'} />
            <ReviewField label="Metacritic" value={game.metacritic ? game.metacritic.toString() : 'Unknown'} />
          </div>
          {game.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {game.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {game.notes ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{game.notes}</p> : null}
        </section>

        <section className="rounded-lg border border-white/10 bg-ink-900/80 p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {primaryActions.map((action, index) => (
              <button
                key={action.action}
                className={`qs-review-action min-h-14 rounded-md border px-3 text-left text-sm font-semibold transition ${getActionClassName(
                  action.tone,
                  highlightedActionIndex === index,
                )}`}
                onClick={() => onAction(action.action)}
                onFocus={() => onHighlight(index)}
                type="button"
              >
                <span className="block">{action.label}</span>
                <span className="mt-1 block text-xs opacity-70">{action.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {secondaryActions.map((action) => (
              <button
                key={action.action}
                className="min-h-11 rounded-md border border-skyglass/15 px-3 text-sm font-medium text-slate-200 transition hover:bg-mint/10 hover:text-white"
                onClick={() => onAction(action.action)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>

          {isNoteOpen ? (
            <div className="mt-3 rounded-md border border-mint/20 bg-mint/10 p-3">
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
  stats,
  onReturnToLibrary,
  onReviewAnother,
}: {
  sourceLabel: string;
  stats: ReviewStats;
  onReturnToLibrary: () => void;
  onReviewAnother: () => void;
}) {
  return (
    <div className="grid min-h-full place-items-center rounded-lg border border-dashed border-white/15 bg-ink-900/70 p-6 text-center">
      <div className="max-w-xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Review complete</div>
        <h3 className="mt-2 text-3xl font-semibold text-white">{sourceLabel} is clear</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">Nice. This review pass has no more games waiting.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          <ReviewStat label="Queued" value={stats.queueCandidates} />
          <ReviewStat label="Wishlist" value={stats.wishlisted} />
          <ReviewStat label="Dropped" value={stats.dropped} />
          <ReviewStat label="Ignored" value={stats.ignored} />
          <ReviewStat label="Enriched" value={stats.enriched} />
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            className="min-h-11 rounded-md border border-mint/30 bg-mint/10 px-4 text-sm font-semibold text-mint transition hover:bg-mint/20"
            onClick={onReviewAnother}
            type="button"
          >
            Review another collection
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

function updateReviewStats(stats: ReviewStats, action: ReviewModeAction): ReviewStats {
  const nextStats = { ...stats };

  if (action !== 'skip' && action !== 'open-details') {
    nextStats.reviewed += 1;
  }

  if (action === 'queue') {
    nextStats.queueCandidates += 1;
  }

  if (action === 'wishlist') {
    nextStats.wishlisted += 1;
  }

  if (action === 'dropped') {
    nextStats.dropped += 1;
  }

  if (action === 'ignore') {
    nextStats.ignored += 1;
  }

  if (action === 'enrich') {
    nextStats.enriched += 1;
  }

  return nextStats;
}

function getActionClassName(tone: 'accent' | 'neutral' | 'danger', isHighlighted: boolean) {
  if (isHighlighted) {
    return 'border-mint/70 bg-mint text-ink-950 shadow-glow';
  }

  if (tone === 'accent') {
    return 'border-mint/30 bg-mint/10 text-mint hover:bg-mint/20';
  }

  if (tone === 'danger') {
    return 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/20';
  }

  return 'border-skyglass/15 bg-ink-950/70 text-slate-200 hover:bg-mint/10 hover:text-white';
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-ink-950 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-200">{value}</div>
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-ink-950 px-3 py-2">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-300">{children}</span>;
}

function formatSource(source: NonNullable<Game['externalSource']>) {
  if (source === 'retro-rom') {
    return 'Retro';
  }

  if (source === 'steam-wishlist') {
    return 'Steam wishlist';
  }

  return source.slice(0, 1).toUpperCase() + source.slice(1);
}
