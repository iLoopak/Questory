import type { CSSProperties } from 'react';
import { getPlatformAccentColor, type PlatformQueueState } from '../lib/platformQueueStorage';
import type { GamePlatform } from '../types/game';

type PlatformBadgeProps = {
  className?: string;
  platform: GamePlatform;
  queueState?: PlatformQueueState;
  accentColor?: string;
  title?: string;
};

export function PlatformBadge({ accentColor: accentColorOverride, className = '', platform, queueState, title }: PlatformBadgeProps) {
  const accentColor = accentColorOverride ?? (queueState ? getPlatformAccentColor(queueState, platform) : undefined);
  const style = accentColor
    ? ({
        '--platform-badge-accent': accentColor,
      } as CSSProperties)
    : undefined;

  return (
    <span
      className={`platform-badge${accentColor ? ' platform-badge--identity' : ''} ${className}`.trim()}
      style={style}
      title={title ?? platform}
    >
      {accentColor ? <span aria-hidden="true" className="platform-badge__dot" /> : null}
      <span className="platform-badge__label">{platform}</span>
    </span>
  );
}
