import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import type { Game } from '../types/game';

type CompletionRatingSheetProps = {
  game: Game;
  onRate: (rating: number) => void;
  onSkip: () => void;
};

export function CompletionRatingSheet({ game, onRate, onSkip }: CompletionRatingSheetProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(game.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const displayRating = hovered || selected;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onSkip]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={t('completion.rateTitle')}
    >
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onSkip} />
      <div
        className="relative rounded-t-3xl border-t border-skyglass/20 bg-ink-950 shadow-2xl"
        style={{ paddingBottom: 'max(1.5rem, var(--qs-safe-bottom))' }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1.5 w-16 rounded-full bg-skyglass/35" />
        </div>
        <div className="px-5 pb-2 pt-2">
          <div className="mb-5 text-center">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-mint/15">
              <Icon name="trophy" size={20} className="text-mint" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
              {t('completion.rateTitle')}
            </div>
            <p className="mt-1.5 line-clamp-2 text-lg font-bold leading-snug text-white">{game.title}</p>
            <p className="mt-1 text-sm text-slate-400">{t('completion.ratePrompt')}</p>
          </div>

          <div className="flex justify-center gap-3 py-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                className="text-4xl leading-none transition-transform hover:scale-110 active:scale-90"
                style={{ color: star <= displayRating ? '#F59E0B' : '#334155' }}
                type="button"
                onClick={() => setSelected(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
              >
                {star <= displayRating ? '★' : '☆'}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-2.5">
            <button
              className={`w-full rounded-2xl py-3.5 text-[0.9375rem] font-bold transition ${
                selected > 0
                  ? 'bg-mint text-ink-950 hover:bg-mint/90 active:scale-[0.98]'
                  : 'cursor-not-allowed bg-ink-800 text-slate-500'
              }`}
              disabled={selected === 0}
              type="button"
              onClick={() => onRate(selected)}
            >
              {t('completion.saveRating')}
            </button>
            <button
              className="w-full rounded-2xl py-3 text-sm text-slate-500 transition hover:text-slate-300"
              type="button"
              onClick={onSkip}
            >
              {t('completion.skip')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
