import type { Game } from '../types/game';

export function hasSteamAchievementSummary(
  game: Pick<Game, 'steamAchievementsTotal' | 'steamAchievementsUnlocked' | 'steamAchievementsPercent'>,
) {
  return (
    typeof game.steamAchievementsTotal === 'number' &&
    game.steamAchievementsTotal > 0 &&
    typeof game.steamAchievementsUnlocked === 'number' &&
    typeof game.steamAchievementsPercent === 'number'
  );
}

export function formatSteamAchievementSummary(
  game: Pick<Game, 'steamAchievementsTotal' | 'steamAchievementsUnlocked' | 'steamAchievementsPercent'>,
) {
  if (!hasSteamAchievementSummary(game)) {
    return null;
  }

  return `${game.steamAchievementsUnlocked}/${game.steamAchievementsTotal} · ${game.steamAchievementsPercent}%`;
}
