import type { CSSProperties, ReactNode } from 'react';
import type { GameStatus } from '../types/game';

type CardOverlayBadgeVariant = 'platform' | 'finished' | 'planned' | 'playing' | 'dropped' | 'muted' | 'wishlist' | 'later';

type CardOverlayBadgeProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: CardOverlayBadgeVariant;
  accentColor?: string;
  showDot?: boolean;
};

export function getCardStatusBadgeVariant(status: GameStatus | string): CardOverlayBadgeVariant {
  const normalizedStatus = status.trim().toLowerCase();

  if (normalizedStatus === 'finished') return 'finished';
  if (normalizedStatus === 'playing' || normalizedStatus === 'currently playing') return 'playing';
  if (normalizedStatus === 'dropped') return 'dropped';
  if (normalizedStatus === 'ignored' || normalizedStatus === 'hidden') return 'muted';
  if (normalizedStatus === 'wishlist') return 'wishlist';
  if (normalizedStatus === 'skipped' || normalizedStatus === 'later') return 'later';
  if (normalizedStatus === 'want to play' || normalizedStatus === 'backlog' || normalizedStatus === 'planned' || normalizedStatus === 'paused') return 'planned';

  return 'muted';
}

export function CardOverlayBadge({
  children,
  className = '',
  title,
  variant = 'muted',
  accentColor,
  showDot = true,
}: CardOverlayBadgeProps) {
  const style = accentColor
    ? ({ '--card-overlay-badge-accent': accentColor, '--platform-badge-accent': accentColor } as CSSProperties)
    : undefined;

  return (
    <span
      className={`card-overlay-badge card-overlay-badge--${variant} ${className}`.trim()}
      style={style}
      title={title}
    >
      {showDot ? <span aria-hidden="true" className="card-overlay-badge__dot" /> : null}
      <span className="card-overlay-badge__label">{children}</span>
    </span>
  );
}
