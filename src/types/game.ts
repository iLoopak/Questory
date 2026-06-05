export const gamePlatforms = [
  'Steam',
  'PS5',
  'PS4',
  'Switch',
  'Switch 2',
  'PC',
  'Android',
  'PSP',
  'PS2',
  'PS1',
  'PS Vita',
  'Game Boy',
  'Game Boy Color',
  'Game Boy Advance',
  'NES',
  'SNES',
  'Nintendo 64',
  'Nintendo DS',
  'Wii',
  'Wii U',
  'GameCube',
  'Sega Genesis / Mega Drive',
  'Master System',
  'Game Gear',
  'PC Engine',
  'GBA',
  'Other',
] as const;
export const gameStatuses = ['Want to play', 'Playing', 'Paused', 'Finished', 'Dropped'] as const;
export const gameCollectionTypes = ['library', 'wishlist'] as const;
export const wishlistPriorities = ['low', 'medium', 'high'] as const;

export type GamePlatform = (typeof gamePlatforms)[number] | (string & {});
export type GameStatus = (typeof gameStatuses)[number];
export type GameCollectionType = (typeof gameCollectionTypes)[number];
export type WishlistPriority = (typeof wishlistPriorities)[number];

export type ArtworkSource = 'user' | 'steam' | 'rawg' | 'imported' | 'generated-fallback';

export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  coverImage: string;
  artworkSource?: ArtworkSource;
  artworkUpdatedAt?: string;
  playtimeHours: number;
  playtimeCacheHours?: number;
  rating?: number | null;
  favorite?: boolean;
  completionState?: string;
  tags: string[];
  lastPlayedAt: string | null;
  notes: string;
  collectionType: GameCollectionType;
  steamAppId?: number;
  steamAchievementsTotal?: number;
  steamAchievementsUnlocked?: number;
  steamAchievementsPercent?: number;
  steamLastAchievementUnlockTime?: number;
  steamAchievementsUnsupported?: boolean;
  steamAchievementsLastCheckedAt?: number;
  externalSource?: 'manual' | 'steam' | 'steam-wishlist' | 'retro-rom';
  externalUrl?: string;
  importedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  droppedAt?: string;
  droppedReason?: string;
  romFileName?: string;
  romPath?: string;
  romUri?: string;
  romExtension?: string;
  priority?: WishlistPriority;
  expectedPlaytime?: number | null;
  priceTarget?: string;
  releaseDate?: string;
  storeUrl?: string;
  steamPriceInfo?: string;
  steamDiscountInfo?: string;
  steamReviewInfo?: string;
  wishlistImportedAt?: string;
  wishlistSyncedAt?: string;
  rawgId?: number;
  genres?: string[];
  rawgTags?: string[];
  developers?: string[];
  publishers?: string[];
  released?: string | null;
  metacritic?: number | null;
  averagePlaytime?: number | null;
  backgroundImage?: string | null;
  metadataSource?: 'rawg';
  metadataUpdatedAt?: string;
  metadataSkippedAt?: string;
  metadataManualManagedAt?: string;
};
