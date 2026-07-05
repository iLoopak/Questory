import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { Icon } from '../Icon';
import { GameCardShell, GameCardShellSkeleton } from '../GameCardShell';

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (canAddToInbox) {
        onAddToInbox!(game, reason ?? '');
      } else if (isLibraryGame && onOpenDetail) {
        onOpenDetail();
      }
    }
  }

  // Status badge — bottom-left of cover, same slot as ShelfGameCard's platform + status badges.
  const statusBadge = isLibraryGame ? (
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
  ) : null;

  // Metacritic badge — top-right of cover, a Discovery-specific extension.
  const metacriticBadge = game.metacritic ? (
    <span
      className={`absolute right-3 top-3 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm ${metacriticColor(game.metacritic)}`}
    >
      {game.metacritic}
    </span>
  ) : null;

  // Cover image or icon fallback.
  const coverContent = game.coverUrl ? (
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
  );

  // Secondary line: reason text preferred over plain year.
  const secondaryLine = reason ? (
    <p className="mt-0.5 line-clamp-2 text-xs italic leading-snug text-slate-500">{reason}</p>
  ) : year ? (
    <p className="mt-0.5 text-xs leading-snug text-slate-600">{year}</p>
  ) : null;

  // Action area: mirrors ShelfGameCard's button slot (amber for discovery, mint for library).
  // A height placeholder keeps all cards in a strip at the same total height.
  const action = canAddToInbox ? (
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
    <span className="min-h-10 flex-1" />
  );

  return (
    <GameCardShell
      ariaLabel={game.title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      coverContent={coverContent}
      coverBadgesBottom={statusBadge}
      coverBadgeTopRight={metacriticBadge}
      title={game.title}
      secondaryLine={secondaryLine}
      action={action}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton — delegates to the shared shell skeleton.
// ---------------------------------------------------------------------------

export function DiscoveryGameCardSkeleton() {
  return <GameCardShellSkeleton />;
}
