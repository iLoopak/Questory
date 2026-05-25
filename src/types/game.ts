export const gamePlatforms = ['PC', 'Steam', 'Steam Deck', 'Switch', 'PlayStation', 'Xbox'] as const;
export const gameStatuses = ['Want to play', 'Backlog', 'Playing', 'Paused', 'Completed', 'Dropped'] as const;

export type GamePlatform = (typeof gamePlatforms)[number];
export type GameStatus = (typeof gameStatuses)[number];

export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  coverImage: string;
  playtimeHours: number;
  tags: string[];
  lastPlayedAt: string | null;
  notes: string;
  steamAppId?: number;
  externalSource?: 'steam';
  externalUrl?: string;
  importedAt?: string;
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
