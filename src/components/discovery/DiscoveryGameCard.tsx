import type { Game } from '../../types/game';
import type { DiscoveryGame } from '../../lib/discovery';

type LibraryStatus = 'library' | 'wishlist' | null;

function getLibraryStatus(rawgId: number, games: Game[]): LibraryStatus {
  const match = games.find((g) => g.rawgId === rawgId);
  if (!match) return null;
  return match.collectionType === 'wishlist' ? 'wishlist' : 'library';
}

function metacriticColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

type Props = {
  game: DiscoveryGame;
  userGames: Game[];
  onClick?: () => void;
};

export function DiscoveryGameCard({ game, userGames, onClick }: Props) {
  const libraryStatus = getLibraryStatus(game.rawgId, userGames);
  const isClickable = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`group relative flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-950 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/70 ${
        isClickable
          ? 'cursor-pointer hover:border-white/20 hover:bg-ink-900'
          : 'cursor-default'
      }`}
      aria-label={game.title}
    >
      {/* Cover */}
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
          <div className="flex h-full items-center justify-center text-slate-700">
            <span className="text-3xl">🎮</span>
          </div>
        )}

        {/* Metacritic badge — top right overlay */}
        {game.metacritic ? (
          <span
            className={`absolute right-1.5 top-1.5 rounded-md bg-ink-950/80 px-1.5 py-0.5 text-[10px] font-bold tabular-nums backdrop-blur-sm ${metacriticColor(game.metacritic)}`}
          >
            {game.metacritic}
          </span>
        ) : null}
      </div>

      {/* Card body */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
          {game.title}
        </p>

        {/* Platform list */}
        {game.platforms.length > 0 ? (
          <p className="truncate text-[10px] leading-snug text-slate-600">
            {game.platforms.join(' · ')}
          </p>
        ) : null}

        {/* Library badges */}
        {libraryStatus ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
            {libraryStatus === 'library' ? (
              <span className="inline-flex rounded-full bg-mint/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-mint">
                In Library
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-purple-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-300">
                Wishlist
              </span>
            )}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export function DiscoveryGameCardSkeleton() {
  return (
    <div className="w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-ink-950">
      <div className="aspect-[2/3] w-full animate-pulse bg-ink-900" />
      <div className="space-y-2 p-2">
        <div className="h-3 w-full animate-pulse rounded bg-ink-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-ink-800" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-ink-800" />
      </div>
    </div>
  );
}
