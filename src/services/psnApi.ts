import type { PsnTrophyTitle, PsnTrophyCounts } from '../types/psn';

const PSN_TROPHY_BASE_DEV = '/api/psn-trophy';
const PSN_TROPHY_BASE_PROD = 'https://m.np.playstation.com';

export class PsnApiError extends Error {
  constructor(
    message: string,
    public readonly code: PsnApiErrorCode,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'PsnApiError';
  }
}

export type PsnApiErrorCode =
  | 'missing-cookies'
  | 'auth-failed'
  | 'token-expired'
  | 'dev-server-required'
  | 'api-failure'
  | 'malformed-response'
  | 'cors-blocked';

export type PsnConnectResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  onlineId: string;
};

export async function connectWithCookies(cookieString: string): Promise<PsnConnectResult> {
  if (!cookieString.trim()) {
    throw new PsnApiError('Cookie string is required.', 'missing-cookies');
  }

  let response: Response;
  try {
    response = await fetch('/api/psn/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookieString: cookieString.trim() }),
    });
  } catch {
    throw new PsnApiError(
      'PSN connection failed. The dev server is required for PSN authentication.',
      'dev-server-required',
    );
  }

  if (response.status === 404) {
    throw new PsnApiError(
      'PSN connect endpoint not found. Run QuestShelf via the dev server (npm run dev) to use PSN.',
      'dev-server-required',
      404,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new PsnApiError(
      body.message ?? 'PSN authentication failed. Check your browser cookie string and try again.',
      'auth-failed',
      response.status,
    );
  }

  return response.json() as Promise<PsnConnectResult>;
}

export async function getPsnTrophyTitles(accessToken: string): Promise<PsnTrophyTitle[]> {
  const base = import.meta.env.DEV ? PSN_TROPHY_BASE_DEV : PSN_TROPHY_BASE_PROD;
  const allTitles: PsnTrophyTitle[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const url = `${base}/api/trophy/v1/users/me/trophyTitles?limit=${limit}&offset=${offset}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new PsnApiError('PSN trophy API request failed. Check network access.', 'cors-blocked');
    }

    if (response.status === 401) {
      throw new PsnApiError('PSN access token has expired. Reconnect in Settings → Integrations → PSN.', 'token-expired', 401);
    }

    if (!response.ok) {
      throw new PsnApiError(`PSN trophy API returned HTTP ${response.status}.`, 'api-failure', response.status);
    }

    const data = await response.json().catch(() => null) as { trophyTitles?: unknown[]; totalItemCount?: number } | null;
    if (!data || !Array.isArray(data.trophyTitles)) {
      throw new PsnApiError('PSN trophy API returned unexpected data.', 'malformed-response');
    }

    const parsed = data.trophyTitles.map(parsePsnTrophyTitle).filter((t): t is PsnTrophyTitle => t !== null);
    allTitles.push(...parsed);

    if (allTitles.length >= (data.totalItemCount ?? 0) || data.trophyTitles.length < limit) {
      break;
    }

    offset += limit;
  }

  return allTitles;
}

function parsePsnTrophyTitle(raw: unknown): PsnTrophyTitle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const npCommunicationId = typeof r.npCommunicationId === 'string' ? r.npCommunicationId : '';
  const trophyTitleName = typeof r.trophyTitleName === 'string' ? r.trophyTitleName : '';

  if (!npCommunicationId || !trophyTitleName) return null;

  return {
    npCommunicationId,
    trophyTitleName,
    trophyTitlePlatform: typeof r.trophyTitlePlatform === 'string' ? r.trophyTitlePlatform : '',
    trophyTitleIconUrl: typeof r.trophyTitleIconUrl === 'string' ? r.trophyTitleIconUrl : undefined,
    definedTrophies: parseTrophyCounts(r.definedTrophies),
    earnedTrophies: parseTrophyCounts(r.earnedTrophies),
    progress: typeof r.progress === 'number' ? r.progress : 0,
    lastUpdatedDateTime: typeof r.lastUpdatedDateTime === 'string' ? r.lastUpdatedDateTime : undefined,
  };
}

function parseTrophyCounts(raw: unknown): PsnTrophyCounts {
  if (!raw || typeof raw !== 'object') return { bronze: 0, silver: 0, gold: 0, platinum: 0 };
  const r = raw as Record<string, unknown>;
  return {
    bronze: typeof r.bronze === 'number' ? r.bronze : 0,
    silver: typeof r.silver === 'number' ? r.silver : 0,
    gold: typeof r.gold === 'number' ? r.gold : 0,
    platinum: typeof r.platinum === 'number' ? r.platinum : 0,
  };
}
