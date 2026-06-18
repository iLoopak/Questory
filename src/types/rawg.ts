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
};

export type RawgListItem = {
  id: number;
  name: string;
};

export type RawgGameDetails = RawgSearchResult & {
  genres?: RawgListItem[];
  tags?: RawgListItem[];
  developers?: RawgListItem[];
  publishers?: RawgListItem[];
  playtime?: number;
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
  | 'backgroundImage'
  | 'metadataSource'
  | 'metadataUpdatedAt'
  | 'artworkSource'
  | 'artworkUpdatedAt'
> &
  Partial<Pick<Game, 'coverImage'>>;
