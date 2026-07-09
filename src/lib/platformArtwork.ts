import type { GamePlatform } from '../types/game';

type PlatformArtworkMatcher = {
  artworkUrl: string;
  keywords: readonly string[];
};

export const defaultPlatformArtworkMatchers: readonly PlatformArtworkMatcher[] = [
  {
    artworkUrl: '/platform-artwork/steam_default.png',
    keywords: ['steam'],
  },
  {
    artworkUrl: '/platform-artwork/retroid_default.png',
    keywords: ['retroid'],
  },
  {
    artworkUrl: '/platform-artwork/switch2_default.png',
    keywords: ['switch 2', 'switch2', 'nintendo switch 2'],
  },
  {
    artworkUrl: '/platform-artwork/switch_default.png',
    keywords: ['switch', 'nintendo'],
  },
  {
    artworkUrl: '/platform-artwork/xbox_default.png',
    keywords: ['xbox'],
  },
] as const;

export function resolveDefaultPlatformArtwork(platform: GamePlatform | string): string | undefined {
  const normalizedPlatform = platform.trim().toLowerCase();
  if (!normalizedPlatform) {
    return undefined;
  }

  return defaultPlatformArtworkMatchers.find((matcher) =>
    matcher.keywords.some((keyword) => normalizedPlatform.includes(keyword)),
  )?.artworkUrl;
}
