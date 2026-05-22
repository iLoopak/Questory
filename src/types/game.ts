export const gamePlatforms = ['PC', 'Steam Deck', 'Switch', 'PlayStation', 'Xbox'] as const;
export const gameStatuses = ['Backlog', 'Playing', 'Paused', 'Completed', 'Dropped'] as const;

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
};
