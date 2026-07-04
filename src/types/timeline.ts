import type { SteamAchievement } from './game';

export interface AchievementTimelineEvent {
  id: string;
  type: 'achievement';
  timestamp: number; // Unix seconds
  gameId: string;
  gameSteamAppId?: number;
  gameTitle: string;
  achievement: SteamAchievement;
}

// Union type — extend with new event types here as features grow
export type TimelineEvent = AchievementTimelineEvent;

export type TimelineMonth = {
  year: number;
  month: number; // 0–11
  events: TimelineEvent[];
};

export type TimelineYear = {
  year: number;
  months: TimelineMonth[];
};
