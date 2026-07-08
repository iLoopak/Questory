import type { Game } from '../types/game';
import { getRawgRatingDisplay } from './RawgRatingBadge';

type RatingBadgeStackProps = {
  game: Pick<Game, 'rawgRating' | 'rawgRatingsCount'>;
  metacriticScore?: number | string | null;
  className?: string;
  /**
   * compact keeps the tiny overlay treatment used by cover cards.
   * detail can be used for larger content areas if needed later.
   */
  variant?: 'compact' | 'detail';
};

function getMetacriticTextClass(score: number): string {
  if (score >= 75) return 'text-emerald-300';
  if (score >= 50) return 'text-amber-300';
  return 'text-red-300';
}

/**
 * Shared cover-rating badge layout for Metacritic and RAWG ratings.
 *
 * The stack owns spacing and wrapping so independent rating pills never share
 * the same absolute coordinates. Small cards naturally stack vertically; wider
 * covers may wrap into a compact row when there is room.
 */
export function RatingBadgeStack({ game, metacriticScore, className = '', variant = 'compact' }: RatingBadgeStackProps) {
  const rawgRating = getRawgRatingDisplay(game);
  const numericMetacriticScore =
    typeof metacriticScore === 'number' ? metacriticScore : typeof metacriticScore === 'string' ? Number(metacriticScore) : null;
  const shouldShowMetacritic =
    numericMetacriticScore !== null && Number.isFinite(numericMetacriticScore) && numericMetacriticScore > 0;

  if (!shouldShowMetacritic && !rawgRating) return null;

  const pillClass =
    variant === 'detail'
      ? 'rounded-full border border-white/15 bg-ink-950/80 px-3 py-1 text-sm font-bold leading-none shadow-glow backdrop-blur-sm'
      : 'rounded bg-ink-950/80 px-1 py-0.5 text-[0.55rem] font-extrabold leading-none ring-1 ring-white/15 backdrop-blur-sm';

  return (
    <span className={`flex max-w-full flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center ${className}`.trim()}>
      {shouldShowMetacritic ? (
        <span className={`${pillClass} tabular-nums ${getMetacriticTextClass(numericMetacriticScore!)}`} title={`Metacritic ${metacriticScore}`}>
          MC {metacriticScore}
        </span>
      ) : null}
      {rawgRating ? (
        <span className={`${pillClass} text-amber-200`} title={rawgRating.title}>
          ★ {rawgRating.ratingLabel}
        </span>
      ) : null}
    </span>
  );
}
