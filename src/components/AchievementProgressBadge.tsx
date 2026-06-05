import type { Game } from '../types/game';
import { formatSteamAchievementSummary, hasSteamAchievementSummary } from '../lib/steamAchievementSummary';
import { useI18n } from '../i18n';

type AchievementProgressBadgeProps = {
  game: Pick<Game, 'steamAchievementsTotal' | 'steamAchievementsUnlocked' | 'steamAchievementsPercent'>;
  className?: string;
  showLabel?: boolean;
};

export function AchievementProgressBadge({ game, className = '', showLabel = false }: AchievementProgressBadgeProps) {
  const { t } = useI18n();

  if (!hasSteamAchievementSummary(game)) {
    return null;
  }

  const summary = formatSteamAchievementSummary(game);

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full border border-mint/25 bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint shadow-sm shadow-mint/5 dark:border-mint/25 dark:bg-mint/10 ${className}`}
      title={`${t('collection.achievements')} ${summary}`}
    >
      <span aria-hidden="true">🏆</span>
      <span>{showLabel ? `${t('collection.achievements')} ${summary}` : summary}</span>
    </span>
  );
}
