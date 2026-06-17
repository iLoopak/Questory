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
    .replace(/\((pc|steam deck|steam|nintendo switch|switch|playstation 5|ps5|playstation 4|ps4|playstation 3|ps3|playstation 2|ps2|playstation portable|psp|ps vita|ps1|playstation|xbox series x|xbox series s|xbox one|xbox 360|xbox|series x|series s|nintendo 3ds|3ds|nintendo ds|nintendo 64|n64|game boy advance|gba|game boy color|gbc|game boy|gamecube|wii u|wii|nes|snes|dreamcast|sega saturn|saturn|sega genesis|mega drive|genesis|windows|mac|linux)\)$/g, '')
    .replace(/\[(pc|steam deck|steam|nintendo switch|switch|playstation 5|ps5|playstation 4|ps4|playstation 3|ps3|playstation 2|ps2|playstation portable|psp|ps vita|ps1|playstation|xbox series x|xbox series s|xbox one|xbox 360|xbox|series x|series s|nintendo 3ds|3ds|nintendo ds|nintendo 64|n64|game boy advance|gba|game boy color|gbc|game boy|gamecube|wii u|wii|nes|snes|dreamcast|sega saturn|saturn|sega genesis|mega drive|genesis|windows|mac|linux)\]$/g, '')
    .replace(/\b(game of the year|goty)\b/g, '')
    .replace(/\b(definitive|deluxe|ultimate|complete|collector'?s?|enhanced|anniversary)\s+edition\b/g, '')
    .replace(/\b(remastered|remaster|remake|director'?s cut|hd|vr)\b/g, '')
    .replace(/\b(pc|steam deck|steam|nintendo switch|switch|playstation 5|ps5|playstation 4|ps4|playstation 3|ps3|playstation 2|ps2|playstation portable|psp|ps vita|ps1|playstation|xbox series x|xbox series s|xbox one|xbox 360|xbox|series x|series s|nintendo 3ds|3ds|nintendo ds|nintendo 64|n64|game boy advance|gba|game boy color|gbc|game boy|gamecube|wii u|wii|nes|snes|dreamcast|sega saturn|saturn|sega genesis|mega drive|genesis|windows|mac|linux)\b$/g, '')
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

function toPlatformKey(platform: string): string {
  switch (platform.toLowerCase().replace(/\s+/g, ' ').trim()) {
    case 'pc': case 'windows': case 'steam': case 'steam deck': return 'pc';
    case 'playstation': case 'playstation 1': case 'ps1': case 'psx': return 'ps';
    case 'playstation 2': case 'ps2': return 'ps2';
    case 'playstation 3': case 'ps3': return 'ps3';
    case 'playstation 4': case 'ps4': return 'ps4';
    case 'playstation 5': case 'ps5': return 'ps5';
    case 'psp': case 'playstation portable': return 'psp';
    case 'ps vita': case 'playstation vita': case 'vita': case 'psvita': return 'vita';
    case 'xbox': return 'xbox';
    case 'xbox 360': case 'x360': return 'xbox360';
    case 'xbox one': return 'xboxone';
    case 'xbox series x': case 'xbox series s': case 'xbox series x/s': case 'xbox series s/x': case 'series x': case 'series s': return 'xboxseries';
    case 'nintendo switch': case 'switch': return 'switch';
    case 'wii u': case 'wiiu': return 'wiiu';
    case 'wii': return 'wii';
    case 'gamecube': case 'nintendo gamecube': case 'gc': case 'ngc': return 'gamecube';
    case 'nintendo 64': case 'n64': return 'n64';
    case 'snes': case 'super nintendo': case 'super nes': case 'super famicom': return 'snes';
    case 'nes': case 'famicom': case 'nintendo entertainment system': return 'nes';
    case 'game boy advance': case 'gba': return 'gba';
    case 'game boy color': case 'gbc': return 'gbc';
    case 'game boy': case 'gameboy': case 'gb': return 'gb';
    case 'nintendo ds': case 'nds': case 'ds': return 'ds';
    case 'nintendo 3ds': case '3ds': return '3ds';
    case 'dreamcast': case 'sega dreamcast': return 'dreamcast';
    case 'genesis': case 'sega genesis': case 'mega drive': case 'sega mega drive': return 'genesis';
    case 'saturn': case 'sega saturn': return 'saturn';
    case 'mac': case 'macos': case 'apple mac': return 'mac';
    case 'linux': return 'linux';
    case 'ios': return 'ios';
    case 'android': return 'android';
    default: return platform.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}

function scorePlatform(game: Game, result: RawgSearchResult) {
  const rawgPlatforms = result.platforms?.map((entry) => toPlatformKey(entry.platform.name)) ?? [];

  if (rawgPlatforms.length === 0) {
    return { points: 0, reason: '' };
  }

  const gamePlatform = toPlatformKey(game.platform);

  if (rawgPlatforms.includes(gamePlatform)) {
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
