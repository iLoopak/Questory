import { getRawgMetadataWithCoverFallback } from './gameCoverImages';
import { getCachedRawgMetadata, saveRawgMetadataCacheEntry } from './rawgMetadataCache';
import { isHighConfidenceMatch, normalizeTitle, rankRawgMatches } from './rawgMatchScoring';
import { getGameDetails, mapRawgDetailsToMetadata, RawgApiError, searchGameByName } from '../services/rawgApi';
import type { Game } from '../types/game';
import type { RawgMetadata, RawgSearchResult } from '../types/rawg';

export type SingleGameMetadataRefreshResult =
  | {
      metadata: RawgMetadata;
      status: 'updated';
    }
  | {
      status: 'no-match';
    };

export async function refreshRawgMetadataForGame(game: Game): Promise<SingleGameMetadataRefreshResult> {
  if (typeof game.rawgId === 'number') {
    const metadata = await fetchRawgMetadataForGame(game, game.rawgId);
    return { metadata, status: 'updated' };
  }

  const searchTitle = getMetadataSearchTitle(game);
  const cachedMetadata = getCachedRawgMetadata(searchTitle);

  if (cachedMetadata) {
    return { metadata: cachedMetadata.metadata, status: 'updated' };
  }

  const matches = rankRawgMatches({ ...game, title: searchTitle }, await searchRawgWithFallback(searchTitle));
  const bestMatch = matches[0];

  if (!bestMatch || !isHighConfidenceMatch(bestMatch)) {
    return { status: 'no-match' };
  }

  const metadata = await fetchRawgMetadataForGame(game, bestMatch.result.id);
  saveRawgMetadataCacheEntry({
    cachedAt: new Date().toISOString(),
    gameTitle: searchTitle,
    metadata,
    rawgId: bestMatch.result.id,
  });

  return { metadata, status: 'updated' };
}

function getMetadataSearchTitle(game: Game) {
  return (game.metadataSearchTitle || game.displayTitleOverride || game.title).trim() || game.title;
}

async function fetchRawgMetadataForGame(game: Game, rawgId: number) {
  const details = await getGameDetails(rawgId);
  return getRawgMetadataWithCoverFallback(game, mapRawgDetailsToMetadata(details));
}

export async function searchRawgWithFallback(title: string) {
  const queries = getRawgSearchQueries(title);
  const resultsById = new Map<number, RawgSearchResult>();
  let lastError: unknown = null;

  for (const query of queries) {
    try {
      const results = await searchGameByName(query);
      results.forEach((result) => resultsById.set(result.id, result));
    } catch (error) {
      lastError = error;
    }
  }

  const results = Array.from(resultsById.values());

  if (results.length > 0) {
    return results;
  }

  if (lastError instanceof RawgApiError && lastError.code === 'no-match') {
    return [];
  }

  throw lastError ?? new RawgApiError('No RAWG matches found for this title.', 'no-match');
}

function getRawgSearchQueries(title: string) {
  const normalizedTitle = normalizeTitle(title);
  const titleWithoutSubtitle = title.split(/\s+[-:]\s+/)[0]?.trim() ?? title;

  return Array.from(new Set([title.trim(), normalizedTitle, titleWithoutSubtitle].filter(Boolean)));
}
