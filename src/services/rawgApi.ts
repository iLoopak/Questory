import { postIntegration } from '../lib/integrationProxy';
import { loadRawgSettings } from '../lib/rawgSettingsStorage';
import type { RawgGameDetails, RawgMetadata, RawgScreenshotList, RawgSearchResult } from '../types/rawg';


type RawgSearchResponse = {
  results?: RawgSearchResult[];
};

export class RawgApiError extends Error {
  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'no-match' | 'api-failure' | 'rate-limit',
  ) {
    super(message);
    this.name = 'RawgApiError';
  }
}

function getRawgApiKey() {
  const { apiKey } = loadRawgSettings();
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new RawgApiError('Add a RAWG API key in Settings before finding metadata.', 'missing-api-key');
  }

  return trimmedApiKey;
}

async function requestRawg<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = getRawgApiKey();
  if (!import.meta.env.DEV || import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim()) {
    try {
      const route = path === '/games' ? '/games' : path.endsWith('/screenshots') ? '/games/{id}/screenshots' : path.endsWith('/suggested') ? '/games/{id}/suggested' : path.endsWith('/game-series') ? '/games/{id}/game-series' : '/games/{id}';
      const rawgId = path.match(/^\/games\/(\d+)/)?.[1];
      const payload = await postIntegration<{ response: T }>('rawg', 'request', { apiKey, route, rawgId, params });
      return payload.response;
    } catch (error) {
      throw mapRawgProxyError(error);
    }
  }

  if (import.meta.env.DEV) {
    const rawgApiBaseUrl = 'https://api.rawg.io/api';
    const url = new URL(`${rawgApiBaseUrl}${path}`);
    url.searchParams.set('key', apiKey);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    let response: Response;
    try { response = await fetch(url); } catch { throw new RawgApiError('RAWG request failed. Check network access and try again.', 'api-failure'); }
    if (response.status === 429 || response.status === 503) throw new RawgApiError('RAWG is rate limited or temporarily unavailable. Try again later.', 'rate-limit');
    if (response.status === 401 || response.status === 403) throw new RawgApiError('RAWG did not accept this API key.', 'invalid-api-key');
    if (!response.ok) throw new RawgApiError('RAWG request failed. Check the key and try again.', 'api-failure');
    return (await response.json()) as T;
  }

  throw new RawgApiError('RAWG production requests must use the integration proxy.', 'api-failure');
}

function mapRawgProxyError(error: unknown): RawgApiError {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  if (code === 'INVALID_API_KEY') return new RawgApiError('RAWG did not accept this API key.', 'invalid-api-key');
  if (code === 'RATE_LIMITED' || code === 'PROVIDER_UNAVAILABLE' || code === 'PROVIDER_TIMEOUT') return new RawgApiError('RAWG is rate limited or temporarily unavailable. Try again later.', 'rate-limit');
  return new RawgApiError(error instanceof Error ? error.message : 'RAWG request failed through the integration proxy.', 'api-failure');
}

export async function searchGameByName(title: string): Promise<RawgSearchResult[]> {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new RawgApiError('No game title was provided for RAWG search.', 'no-match');
  }

  const response = await requestRawg<RawgSearchResponse>('/games', {
    search: normalizedTitle,
    page_size: '5',
  });
  const results = response.results ?? [];

  if (results.length === 0) {
    throw new RawgApiError('No RAWG matches found for this title.', 'no-match');
  }

  return results;
}

export async function getGameDetails(rawgId: number): Promise<RawgGameDetails> {
  return requestRawg<RawgGameDetails>(`/games/${rawgId}`);
}

export async function getGameScreenshots(rawgId: number): Promise<string[]> {
  const data = await requestRawg<RawgScreenshotList>(`/games/${rawgId}/screenshots`, {
    page_size: '5',
  });
  return data.results.map((s) => s.image);
}

export async function fetchSuggestedGames(rawgId: number): Promise<RawgSearchResult[]> {
  try {
    const data = await requestRawg<{ results?: RawgSearchResult[] }>(`/games/${rawgId}/suggested`, { page_size: '10' });
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function fetchGameSeries(rawgId: number): Promise<RawgSearchResult[]> {
  try {
    const data = await requestRawg<{ results?: RawgSearchResult[] }>(`/games/${rawgId}/game-series`, { page_size: '10' });
    return data.results ?? [];
  } catch {
    return [];
  }
}

export interface RecommendedGamesParams {
  /** Comma-separated RAWG genre slugs, e.g. "action,role-playing-games-rpg" */
  genres?: string;
  /** Comma-separated RAWG tag slugs, e.g. "deckbuilding,roguelite" */
  tags?: string;
  /** Optional lower bound for metacritic filter */
  metacriticMin?: number;
  /** Optional upper bound for metacritic filter */
  metacriticMax?: number;
  /** RAWG ordering param, e.g. "-rating", "-added", "-released". Defaults to "-rating". */
  ordering?: string;
  /** RAWG dates range filter, e.g. "2025-01-01,2025-12-31" */
  dates?: string;
  /** Comma-separated RAWG platform ids, e.g. "4,187" for PC and PS5. */
  platforms?: string;
  pageSize?: number;
}

export async function fetchRecommendedGames(
  params: RecommendedGamesParams,
): Promise<RawgSearchResult[]> {
  try {
    const queryParams: Record<string, string> = {
      page_size: String(params.pageSize ?? 24),
      ordering: params.ordering ?? '-rating',
    };
    if (params.genres) queryParams.genres = params.genres;
    if (params.tags) queryParams.tags = params.tags;
    if (params.platforms) queryParams.platforms = params.platforms;
    if (params.metacriticMin != null || params.metacriticMax != null) {
      queryParams.metacritic = `${params.metacriticMin ?? 0},${params.metacriticMax ?? 100}`;
    }
    if (params.dates) queryParams.dates = params.dates;
    const data = await requestRawg<{ results?: RawgSearchResult[] }>('/games', queryParams);
    return data.results ?? [];
  } catch {
    return [];
  }
}

function getPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function getNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export function mapRawgDetailsToMetadata(details: RawgGameDetails): RawgMetadata {
  const metacriticScore = getPositiveNumber(details.metacritic);
  const rawgRating = getPositiveNumber(details.rating);
  const rawgRatingsCount = getNonNegativeInteger(details.ratings_count);
  return {
    rawgId: details.id,
    rawgSlug: details.slug,
    rawgTitle: details.name,
    genres: details.genres?.map((genre) => genre.name) ?? [],
    rawgTags: details.tags?.slice(0, 12).map((tag) => tag.name) ?? [],
    developers: details.developers?.map((developer) => developer.name) ?? [],
    publishers: details.publishers?.map((publisher) => publisher.name) ?? [],
    released: details.released,
    metacritic: details.metacritic,
    ...(metacriticScore ? { metacriticScore } : {}),
    ...(rawgRating ? { rawgRating } : {}),
    ...(rawgRatingsCount !== undefined ? { rawgRatingsCount } : {}),
    backgroundImage: details.background_image,
    metadataSource: 'rawg',
    metadataUpdatedAt: new Date().toISOString(),
  };
}
