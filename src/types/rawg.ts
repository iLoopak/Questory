import type { Game } from './game';

export type RawgSettings = {
  apiKey: string;
};

export type RawgSearchResult = {
  id: number;
  name: string;
  slug?: string;
  released: string | null;
  background_image: string | null;
  metacritic: number | null;
  genres?: RawgListItem[];
  platforms?: Array<{
    platform: RawgListItem;
  }>;
  /** RAWG returns tags in list results — includes slug for comparison. */
  tags?: RawgListItem[];
};

export type RawgListItem = {
  id: number;
  name: string;
  /** Present on tag items and genre items in list results. */
  slug?: string;
};

export type RawgGameDetails = RawgSearchResult & {
  genres?: RawgListItem[];
  tags?: RawgListItem[];
  developers?: RawgListItem[];
  publishers?: RawgListItem[];
  playtime?: number;
};

export type RawgScreenshot = {
  id: number;
  image: string;
  width: number;
  height: number;
};

export type RawgScreenshotList = {
  count: number;
  results: RawgScreenshot[];
};

export type RawgMetadata = Pick<
  Game,
  | 'rawgId'
  | 'rawgSlug'
  | 'rawgTitle'
  | 'genres'
  | 'rawgTags'
  | 'developers'
  | 'publishers'
  | 'released'
  | 'metacritic'
  | 'averagePlaytime'
  | 'metacriticScore'
  | 'rawgPlaytimeHours'
  | 'backgroundImage'
  | 'metadataSource'
  | 'metadataUpdatedAt'
  | 'artworkSource'
  | 'artworkUpdatedAt'
> &
  Partial<Pick<Game, 'coverImage'>>;
