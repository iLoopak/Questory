import type { IconName } from './icons';

/**
 * AS-22: the achievement the Queue Ghost celebrates. `useAchievementSystem` (a hook) had to import
 * this from the `QueueGhost` component to describe its own state; it is a domain contract, so it
 * lives outside the component that happens to render it. `QueueGhost` re-exports it.
 */
export type QueueGhostAchievement = {
  title: string;
  icon: IconName;
};
