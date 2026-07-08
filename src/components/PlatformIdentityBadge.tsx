import { getDefaultPlatformAccentColor, getPlatformAccentColor, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { GamePlatform } from '../types/game';
import { CardOverlayBadge } from './CardOverlayBadge';

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
    <CardOverlayBadge
      accentColor={accent}
      className={`platform-badge platform-badge--identity ${className}`.trim()}
      title={platform}
      variant="platform"
    >
      {platform}
    </CardOverlayBadge>
  );
}
