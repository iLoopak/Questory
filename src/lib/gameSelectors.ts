import type { DiscoveryCandidate, DiscoveryGame, GamePreviewModel } from './discovery';
import type { Game, GamePlatform, SteamAchievement } from '../types/game';

export type GameIdentity = {
  id: string;
  title: string;
  displayTitleOverride?: string;
  platform: GamePlatform;
  collectionType: Game['collectionType'];
  externalSource?: Game['externalSource'];
};

export type ArtworkSet = {
  cover: string;
  wideCover?: string;
  hero?: string;
  logo?: string;
  icon?: string;
  background?: string | null;
  fallback?: string | null;
  source?: Game['artworkSource'];
  updatedAt?: string;
  providerMetadata?: Game['artworkSourceMetadata'];
};

export type RawgMetadataSnapshot = {
  rawgId?: number;
  rawgSlug?: string;
  title?: string;
  releaseDate?: string | null;
  genres: string[];
  tags: string[];
  developers: string[];
  publishers: string[];
  metacritic?: number | null;
  backgroundImage?: string | null;
  source?: Game['metadataSource'] | 'rawg';
  updatedAt?: string;
  skippedAt?: string;
  manualManagedAt?: string;
};

export type HltbMetadataSnapshot = {
  hltbId?: string;
  title?: string;
  averagePlaytime?: number | null;
  mainStory?: number;
  mainExtra?: number;
  completionist?: number;
  source?: string;
  matchConfidence?: number;
  updatedAt?: string;
};

export type MetadataSummary = {
  title: string;
  platform?: GamePlatform | string;
  releaseDate?: string | null;
  releaseYear?: string | null;
  genres: string[];
  tags: string[];
  developers: string[];
  publishers: string[];
  metacritic?: number | null;
  averagePlaytime?: number | null;
};

export type ProviderGameLink = {
  provider: 'steam' | 'rawg' | 'itad' | 'manual' | (string & {});
  providerGameId: string;
  url?: string;
  linkedAt?: string;
  source?: Game['externalSource'] | Game['metadataSource'] | 'itad' | 'manual';
  confidence?: number;
  matchSource?: string;
};

export type AchievementProgress = {
  provider: 'steam' | (string & {});
  total?: number;
  unlocked?: number;
  percent?: number;
  achievements?: SteamAchievement[];
  lastUnlockAt?: number;
  syncedAt?: number;
  unsupported?: boolean;
};

export type WishlistDealInfo = {
  store?: 'itad' | 'steam' | (string & {});
  provider?: 'itad' | 'steam' | (string & {});
  price?: number;
  currency?: string;
  shop?: string;
  discount?: number;
  historicalLow?: {
    price?: number;
    currency?: string;
    isCurrent?: boolean;
  };
  reviewSummary?: string;
  url?: string;
  syncedAt?: string;
  matchConfidence?: Game['itadMatchConfidence'];
};

export type SteamProviderState = {
  provider: 'steam';
  appId?: number;
  storeUrl?: string;
  playtimeMinutes?: number;
  recentPlaytimeMinutes?: number;
  playtimeCacheHours?: number;
  lastPlayed?: string;
  lastActivityAt?: string;
  lastActivityDeltaMinutes?: number;
  achievementsSummary: AchievementProgress;
  achievementsTotal?: number;
  achievementsUnlocked?: number;
  achievementsPercent?: number;
  lastAchievementUnlockTime?: number;
  achievementsUnsupported?: boolean;
  achievementsLastCheckedAt?: number;
  achievements?: SteamAchievement[];
  syncedAt?: string | number;
  profileSource?: Game['externalSource'];
};

export type ArtworkSourceModel = Game | GamePreviewModel | DiscoveryCandidate | DiscoveryGame;
export type MetadataSourceModel = Game | GamePreviewModel | DiscoveryCandidate | DiscoveryGame;

export function getGameIdentity(game: Game): GameIdentity {
  return {
    id: game.id,
    title: game.title,
    displayTitleOverride: game.displayTitleOverride,
    platform: game.platform,
    collectionType: game.collectionType,
    externalSource: game.externalSource,
  };
}

export function getArtworkSet(source: ArtworkSourceModel): ArtworkSet {
  if (isGamePreviewModel(source)) {
    return {
      cover: source.artwork.coverUrl ?? '',
      background: source.artwork.backgroundImage ?? source.artwork.coverUrl ?? null,
      fallback: source.artwork.coverUrl,
      source: 'rawg',
    };
  }

  if (isDiscoveryCandidate(source)) {
    return getArtworkSet(source.game);
  }

  if (isDiscoveryGame(source)) {
    return {
      cover: source.coverUrl ?? '',
      background: source.coverUrl,
      fallback: source.coverUrl,
      source: 'rawg',
    };
  }

  return {
    cover: source.coverImage,
    wideCover: source.wideCoverImage,
    hero: source.heroImage,
    logo: source.logoImage,
    icon: source.iconImage,
    background: source.backgroundImage,
    fallback: source.coverImage || source.backgroundImage || null,
    source: source.artworkSource,
    providerMetadata: source.artworkSourceMetadata,
    updatedAt: source.artworkUpdatedAt,
  };
}

export function getRawgMetadataSnapshot(source: MetadataSourceModel): RawgMetadataSnapshot {
  if (isGamePreviewModel(source)) {
    return {
      rawgId: source.identity.rawgId,
      rawgSlug: source.identity.slug ?? undefined,
      title: source.identity.title,
      releaseDate: source.metadata.released,
      genres: source.metadata.genres,
      tags: source.metadata.tags,
      developers: source.metadata.developers ?? [],
      publishers: source.metadata.publishers ?? [],
      metacritic: source.metadata.metacritic,
      backgroundImage: source.artwork.backgroundImage ?? source.artwork.coverUrl ?? null,
      source: 'rawg',
    };
  }

  if (isDiscoveryCandidate(source)) {
    return getRawgMetadataSnapshot(source.game);
  }

  if (isDiscoveryGame(source)) {
    return {
      rawgId: source.rawgId,
      rawgSlug: source.slug ?? undefined,
      title: source.title,
      releaseDate: source.released,
      genres: source.genres,
      tags: source.tags,
      developers: [],
      publishers: [],
      metacritic: source.metacritic,
      backgroundImage: source.coverUrl,
      source: 'rawg',
    };
  }

  return {
    rawgId: source.rawgId,
    rawgSlug: source.rawgSlug,
    title: source.rawgTitle,
    releaseDate: source.released,
    genres: source.genres ?? [],
    tags: source.rawgTags ?? [],
    developers: source.developers ?? [],
    publishers: source.publishers ?? [],
    metacritic: source.metacritic ?? source.metacriticScore,
    backgroundImage: source.backgroundImage,
    source: source.metadataSource,
    updatedAt: source.metadataUpdatedAt,
    skippedAt: source.metadataSkippedAt,
    manualManagedAt: source.metadataManualManagedAt,
  };
}

export function getHltbMetadataSnapshot(source: MetadataSourceModel): HltbMetadataSnapshot {
  if (!isGame(source)) {
    return {};
  }

  return {
    hltbId: source.hltbId,
    title: source.hltbTitle,
    averagePlaytime: source.hltbMainHours ?? null,
    mainStory: source.hltbMainHours,
    mainExtra: source.hltbMainExtraHours,
    completionist: source.hltbCompletionistHours,
    source: source.hltbSourceUrl,
    matchConfidence: source.hltbMatchConfidence,
    updatedAt: source.hltbLastSyncedAt,
  };
}

export function getMetadataSummary(source: MetadataSourceModel): MetadataSummary {
  const rawg = getRawgMetadataSnapshot(source);
  const hltb = getHltbMetadataSnapshot(source);
  const releaseDate = rawg.releaseDate;
  const title = rawg.title ?? getSourceTitle(source);
  const platform = getSourcePlatform(source);

  return {
    title,
    platform,
    releaseDate,
    releaseYear: releaseDate ? releaseDate.slice(0, 4) : null,
    genres: rawg.genres,
    tags: rawg.tags.length > 0 ? rawg.tags : isGame(source) ? source.tags : [],
    developers: rawg.developers,
    publishers: rawg.publishers,
    metacritic: rawg.metacritic,
    averagePlaytime: hltb.averagePlaytime ?? null,
  };
}

/** @deprecated Use getRawgMetadataSnapshot. */
export const getRawgMetadata = getRawgMetadataSnapshot;

/** @deprecated Use getMetadataSummary. */
export const getGameMetadataSummary = getMetadataSummary;

export function getProviderLinks(game: Game): ProviderGameLink[] {
  const links: ProviderGameLink[] = [];

  if (typeof game.steamAppId === 'number') {
    links.push({
      provider: 'steam',
      providerGameId: String(game.steamAppId),
      url: game.storeUrl ?? game.externalUrl ?? `https://store.steampowered.com/app/${game.steamAppId}`,
      linkedAt: game.importedAt ?? game.updatedAt,
      source: game.externalSource,
      matchSource: game.externalSource === 'steam-wishlist' ? 'steam-wishlist' : 'steam-app-id',
    });
  }

  if (typeof game.rawgId === 'number') {
    links.push({
      provider: 'rawg',
      providerGameId: String(game.rawgId),
      url: game.rawgSlug ? `https://rawg.io/games/${game.rawgSlug}` : undefined,
      linkedAt: game.metadataUpdatedAt,
      source: game.metadataSource ?? 'rawg',
      matchSource: game.rawgSlug ? 'rawg-slug' : 'rawg-id',
    });
  }

  if (game.itadId || game.itadPlain || game.itadSlug) {
    links.push({
      provider: 'itad',
      providerGameId: game.itadId ?? game.itadPlain ?? game.itadSlug ?? '',
      url: game.itadCurrentBestUrl,
      linkedAt: game.itadLastSyncedAt,
      source: 'itad',
      matchSource: game.itadMatchConfidence,
    });
  }

  if (game.externalUrl && links.every((link) => link.url !== game.externalUrl)) {
    links.push({
      provider: game.externalSource ?? 'manual',
      providerGameId: game.externalUrl,
      url: game.externalUrl,
      linkedAt: game.importedAt,
      source: game.externalSource ?? 'manual',
      matchSource: 'external-url',
    });
  }

  return links.filter((link) => link.providerGameId);
}

export function getAchievementProgress(game: Game, provider: 'steam' | (string & {}) = 'steam'): AchievementProgress {
  if (provider !== 'steam') {
    return { provider };
  }

  return {
    provider: 'steam',
    total: game.steamAchievementsTotal,
    unlocked: game.steamAchievementsUnlocked,
    percent: game.steamAchievementsPercent,
    achievements: game.steamAchievements,
    lastUnlockAt: game.steamLastAchievementUnlockTime,
    syncedAt: game.steamAchievementsLastCheckedAt,
    unsupported: game.steamAchievementsUnsupported,
  };
}

export function getSteamProviderState(game: Game): SteamProviderState {
  const achievementsSummary = getAchievementProgress(game, 'steam');

  return {
    provider: 'steam',
    appId: game.steamAppId,
    storeUrl: typeof game.steamAppId === 'number'
      ? game.storeUrl ?? game.externalUrl ?? `https://store.steampowered.com/app/${game.steamAppId}`
      : game.storeUrl ?? game.externalUrl,
    playtimeMinutes: game.steamPlaytimeMinutes,
    recentPlaytimeMinutes: game.lastSteamActivityDeltaMinutes,
    playtimeCacheHours: game.playtimeCacheHours,
    lastPlayed: game.lastPlayedAt ?? undefined,
    lastActivityAt: game.lastSteamActivityAt,
    lastActivityDeltaMinutes: game.lastSteamActivityDeltaMinutes,
    achievementsSummary,
    achievementsTotal: achievementsSummary.total,
    achievementsUnlocked: achievementsSummary.unlocked,
    achievementsPercent: achievementsSummary.percent,
    lastAchievementUnlockTime: achievementsSummary.lastUnlockAt,
    achievementsUnsupported: achievementsSummary.unsupported,
    achievementsLastCheckedAt: achievementsSummary.syncedAt,
    achievements: achievementsSummary.achievements,
    syncedAt: game.steamAchievementsLastCheckedAt ?? game.wishlistSyncedAt,
    profileSource: game.externalSource,
  };
}

export function getWishlistDealInfo(game: Game): WishlistDealInfo {
  const hasItadDeal = typeof game.itadCurrentBestPrice === 'number'
    || typeof game.itadDiscountPercent === 'number'
    || typeof game.itadHistoricalLowPrice === 'number'
    || Boolean(game.itadCurrentBestUrl);

  if (hasItadDeal) {
    return {
      store: 'itad',
      provider: 'itad',
      price: game.itadCurrentBestPrice,
      currency: game.itadCurrentBestCurrency,
      shop: game.itadCurrentBestShop,
      discount: game.itadDiscountPercent,
      historicalLow: {
        price: game.itadHistoricalLowPrice,
        currency: game.itadHistoricalLowCurrency,
        isCurrent: game.itadIsHistoricalLow,
      },
      reviewSummary: game.steamReviewInfo,
      url: game.itadCurrentBestUrl,
      syncedAt: game.itadLastSyncedAt,
      matchConfidence: game.itadMatchConfidence,
    };
  }

  return {
    store: 'steam',
    provider: 'steam',
    discount: parseDiscountPercent(game.steamDiscountInfo),
    reviewSummary: game.steamReviewInfo,
    url: game.storeUrl ?? game.externalUrl,
    syncedAt: game.wishlistSyncedAt,
  };
}

function parseDiscountPercent(discountInfo?: string): number | undefined {
  if (!discountInfo) return undefined;
  const match = discountInfo.match(/(\d+)\s*%/);
  return match ? Number(match[1]) : undefined;
}


function getSourceTitle(source: MetadataSourceModel): string {
  if (isGame(source) || isGamePreviewModel(source) || isDiscoveryGame(source)) return source.title;
  return source.game.title;
}

function getSourcePlatform(source: MetadataSourceModel): GamePlatform | string | undefined {
  if (isGame(source)) return source.platform;
  if (isGamePreviewModel(source)) return source.metadata.platforms[0];
  if (isDiscoveryGame(source)) return source.platforms[0];
  return source.game.platforms[0];
}

function isGame(source: MetadataSourceModel | ArtworkSourceModel): source is Game {
  return 'collectionType' in source && 'coverImage' in source;
}

function isGamePreviewModel(source: MetadataSourceModel | ArtworkSourceModel): source is GamePreviewModel {
  return 'identity' in source && 'artwork' in source && 'metadata' in source;
}

function isDiscoveryCandidate(source: MetadataSourceModel | ArtworkSourceModel): source is DiscoveryCandidate {
  return 'game' in source && 'libraryStatus' in source;
}

function isDiscoveryGame(source: MetadataSourceModel | ArtworkSourceModel): source is DiscoveryGame {
  return 'rawgId' in source && 'coverUrl' in source && 'hasSteamVersion' in source;
}
