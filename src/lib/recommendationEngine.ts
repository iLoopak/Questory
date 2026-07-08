import type { Game, GamePlatform } from '../types/game';
import type { CollectionItem, LibraryGame, WishlistGame } from '../types/collectionItem';
import { getAchievementProgress, getMetadataSummary } from './gameSelectors';
import { getPrimaryHltbHours, hasHltbData } from './hltb';
import { hasSteamAchievementSummary } from './steamAchievementSummary';

export const availableTimeOptions = ['15 min', '30 min', '1 hour', 'long session'] as const;
export const moodOptions = ['brain off', 'story', 'grind', 'challenge', 'comfort'] as const;

export type AvailableTime = (typeof availableTimeOptions)[number];
export type RecommendationMood = (typeof moodOptions)[number];

export type RecommendationPreferences = {
  availableTime: AvailableTime;
  includeFinishedGames: boolean;
  includeWishlist: boolean;
  mood: RecommendationMood;
  preferredPlatform: GamePlatform | 'Any';
};

export type RecommendationCandidateSource = 'library' | 'wishlist' | 'platform-plan' | 'discovery';

export type RecommendationCandidate = {
  id: string;
  source: RecommendationCandidateSource;
  game: CollectionItem;
  title: string;
  platform: GamePlatform;
  status: Game['status'];
  tags: string[];
  genres: string[];
  playtimeHours: number;
  lastPlayedAt: string | null;
  metadataAvailable: boolean;
  achievementPercent?: number;
};

export type RecommendationResult = {
  confidence: number;
  game: Game;
  candidate: RecommendationCandidate;
  reasons: string[];
  score: number;
};

const moodKeywords: Record<RecommendationMood, string[]> = {
  'brain off': ['casual', 'cozy', 'relaxing', 'sandbox', 'arcade', 'simulation', 'open world'],
  story: ['story', 'narrative', 'adventure', 'rpg', 'singleplayer', 'atmospheric', 'choices matter'],
  grind: ['grind', 'loot', 'roguelike', 'roguelite', 'action', 'rpg', 'survival', 'crafting'],
  challenge: ['difficult', 'souls-like', 'strategy', 'tactical', 'competitive', 'precision', 'hardcore'],
  comfort: ['cozy', 'relaxing', 'family friendly', 'cute', 'wholesome', 'simulation', 'farming'],
};

const shortSessionKeywords = ['arcade', 'roguelike', 'roguelite', 'platformer', 'puzzle', 'casual'];
const longSessionKeywords = ['rpg', 'open world', 'strategy', 'simulation', 'survival', 'story'];

export function buildRecommendationCandidates(games: CollectionItem[], platformPlans?: unknown): RecommendationCandidate[] {
  void platformPlans;

  return games.map((game) => {
    const metadata = getMetadataSummary(game);
    const achievementProgress = getAchievementProgress(game, 'steam');

    return {
      id: game.id,
      source: game.collectionType,
      game,
      title: game.title,
      platform: game.platform,
      status: game.status,
      tags: [...game.tags, ...(game.rawgTags ?? [])],
      genres: metadata.genres,
      playtimeHours: game.playtimeHours,
      lastPlayedAt: game.lastPlayedAt,
      metadataAvailable: game.metadataSource === 'rawg',
      achievementPercent: achievementProgress.percent,
    };
  });
}

export function buildRecommendationCandidate(game: LibraryGame | WishlistGame): RecommendationCandidate {
  return buildRecommendationCandidates([game])[0];
}

export function getRecommendations(games: Game[], preferences: RecommendationPreferences): RecommendationResult[] {
  return buildRecommendationCandidates(games)
    .filter((candidate) => preferences.includeWishlist || candidate.source === 'library')
    .filter((candidate) => preferences.includeFinishedGames || candidate.status !== 'Finished')
    .map((candidate) => scoreRecommendationCandidate(candidate, preferences))
    .sort((first, second) => second.score - first.score);
}

export function scoreRecommendationCandidate(candidate: RecommendationCandidate, preferences: RecommendationPreferences): RecommendationResult {
  const game = candidate.game;
  const reasons: string[] = [];
  let score = 0;

  // Status is the strongest signal: continue what is already active, keep backlog viable, and avoid abandoned games.
  if (game.status === 'Playing') {
    score += 34;
    reasons.push('Already in progress');
  } else if (game.status === 'Want to play') {
    score += 18;
    reasons.push('Ready from your backlog');
  } else if (game.status === 'Paused') {
    score += 10;
    reasons.push('Paused but easy to resume');
  } else if (game.status === 'Finished') {
    score += preferences.includeFinishedGames ? 2 : -40;
    reasons.push(preferences.includeFinishedGames ? 'Finished but allowed' : 'Finished games are filtered down');
  } else if (game.status === 'Dropped') {
    score -= 32;
    reasons.push('Dropped games are heavily penalized');
  }

  // Recency favors games that have not been touched lately, while still allowing never-started games to surface.
  const daysSincePlayed = getDaysSincePlayed(candidate.lastPlayedAt);

  if (daysSincePlayed === null) {
    score += 8;
    reasons.push('Not started recently');
  } else if (daysSincePlayed >= 21) {
    score += 18;
    reasons.push('Not played in a while');
  } else if (daysSincePlayed >= 7) {
    score += 10;
    reasons.push('Fresh enough to revisit');
  } else {
    score -= 5;
    reasons.push('Played recently');
  }

  // Platform preference is a direct boost, with Steam Deck treated as compatible with Steam.
  if (preferences.preferredPlatform !== 'Any') {
    if (candidate.platform === preferences.preferredPlatform) {
      score += 18;
      reasons.push(`Matches ${preferences.preferredPlatform}`);
    } else if (preferences.preferredPlatform === 'Steam Deck' && candidate.platform === 'Steam') {
      score += 10;
      reasons.push('Steam library fits handheld play');
    } else {
      score -= 12;
      reasons.push(`Not on ${preferences.preferredPlatform}`);
    }
  }

  const keywordText = collectKeywords(game);
  const moodMatches = moodKeywords[preferences.mood].filter((keyword) => keywordText.includes(keyword));

  if (moodMatches.length > 0) {
    score += Math.min(24, moodMatches.length * 8);
    reasons.push(`Fits ${preferences.mood} mood`);
  }

  // Session fit combines explicit playtime metadata with broad genre/tag hints.
  const timeFit = scoreTimeFit(game, preferences.availableTime, keywordText);
  score += timeFit.points;

  if (timeFit.reason) {
    reasons.push(timeFit.reason);
  }


  const hltbNudge = scoreHltbFit(game);
  score += hltbNudge.points;

  if (hltbNudge.reason) {
    reasons.push(hltbNudge.reason);
  }

  const achievementNudge = scoreAchievementProgress(game);
  score += achievementNudge.points;

  if (achievementNudge.reason) {
    reasons.push(achievementNudge.reason);
  }

  // Missing metadata should not hide a game, but it lowers confidence in the recommendation.
  if (game.metadataSource !== 'rawg') {
    score -= 8;
    reasons.push('RAWG metadata is missing');
  }

  const confidence = Math.max(5, Math.min(98, Math.round(score)));

  return {
    confidence,
    game,
    candidate,
    reasons: reasons.slice(0, 5),
    score,
  };
}

export function scoreGame(game: Game, preferences: RecommendationPreferences): RecommendationResult {
  return scoreRecommendationCandidate(buildRecommendationCandidate(game as CollectionItem), preferences);
}


// HLTB is a light recommendation nudge only: completion estimates should help surface
// quick wins without dominating playtime, status, platform, and achievement signals.
function scoreHltbFit(game: Game) {
  if (!hasHltbData(game)) {
    return { points: 0, reason: null };
  }

  const mainHours = getPrimaryHltbHours(game);
  if (typeof mainHours !== 'number') {
    return { points: 0, reason: null };
  }

  if (game.playtimeHours > 0 && game.playtimeHours < mainHours) {
    const remainingHours = Math.max(0, mainHours - game.playtimeHours);
    const achievementPercent = game.steamAchievementsPercent ?? 0;

    if (achievementPercent >= 70 && remainingHours <= 5) {
      return { points: 7, reason: 'Near completion by achievements and HLTB time' };
    }

    return { points: 4, reason: 'Started and still within estimated length' };
  }

  if (mainHours < 10) {
    return { points: 5, reason: 'Short game from HLTB' };
  }

  if (mainHours >= 10 && mainHours <= 25) {
    return { points: 3, reason: 'Medium-length game from HLTB' };
  }

  return { points: 0, reason: null };
}

function scoreAchievementProgress(game: Game) {
  if (!hasSteamAchievementSummary(game)) {
    return { points: 0, reason: null };
  }

  const percent = game.steamAchievementsPercent ?? 0;

  if (percent >= 80 && percent < 100) {
    return { points: 6, reason: 'Close to achievement completion' };
  }

  if (game.playtimeHours >= 20 && percent > 0 && percent < 35) {
    return { points: 4, reason: 'Plenty played with achievements left' };
  }

  return { points: 0, reason: null };
}

function scoreTimeFit(game: Game, availableTime: AvailableTime, keywordText: string) {
  const averagePlaytime = getPrimaryHltbHours(game) ?? null;
  const hasShortSessionHint = shortSessionKeywords.some((keyword) => keywordText.includes(keyword));
  const hasLongSessionHint = longSessionKeywords.some((keyword) => keywordText.includes(keyword));

  if (availableTime === '15 min') {
    if (hasShortSessionHint) {
      return { points: 18, reason: 'Works for a quick session' };
    }

    if (averagePlaytime && averagePlaytime >= 30) {
      return { points: -10, reason: 'May want more time' };
    }

    return { points: 4, reason: 'Can fit a short check-in' };
  }

  if (availableTime === '30 min') {
    if (hasShortSessionHint || game.status === 'Playing') {
      return { points: 14, reason: 'Fits a short session' };
    }

    return { points: 6, reason: 'Reasonable for a half hour' };
  }

  if (availableTime === '1 hour') {
    if (hasLongSessionHint || game.status === 'Playing') {
      return { points: 14, reason: 'Good for a focused hour' };
    }

    return { points: 8, reason: 'Enough time to make progress' };
  }

  if (hasLongSessionHint || (averagePlaytime && averagePlaytime >= 12)) {
    return { points: 18, reason: 'Rewards a longer session' };
  }

  return { points: 6, reason: 'Still playable in a long session' };
}

function collectKeywords(game: Game) {
  return [...game.tags, ...(game.genres ?? []), ...(game.rawgTags ?? [])].join(' ').toLowerCase();
}

function getDaysSincePlayed(value: string | null) {
  if (!value) {
    return null;
  }

  const playedAt = new Date(value).getTime();

  if (!Number.isFinite(playedAt)) {
    return null;
  }

  const dayMs = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - playedAt) / dayMs);
}
