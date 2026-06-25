import type { Game } from '../types/game';
import type { ItadMatchConfidence } from '../types/itad';
import { postIntegration } from './integrationProxy';

const developmentItadApiBaseUrl = '/api/itad';
const itadApiBaseUrl = import.meta.env.VITE_ITAD_API_BASE_URL?.trim() || developmentItadApiBaseUrl;
const itadCorsProxyMessage = 'IsThereAnyDeal sync failed. The API may require a proxy in browser/PWA mode.';
const defaultCountry = 'US';
const maxOverviewBatchSize = 200;

export class IsThereAnyDealError extends Error {
  code: 'missing-api-key' | 'no-match' | 'rate-limit' | 'server-error' | 'network-error' | 'bad-response' | 'proxy-required';
  status?: number;

  constructor(code: IsThereAnyDealError['code'], message: string, status?: number) {
    super(message);
    this.name = 'IsThereAnyDealError';
    this.code = code;
    this.status = status;
  }
}

type ItadSearchResult = {
  id: string;
  slug?: string;
  title: string;
  type?: string | null;
};

type ItadPrice = {
  amount: number;
  amountInt?: number;
  currency: string;
};

type ItadOverviewDeal = {
  cut?: number;
  price?: ItadPrice | null;
  shop?: { name?: string } | null;
  url?: string | null;
};

type ItadOverviewEntry = {
  current?: ItadOverviewDeal | null;
  id: string;
  lowest?: ItadOverviewDeal | null;
  urls?: { game?: string | null } | null;
};

type ItadOverviewResponse = {
  prices?: ItadOverviewEntry[];
};

export type ItadMatch = {
  confidence: ItadMatchConfidence;
  id: string;
  slug?: string;
  title: string;
};

export type ItadDealSummary = {
  currentBestCurrency?: string;
  currentBestPrice?: number;
  currentBestShop?: string;
  currentBestUrl?: string;
  discountPercent?: number;
  historicalLowCurrency?: string;
  historicalLowPrice?: number;
  isHistoricalLow?: boolean;
};

export type ItadWishlistSyncResult = {
  gameId: string;
  match?: ItadMatch;
  deal?: ItadDealSummary;
  status: 'updated' | 'no-match' | 'failed';
};

export async function syncItadDealsForWishlistGames(games: Game[], apiKey: string): Promise<ItadWishlistSyncResult[]> {
  assertApiKey(apiKey);
  const matches = new Map<string, ItadMatch>();
  const initialResults: ItadWishlistSyncResult[] = [];
  let firstSyncFailure: IsThereAnyDealError | null = null;

  for (const game of games) {
    try {
      const match = game.itadId
        ? getStoredMatch(game)
        : await findItadGameByTitle(game.title, apiKey);

      if (!match) {
        initialResults.push({ gameId: game.id, status: 'no-match' });
        continue;
      }

      matches.set(game.id, match);
    } catch (error) {
      if (error instanceof IsThereAnyDealError && error.code === 'no-match') {
        initialResults.push({ gameId: game.id, status: 'no-match' });
      } else {
        if (!firstSyncFailure && error instanceof IsThereAnyDealError) {
          firstSyncFailure = error;
        }

        initialResults.push({ gameId: game.id, status: 'failed' });
      }
    }
  }

  if (matches.size === 0 && firstSyncFailure && initialResults.every((result) => result.status === 'failed')) {
    throw firstSyncFailure;
  }

  let dealResults = new Map<string, ItadDealSummary>();
  let overviewFailed = false;

  try {
    dealResults = await fetchOverviewForMatches(Array.from(matches.values()), apiKey);
  } catch (error) {
    overviewFailed = true;

    if (error instanceof IsThereAnyDealError && isProxyOrNetworkError(error)) {
      throw error;
    }
  }

  const resultByGameId = new Map<string, ItadWishlistSyncResult>();

  initialResults.forEach((result) => resultByGameId.set(result.gameId, result));

  for (const game of games) {
    const match = matches.get(game.id);
    if (!match) {
      continue;
    }

    const deal = dealResults.get(match.id);
    resultByGameId.set(game.id, deal && !overviewFailed ? { gameId: game.id, match, deal, status: 'updated' } : { gameId: game.id, match, status: 'failed' });
  }

  return games.map((game) => resultByGameId.get(game.id) ?? { gameId: game.id, status: 'failed' });
}

async function findItadGameByTitle(title: string, apiKey: string): Promise<ItadMatch | null> {
  const url = createItadUrl('/games/search/v1', apiKey);
  url.searchParams.set('title', title);
  url.searchParams.set('results', '5');

  const results = shouldUseItadIntegrationProxy()
    ? (await postIntegration<{ response: ItadSearchResult[] }>('itad', 'search', { apiKey, title, results: '5' })).response
    : await itadFetch<ItadSearchResult[]>(url, apiKey);
  const normalizedTitle = normalizeTitle(title);
  const exactMatches = results.filter((result) => normalizeTitle(result.title) === normalizedTitle && result.type !== 'dlc');

  if (exactMatches.length !== 1) {
    throw new IsThereAnyDealError('no-match', exactMatches.length === 0 ? 'No IsThereAnyDeal match found.' : 'Ambiguous IsThereAnyDeal match.');
  }

  const match = exactMatches[0];

  return {
    confidence: match.title === title ? 'exact' : 'title-normalized',
    id: match.id,
    slug: match.slug,
    title: match.title,
  };
}

async function fetchOverviewForMatches(matches: ItadMatch[], apiKey: string) {
  const deals = new Map<string, ItadDealSummary>();

  for (let index = 0; index < matches.length; index += maxOverviewBatchSize) {
    const batch = matches.slice(index, index + maxOverviewBatchSize);
    const url = createItadUrl('/games/overview/v2', apiKey);
    url.searchParams.set('country', defaultCountry);
    url.searchParams.set('vouchers', 'true');

    const response = shouldUseItadIntegrationProxy()
      ? (await postIntegration<{ response: ItadOverviewResponse }>('itad', 'overview', { apiKey, ids: batch.map((match) => match.id), country: defaultCountry })).response
      : await itadFetch<ItadOverviewResponse>(url, apiKey, {
        body: JSON.stringify(batch.map((match) => match.id)),
        method: 'POST',
      });

    response.prices?.forEach((entry) => {
      deals.set(entry.id, mapOverviewEntryToDealSummary(entry));
    });
  }

  return deals;
}

function mapOverviewEntryToDealSummary(entry: ItadOverviewEntry): ItadDealSummary {
  const currentPrice = entry.current?.price ?? undefined;
  const historicalLowPrice = entry.lowest?.price ?? undefined;

  return {
    currentBestCurrency: currentPrice?.currency,
    currentBestPrice: currentPrice?.amount,
    currentBestShop: entry.current?.shop?.name ?? undefined,
    currentBestUrl: entry.current?.url ?? entry.urls?.game ?? undefined,
    discountPercent: typeof entry.current?.cut === 'number' ? entry.current.cut : undefined,
    historicalLowCurrency: historicalLowPrice?.currency,
    historicalLowPrice: historicalLowPrice?.amount,
    isHistoricalLow: Boolean(currentPrice && historicalLowPrice && currentPrice.currency === historicalLowPrice.currency && currentPrice.amount <= historicalLowPrice.amount),
  };
}

function getStoredMatch(game: Game): ItadMatch {
  return {
    confidence: game.itadMatchConfidence ?? 'exact',
    id: game.itadId as string,
    slug: game.itadSlug,
    title: game.title,
  };
}

async function itadFetch<T>(url: URL, apiKey: string, init: RequestInit = {}): Promise<T> {
  assertApiKey(apiKey);

  let response: Response;
  const method = init.method?.toUpperCase() ?? 'GET';
  const headers = new Headers(init.headers);

  if (method !== 'GET' && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    response = await fetch(url, {
      ...init,
      headers,
    });
  } catch (error) {
    throw createNetworkError(error);
  }

  if (response.status === 429) {
    throw new IsThereAnyDealError('rate-limit', 'IsThereAnyDeal rate limit reached.', response.status);
  }

  if (response.status >= 500) {
    throw new IsThereAnyDealError('server-error', 'IsThereAnyDeal server error.', response.status);
  }

  if (!response.ok) {
    throw new IsThereAnyDealError('bad-response', `IsThereAnyDeal request failed with HTTP ${response.status}.`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new IsThereAnyDealError('bad-response', 'IsThereAnyDeal returned invalid JSON.', response.status);
  }
}


function createItadUrl(path: string, apiKey: string) {
  assertApiKey(apiKey);

  const baseUrl = isAbsoluteUrl(itadApiBaseUrl) ? itadApiBaseUrl : window.location.origin;
  const url = new URL(`${itadApiBaseUrl.replace(/\/$/, '')}${path}`, baseUrl);
  url.searchParams.set('key', apiKey.trim());

  return url;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function createNetworkError(error: unknown) {
  const message = error instanceof Error && error.message ? `${itadCorsProxyMessage} ${error.message}` : itadCorsProxyMessage;

  return new IsThereAnyDealError('proxy-required', message);
}

function isProxyOrNetworkError(error: IsThereAnyDealError) {
  return error.code === 'network-error' || error.code === 'proxy-required';
}

function assertApiKey(apiKey: string) {
  if (!apiKey.trim()) {
    throw new IsThereAnyDealError('missing-api-key', 'Missing IsThereAnyDeal API key.');
  }
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(edition|standard edition|game of the year|goty)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function shouldUseItadIntegrationProxy() {
  return !import.meta.env.DEV || Boolean(import.meta.env.VITE_INTEGRATIONS_PROXY_BASE_URL?.trim());
}
