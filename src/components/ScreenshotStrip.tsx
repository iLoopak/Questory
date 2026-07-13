import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../types/game';
import { isMissingOrGeneratedCover } from '../lib/gameCoverImages';
import { useGameScreenshots } from '../hooks/useGameScreenshots';
import { useDiscoveryScreenshots } from '../hooks/useDiscoveryScreenshots';
import { Icon } from './Icon';

// ─── Lightbox ─────────────────────────────────────────────────────────────────

type LightboxProps = {
  screenshots: string[];
  initialIndex: number;
  gameTitle: string;
  onClose: () => void;
};

function ScreenshotLightbox({ screenshots, initialIndex, gameTitle, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const total = screenshots.length;

  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const next = () => setIdx((i) => Math.min(total - 1, i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      aria-label={`${gameTitle} screenshot ${idx + 1} of ${total}`}
      aria-modal="true"
      data-lightbox="screenshot"
      className="fixed inset-0 z-[10002] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      {/* Image */}
      <div
        className="relative flex max-h-[88dvh] max-w-[92dvw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          alt={`${gameTitle} screenshot ${idx + 1}`}
          className="max-h-[85dvh] max-w-[90dvw] rounded-xl object-contain shadow-2xl"
          draggable={false}
          src={screenshots[idx]}
        />

        {/* Prev */}
        {idx > 0 && (
          <button
            aria-label="Previous screenshot"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white/80 transition hover:bg-black/70 hover:text-white"
            onClick={prev}
            type="button"
          >
            <Icon name="chevron-left" />
          </button>
        )}

        {/* Next */}
        {idx < total - 1 && (
          <button
            aria-label="Next screenshot"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white/80 transition hover:bg-black/70 hover:text-white"
            onClick={next}
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {total > 1 && (
        <div
          aria-hidden="true"
          className="mt-4 flex gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {screenshots.map((_, i) => (
            <button
              key={i}
              className={`rounded-full transition-all ${
                i === idx
                  ? 'h-1.5 w-4 bg-white'
                  : 'h-1.5 w-1.5 bg-white/35 hover:bg-white/60'
              }`}
              onClick={() => setIdx(i)}
              type="button"
            />
          ))}
        </div>
      )}

      {/* Close */}
      <button
        aria-label="Close screenshots"
        className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white/70 transition hover:bg-black/60 hover:text-white"
        onClick={onClose}
        type="button"
      >
        <Icon name="x" />
      </button>
    </div>,
    document.body,
  );
}

// ─── Strip ────────────────────────────────────────────────────────────────────

type GameScreenshotGalleryProps = {
  title: string;
  screenshots: string[];
  loading?: boolean;
  className?: string;
  skeletonCount?: number;
  thumbnailClassName?: string;
};

export function GameScreenshotGallery({
  title,
  screenshots,
  loading = false,
  className = '',
  skeletonCount = 3,
  thumbnailClassName = 'h-12 w-[5.5rem]',
}: GameScreenshotGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!loading && screenshots.length === 0) return null;

  return (
    <div className={`screenshot-strip ${className}`}>
      {loading ? (
        <div aria-hidden="true" className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div
              key={i}
              className={`${thumbnailClassName} flex-shrink-0 animate-pulse rounded-lg bg-white/8`}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {screenshots.map((url, i) => (
            <button
              key={url}
              aria-label={`View screenshot ${i + 1} of ${screenshots.length} for ${title}`}
              className="group flex-shrink-0 overflow-hidden rounded-lg border border-white/10 transition hover:border-white/30 focus-visible:border-accent focus-visible:outline-none"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setLightboxIndex(i);
              }}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                className={`${thumbnailClassName} object-cover transition group-hover:brightness-110`}
                decoding="async"
                draggable={false}
                loading="lazy"
                src={url}
              />
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ScreenshotLightbox
          gameTitle={title}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          screenshots={screenshots}
        />
      )}
    </div>
  );
}

type ScreenshotStripProps = {
  game: Game;
  className?: string;
};

export function ScreenshotStrip({ game, className = '' }: ScreenshotStripProps) {
  const { screenshots, loading, error, refetch } = useGameScreenshots(game);

  // Show "Find screenshots" prompt only for games with missing/generated cover art
  // and no screenshots after the fetch resolves.
  const hasMissingArt = isMissingOrGeneratedCover(game.coverImage);
  const showFindPrompt = !loading && screenshots.length === 0 && hasMissingArt;

  // AS-13: a temporary failure is not "this game has no screenshots" — it gets a Retry, in the
  // affordance this strip already had.
  if (error && screenshots.length === 0) {
    return (
      <div className={`screenshot-strip ${className}`}>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 focus-visible:border-accent focus-visible:outline-none"
          onClick={refetch}
          type="button"
        >
          <Icon name="refresh-cw" />
          Screenshots unavailable — Retry
        </button>
      </div>
    );
  }

  // Return null when there's nothing to show and no prompt to display.
  if (!loading && screenshots.length === 0 && !showFindPrompt) return null;

  if (loading || screenshots.length > 0) {
    return <GameScreenshotGallery className={className} loading={loading} screenshots={screenshots} title={game.title} />;
  }

  return (
    <div className={`screenshot-strip ${className}`}>
      <button
        className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 focus-visible:border-accent focus-visible:outline-none"
        onClick={refetch}
        type="button"
      >
        <Icon name="image" />
        Find screenshots
      </button>
    </div>
  );
}

// ─── Discovery variant ────────────────────────────────────────────────────────
// Same thumbnail strip + lightbox, but accepts a rawgId instead of a Game.
// Shares the screenshot cache with ScreenshotStrip so entries are reused.

type DiscoveryScreenshotStripProps = {
  rawgId: number;
  title: string;
  className?: string;
};

export function DiscoveryScreenshotStrip({ rawgId, title, className = '' }: DiscoveryScreenshotStripProps) {
  const { screenshots, loading, error, refetch } = useDiscoveryScreenshots(rawgId);

  return <DiscoveryScreenshotGallery className={className} error={error} loading={loading} onRetry={refetch} screenshots={screenshots} title={title} />;
}

export function DiscoveryScreenshotGallery({
  className = '',
  error,
  loading,
  onRetry,
  screenshots,
  title,
}: {
  className?: string;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  screenshots: string[];
  title: string;
}) {
  if (error && screenshots.length === 0) {
    return (
      <div className={`screenshot-strip ${className}`}>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 focus-visible:border-accent focus-visible:outline-none"
          onClick={onRetry}
          type="button"
        >
          <Icon name="refresh-cw" />
          Screenshots unavailable — Retry
        </button>
      </div>
    );
  }

  return (
    <GameScreenshotGallery
      className={className}
      loading={loading}
      screenshots={screenshots}
      title={title}
    />
  );
}
