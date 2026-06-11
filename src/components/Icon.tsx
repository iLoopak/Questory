import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'arrow-left'
  | 'check'
  | 'chevrons-right'
  | 'external-link'
  | 'eye-off'
  | 'gamepad-2'
  | 'heart'
  | 'image'
  | 'info'
  | 'list-plus'
  | 'lock'
  | 'more-horizontal'
  | 'panel-top-open'
  | 'pencil'
  | 'plus-square'
  | 'refresh-cw'
  | 'search'
  | 'settings'
  | 'shopping-bag'
  | 'sliders-horizontal'
  | 'trash-2'
  | 'trophy'
  | 'x';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'color' | 'name'> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 16, strokeWidth = 2, className = '', ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={`qs-icon ${className}`.trim()}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

const iconPaths: Record<IconName, ReactNode> = {
  'arrow-left': <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  check: <path d="m20 6-11 11-5-5" />,
  'chevrons-right': <><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></>,
  'external-link': <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  'eye-off': <><path d="m2 2 20 20" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M16.8 16.8A10.8 10.8 0 0 1 12 18C7 18 3.7 14.9 2 12c.8-1.3 2-2.7 3.5-3.8" /><path d="M9.9 6.2A10.8 10.8 0 0 1 12 6c5 0 8.3 3.1 10 6a13.2 13.2 0 0 1-2.1 2.8" /></>,
  'gamepad-2': <><path d="M6 12h4" /><path d="M8 10v4" /><path d="M15 13h.01" /><path d="M18 11h.01" /><path d="M17.3 6H6.7a4 4 0 0 0-3.9 3.2l-1 5A3 3 0 0 0 4.7 18c1 0 1.9-.5 2.5-1.3L8.5 15h7l1.3 1.7A3 3 0 0 0 22.2 14l-1-4.8A4 4 0 0 0 17.3 6Z" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  'list-plus': <><path d="M11 6H3" /><path d="M11 12H3" /><path d="M13 18H3" /><path d="M18 9v6" /><path d="M15 12h6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  'more-horizontal': <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  'panel-top-open': <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="m9 15 3-3 3 3" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  'plus-square': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8" /><path d="M8 12h8" /></>,
  'refresh-cw': <><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  'shopping-bag': <><path d="M6 8h12l-1 13H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  'sliders-horizontal': <><path d="M21 4h-7" /><path d="M10 4H3" /><path d="M21 12h-9" /><path d="M8 12H3" /><path d="M21 20h-5" /><path d="M12 20H3" /><circle cx="12" cy="4" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="14" cy="20" r="2" /></>,
  'trash-2': <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M5 6H3v2a4 4 0 0 0 4 4" /><path d="M19 6h2v2a4 4 0 0 1-4 4" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
};
