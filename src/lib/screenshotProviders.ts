import type { Game } from '../types/game';
import { RawgApiError, getGameScreenshots, searchGameByName } from '../services/rawgApi';
import { getSuggestedConfidenceThreshold, rankRawgMatches } from './rawgMatchScoring';

export type ScreenshotsProvider = {
  name: string;
  fetchScreenshots: (game: Game) => Promise<string[]>;
};

// RAWG provider — uses stored rawgId when present, otherwise searches by title.
// Returns [] when no match is found, propagates RawgApiError on auth/network failure.
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
 * Tries each provider in order and returns the first non-empty result.
 * Deduplicates by URL and caps at 5 screenshots.
 * Throws only for configuration errors (missing API key) so callers can
 * distinguish "not set up" from "genuinely no screenshots found".
 */
export async function fetchScreenshotsForGame(game: Game): Promise<{ urls: string[]; provider: string }> {
  let lastConfigError: RawgApiError | null = null;

  for (const provider of screenshotProviders) {
    try {
      const raw = await provider.fetchScreenshots(game);
      const unique = [...new Set(raw)].slice(0, 5);
      if (unique.length > 0) return { urls: unique, provider: provider.name };
      return { urls: [], provider: provider.name };
    } catch (e) {
      if (e instanceof RawgApiError && (e.code === 'missing-api-key' || e.code === 'invalid-api-key')) {
        lastConfigError = e;
        break; // No point trying other providers if auth is the issue
      }
      // Network/API failure — continue to next provider
    }
  }

  if (lastConfigError) throw lastConfigError;
  return { urls: [], provider: 'none' };
}
