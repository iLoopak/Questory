import { Icon } from './Icon';
import type { QuestShelfAchievementProgress } from '../lib/questShelfAchievements';

type AchievementToolbarChipsProps = {
  activeAchievement?: QuestShelfAchievementProgress | null;
  onOpenAchievementSettings?: () => void;
};

export function AchievementToolbarChips({
  activeAchievement,
  onOpenAchievementSettings,
}: AchievementToolbarChipsProps) {
  if (!activeAchievement) {
    return null;
  }

  return (
    <div className="qs-toolbar-highlight-chips" aria-label="Toolbar highlights">
      {activeAchievement ? <ActiveAchievementToolbarChip achievement={activeAchievement} onClick={onOpenAchievementSettings} /> : null}
    </div>
  );
}

function ActiveAchievementToolbarChip({ achievement, onClick }: { achievement: QuestShelfAchievementProgress; onClick?: () => void }) {
  const content = (
    <>
      <span className="qs-achievement-chip__icon" aria-hidden="true">
        <Icon name={achievement.icon} size={15} strokeWidth={2.2} />
      </span>
      <span className="truncate">{achievement.title}</span>
    </>
  );
  const className = `qs-achievement-chip qs-achievement-chip--${achievement.colorVariant}`;

  if (!onClick) {
    return <span className={className} title={achievement.title}>{content}</span>;
  }

  return (
    <button className={className} onClick={onClick} title={`${achievement.title} - choose active badge`} type="button">
      {content}
    </button>
  );
}
