import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import type { Game } from '../types/game';
import { useBottomSheetDragToClose } from '../hooks/useBottomSheetDragToClose';

type CompletionRatingSheetProps = {
  game: Game;
  onRate: (rating: number) => void;
  onSkip: () => void;
};

export function CompletionRatingSheet({ game, onRate, onSkip }: CompletionRatingSheetProps) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstStarRef = useRef<HTMLButtonElement | null>(null);
  // Once the sheet has committed a rating or been dismissed, ignore any further
  // input so a rapid double tap can't rate/close twice or affect the next game.
  const actedRef = useRef(false);

  const close = useCallback(() => {
    if (actedRef.current) return;
    actedRef.current = true;
    onSkip();
  }, [onSkip]);

  const rate = useCallback((rating: number) => {
    if (actedRef.current) return;
    actedRef.current = true;
    onRate(rating);
  }, [onRate]);

  const { dragHandleProps, dragStyle } = useBottomSheetDragToClose({ panelRef, onClose: close });
  // Star tap is the commit action, so nothing is "selected" until it saves; show
  // the game's existing rating (if any) as the resting fill, and hover as preview.
  const displayRating = hovered || (game.rating ?? 0);

  useEffect(() => {
    // Focus the first star so keyboard/controller users can commit with Enter/A.
    firstStarRef.current?.focus({ preventScroll: true });

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('completion.rateTitle')}
    >
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={close} />
      <div
        className="relative rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        ref={panelRef}
        style={{ paddingBottom: 'max(1.5rem, var(--qs-safe-bottom))', ...dragStyle }}
      >
        <div className="qs-sheet-drag-region flex justify-center pb-2 pt-3" {...dragHandleProps}>
          <div className="qs-sheet-handle h-1.5 w-16 rounded-full bg-skyglass/35" title="Swipe down to dismiss" />
        </div>
        <div className="px-5 pb-2 pt-2">
          <div className="mb-5 text-center">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-mint/15">
              <Icon name="trophy" size={20} className="text-mint" />
            </div>
            <div className="qs-label-caps text-accent">
              {t('completion.rateTitle')}
            </div>
            <p className="mt-1.5 line-clamp-2 text-lg font-bold leading-snug text-white">{game.title}</p>
            <p className="mt-1 text-sm text-slate-400">{t('completion.ratePrompt')}</p>
          </div>

          <div className="flex justify-center gap-3 py-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                ref={star === 1 ? firstStarRef : undefined}
                aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                className="text-4xl leading-none transition-transform hover:scale-110 active:scale-90"
                style={{ color: star <= displayRating ? '#F59E0B' : '#334155' }}
                type="button"
                onClick={() => rate(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
              >
                {star <= displayRating ? '★' : '☆'}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <button
              className="w-full rounded-2xl py-3 text-sm text-slate-500 transition hover:text-slate-300"
              type="button"
              onClick={close}
            >
              {t('completion.skip')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
