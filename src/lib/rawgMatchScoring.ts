import type { Game } from '../types/game';
import type { RawgSearchResult } from '../types/rawg';

export type RawgMatchScore = {
  confidence: number;
  reasons: string[];
  result: RawgSearchResult;
};

const highConfidenceThreshold = 90;
const suggestedConfidenceThreshold = 70;

export function getHighConfidenceThreshold() {
  return highConfidenceThreshold;
}

export function getSuggestedConfidenceThreshold() {
  return suggestedConfidenceThreshold;
}

export function rankRawgMatches(game: Game, results: RawgSearchResult[]): RawgMatchScore[] {
  return results
    .map((result) => scoreRawgMatch(game, result))
    .sort((first, second) => second.confidence - first.confidence);
}

export function scoreRawgMatch(game: Game, result: RawgSearchResult): RawgMatchScore {
  const reasons: string[] = [];
  const normalizedGameTitle = normalizeTitle(game.title);
  const normalizedResultTitle = normalizeTitle(result.name);
  let confidence = 0;

  if (normalizedGameTitle === normalizedResultTitle) {
    confidence += 76;
    reasons.push('title similarity: exact normalized title');
  } else {
    const similarity = titleSimilarity(normalizedGameTitle, normalizedResultTitle);
    confidence += Math.round(similarity * 62);

    reasons.push(`title similarity: ${Math.round(similarity * 100)}%`);
  }

  const platformScore = scorePlatform(game, result);
  confidence += platformScore.points;

  if (platformScore.reason) {
    reasons.push(platformScore.reason);
  }

  const releaseYearScore = scoreReleaseYear(game, result);
  confidence += releaseYearScore.points;

  if (releaseYearScore.reason) {
    reasons.push(releaseYearScore.reason);
  }

  return {
    confidence: Math.min(confidence, 100),
    reasons,
    result,
  };
}

export function isHighConfidenceMatch(match: RawgMatchScore) {
  return match.confidence >= highConfidenceThreshold;
}

export function isSuggestedMatch(match: RawgMatchScore) {
  return match.confidence >= suggestedConfidenceThreshold && match.confidence < highConfidenceThreshold;
}

export function normalizeTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2122\u00ae\u00a9]/g, '')
    .replace(/\((pc|steam|steam deck|switch|nintendo switch|playstation|ps4|ps5|xbox|xbox one|series x|series s|windows|mac|linux)\)$/g, '')
    .replace(/\[(pc|steam|steam deck|switch|nintendo switch|playstation|ps4|ps5|xbox|xbox one|series x|series s|windows|mac|linux)\]$/g, '')
    .replace(/\b(game of the year|goty)\b/g, '')
    .replace(/\b(definitive|deluxe|ultimate|complete|collector'?s?|enhanced|anniversary)\s+edition\b/g, '')
    .replace(/\b(remastered|remaster|remake|director'?s cut|hd|vr)\b/g, '')
    .replace(/\b(pc|steam|steam deck|switch|nintendo switch|playstation|ps4|ps5|xbox|xbox one|series x|series s|windows|mac|linux)\b$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(edition|version)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(firstTitle: string, secondTitle: string) {
  if (!firstTitle || !secondTitle) {
    return 0;
  }

  const firstTokens = new Set(firstTitle.split(' ').filter(Boolean));
  const secondTokens = new Set(secondTitle.split(' ').filter(Boolean));
  const sharedTokens = Array.from(firstTokens).filter((token) => secondTokens.has(token));
  const tokenScore = sharedTokens.length / Math.max(firstTokens.size, secondTokens.size, 1);
  const lengthScore = Math.min(firstTitle.length, secondTitle.length) / Math.max(firstTitle.length, secondTitle.length);

  return tokenScore * 0.75 + lengthScore * 0.25;
}

function scorePlatform(game: Game, result: RawgSearchResult) {
  const rawgPlatforms = result.platforms?.map((entry) => entry.platform.name.toLowerCase()) ?? [];

  if (rawgPlatforms.length === 0) {
    return { points: 0, reason: '' };
  }

  const platform = game.platform.toLowerCase();
  const expectsPc = platform === 'pc' || platform === 'steam' || platform === 'steam deck';
  const hasPc = rawgPlatforms.some((rawgPlatform) => rawgPlatform.includes('pc'));

  if (expectsPc && hasPc) {
    return { points: 14, reason: 'platform similarity: match' };
  }

  if (rawgPlatforms.some((rawgPlatform) => rawgPlatform.includes(platform))) {
    return { points: 14, reason: 'platform similarity: match' };
  }

  return { points: -4, reason: 'platform similarity: unknown or different' };
}

function scoreReleaseYear(game: Game, result: RawgSearchResult) {
  const gameYear = getYear(game.released ?? null);
  const resultYear = getYear(result.released);

  if (!gameYear || !resultYear) {
    return { points: 0, reason: 'release year similarity: unavailable' };
  }

  if (gameYear === resultYear) {
    return { points: 14, reason: 'release year similarity: exact match' };
  }

  if (Math.abs(gameYear - resultYear) === 1) {
    return { points: 7, reason: 'release year similarity: near match' };
  }

  return { points: -8, reason: 'release year similarity: differs' };
}

function getYear(value: string | null) {
  if (!value) {
    return null;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}
