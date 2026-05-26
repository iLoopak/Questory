import { useEffect, useMemo, useState } from 'react';
import { getGameCoverSources } from '../lib/gameCoverImages';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';

type GameCardProps = {
  game: Game;
  onAddToWishlist?: (game: Game) => void;
  onMoveToLibrary?: (game: Game) => void;
  onOpenDetails: () => void;
  onRemove: (gameId: string) => void;
  onRemoveAndIgnore: (game: Game) => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

export function GameCard({
  game,
  onAddToWishlist,
  onMoveToLibrary,
  onOpenDetails,
  onRemove,
  onRemoveAndIgnore,
  onStatusChange,
}: GameCardProps) {
  const coverSources = useMemo(() => {
    return getGameCoverSources(game);
  }, [game]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);
  const [isCoverLoaded, setIsCoverLoaded] = useState(false);

  useEffect(() => {
    setCoverSourceIndex(0);
    setIsCoverLoaded(false);
  }, [coverSources]);

  const lastPlayed = game.lastPlayedAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(game.lastPlayedAt),
      )
    : 'Not started';

  const activeCoverSource = coverSources[coverSourceIndex];

  return (
    <article className="flex h-full min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-ink-800 shadow-panel">
      <div className="relative aspect-[16/9] max-h-44 shrink-0 overflow-hidden bg-ink-700">
        {activeCoverSource ? (
          <>
            {!isCoverLoaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
            <img
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                isCoverLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              src={activeCoverSource}
              alt=""
              decoding="async"
              loading="lazy"
              onError={() => {
                setIsCoverLoaded(false);
                setCoverSourceIndex((currentIndex) => currentIndex + 1);
              }}
              onLoad={() => setIsCoverLoaded(true)}
            />
          </>
        ) : (
          <div className="grid h-full place-items-center bg-ink-700 px-4 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border border-white/10 bg-ink-900 text-xl font-semibold text-mint">
                {game.title.slice(0, 1).toUpperCase()}
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">No cover</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
          {game.platform}
        </span>
        {game.collectionType === 'wishlist' ? (
          <span className="absolute right-3 top-3 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
            Wishlist
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 min-h-[3.5rem] text-lg font-semibold leading-7 text-white" title={game.title}>
              {game.title}
            </h3>
            <p className="mt-1 truncate text-sm text-slate-400">
              {game.playtimeHours}h played - {lastPlayed}
            </p>
          </div>

          <select
            className="h-9 max-w-[9rem] shrink-0 rounded-md border border-white/10 bg-ink-900 px-2 text-sm font-medium text-slate-100 outline-none transition focus:border-mint"
            value={game.status}
            aria-label={`Change status for ${game.title}`}
            onChange={(event) => onStatusChange(game.id, event.target.value as GameStatus)}
          >
            {gameStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2 text-sm text-slate-300">
          <CompactField label="Status" value={game.status} />
          <CompactField label="Enrichment" value={getEnrichmentStatus(game)} />
          {game.collectionType === 'wishlist' && game.priority ? <CompactField label="Priority" value={game.priority} /> : null}
          {game.collectionType === 'wishlist' && game.priceTarget ? (
            <CompactField label="Price target" value={game.priceTarget} />
          ) : null}
        </div>

        <div className="flex min-h-[2rem] flex-wrap gap-2">
          {game.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
              {tag}
            </span>
          ))}
          {game.tags.length > 4 ? (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-500">
              +{game.tags.length - 4}
            </span>
          ) : null}
        </div>

        <div className="mt-auto border-t border-white/10 pt-3">
          <div className="grid gap-2">
            <button
              className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
              onClick={onOpenDetails}
              type="button"
            >
              Details
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              {game.collectionType === 'wishlist' ? (
                <>
                  <button
                    className="h-9 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-medium text-mint transition hover:bg-mint/20"
                    onClick={() => onMoveToLibrary?.(game)}
                    type="button"
                  >
                    Move to Library
                  </button>
                  <button
                    className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                    onClick={() => onRemove(game.id)}
                    type="button"
                  >
                    Remove Wishlist
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                    onClick={() => onAddToWishlist?.(game)}
                    type="button"
                  >
                    Add to Wishlist
                  </button>
                  <button
                    className="h-9 rounded-md border border-red-400/30 px-3 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-600"
                    disabled={typeof game.steamAppId !== 'number'}
                    onClick={() => onRemoveAndIgnore(game)}
                    type="button"
                  >
                    Remove + ignore
                  </button>
                </>
              )}
            </div>
            {game.collectionType === 'library' ? (
              <button
                className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                onClick={() => onRemove(game.id)}
                type="button"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

type CompactFieldProps = {
  label: string;
  value: string;
};

function CompactField({ label, value }: CompactFieldProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-ink-900 px-2.5 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="truncate text-right text-slate-200">{value}</div>
    </div>
  );
}

function getEnrichmentStatus(game: Game) {
  if (game.metadataSource === 'rawg') {
    return 'RAWG enriched';
  }

  if (game.metadataManualManagedAt) {
    return 'Manual';
  }

  if (game.metadataSkippedAt) {
    return 'Skipped';
  }

  return 'Missing RAWG';
}
