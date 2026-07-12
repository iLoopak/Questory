import type { Game } from '../types/game';
import { RawgApiError, getGameScreenshots, searchGameByName, toRawgProviderError } from '../services/rawgApi';
import { providerFailure, providerSuccess, type ProviderResult } from './providerResult';
import { getSuggestedConfidenceThreshold, rankRawgMatches } from './rawgMatchScoring';

export type ScreenshotsProvider = {
  name: string;
  fetchScreenshots: (game: Game) => Promise<string[]>;
};

export type ScreenshotFetch = { urls: string[]; provider: string };

// RAWG provider — uses stored rawgId when present, otherwise searches by title.
// Returns [] when no confident match is found (a genuine "no screenshots for this game"), and
// propagates RawgApiError on auth/network/provider failure.
const rawgProvider: ScreenshotsProvider = {
  name: 'rawg',
  async fetchScreenshots(game: Game): Promise<string[]> {
    let rawgId = game.rawgId;

    if (!rawgId) {
      const results = await searchGameByName(game.title);
      const ranked = rankRawgMatches(game, results);
      if (ranked.length === 0 || ranked[0].confidence < getSuggestedConfidenceThreshold()) {
        return [];
      }
      rawgId = ranked[0].result.id;
    }

    return getGameScreenshots(rawgId);
  },
};

// Ordered list — Steam, IGDB, etc. can be appended here later.
export const screenshotProviders: ScreenshotsProvider[] = [rawgProvider];

/**
 * AS-13: "no screenshots" and "we could not ask" are different answers.
 *
 * This used to swallow every non-auth error and return `{ urls: [] }`, which the hook then wrote
 * into a SEVEN-DAY cache — so one flaky request hid a game's screenshots for a week. It now returns
 * the AS-10 `ProviderResult`: a success (with zero urls when the provider genuinely has none, or
 * when no confident title match exists) or a typed failure that the caller must not cache.
 */
export async function fetchScreenshotsForGame(game: Game): Promise<ProviderResult<ScreenshotFetch>> {
  let lastError: ProviderResult<ScreenshotFetch> | null = null;

  for (const provider of screenshotProviders) {
    try {
      const raw = await provider.fetchScreenshots(game);
      const unique = [...new Set(raw)].slice(0, 5);
      return providerSuccess({ urls: unique, provider: provider.name });
    } catch (error) {
      // RAWG search with no match is not a failure — it is a game RAWG does not know, and caching
      // that empty answer is correct.
      if (error instanceof RawgApiError && error.code === 'no-match') {
        return providerSuccess({ urls: [], provider: provider.name });
      }

      lastError = providerFailure(toRawgProviderError(error));

      // An auth problem will not be fixed by asking a different provider.
      if (error instanceof RawgApiError && (error.code === 'missing-api-key' || error.code === 'invalid-api-key')) {
        return lastError;
      }
      // Otherwise fall through and let the next provider try.
    }
  }

  // Every provider failed, or there are none. Either way this is not an empty success.
  return lastError ?? providerSuccess({ urls: [], provider: 'none' });
}
