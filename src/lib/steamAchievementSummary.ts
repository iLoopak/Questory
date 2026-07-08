import type { Game } from '../types/game';

type SteamAchievementSummaryFields = Pick<Game, 'steamAchievementsTotal' | 'steamAchievementsUnlocked' | 'steamAchievementsPercent'>;

export function hasSteamAchievementSummary(game: SteamAchievementSummaryFields) {
  return (
    typeof game.steamAchievementsTotal === 'number' &&
    game.steamAchievementsTotal > 0 &&
    typeof game.steamAchievementsUnlocked === 'number' &&
    typeof game.steamAchievementsPercent === 'number'
  );
}

export function formatSteamAchievementSummary(game: SteamAchievementSummaryFields) {
  if (!hasSteamAchievementSummary(game)) {
    return null;
  }

  return `${game.steamAchievementsUnlocked}/${game.steamAchievementsTotal} · ${game.steamAchievementsPercent}%`;
}
