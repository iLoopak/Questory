import { useEffect, useMemo, useState } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';

type GameCardProps = {
  game: Game;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

export function GameCard({ game, onStatusChange }: GameCardProps) {
  const coverSources = useMemo(() => {
    if (typeof game.steamAppId === 'number') {
      const artworkUrls = getSteamArtworkUrls(game.steamAppId);
      return [artworkUrls.library, artworkUrls.header, artworkUrls.capsule];
    }

    return game.coverImage ? [game.coverImage] : [];
  }, [game.coverImage, game.steamAppId]);
  const [coverSourceIndex, setCoverSourceIndex] = useState(0);

  useEffect(() => {
    setCoverSourceIndex(0);
  }, [coverSources]);

  const lastPlayed = game.lastPlayedAt
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(game.lastPlayedAt),
      )
    : 'Not started';

  const activeCoverSource = coverSources[coverSourceIndex];

  return (
    <article className="grid min-h-[220px] overflow-hidden rounded-lg border border-white/10 bg-ink-800 shadow-panel sm:grid-cols-[148px_minmax(0,1fr)]">
      <div className="relative min-h-44 bg-ink-700 sm:min-h-full">
        {activeCoverSource ? (
          <img
            className="h-full w-full object-cover"
            src={activeCoverSource}
            alt=""
            loading="lazy"
            onError={() => setCoverSourceIndex((currentIndex) => currentIndex + 1)}
          />
        ) : (
          <div className="grid h-full min-h-44 place-items-center bg-ink-700 px-4 text-center sm:min-h-full">
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
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-white">{game.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{game.playtimeHours}h played - {lastPlayed}</p>
          </div>

          <select
            className="h-9 shrink-0 rounded-md border border-white/10 bg-ink-900 px-2 text-sm font-medium text-slate-100 outline-none transition focus:border-mint"
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

        <p className="line-clamp-2 text-sm leading-6 text-slate-300">{game.notes}</p>

        <div className="mt-auto flex flex-wrap gap-2">
          {game.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
