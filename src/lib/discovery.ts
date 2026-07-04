export interface DiscoveryGame {
  rawgId: number;
  title: string;
  coverUrl: string | null;
  metacritic: number | null;
  platforms: string[];
  released: string | null;
  slug: string | null;
}

export interface DiscoverySection {
  id: string;
  title: string;
  games: DiscoveryGame[];
}
