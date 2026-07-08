import type { Game } from '../types/game';

export const MIN_RAWG_RATINGS_COUNT = 10;

export type RawgRatingDisplay = {
  countLabel: string;
  ratingLabel: string;
  title: string;
};

export function getRawgRatingDisplay(game: Pick<Game, 'rawgRating' | 'rawgRatingsCount'>): RawgRatingDisplay | null {
  if (typeof game.rawgRating !== 'number' || !Number.isFinite(game.rawgRating) || game.rawgRating <= 0) return null;
  if (typeof game.rawgRatingsCount !== 'number' || !Number.isFinite(game.rawgRatingsCount) || game.rawgRatingsCount < MIN_RAWG_RATINGS_COUNT) return null;

  const ratingLabel = game.rawgRating.toFixed(1).replace(/\.0$/, '.0');
  const countLabel = formatRatingCount(game.rawgRatingsCount);
  return {
    countLabel,
    ratingLabel,
    title: `RAWG community rating ${ratingLabel} from ${countLabel} ratings`,
  };
}

export function RawgRatingBadge({ game, variant = 'overlay' }: { game: Pick<Game, 'rawgRating' | 'rawgRatingsCount'>; variant?: 'overlay' | 'detail' }) {
  const display = getRawgRatingDisplay(game);
  if (!display) return null;

  if (variant === 'detail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-sm font-bold text-amber-200" title={display.title}>
        <span aria-hidden="true">★</span>
        <span>{display.ratingLabel}</span>
        <span className="text-xs font-medium text-slate-400">({display.countLabel} ratings)</span>
      </span>
    );
  }

  return (
    <span className="rounded bg-ink-950/80 px-1 py-0.5 text-[0.55rem] font-extrabold leading-none text-amber-200 ring-1 ring-white/15 backdrop-blur-sm" title={display.title}>
      ★ {display.ratingLabel}
    </span>
  );
}

function formatRatingCount(count: number) {
  if (count >= 1_000_000) return `${trimTrailingZero(count / 1_000_000)}m`;
  if (count >= 1_000) return `${trimTrailingZero(count / 1_000)}k`;
  return Math.floor(count).toString();
}

function trimTrailingZero(value: number) {
  return value.toFixed(1).replace(/\.0$/, '');
}
