import type { Game } from '../types/game';
import type { RawgSearchResult } from '../types/rawg';

export type RawgMatchScore = {
  confidence: number;
  reasons: string[];
  result: RawgSearchResult;
};

const highConfidenceThreshold = 82;

export function getHighConfidenceThreshold() {
  return highConfidenceThreshold;
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
    confidence += 58;
    reasons.push('exact title');
  } else {
    const similarity = titleSimilarity(normalizedGameTitle, normalizedResultTitle);
    confidence += Math.round(similarity * 48);

    if (similarity >= 0.74) {
      reasons.push('similar title');
    }
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

function normalizeTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(complete|definitive|deluxe|edition|goty|remastered|remake)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
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
    return { points: 14, reason: 'platform match' };
  }

  if (rawgPlatforms.some((rawgPlatform) => rawgPlatform.includes(platform))) {
    return { points: 14, reason: 'platform match' };
  }

  return { points: 0, reason: '' };
}

function scoreReleaseYear(game: Game, result: RawgSearchResult) {
  const gameYear = getYear(game.released ?? null);
  const resultYear = getYear(result.released);

  if (!gameYear || !resultYear) {
    return { points: 0, reason: '' };
  }

  if (gameYear === resultYear) {
    return { points: 14, reason: 'release year match' };
  }

  if (Math.abs(gameYear - resultYear) === 1) {
    return { points: 7, reason: 'near release year' };
  }

  return { points: -8, reason: 'release year differs' };
}

function getYear(value: string | null) {
  if (!value) {
    return null;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}
