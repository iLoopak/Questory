import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../types/game';
import { isMissingOrGeneratedCover } from '../lib/gameCoverImages';
import { useGameScreenshots } from '../hooks/useGameScreenshots';
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

type ScreenshotStripProps = {
  game: Game;
  className?: string;
};

export function ScreenshotStrip({ game, className = '' }: ScreenshotStripProps) {
  const { screenshots, loading, refetch } = useGameScreenshots(game);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Show "Find screenshots" prompt only for games with missing/generated cover art
  // and no screenshots after the fetch resolves.
  const hasMissingArt = isMissingOrGeneratedCover(game.coverImage);
  const showFindPrompt = !loading && screenshots.length === 0 && hasMissingArt;

  // Return null when there's nothing to show and no prompt to display.
  if (!loading && screenshots.length === 0 && !showFindPrompt) return null;

  return (
    <div className={`screenshot-strip ${className}`} ref={stripRef}>
      {loading ? (
        // Skeleton placeholders
        <div aria-hidden="true" className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 w-[5.5rem] flex-shrink-0 animate-pulse rounded-lg bg-white/8"
            />
          ))}
        </div>
      ) : screenshots.length > 0 ? (
        // Screenshot thumbnails
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {screenshots.map((url, i) => (
            <button
              key={url}
              aria-label={`View screenshot ${i + 1} of ${screenshots.length} for ${game.title}`}
              className="group flex-shrink-0 overflow-hidden rounded-lg border border-white/10 transition hover:border-white/30 focus-visible:border-accent focus-visible:outline-none"
              onClick={() => setLightboxIndex(i)}
              type="button"
            >
              <img
                alt=""
                aria-hidden="true"
                className="h-12 w-[5.5rem] object-cover transition group-hover:brightness-110"
                decoding="async"
                draggable={false}
                loading="lazy"
                src={url}
              />
            </button>
          ))}
        </div>
      ) : (
        // "Find screenshots" prompt for games with no art and no screenshots
        <button
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-white/20 hover:text-slate-200 focus-visible:border-accent focus-visible:outline-none"
          onClick={refetch}
          type="button"
        >
          <Icon name="image" />
          Find screenshots
        </button>
      )}

      {lightboxIndex !== null && (
        <ScreenshotLightbox
          gameTitle={game.title}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          screenshots={screenshots}
        />
      )}
    </div>
  );
}
