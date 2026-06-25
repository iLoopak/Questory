import type { CSSProperties } from 'react';
import { getDefaultPlatformAccentColor, getPlatformAccentColor, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { GamePlatform } from '../types/game';

type PlatformIdentityBadgeProps = {
  className?: string;
  platform: GamePlatform;
  queueState?: PlatformQueueState;
  accentColor?: string;
};

export function PlatformIdentityBadge({
  className = '',
  platform,
  queueState,
  accentColor: accentColorOverride,
}: PlatformIdentityBadgeProps) {
  const accent =
    accentColorOverride ??
    (queueState ? getPlatformAccentColor(queueState, platform) : undefined) ??
    getDefaultPlatformAccentColor(platform);

  return (
    <span
      className={`platform-badge platform-badge--identity ${className}`.trim()}
      style={{ '--platform-badge-accent': accent } as CSSProperties}
      title={platform}
    >
      <span aria-hidden="true" className="platform-badge__dot" />
      <span className="platform-badge__label">{platform}</span>
    </span>
  );
}
