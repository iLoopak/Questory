import { useEffect, useMemo, useState } from 'react';
import { getSteamArtworkUrls } from '../lib/steamArtwork';
import { getGameDetails, mapRawgDetailsToMetadata, RawgApiError, searchGameByName } from '../services/rawgApi';
import type { Game, GameStatus } from '../types/game';
import { gameStatuses } from '../types/game';
import type { RawgMetadata, RawgSearchResult } from '../types/rawg';

type GameCardProps = {
  game: Game;
  onMetadataUpdate: (gameId: string, metadata: RawgMetadata) => void;
  onOpenDetails: () => void;
  onStatusChange: (gameId: string, status: GameStatus) => void;
};

type MetadataState = {
  status: 'idle' | 'loading' | 'matches' | 'saving' | 'success' | 'error';
  message: string;
  matches: RawgSearchResult[];
};

const initialMetadataState: MetadataState = {
  status: 'idle',
  message: '',
  matches: [],
};

export function GameCard({ game, onMetadataUpdate, onOpenDetails, onStatusChange }: GameCardProps) {
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
  const [metadataState, setMetadataState] = useState<MetadataState>(initialMetadataState);

  async function findMetadata() {
    setMetadataState({
      status: 'loading',
      message: 'Searching RAWG...',
      matches: [],
    });

    try {
      const matches = await searchGameByName(game.title);

      setMetadataState({
        status: 'matches',
        message: `Found ${matches.length} possible matches.`,
        matches,
      });
    } catch (error) {
      setMetadataState({
        status: 'error',
        message:
          error instanceof RawgApiError
            ? error.message
            : 'RAWG metadata search failed. Check the API key and network access.',
        matches: [],
      });
    }
  }

  async function applyMetadataMatch(rawgId: number) {
    setMetadataState((currentState) => ({
      ...currentState,
      status: 'saving',
      message: 'Saving RAWG metadata...',
    }));

    try {
      const details = await getGameDetails(rawgId);
      onMetadataUpdate(game.id, mapRawgDetailsToMetadata(details));
      setMetadataState({
        status: 'success',
        message: `Saved RAWG metadata for ${details.name}.`,
        matches: [],
      });
    } catch (error) {
      setMetadataState({
        status: 'error',
        message:
          error instanceof RawgApiError
            ? error.message
            : 'RAWG metadata details failed. Check the API key and try again.',
        matches: [],
      });
    }
  }

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

        <MetadataSummary game={game} />

        <div className="border-t border-white/10 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              {game.metadataSource === 'rawg' ? 'RAWG enriched' : 'Metadata'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                onClick={onOpenDetails}
                type="button"
              >
                Details
              </button>
              <button
                className="h-9 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                disabled={metadataState.status === 'loading' || metadataState.status === 'saving'}
                onClick={findMetadata}
                type="button"
              >
                {metadataState.status === 'loading' ? 'Searching...' : 'Find metadata'}
              </button>
            </div>
          </div>

          {metadataState.message ? (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm leading-6 ${
                metadataState.status === 'error'
                  ? 'border-red-400/40 bg-red-500/10 text-red-200'
                  : 'border-white/10 bg-ink-900 text-slate-300'
              }`}
            >
              {metadataState.message}
            </div>
          ) : null}

          {metadataState.status === 'matches' ? (
            <div className="mt-3 space-y-2">
              {metadataState.matches.map((match) => (
                <button
                  key={match.id}
                  className="grid w-full gap-3 rounded-md border border-white/10 bg-ink-900 p-2 text-left transition hover:border-mint/50 sm:grid-cols-[64px_minmax(0,1fr)]"
                  onClick={() => applyMetadataMatch(match.id)}
                  type="button"
                >
                  {match.background_image ? (
                    <img
                      alt=""
                      className="h-14 w-full rounded bg-ink-800 object-cover sm:w-16"
                      loading="lazy"
                      src={match.background_image}
                    />
                  ) : (
                    <div className="h-14 rounded bg-ink-800 sm:w-16" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{match.name}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {match.released ?? 'Unknown release'} - Metacritic {match.metacritic ?? 'n/a'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type MetadataSummaryProps = {
  game: Game;
};

function MetadataSummary({ game }: MetadataSummaryProps) {
  const hasMetadata = game.metadataSource === 'rawg';

  if (!hasMetadata) {
    return null;
  }

  return (
    <div className="rounded-md border border-white/10 bg-ink-900 p-3">
      <div className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <MetadataField label="Released" value={game.released ?? 'Unknown'} />
        <MetadataField label="Metacritic" value={game.metacritic?.toString() ?? 'n/a'} />
        <MetadataField label="Avg playtime" value={game.averagePlaytime ? `${game.averagePlaytime}h` : 'n/a'} />
        <MetadataField label="Developers" value={game.developers?.join(', ') || 'n/a'} />
        <MetadataField label="Publishers" value={game.publishers?.join(', ') || 'n/a'} />
      </div>

      {game.genres && game.genres.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {game.genres.map((genre) => (
            <span key={genre} className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-medium text-mint">
              {genre}
            </span>
          ))}
        </div>
      ) : null}

      {game.rawgTags && game.rawgTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {game.rawgTags.slice(0, 6).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type MetadataFieldProps = {
  label: string;
  value: string;
};

function MetadataField({ label, value }: MetadataFieldProps) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-slate-200">{value}</div>
    </div>
  );
}
