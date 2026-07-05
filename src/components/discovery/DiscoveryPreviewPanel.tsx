import { useEffect, useRef, useState } from 'react';
import type { Game } from '../../types/game';
import type { RawgGameDetails } from '../../types/rawg';
import type { DiscoveryCandidate, DiscoveryGame } from '../../lib/discovery';
import { getGameDetails, getGameScreenshots } from '../../services/rawgApi';
import { Icon } from '../Icon';

type Props = {
  candidate: DiscoveryCandidate;
  userGames: Game[];
  discoveryInboxRawgIds: Set<number>;
  onClose: () => void;
  onAddToInbox: (game: DiscoveryGame, reason: string) => void;
  onAddToWishlist: (game: DiscoveryGame) => void;
  onAddToLibrary: (game: DiscoveryGame) => void;
};

export function DiscoveryPreviewPanel({
  candidate,
  userGames,
  discoveryInboxRawgIds,
  onClose,
  onAddToInbox,
  onAddToWishlist,
  onAddToLibrary,
}: Props) {
  const { game, reason } = candidate;
  const [details, setDetails] = useState<RawgGameDetails | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Derive real-time status from props (reacts to changes while the panel is open).
  const realMatch = userGames.find((g) => g.rawgId === game.rawgId);
  const isInLibrary = realMatch?.collectionType === 'library';
  const isInWishlist = realMatch?.collectionType === 'wishlist';
  const isInInbox = discoveryInboxRawgIds.has(game.rawgId);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDetails(null);
    setScreenshots([]);
    scrollRef.current?.scrollTo({ top: 0 });

    Promise.all([
      getGameDetails(game.rawgId),
      getGameScreenshots(game.rawgId).catch(() => []),
    ]).then(([d, s]) => {
      if (cancelled) return;
      setDetails(d);
      setScreenshots(s);
      setIsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [game.rawgId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const heroSrc = details?.background_image ?? game.coverUrl;
  const coverSrc = game.coverUrl;
  const releaseYear = game.released ? game.released.slice(0, 4) : null;
  const developers = details?.developers?.map((d) => d.name) ?? [];
  const publishers = details?.publishers?.map((p) => p.name) ?? [];
  const genres = game.genres.length > 0 ? game.genres : (details?.genres?.map((g) => g.name) ?? []);
  const metacritic = game.metacritic;
  const avgPlaytime = details?.playtime;
  const description = details?.description_raw;

  return (
    <div
      ref={scrollRef}
      aria-label={`Preview: ${game.title}`}
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink-950"
      role="dialog"
    >
      {/* ── Hero image ── */}
      <div className="relative h-52 shrink-0 sm:h-72">
        {heroSrc ? (
          <>
            <img
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              src={heroSrc}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-transparent to-ink-950" />
          </>
        ) : (
          <div className="h-full bg-gradient-to-b from-ink-900 to-ink-950" />
        )}

        {/* Back button */}
        <button
          aria-label="Back"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink-950/70 text-white backdrop-blur-sm transition hover:bg-ink-950"
          onClick={onClose}
          type="button"
        >
          <Icon name="arrow-left" size={18} />
        </button>

        {/* Reason badge */}
        {reason ? (
          <span className="absolute right-4 top-4 rounded-full bg-ink-950/70 px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur-sm">
            {reason}
          </span>
        ) : null}

        {/* Portrait cover — overlaps hero bottom */}
        <div className="absolute bottom-0 left-4 translate-y-1/2">
          {coverSrc ? (
            <img
              alt={game.title}
              className="h-28 w-20 rounded-xl border border-skyglass/20 object-cover shadow-xl sm:h-32 sm:w-24"
              decoding="async"
              src={coverSrc}
            />
          ) : (
            <div className="flex h-28 w-20 items-center justify-center rounded-xl border border-skyglass/20 bg-ink-800 shadow-xl sm:h-32 sm:w-24">
              <Icon className="text-slate-600" name="gamepad-2" size={28} />
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="px-4 pb-48 sm:pb-44">
        {/* Spacer for cover portrait overlap */}
        <div className="h-16 sm:h-18" />

        {/* Title + metacritic */}
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {game.title}
          </h1>
          {metacritic ? (
            <span className={`mt-1 shrink-0 rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums ${metacriticStyle(metacritic)}`}>
              MC {metacritic}
            </span>
          ) : null}
        </div>

        {/* Year · developer · avg playtime */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
          {releaseYear ? <span>{releaseYear}</span> : null}
          {developers.length > 0 ? <span>{developers.slice(0, 2).join(', ')}</span> : null}
          {avgPlaytime && avgPlaytime > 0 ? <span>~{avgPlaytime}h avg playtime</span> : null}
        </div>

        {/* Publisher */}
        {publishers.length > 0 ? (
          <p className="mt-1 text-xs text-slate-600">Published by {publishers.slice(0, 2).join(', ')}</p>
        ) : null}

        {/* Genres */}
        {genres.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {genres.slice(0, 6).map((g) => (
              <span
                key={g}
                className="rounded-full border border-skyglass/20 bg-ink-900/60 px-2.5 py-0.5 text-xs font-medium text-slate-300"
              >
                {g}
              </span>
            ))}
          </div>
        ) : null}

        {/* Platform badges */}
        {game.platforms.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {game.platforms.slice(0, 5).map((p) => (
              <span key={p} className="rounded bg-ink-900/80 px-1.5 py-0.5 text-xs text-slate-500">
                {p}
              </span>
            ))}
          </div>
        ) : null}

        {/* Description */}
        {isLoading ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-ink-800"
                style={{ width: `${[100, 90, 95, 85, 75][i]}%` }}
              />
            ))}
          </div>
        ) : description ? (
          <p className="mt-6 line-clamp-8 text-sm leading-relaxed text-slate-400">{description}</p>
        ) : null}

        {/* Screenshots */}
        {screenshots.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Screenshots
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {screenshots.map((src, i) => (
                <img
                  key={i}
                  alt=""
                  className="h-28 w-48 shrink-0 rounded-lg object-cover sm:h-32 sm:w-56"
                  decoding="async"
                  loading="lazy"
                  src={src}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Sticky action bar ── */}
      <div className="fixed inset-x-0 bottom-0 border-t border-skyglass/15 bg-ink-950/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] pt-3 backdrop-blur-sm">
        {isInLibrary ? (
          <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-mint/20 bg-mint/10 text-sm font-semibold text-mint">
            <Icon name="check" size={16} strokeWidth={2.5} />
            Already in your Library
          </div>
        ) : isInWishlist ? (
          <div className="space-y-2">
            <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-purple-400/20 bg-purple-400/10 text-sm font-semibold text-purple-300">
              <Icon name="heart" size={16} strokeWidth={2.5} />
              In your Wishlist
            </div>
            <button
              className="flex h-11 w-full items-center justify-center rounded-xl border border-mint/30 bg-mint/10 text-sm font-semibold text-mint transition hover:bg-mint/20"
              onClick={() => onAddToLibrary(game)}
              type="button"
            >
              Move to Library
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {isInInbox ? (
              <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-sm font-semibold text-amber-400">
                <Icon name="check" size={16} strokeWidth={2.5} />
                In Discovery Inbox
              </div>
            ) : (
              <button
                className="flex h-11 w-full items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-sm font-semibold text-amber-400 transition hover:bg-amber-400/20"
                onClick={() => onAddToInbox(game, reason ?? '')}
                type="button"
              >
                Review Later
              </button>
            )}
            <div className="flex gap-2">
              <button
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-400/10 text-sm font-semibold text-purple-300 transition hover:bg-purple-400/20"
                onClick={() => onAddToWishlist(game)}
                type="button"
              >
                Add to Wishlist
              </button>
              <button
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-mint/30 bg-mint/10 text-sm font-semibold text-mint transition hover:bg-mint/20"
                onClick={() => onAddToLibrary(game)}
                type="button"
              >
                Add to Library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function metacriticStyle(score: number): string {
  if (score >= 75) return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400';
  if (score >= 50) return 'border-amber-400/30 bg-amber-400/15 text-amber-400';
  return 'border-red-500/30 bg-red-500/15 text-red-400';
}
