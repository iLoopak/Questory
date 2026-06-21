import { isMissingOrGeneratedCover, getStoredArtworkSource } from './gameCoverImages';
import { getMetadataSearchTitle } from './rawgMetadataEnrichment';
import type { Game } from '../types/game';

export type SteamGridDbArtwork = Partial<Pick<Game, 'coverImage' | 'wideCoverImage' | 'heroImage' | 'logoImage' | 'iconImage' | 'artworkSource' | 'artworkUpdatedAt' | 'artworkSourceMetadata'>>;

const CACHE_KEY_PREFIX = 'qs-sgdb-artwork:';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchSteamGridDbArtworkForGame(game: Game): Promise<SteamGridDbArtwork | null> {
  const title = getMetadataSearchTitle(game);
  const cacheKey = getCacheKey(game, title);
  const cached = readCachedArtwork(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams();
  if (typeof game.steamAppId === 'number') params.set('steamAppId', String(game.steamAppId));
  if (title) params.set('title', title);
  if (!params.toString()) return null;

  let response: Response;
  try {
    response = await fetch(`/api/steamgriddb/artwork?${params.toString()}`);
  } catch {
    return null;
  }

  if (response.status === 404 || response.status === 501 || response.status === 503) return null;
  if (!response.ok) return null;

  let body: SteamGridDbArtwork;
  try {
    body = (await response.json()) as SteamGridDbArtwork;
  } catch {
    return null;
  }

  const artwork = sanitizeArtworkResponse(body);
  if (!artwork) return null;
  writeCachedArtwork(cacheKey, artwork);
  return artwork;
}

export function mergeSteamGridDbArtworkIntoGame(game: Game, artwork: SteamGridDbArtwork | null): Game {
  if (!artwork) return game;
  const source = getStoredArtworkSource(game);
  const protectsManualCover = source === 'user';
  const now = new Date().toISOString();
  const next: Game = { ...game };
  let changed = false;

  if (artwork.coverImage && !protectsManualCover && (isMissingOrGeneratedCover(game.coverImage) || source === 'steamgriddb')) {
    next.coverImage = artwork.coverImage;
    changed = true;
  }
  if (artwork.wideCoverImage && shouldApplyVariant(game.wideCoverImage, source)) {
    next.wideCoverImage = artwork.wideCoverImage;
    changed = true;
  }
  if (artwork.heroImage && shouldApplyVariant(game.heroImage, source)) {
    next.heroImage = artwork.heroImage;
    changed = true;
  }
  if (artwork.logoImage && shouldApplyVariant(game.logoImage, source)) {
    next.logoImage = artwork.logoImage;
    changed = true;
  }
  if (artwork.iconImage && shouldApplyVariant(game.iconImage, source)) {
    next.iconImage = artwork.iconImage;
    changed = true;
  }

  if (!changed) return game;
  next.artworkSource = protectsManualCover && next.coverImage === game.coverImage ? game.artworkSource : 'steamgriddb';
  next.artworkUpdatedAt = now;
  next.artworkSourceMetadata = {
    ...game.artworkSourceMetadata,
    steamGridDb: artwork.artworkSourceMetadata?.steamGridDb ?? {
      gameId: artwork.artworkSourceMetadata?.steamGridDb?.gameId,
      lookup: typeof game.steamAppId === 'number' ? 'steam-app-id' : 'title',
      refreshedAt: now,
    },
  };
  return next;
}

export function getPreferredArtworkSources(game: Game, usage: 'portrait' | 'landscape' | 'hero' | 'logo' | 'icon' = 'portrait') {
  const urls: Array<string | undefined | null> = [];
  if (usage === 'portrait') urls.push(game.coverImage, game.wideCoverImage, game.heroImage);
  if (usage === 'landscape') urls.push(game.wideCoverImage, game.heroImage, game.coverImage);
  if (usage === 'hero') urls.push(game.heroImage, game.wideCoverImage, game.backgroundImage ?? '', game.coverImage);
  if (usage === 'logo') urls.push(game.logoImage, game.iconImage, game.coverImage);
  if (usage === 'icon') urls.push(game.iconImage, game.logoImage, game.coverImage);
  return Array.from(new Set(urls.map((url) => url?.trim()).filter(Boolean) as string[]));
}

function shouldApplyVariant(currentUrl: string | undefined | null, coverSource: string | undefined) {
  return !currentUrl?.trim() || coverSource === 'steamgriddb';
}

function sanitizeArtworkResponse(response: SteamGridDbArtwork) {
  const artwork: SteamGridDbArtwork = {};
  for (const key of ['coverImage', 'wideCoverImage', 'heroImage', 'logoImage', 'iconImage'] as const) {
    const value = response[key]?.trim();
    if (value && /^https?:\/\//i.test(value)) artwork[key] = value;
  }
  if (!Object.keys(artwork).length) return null;
  artwork.artworkSource = 'steamgriddb';
  artwork.artworkSourceMetadata = response.artworkSourceMetadata;
  return artwork;
}

function getCacheKey(game: Game, title: string) {
  return `${CACHE_KEY_PREFIX}${game.steamAppId ?? 'title'}:${title.toLowerCase()}`;
}

function readCachedArtwork(cacheKey: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as { cachedAt?: string; artwork?: SteamGridDbArtwork } | null;
    if (!parsed?.cachedAt || !parsed.artwork) return null;
    if (Date.now() - new Date(parsed.cachedAt).getTime() > CACHE_MAX_AGE_MS) return null;
    return parsed.artwork;
  } catch { return null; }
}

function writeCachedArtwork(cacheKey: string, artwork: SteamGridDbArtwork) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: new Date().toISOString(), artwork })); } catch { /* ignore */ }
}
