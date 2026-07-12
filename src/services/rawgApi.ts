import { postIntegration } from '../lib/integrationProxy';
import { loadRawgSettings } from '../lib/rawgSettingsStorage';
import {
  createProviderError,
  parseRetryAfterMs,
  providerFailure,
  providerSuccess,
  toProviderErrorKind,
  type ProviderError,
  type ProviderErrorKind,
  type ProviderResult,
} from '../lib/providerResult';
import type { RawgGameDetails, RawgMetadata, RawgScreenshotList, RawgSearchResult } from '../types/rawg';


type RawgSearchResponse = {
  results?: RawgSearchResult[];
};

export class RawgApiError extends Error {
  /**
   * AS-10: the finer taxonomy rides along with the existing `code`.
   *
   * `code` is what the metadata, screenshot and settings surfaces already branch on, so it is
   * unchanged. `kind` is what the list helpers below turn into a `ProviderResult` — it separates a
   * timeout from a 429 from an unreachable network, which `code` never could.
   */
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    public code: 'missing-api-key' | 'invalid-api-key' | 'no-match' | 'api-failure' | 'rate-limit',
    options: { kind?: ProviderErrorKind; status?: number; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'RawgApiError';
    this.kind = options.kind ?? defaultKindForCode(code);
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function defaultKindForCode(code: RawgApiError['code']): ProviderErrorKind {
  if (code === 'missing-api-key') return 'missing-key';
  if (code === 'invalid-api-key') return 'invalid-key';
  if (code === 'rate-limit') return 'rate-limited';
  return 'provider';
}

/** A caught RAWG exception, as the typed failure the services and the UI consume. */
export function toRawgProviderError(error: unknown): ProviderError {
  if (error instanceof RawgApiError) {
    // `no-match` is not a failure of the provider — it is a successful search with nothing in it.
    // It never reaches this function from the list helpers, which do not throw it.
    return createProviderError(error.kind, { status: error.status, retryAfterMs: error.retryAfterMs });
  }

  return createProviderError(toProviderErrorKind(error));
}

function getRawgApiKey() {
  const { apiKey } = loadRawgSettings();
  const trimmedApiKey = apiKey.trim();

  if (!trimmedApiKey) {
    throw new RawgApiError('Add a RAWG API key in Settings before finding metadata.', 'missing-api-key');
  }

  return trimmedApiKey;
}

/** The key never appears in an error: it is read here and only ever sent in the request body. */
export function isRawgConfigured(): boolean {
  return loadRawgSettings().apiKey.trim().length > 0;
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
    try {
      response = await fetch(url);
    } catch (error) {
      // A rejected fetch never reached RAWG: offline, DNS, CORS — or our own abort.
      const kind = toProviderErrorKind(error);
      throw new RawgApiError('RAWG request failed. Check network access and try again.', 'api-failure', { kind });
    }
    if (response.status === 429) {
      throw new RawgApiError('RAWG is rate limited. Try again later.', 'rate-limit', {
        kind: 'rate-limited',
        status: 429,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')),
      });
    }
    // 503 keeps its historical `rate-limit` code (the metadata surfaces branch on it), but it is a
    // provider outage, and the taxonomy now says so.
    if (response.status === 503) throw new RawgApiError('RAWG is temporarily unavailable. Try again later.', 'rate-limit', { kind: 'provider', status: 503 });
    if (response.status === 401 || response.status === 403) throw new RawgApiError('RAWG did not accept this API key.', 'invalid-api-key', { status: response.status });
    if (!response.ok) throw new RawgApiError('RAWG request failed. Check the key and try again.', 'api-failure', { kind: 'provider', status: response.status });
    try {
      return (await response.json()) as T;
    } catch {
      throw new RawgApiError('RAWG returned a response Questory could not read.', 'api-failure', { kind: 'malformed-response', status: response.status });
    }
  }

  throw new RawgApiError('RAWG production requests must use the integration proxy.', 'api-failure');
}

function mapRawgProxyError(error: unknown): RawgApiError {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;

  if (code === 'INVALID_API_KEY') return new RawgApiError('RAWG did not accept this API key.', 'invalid-api-key', { status });
  if (code === 'RATE_LIMITED') return new RawgApiError('RAWG is rate limited. Try again later.', 'rate-limit', { kind: 'rate-limited', status: status ?? 429 });
  if (code === 'PROVIDER_TIMEOUT') return new RawgApiError('RAWG took too long to respond. Try again.', 'rate-limit', { kind: 'timeout', status });
  if (code === 'PROVIDER_UNAVAILABLE') return new RawgApiError('RAWG is temporarily unavailable. Try again later.', 'rate-limit', { kind: 'provider', status });

  // The proxy itself could not be reached (offline, or the request was aborted): that is a network
  // condition, not a RAWG outage, and the message must not leak the proxy's own error text.
  const kind = code === 'PROXY_ERROR' || !code ? toProviderErrorKind(error) : 'provider';
  return new RawgApiError('RAWG request failed through the integration proxy.', 'api-failure', { kind, status });
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

/**
 * The list helpers below all return a `ProviderResult`.
 *
 * They used to `catch { return []; }`, which is exactly the defect: an outage became a valid empty
 * list, and the services cached it. A genuine empty page is still `ok: true` with `data: []` — that
 * distinction is the entire point.
 */
async function requestRawgList(
  path: string,
  params: Record<string, string>,
): Promise<ProviderResult<RawgSearchResult[]>> {
  try {
    const data = await requestRawg<{ results?: RawgSearchResult[] }>(path, params);
    if (data?.results !== undefined && !Array.isArray(data.results)) {
      return providerFailure(createProviderError('malformed-response'));
    }

    return providerSuccess(data?.results ?? []);
  } catch (error) {
    return providerFailure(toRawgProviderError(error));
  }
}

export function fetchSuggestedGames(rawgId: number): Promise<ProviderResult<RawgSearchResult[]>> {
  return requestRawgList(`/games/${rawgId}/suggested`, { page_size: '10' });
}

export function fetchGameSeries(rawgId: number): Promise<ProviderResult<RawgSearchResult[]>> {
  return requestRawgList(`/games/${rawgId}/game-series`, { page_size: '10' });
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

export function fetchRecommendedGames(
  params: RecommendedGamesParams,
): Promise<ProviderResult<RawgSearchResult[]>> {
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

  return requestRawgList('/games', queryParams);
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
