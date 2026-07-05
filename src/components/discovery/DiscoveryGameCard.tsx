import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { Icon } from '../Icon';

function metacriticColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function releaseYear(released: string | null): string | null {
  if (!released) return null;
  const m = released.match(/^(\d{4})/);
  return m ? m[1] : null;
}

type Props = {
  candidate: DiscoveryCandidate;
  onOpenDetail?: () => void;
  onAddToInbox?: (game: DiscoveryGame, reason: string) => void;
};

export function DiscoveryGameCard({ candidate, onOpenDetail, onAddToInbox }: Props) {
  const { game, libraryStatus, inboxStatus } = candidate;
  const reason = candidate.reason;

  const isLibraryGame = libraryStatus === 'library';
  const isWishlistGame = libraryStatus === 'wishlist';
  const isOwned = isLibraryGame || isWishlistGame;
  const year = releaseYear(game.released);

  const canAddToInbox = !isOwned && !inboxStatus && onAddToInbox != null;

  function handleClick() {
    if (isLibraryGame && onOpenDetail) onOpenDetail();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (canAddToInbox) {
        onAddToInbox!(game, reason ?? '');
      } else if (isLibraryGame && onOpenDetail) {
        onOpenDetail();
      }
    }
  }

  return (
    <div
      aria-label={game.title}
      className="group relative flex w-[clamp(11rem,22vw,16rem)] shrink-0 flex-col rounded-xl border border-skyglass/18 bg-ink-950/80 p-2 text-left shadow-panel transition duration-200 hover:-translate-y-1 hover:border-mint/45 hover:shadow-glow focus-visible:-translate-y-1 focus-visible:border-mint/80 focus-visible:shadow-glow focus-visible:outline-none"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/* Cover */}
      <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-ink-700">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Icon name="gamepad-2" size={28} className="text-slate-700" />
          </span>
        )}

        {/* Cover gradient */}
        <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" />

        {/* Status badge — bottom left, mirrors ShelfGameCard badge row */}
        <span className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
          {isLibraryGame ? (
            <span className="inline-flex items-center rounded-full bg-mint/15 px-2.5 py-1 text-xs font-semibold text-mint">
              In Library
            </span>
          ) : isWishlistGame ? (
            <span className="inline-flex items-center rounded-full bg-purple-400/15 px-2.5 py-1 text-xs font-semibold text-purple-300">
              Wishlist
            </span>
          ) : inboxStatus ? (
            <span className="inline-flex items-center rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-400">
              In Inbox
            </span>
          ) : game.hasSteamVersion ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2.5 py-1 text-xs font-semibold text-white/50">
              <Icon name="steam" size={11} />
              Steam
            </span>
          ) : null}
        </span>

        {/* Metacritic — top right (Discovery-specific extension) */}
        {game.metacritic ? (
          <span
            className={`absolute right-2 top-2 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm ${metacriticColor(game.metacritic)}`}
          >
            {game.metacritic}
          </span>
        ) : null}
      </span>

      {/* Title */}
      <span className="mt-2.5 block min-h-[2.75rem]">
        <span className="line-clamp-2 text-base font-semibold leading-6 text-white">{game.title}</span>
      </span>

      {/* Reason or year — Discovery-specific secondary line */}
      {reason ? (
        <p className="mt-0.5 line-clamp-2 text-xs italic leading-snug text-slate-500">{reason}</p>
      ) : year ? (
        <p className="mt-0.5 text-xs leading-snug text-slate-600">{year}</p>
      ) : null}

      {/* Action row — mirrors ShelfGameCard's bottom action area */}
      <span className="mt-2.5 flex items-center" onClick={(e) => e.stopPropagation()}>
        {canAddToInbox ? (
          <button
            type="button"
            className="min-h-10 flex-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 text-sm font-semibold text-amber-400 transition hover:bg-amber-400/20 hover:shadow-glow focus-visible:bg-amber-400 focus-visible:text-ink-950 focus-visible:outline-none"
            onClick={() => onAddToInbox!(game, reason ?? '')}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Review Later
          </button>
        ) : isLibraryGame && onOpenDetail ? (
          <button
            type="button"
            className="min-h-10 flex-1 rounded-md border border-mint/30 bg-mint/10 px-3 text-sm font-semibold text-mint transition hover:bg-mint/20 hover:shadow-glow focus-visible:bg-mint focus-visible:text-ink-950 focus-visible:outline-none"
            onClick={onOpenDetail}
            onKeyDown={(e) => e.stopPropagation()}
          >
            Open
          </button>
        ) : (
          // Height placeholder so all cards in a row share the same total height.
          <span className="min-h-10" />
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function DiscoveryGameCardSkeleton() {
  return (
    <div className="flex w-[clamp(11rem,22vw,16rem)] shrink-0 flex-col rounded-xl border border-skyglass/18 bg-ink-950/80 p-2 shadow-panel">
      <span className="block aspect-[3/4] animate-pulse rounded-lg bg-ink-800" />
      <span className="mt-2.5 block min-h-[2.75rem] space-y-2">
        <span className="block h-4 w-full animate-pulse rounded bg-ink-800" />
        <span className="block h-4 w-3/4 animate-pulse rounded bg-ink-800" />
      </span>
      <span className="mt-0.5 block h-3 w-1/2 animate-pulse rounded bg-ink-800" />
      <span className="mt-2.5 block h-10 animate-pulse rounded-md bg-ink-800" />
    </div>
  );
}
