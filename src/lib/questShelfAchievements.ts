import type { PlatformQueueState } from './platformQueueStorage';
import type { Game } from '../types/game';

export type QuestShelfAchievementId =
  | 'steam-veteran'
  | 'completionist'
  | 'collector'
  | 'retro-explorer'
  | 'backlog-slayer'
  | 'wishlist-curator'
  | 'achievement-hunter';

export type QuestShelfAchievement = {
  id: QuestShelfAchievementId;
  title: string;
  glyph: string;
  description: string;
  unlockCondition: string;
  priority: number;
  target?: number;
  getProgress: (games: Game[], queueState?: PlatformQueueState) => number;
};

export type QuestShelfAchievementProgress = QuestShelfAchievement & {
  current: number;
  isUnlocked: boolean;
  progressLabel: string;
};

const backlogSlayerTarget = 5;
const wishlistCuratorTarget = 5;

export const questShelfAchievementRegistry: QuestShelfAchievement[] = [
  {
    id: 'steam-veteran',
    title: 'Steam Veteran',
    glyph: '🎮',
    description: 'Your shelf includes games from Steam.',
    unlockCondition: 'Add at least one Steam game to your Library.',
    priority: 100,
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.platform === 'Steam' || game.externalSource === 'steam' || typeof game.steamAppId === 'number')).length,
  },
  {
    id: 'completionist',
    title: 'Completionist',
    glyph: '✅',
    description: 'You have finished at least one game.',
    unlockCondition: 'Mark at least one Library game as Finished.',
    priority: 90,
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && game.status === 'Finished').length,
  },
  {
    id: 'collector',
    title: 'Collector',
    glyph: '💎',
    description: 'Your QuestShelf library has grown into a collection.',
    unlockCondition: 'Keep 25 or more games in your Library.',
    priority: 80,
    target: 25,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library').length,
  },
  {
    id: 'retro-explorer',
    title: 'Retro Explorer',
    glyph: '👾',
    description: 'Your shelf includes at least one retro platform.',
    unlockCondition: 'Add a Library game from a retro platform.',
    priority: 70,
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && isRetroPlatform(game.platform)).length,
  },
  {
    id: 'backlog-slayer',
    title: 'Backlog Slayer',
    glyph: '☠️',
    description: 'You are clearing games from the backlog queue.',
    unlockCondition: `Finish or drop ${backlogSlayerTarget} queued Library games.`,
    priority: 60,
    target: backlogSlayerTarget,
    getProgress: (games, queueState) => {
      const queuedGameIds = new Set(queueState?.entries.map((entry) => entry.gameId) ?? []);
      return games.filter((game) => game.collectionType === 'library' && (game.status === 'Finished' || game.status === 'Dropped') && (queuedGameIds.has(game.id) || game.finishedAt || game.droppedAt)).length;
    },
  },
  {
    id: 'wishlist-curator',
    title: 'Wishlist Curator',
    glyph: '📝',
    description: 'You keep a deliberate wishlist for future quests.',
    unlockCondition: `Add ${wishlistCuratorTarget} games to your Wishlist.`,
    priority: 50,
    target: wishlistCuratorTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'wishlist').length,
  },
  {
    id: 'achievement-hunter',
    title: 'Achievement Hunter',
    glyph: '🏆',
    description: 'Steam achievement data is powering your shelf.',
    unlockCondition: 'Sync Steam achievement data or reach high achievement completion.',
    priority: 40,
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && ((game.steamAchievementsTotal ?? 0) > 0 || (game.steamAchievementsPercent ?? 0) >= 75)).length,
  },
];

export function getQuestShelfAchievements(games: Game[], queueState?: PlatformQueueState): QuestShelfAchievementProgress[] {
  return questShelfAchievementRegistry.map((achievement) => {
    const current = achievement.getProgress(games, queueState);
    const target = achievement.target ?? 1;
    const isUnlocked = current >= target;
    return {
      ...achievement,
      current,
      isUnlocked,
      progressLabel: isUnlocked ? 'Unlocked' : `${Math.min(current, target)} / ${target}`,
    };
  });
}

export function getActiveQuestShelfAchievement(games: Game[], selectedActiveBadgeId?: string, queueState?: PlatformQueueState) {
  const achievements = getQuestShelfAchievements(games, queueState);
  const unlocked = achievements.filter((achievement) => achievement.isUnlocked).sort((first, second) => second.priority - first.priority);
  return unlocked.find((achievement) => achievement.id === selectedActiveBadgeId) ?? unlocked[0] ?? null;
}

export function isQuestShelfAchievementId(value: unknown): value is QuestShelfAchievementId {
  return typeof value === 'string' && questShelfAchievementRegistry.some((achievement) => achievement.id === value);
}

export function getLegacyComputedShelfTitle(games: Game[]) {
  return getActiveQuestShelfAchievement(games)?.title ?? '';
}

function isRetroPlatform(platform: Game['platform']) {
  return ['PSP', 'PS2', 'PS1', 'PS Vita', 'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'NES', 'SNES', 'Nintendo 64', 'Nintendo DS', 'Wii', 'Wii U', 'GameCube', 'Sega Genesis / Mega Drive', 'Master System', 'Game Gear', 'PC Engine', 'GBA'].includes(String(platform));
}
