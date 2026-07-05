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

  const isLibraryGame = libraryStatus === 'library';
  const isWishlistGame = libraryStatus === 'wishlist';
  const isOwned = isLibraryGame || isWishlistGame;
  const year = releaseYear(game.released);
  const displayedGenres = game.genres.slice(0, 2);

  // A game can be added to the inbox only when it's not already owned or already waiting.
  const canAddToInbox = !isOwned && !inboxStatus && onAddToInbox != null;

  function handleCardClick() {
    if (isLibraryGame && onOpenDetail) onOpenDetail();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ') && isLibraryGame && onOpenDetail) {
      e.preventDefault();
      onOpenDetail();
    }
  }

  return (
    <div
      className={`group relative flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-950 transition-colors
        ${isLibraryGame ? 'cursor-pointer hover:border-white/20 hover:bg-ink-900 focus-within:border-mint/40' : 'cursor-default'}
      `}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role={isLibraryGame ? 'button' : undefined}
      tabIndex={isLibraryGame ? 0 : undefined}
      aria-label={isLibraryGame ? `Open ${game.title}` : game.title}
    >
      {/* Cover image area */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-ink-900">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon name="gamepad-2" size={28} className="text-slate-700" />
          </div>
        )}

        {/* Steam icon — top left */}
        {game.hasSteamVersion ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-ink-950/80 p-1 backdrop-blur-sm">
            <Icon name="steam" size={10} className="text-white/60" />
          </span>
        ) : null}

        {/* Metacritic — top right */}
        {game.metacritic ? (
          <span
            className={`absolute right-1.5 top-1.5 rounded-md bg-ink-950/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums backdrop-blur-sm ${metacriticColor(game.metacritic)}`}
          >
            {game.metacritic}
          </span>
        ) : null}

        {/* "Review Later" — desktop hover overlay (hover-capable devices only) */}
        {canAddToInbox ? (
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-stretch justify-end gap-1 p-1.5 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 transition-opacity duration-200 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="w-full rounded-lg bg-amber-400/90 px-2 py-1.5 text-[10px] font-semibold text-ink-950 transition hover:bg-amber-400"
              onClick={() => onAddToInbox(game, candidate.reason ?? '')}
            >
              Review Later
            </button>
          </div>
        ) : null}

        {/* "Review Later" — persistent touch button (non-hover devices only) */}
        {canAddToInbox ? (
          <button
            type="button"
            className="[@media(hover:hover)]:hidden absolute bottom-1.5 right-1.5 rounded-lg bg-amber-400/90 px-2 py-1 text-[9px] font-semibold text-ink-950 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddToInbox(game, candidate.reason ?? '');
            }}
          >
            Review Later
          </button>
        ) : null}
      </div>

      {/* Card body */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
          {game.title}
        </p>

        {year ? (
          <p className="text-[10px] leading-none text-slate-600">{year}</p>
        ) : null}

        {displayedGenres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {displayedGenres.map((genre) => (
              <span
                key={genre}
                className="inline-flex rounded-full bg-ink-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-500"
              >
                {genre}
              </span>
            ))}
          </div>
        ) : null}

        {candidate.reason ? (
          <p className="text-[9px] italic leading-snug text-slate-600">{candidate.reason}</p>
        ) : null}

        {/* Status badges */}
        {(isOwned || inboxStatus) ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
            {isLibraryGame ? (
              <span className="inline-flex rounded-full bg-mint/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-mint">
                In Library
              </span>
            ) : isWishlistGame ? (
              <span className="inline-flex rounded-full bg-purple-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-300">
                Wishlist
              </span>
            ) : inboxStatus ? (
              <span className="inline-flex rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                In Inbox
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function DiscoveryGameCardSkeleton() {
  return (
    <div className="w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
      <div className="aspect-[2/3] w-full animate-pulse bg-ink-900" />
      <div className="space-y-2 p-2">
        <div className="h-3 w-full animate-pulse rounded bg-ink-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-ink-800" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-ink-800" />
        <div className="flex gap-1">
          <div className="h-4 w-10 animate-pulse rounded-full bg-ink-800" />
          <div className="h-4 w-12 animate-pulse rounded-full bg-ink-800" />
        </div>
      </div>
    </div>
  );
}
