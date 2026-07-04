import { useState } from 'react';
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
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
};

export function DiscoveryGameCard({
  candidate,
  onOpenDetail,
  onAddToWishlist,
  onAddToLibrary,
}: Props) {
  const { game, libraryStatus } = candidate;
  const [touchOverlayOpen, setTouchOverlayOpen] = useState(false);

  const isLibraryGame = libraryStatus === 'library';
  const isWishlistGame = libraryStatus === 'wishlist';
  const hasAddActions = !isLibraryGame && (onAddToWishlist || onAddToLibrary);
  const year = releaseYear(game.released);

  function handleCardClick() {
    if (isLibraryGame && onOpenDetail) {
      onOpenDetail();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ') && isLibraryGame && onOpenDetail) {
      e.preventDefault();
      onOpenDetail();
    }
  }

  const displayedGenres = game.genres.slice(0, 2);

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
      {/* ------------------------------------------------------------------ */}
      {/* Cover image area                                                     */}
      {/* ------------------------------------------------------------------ */}
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

        {/* ---------------------------------------------------------------- */}
        {/* Quick action overlay — hover on desktop, state-toggle on touch   */}
        {/* ---------------------------------------------------------------- */}
        {hasAddActions ? (
          <>
            {/* Desktop hover overlay */}
            <div
              className={`pointer-events-none absolute inset-0 flex flex-col items-stretch justify-end gap-1 p-1.5
                bg-gradient-to-t from-black/80 via-black/30 to-transparent
                opacity-0 transition-opacity duration-200
                [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100
              `}
              onClick={(e) => e.stopPropagation()}
            >
              <ActionButtons
                game={game}
                libraryStatus={libraryStatus}
                onAddToWishlist={onAddToWishlist}
                onAddToLibrary={onAddToLibrary}
              />
            </div>

            {/* Touch: small + trigger (hidden on hover-capable devices) */}
            <button
              type="button"
              className="[@media(hover:hover)]:hidden absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/90 text-white/80 backdrop-blur-sm"
              aria-label="Add game"
              onClick={(e) => {
                e.stopPropagation();
                setTouchOverlayOpen(true);
              }}
            >
              <span className="text-sm font-bold leading-none">+</span>
            </button>

            {/* Touch overlay (state-driven) */}
            {touchOverlayOpen ? (
              <div
                className="absolute inset-0 flex flex-col items-stretch justify-center gap-1.5 p-2 bg-black/85 backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <ActionButtons
                  game={game}
                  libraryStatus={libraryStatus}
                  onAddToWishlist={onAddToWishlist}
                  onAddToLibrary={onAddToLibrary}
                  onClose={() => setTouchOverlayOpen(false)}
                />
                <button
                  type="button"
                  className="mt-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400"
                  onClick={() => setTouchOverlayOpen(false)}
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Card body                                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
          {game.title}
        </p>

        {/* Year */}
        {year ? (
          <p className="text-[10px] leading-none text-slate-600">{year}</p>
        ) : null}

        {/* Genre chips */}
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

        {/* Library badges */}
        {libraryStatus ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
            {isLibraryGame ? (
              <span className="inline-flex rounded-full bg-mint/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-mint">
                In Library
              </span>
            ) : isWishlistGame ? (
              <span className="inline-flex rounded-full bg-purple-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-300">
                Wishlist
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action buttons — shared between hover overlay and touch overlay
// ---------------------------------------------------------------------------

function ActionButtons({
  game,
  libraryStatus,
  onAddToWishlist,
  onAddToLibrary,
  onClose,
}: {
  game: DiscoveryGame;
  libraryStatus: DiscoveryCandidate['libraryStatus'];
  onAddToWishlist?: (game: DiscoveryGame) => void;
  onAddToLibrary?: (game: DiscoveryGame) => void;
  onClose?: () => void;
}) {
  function act(fn: (() => void) | undefined) {
    fn?.();
    onClose?.();
  }

  return (
    <>
      {libraryStatus !== 'library' && onAddToLibrary ? (
        <button
          type="button"
          className="w-full rounded-lg bg-mint/90 px-2 py-1.5 text-[10px] font-semibold text-ink-950 transition hover:bg-mint"
          onClick={() => act(() => onAddToLibrary(game))}
        >
          + Library
        </button>
      ) : null}
      {libraryStatus !== 'wishlist' && libraryStatus !== 'library' && onAddToWishlist ? (
        <button
          type="button"
          className="w-full rounded-lg border border-white/15 bg-ink-900/80 px-2 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-ink-800 hover:text-white"
          onClick={() => act(() => onAddToWishlist(game))}
        >
          + Wishlist
        </button>
      ) : null}
      {/* Wishlist game — can still add to library */}
      {libraryStatus === 'wishlist' && onAddToLibrary ? (
        <button
          type="button"
          className="w-full rounded-lg bg-mint/90 px-2 py-1.5 text-[10px] font-semibold text-ink-950 transition hover:bg-mint"
          onClick={() => act(() => onAddToLibrary(game))}
        >
          + Library
        </button>
      ) : null}
    </>
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
