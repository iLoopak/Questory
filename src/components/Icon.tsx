import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'alert-triangle'
  | 'archive'
  | 'arrow-left'
  | 'badge-100'
  | 'bookmark-pen'
  | 'check'
  | 'check-circle'
  | 'circle'
  | 'compass'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevrons-right'
  | 'database-sparkles'
  | 'external-link'
  | 'flame'
  | 'eye-off'
  | 'gamepad-2'
  | 'gem'
  | 'handheld'
  | 'heart'
  | 'image'
  | 'image-frame'
  | 'info'
  | 'joystick'
  | 'layers'
  | 'library'
  | 'list-ordered'
  | 'list-plus'
  | 'lock'
  | 'more-horizontal'
  | 'panel-top-open'
  | 'pencil'
  | 'plus'
  | 'play-circle'
  | 'plus-square'
  | 'refresh-cw'
  | 'rocket'
  | 'search'
  | 'settings'
  | 'shopping-bag'
  | 'steam'
  | 'sparkles'
  | 'sliders-horizontal'
  | 'skull-check'
  | 'sword'
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
  'alert-triangle': <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  archive: <><path d="M4 7h16" /><path d="M5 7l1 13h12l1-13" /><path d="M8 4h8l1 3H7l1-3Z" /><path d="M9 11h6" /><path d="M9 15h4" /></>,
  'badge-100': <><path d="m12 2 2.1 3 3.6-.8.8 3.6 3 2.1-1.8 3.3 1.8 3.3-3 2.1-.8 3.6-3.6-.8-2.1 3-2.1-3-3.6.8-.8-3.6-3-2.1 1.8-3.3L2.5 9.9l3-2.1.8-3.6 3.6.8L12 2Z" /><path d="M8 10v4" /><path d="M10.5 10h1.25a1.25 1.25 0 0 1 0 2.5H10.5V14H13" /><path d="M16 10a1.5 2 0 0 0 0 4 1.5 2 0 0 0 0-4Z" /></>,
  'bookmark-pen': <><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-3-6 3V4Z" /><path d="m9.5 13.5 4.8-4.8a1.4 1.4 0 0 1 2 2l-4.8 4.8-2 .5.5-2.5Z" /></>,
  'arrow-left': <><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>,
  check: <path d="m20 6-11 11-5-5" />,
  'check-circle': <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  circle: <circle cx="12" cy="12" r="10" />,
  compass: <><circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" /></>,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevrons-right': <><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></>,

  'database-sparkles': <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 10c0 1.7 3.1 3 7 3 1.1 0 2.2-.1 3.1-.3" /><path d="m18 12 .6 1.4L20 14l-1.4.6L18 16l-.6-1.4L16 14l1.4-.6L18 12Z" /></>,
  'external-link': <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  'eye-off': <><path d="m2 2 20 20" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M16.8 16.8A10.8 10.8 0 0 1 12 18C7 18 3.7 14.9 2 12c.8-1.3 2-2.7 3.5-3.8" /><path d="M9.9 6.2A10.8 10.8 0 0 1 12 6c5 0 8.3 3.1 10 6a13.2 13.2 0 0 1-2.1 2.8" /></>,
  'gamepad-2': <><path d="M6 12h4" /><path d="M8 10v4" /><path d="M15 13h.01" /><path d="M18 11h.01" /><path d="M17.3 6H6.7a4 4 0 0 0-3.9 3.2l-1 5A3 3 0 0 0 4.7 18c1 0 1.9-.5 2.5-1.3L8.5 15h7l1.3 1.7A3 3 0 0 0 22.2 14l-1-4.8A4 4 0 0 0 17.3 6Z" /></>,
  handheld: <><rect x="3" y="6" width="18" height="12" rx="3" /><rect x="8" y="8.5" width="8" height="7" rx="1" /><path d="M6 12h2" /><path d="M7 11v2" /><path d="M18 11.5h.01" /><path d="M18 14h.01" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-5-5L5 19" /></>,
  'image-frame': <><rect x="4" y="5" width="16" height="13" rx="2" /><path d="M7 21h10" /><path d="M12 18v3" /><circle cx="9" cy="10" r="1.2" /><path d="m20 15-4.5-4.5L7 18" /></>,
  joystick: <><path d="M12 14V6" /><circle cx="12" cy="5" r="2" /><path d="M6 14h12l2 6H4l2-6Z" /><path d="M8 17h3" /><path d="M16 17h.01" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  library: <><path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z" /><path d="M8 7h6" /><path d="M8 11h8" /></>,
  'list-ordered': <><path d="M10 6h10" /><path d="M10 12h10" /><path d="M10 18h10" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M4 14h2l-2 4h2" /></>,
  'list-plus': <><path d="M11 6H3" /><path d="M11 12H3" /><path d="M13 18H3" /><path d="M18 9v6" /><path d="M15 12h6" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  'more-horizontal': <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
  'panel-top-open': <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="m9 15 3-3 3 3" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  'play-circle': <><circle cx="12" cy="12" r="10" /><path d="m10 8 6 4-6 4V8Z" /></>,
  'plus-square': <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8" /><path d="M8 12h8" /></>,
  'refresh-cw': <><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
  settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  'shopping-bag': <><path d="M6 8h12l-1 13H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  'sliders-horizontal': <><path d="M21 4h-7" /><path d="M10 4H3" /><path d="M21 12h-9" /><path d="M8 12H3" /><path d="M21 20h-5" /><path d="M12 20H3" /><circle cx="12" cy="4" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="14" cy="20" r="2" /></>,
  flame: <><path d="M12 22c4 0 7-2.8 7-7 0-3-2-5.5-4.4-7.2.2 2.2-.7 3.7-2.1 4.7.4-3.1-1.2-5.7-4-7.5.3 3.4-2.5 5.6-3.3 8.6C4.2 17.8 7.5 22 12 22Z" /><path d="M12 18c1.4 0 2.5-1 2.5-2.4 0-1.1-.6-2-1.6-2.7 0 1-.5 1.7-1.2 2.2.1-1.3-.5-2.4-1.7-3.1.1 1.5-1.1 2.4-1.4 3.7C8.3 17 9.8 18 12 18Z" /></>,
  gem: <><path d="M6 3h12l4 6-10 12L2 9l4-6Z" /><path d="M2 9h20" /><path d="m6 3 3 6 3-6 3 6 3-6" /><path d="m9 9 3 12 3-12" /></>,
  rocket: <><path d="M5 15c-1 1-1.5 3.5-1.5 5.5C5.5 20.5 8 20 9 19" /><path d="M9 15 5 11l3-3c3.5-3.5 7.5-5 12-4-.5 4.5-2 8.5-5.5 12L11 19l-4-4Z" /><path d="M14 6l4 4" /><circle cx="14" cy="10" r="1.5" /></>,
  'skull-check': <><path d="M12 3c-4 0-7 2.8-7 6.8 0 2.5 1.2 4.5 3 5.6V20h8v-4.6c1.8-1.1 3-3.1 3-5.6C19 5.8 16 3 12 3Z" /><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /><path d="M10 15h4" /><path d="m16.5 17.5 1.5 1.5 3-3" /></>,
  sparkles: <><path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Z" /><path d="m19 13 .7 2.3L22 16l-2.3.7L19 19l-.7-2.3L16 16l2.3-.7L19 13Z" /><path d="m5 14 .6 1.9L7.5 17l-1.9.6L5 19.5l-.6-1.9L2.5 17l1.9-1.1L5 14Z" /></>,
  steam: <><circle cx="8" cy="16" r="3" /><circle cx="17" cy="7" r="3" /><path d="M10.5 14.5 15 9" /><path d="m3 14 2.4 1" /><path d="m10.4 17.4 3.2 1.4A4 4 0 0 0 19 15.2V10" /><circle cx="17" cy="7" r="1" /></>,
  sword: <><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="m13 19 6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /></>,
  'trash-2': <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
  trophy: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M5 6H3v2a4 4 0 0 0 4 4" /><path d="M19 6h2v2a4 4 0 0 1-4 4" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
};
