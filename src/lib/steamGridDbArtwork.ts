import { isMissingOrGeneratedCover, getStoredArtworkSource } from './gameCoverImages';
import { getMetadataSearchTitle } from './rawgMetadataEnrichment';
import type { Game } from '../types/game';
import { loadSteamGridDbSettings } from './steamGridDbSettingsStorage';

export type SteamGridDbArtwork = Partial<Pick<Game, 'coverImage' | 'wideCoverImage' | 'heroImage' | 'logoImage' | 'iconImage' | 'artworkSource' | 'artworkUpdatedAt' | 'artworkSourceMetadata'>>;

type FetchSteamGridDbArtworkOptions = {
  apiKey?: string;
  skipCache?: boolean;
};

export type SteamGridDbArtworkCandidate = { url: string; width?: number; height?: number };
export type SteamGridDbArtworkCandidates = {
  gameId?: number;
  cover: SteamGridDbArtworkCandidate[];
  wideCover: SteamGridDbArtworkCandidate[];
  hero: SteamGridDbArtworkCandidate[];
  logo: SteamGridDbArtworkCandidate[];
  icon: SteamGridDbArtworkCandidate[];
};

export type SteamGridDbArtworkCandidatesResult =
  | { status: 'ok'; candidates: SteamGridDbArtworkCandidates }
  | { status: 'no-key' | 'no-match' | 'error' };

export type SteamGridDbTestStatus =
  | 'success'
  | 'missing-key'
  | 'invalid-key'
  | 'rate-limited'
  | 'no-game-match'
  | 'no-artwork'
  | 'endpoint-unavailable'
  | 'provider-error'
  | 'network-error';

export type SteamGridDbTestResult = {
  status: SteamGridDbTestStatus;
  message: string;
};

const CACHE_KEY_PREFIX = 'qs-sgdb-artwork:';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchSteamGridDbArtworkForGame(game: Game, options: FetchSteamGridDbArtworkOptions = {}): Promise<SteamGridDbArtwork | null> {
  const title = getMetadataSearchTitle(game);
  const cacheKey = getCacheKey(game, title);
  const cached = options.skipCache ? null : readCachedArtwork(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams();
  if (typeof game.steamAppId === 'number') params.set('steamAppId', String(game.steamAppId));
  if (title) params.set('title', title);
  if (!params.toString()) return null;

  const apiKey = normalizeSteamGridDbApiKey(options.apiKey) || normalizeSteamGridDbApiKey(loadSteamGridDbSettings().apiKey);
  const init: RequestInit | undefined = apiKey
    ? { headers: { 'X-QuestShelf-SteamGridDb-Key': apiKey } }
    : undefined;

  let response: Response;
  try {
    response = await fetch(`/api/steamgriddb/artwork?${params.toString()}`, init);
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


export async function fetchSteamGridDbArtworkCandidates(game: Game): Promise<SteamGridDbArtworkCandidatesResult> {
  const title = getMetadataSearchTitle(game);
  const params = new URLSearchParams();
  if (typeof game.steamAppId === 'number') params.set('steamAppId', String(game.steamAppId));
  if (title) params.set('title', title);
  if (!params.toString()) return { status: 'no-match' };
  params.set('mode', 'candidates');

  const apiKey = normalizeSteamGridDbApiKey(loadSteamGridDbSettings().apiKey);
  const init: RequestInit | undefined = apiKey
    ? { headers: { 'X-QuestShelf-SteamGridDb-Key': apiKey } }
    : undefined;

  let response: Response;
  try {
    response = await fetch(`/api/steamgriddb/artwork?${params.toString()}`, init);
  } catch {
    return { status: 'error' };
  }

  if (response.status === 503) return { status: 'no-key' };
  if (response.status === 404) return { status: 'no-match' };
  if (response.status === 501 || !response.ok) return { status: 'error' };

  let body: SteamGridDbArtworkCandidates;
  try {
    body = (await response.json()) as SteamGridDbArtworkCandidates;
  } catch {
    return { status: 'error' };
  }

  const candidates: SteamGridDbArtworkCandidates = {
    gameId: typeof body.gameId === 'number' ? body.gameId : undefined,
    cover: sanitizeCandidates(body.cover),
    wideCover: sanitizeCandidates(body.wideCover),
    hero: sanitizeCandidates(body.hero),
    logo: sanitizeCandidates(body.logo),
    icon: sanitizeCandidates(body.icon),
  };
  return { status: 'ok', candidates };
}

function sanitizeCandidates(list: unknown): SteamGridDbArtworkCandidate[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is { url: string } => Boolean(item?.url && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)))
    .map((item) => ({ url: item.url, width: typeof item.width === 'number' ? item.width : undefined, height: typeof item.height === 'number' ? item.height : undefined }));
}

export async function testSteamGridDbConnection(game: Game, options: FetchSteamGridDbArtworkOptions = {}): Promise<SteamGridDbTestResult> {
  const title = getMetadataSearchTitle(game);
  const params = new URLSearchParams();
  if (typeof game.steamAppId === 'number') params.set('steamAppId', String(game.steamAppId));
  if (title) params.set('title', title);
  if (!params.toString()) {
    return { status: 'no-game-match', message: 'No game title or Steam app ID is available for the SteamGridDB test lookup.' };
  }

  const apiKey = normalizeSteamGridDbApiKey(options.apiKey) || normalizeSteamGridDbApiKey(loadSteamGridDbSettings().apiKey);
  const init: RequestInit | undefined = apiKey
    ? { headers: { 'X-QuestShelf-SteamGridDb-Key': apiKey } }
    : undefined;

  try {
    const response = await fetch(`/api/steamgriddb/artwork?${params.toString()}&test=1`, init);
    const body = await readSteamGridDbTestBody(response);
    if (response.ok) {
      const artwork = sanitizeArtworkResponse(body as SteamGridDbArtwork);
      if (artwork) return { status: 'success', message: 'SteamGridDB returned artwork successfully.' };
      return { status: 'no-artwork', message: 'SteamGridDB responded successfully but did not return usable artwork for the test game.' };
    }
    const status = getSteamGridDbTestStatus(response.status, body);
    return { status, message: getSteamGridDbTestMessage(status, body) };
  } catch {
    return { status: 'network-error', message: 'SteamGridDB test could not reach the local dev endpoint or network.' };
  }
}

export function normalizeSteamGridDbApiKey(value: string | undefined | null) {
  const trimmed = (value ?? '').trim();
  return trimmed.replace(/^Bearer\s+/i, '').trim();
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


async function readSteamGridDbTestBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getSteamGridDbTestStatus(statusCode: number, body: Record<string, unknown>): SteamGridDbTestStatus {
  const status = typeof body.status === 'string' ? body.status : typeof body.reason === 'string' ? body.reason : '';
  if (isSteamGridDbTestStatus(status)) return status;
  if (statusCode === 401 || statusCode === 403) return 'invalid-key';
  if (statusCode === 404) return 'no-game-match';
  if (statusCode === 429) return 'rate-limited';
  if (statusCode === 501 || statusCode === 503) return 'endpoint-unavailable';
  return 'provider-error';
}

function isSteamGridDbTestStatus(value: string): value is SteamGridDbTestStatus {
  return ['success', 'missing-key', 'invalid-key', 'rate-limited', 'no-game-match', 'no-artwork', 'endpoint-unavailable', 'provider-error', 'network-error'].includes(value);
}

function getSteamGridDbTestMessage(status: SteamGridDbTestStatus, body: Record<string, unknown>) {
  const providerMessage = typeof body.message === 'string' ? body.message : '';
  if (providerMessage) return providerMessage;
  switch (status) {
    case 'missing-key': return 'SteamGridDB API key is missing. Add a key or configure a dev/server environment key.';
    case 'invalid-key': return 'SteamGridDB rejected the API key. Check the key and try again.';
    case 'rate-limited': return 'SteamGridDB rate-limited the request. Wait and try again later.';
    case 'no-game-match': return 'SteamGridDB could not find the test game.';
    case 'no-artwork': return 'SteamGridDB found the test game but did not return artwork.';
    case 'endpoint-unavailable': return 'The local SteamGridDB dev endpoint is unavailable.';
    case 'network-error': return 'SteamGridDB test failed because of a network or dev endpoint error.';
    default: return 'SteamGridDB provider returned an unexpected error.';
  }
}
