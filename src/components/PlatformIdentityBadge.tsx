import type { CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';
import { getDefaultPlatformAccentColor, getPlatformAccentColor, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { GamePlatform } from '../types/game';

type PlatformIdentityBadgeProps = {
  className?: string;
  compact?: boolean;
  platform: GamePlatform;
  queueState?: PlatformQueueState;
  accentColor?: string;
};

function resolvePlatformIcon(platform: GamePlatform): IconName | null {
  const p = platform.toLowerCase();
  if (p.includes('steam') || (p.includes('pc') && !p.includes('psp'))) return 'steam';
  if (
    p.includes('switch') ||
    p.includes('deck') ||
    p.includes('handheld') ||
    p.includes('portable') ||
    p.includes('vita') ||
    p.includes('psp') ||
    p.includes('game boy') ||
    p.includes('gba')
  ) return 'handheld';
  if (p.includes('retro') || p.includes('arcade') || p.includes('dreamcast') || p.includes('amiga')) return 'joystick';
  return null;
}

export function PlatformIdentityBadge({
  className = '',
  compact = false,
  platform,
  queueState,
  accentColor: accentColorOverride,
}: PlatformIdentityBadgeProps) {
  const accent =
    accentColorOverride ??
    (queueState ? getPlatformAccentColor(queueState, platform) : undefined) ??
    getDefaultPlatformAccentColor(platform);

  const icon = resolvePlatformIcon(platform);

  return (
    <span
      className={`platform-badge platform-badge--identity ${className}`.trim()}
      style={{ '--platform-badge-accent': accent } as CSSProperties}
      title={platform}
    >
      {icon !== null ? (
        <Icon className="platform-badge__icon" name={icon} size={compact ? 9 : 11} strokeWidth={2.2} />
      ) : (
        <span aria-hidden="true" className="platform-badge__dot" />
      )}
      <span className="platform-badge__label">{platform}</span>
    </span>
  );
}
