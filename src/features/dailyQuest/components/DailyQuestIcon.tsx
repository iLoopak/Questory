interface DailyQuestIconProps {
  size?: number;
  className?: string;
}

// Flat line icon: portrait game cover with a 2×2 reveal-tile overlay.
// Top-left + bottom-right tiles are "hidden" (filled); top-right + bottom-left
// are "revealed" (outline only). Directly represents the gameplay mechanic.
export function DailyQuestIcon({ size = 20, className = '' }: DailyQuestIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Cover frame */}
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* Hidden tiles — filled, not yet revealed */}
      <rect x="5.5" y="3.5" width="6" height="8" rx="0.5" fill="currentColor" opacity="0.28" />
      <rect x="12.5" y="12.5" width="6" height="8" rx="0.5" fill="currentColor" opacity="0.28" />
      {/* Revealed tiles — outline only, content visible through */}
      <rect x="12.5" y="3.5" width="6" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" opacity="0.22" />
      <rect x="5.5" y="12.5" width="6" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" opacity="0.22" />
    </svg>
  );
}
