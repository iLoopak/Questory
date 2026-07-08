type MetacriticBadgeProps = {
  score: number;
  /**
   * overlay — translucent dark chip with colored text, absolutely positioned
   *   in a card cover's top corner (16:9 GameCard call sites).
   * chip — solid colored chip, positioned by the parent (compact 3:4 tiles).
   */
  variant: 'overlay' | 'chip';
};

function overlayTextClass(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function chipClass(score: number): string {
  if (score >= 75) return 'bg-emerald-500/90 text-white';
  if (score >= 50) return 'bg-amber-400/90 text-amber-950';
  return 'bg-red-500/90 text-white';
}

/**
 * Canonical Metacritic score badge — one place for the colour thresholds
 * (75+ green, 50–74 amber, below red) and both visual treatments.
 */
export function MetacriticBadge({ score, variant }: MetacriticBadgeProps) {
  if (variant === 'chip') {
    return (
      <div className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-xs font-bold ${chipClass(score)}`}>
        {score}
      </div>
    );
  }

  return (
    <span
      className={`absolute right-3 top-3 rounded-md bg-ink-950/85 px-1.5 py-0.5 text-xs font-bold tabular-nums backdrop-blur-sm ${overlayTextClass(score)}`}
    >
      {score}
    </span>
  );
}
