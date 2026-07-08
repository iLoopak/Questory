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
export type ItadMatchConfidence = 'exact' | 'title-normalized';

export type ArtworkSource = 'custom' | 'user' | 'steamgriddb' | 'steam' | 'rawg' | 'imported' | 'generated-fallback';

export type SteamAchievement = {
  apiName: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  grayIconUrl?: string;
  hidden?: boolean;
  unlocked: boolean;
  unlockTime?: number;
};

export type RomFileReference = {
  extension?: string;
  fileName: string;
  path: string;
  role?: 'primary' | 'track' | 'disc' | 'file';
  uri?: string;
};

export type Game = {
  id: string;
  title: string;
  displayTitleOverride?: string;
  metadataSearchTitle?: string;
  originalImportedTitle?: string;
  platform: GamePlatform;
  status: GameStatus;
  coverImage: string;
  wideCoverImage?: string;
  heroImage?: string;
  logoImage?: string;
  iconImage?: string;
  artworkSource?: ArtworkSource;
  artworkSourceMetadata?: {
    steamGridDb?: {
      gameId?: number;
      lookup?: 'steam-app-id' | 'title';
      refreshedAt?: string;
    };
  };
  artworkUpdatedAt?: string;
  playtimeHours: number;
  playtimeCacheHours?: number;
  steamPlaytimeMinutes?: number;
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
  steamAchievements?: SteamAchievement[];
  lastSteamActivityAt?: string;
  lastSteamActivityDeltaMinutes?: number;
  externalSource?: 'manual' | 'steam' | 'steam-wishlist' | 'retro-rom' | 'playstation-library' | 'nintendo-virtual-game-cards';
  externalUrl?: string;
  nintendoVirtualGameCard?: {
    source: 'nintendo-virtual-game-cards';
    version: 1;
    detailUrl?: string;
    vgcId?: string;
    cardType?: string;
    exportedAt?: string;
    pageUrl?: string;
    coverUrl?: string;
  };
  importedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  droppedAt?: string;
  droppedReason?: string;
  romFileName?: string;
  romPath?: string;
  romUri?: string;
  romExtension?: string;
  romFiles?: RomFileReference[];
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
  itadId?: string;
  itadPlain?: string;
  itadSlug?: string;
  itadMatchConfidence?: ItadMatchConfidence;
  itadCurrentBestPrice?: number;
  itadCurrentBestCurrency?: string;
  itadCurrentBestShop?: string;
  itadCurrentBestUrl?: string;
  itadDiscountPercent?: number;
  itadHistoricalLowPrice?: number;
  itadHistoricalLowCurrency?: string;
  itadIsHistoricalLow?: boolean;
  itadLastSyncedAt?: string;
  hltbId?: string;
  hltbTitle?: string;
  hltbMainHours?: number;
  hltbMainExtraHours?: number;
  hltbCompletionistHours?: number;
  hltbSourceUrl?: string;
  hltbMatchConfidence?: number;
  hltbLastSyncedAt?: string;
  rawgId?: number;
  rawgSlug?: string;
  rawgTitle?: string;
  genres?: string[];
  rawgTags?: string[];
  developers?: string[];
  publishers?: string[];
  released?: string | null;
  metacritic?: number | null;
  metacriticScore?: number;
  rawgRating?: number;
  rawgRatingsCount?: number;
  backgroundImage?: string | null;
  metadataSource?: 'rawg';
  metadataUpdatedAt?: string;
  metadataSkippedAt?: string;
  metadataManualManagedAt?: string;
};
