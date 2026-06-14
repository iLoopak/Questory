import type { PlatformQueueState } from './platformQueueStorage';
import type { IconName } from '../components/Icon';
import type { Game } from '../types/game';

export type QuestShelfAchievementId =
  | 'steam-veteran'
  | 'completionist'
  | 'collector'
  | 'retro-explorer'
  | 'achievement-hunter'
  | 'backlog-slayer'
  | 'curator'
  | 'platform-hopper'
  | 'handheld-hero'
  | 'playing-right-now'
  | 'metadata-master'
  | 'art-conservator'
  | 'queue-commander'
  | 'century-club';

export type QuestShelfAchievement = {
  id: QuestShelfAchievementId;
  title: string;
  icon: IconName;
  description: string;
  unlockCondition: string;
  priority: number;
  colorVariant: 'primary' | 'secondary' | 'mixed' | 'success';
  target?: number;
  getProgress: (games: Game[], queueState?: PlatformQueueState) => number;
};

export type QuestShelfAchievementProgress = QuestShelfAchievement & {
  current: number;
  isUnlocked: boolean;
  progressLabel: string;
};

const backlogSlayerTarget = 10;
const wishlistCuratorTarget = 25;
const platformHopperTarget = 5;
const handheldHeroTarget = 25;
const metadataMasterTarget = 100;
const artConservatorTarget = 100;
const queueCommanderTarget = 5;
const centuryClubTarget = 100;

export const questShelfAchievementRegistry: QuestShelfAchievement[] = [
  {
    id: 'steam-veteran',
    title: 'Steam Veteran',
    icon: 'steam',
    description: 'Your shelf includes games from Steam.',
    unlockCondition: 'Add at least one Steam game to your Library.',
    priority: 110,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.platform === 'Steam' || game.externalSource === 'steam' || typeof game.steamAppId === 'number')).length,
  },
  {
    id: 'completionist',
    title: 'Completionist',
    icon: 'check-circle',
    description: 'You have finished at least one game.',
    unlockCondition: 'Mark at least one Library game as Finished.',
    priority: 100,
    colorVariant: 'success',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && game.status === 'Finished').length,
  },
  {
    id: 'collector',
    title: 'Collector',
    icon: 'archive',
    description: 'Your QuestShelf library has grown into a collection.',
    unlockCondition: 'Keep 25 or more games in your Library.',
    priority: 90,
    colorVariant: 'mixed',
    target: 25,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library').length,
  },
  {
    id: 'retro-explorer',
    title: 'Retro Explorer',
    icon: 'joystick',
    description: 'Your shelf includes at least one retro platform.',
    unlockCondition: 'Add a Library game from a retro platform.',
    priority: 80,
    colorVariant: 'secondary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && isRetroPlatform(game.platform)).length,
  },
  {
    id: 'achievement-hunter',
    title: 'Achievement Hunter',
    icon: 'trophy',
    description: 'Steam achievement completion is actively tracked.',
    unlockCondition: 'Have at least one Steam game with achievement data.',
    priority: 70,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.steamAchievementsLastCheckedAt || (game.steamAchievementsTotal ?? 0) > 0 || typeof game.steamAchievementsPercent === 'number')).length,
  },
  {
    id: 'backlog-slayer',
    title: 'Backlog Slayer',
    icon: 'sword',
    description: 'Making progress through the queue.',
    unlockCondition: `Finish or drop ${backlogSlayerTarget} games from Quest Queue.`,
    priority: 60,
    colorVariant: 'success',
    target: backlogSlayerTarget,
    getProgress: (games, queueState) => {
      const queuedGameIds = new Set(queueState?.entries.map((entry) => entry.gameId) ?? []);
      return games.filter((game) => game.collectionType === 'library' && (game.status === 'Finished' || game.status === 'Dropped') && (queuedGameIds.has(game.id) || game.finishedAt || game.droppedAt)).length;
    },
  },
  {
    id: 'curator',
    title: 'Curator',
    icon: 'bookmark-pen',
    description: 'A carefully maintained wishlist.',
    unlockCondition: `Add ${wishlistCuratorTarget} games to your Wishlist.`,
    priority: 50,
    colorVariant: 'secondary',
    target: wishlistCuratorTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'wishlist').length,
  },
  {
    id: 'platform-hopper',
    title: 'Platform Hopper',
    icon: 'layers',
    description: 'Gaming across many systems.',
    unlockCondition: `Add games across at least ${platformHopperTarget} platforms.`,
    priority: 45,
    colorVariant: 'mixed',
    target: platformHopperTarget,
    getProgress: (games) => new Set(games.filter((game) => game.collectionType === 'library').map((game) => String(game.platform).trim()).filter(Boolean)).size,
  },
  {
    id: 'handheld-hero',
    title: 'Handheld Hero',
    icon: 'handheld',
    description: 'Built a significant handheld/retro collection.',
    unlockCondition: `Add ${handheldHeroTarget} games across retro or handheld platforms.`,
    priority: 44,
    colorVariant: 'secondary',
    target: handheldHeroTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && isRetroPlatform(game.platform)).length,
  },
  {
    id: 'playing-right-now',
    title: 'Playing Right Now',
    icon: 'play-circle',
    description: 'Actively gaming instead of collecting.',
    unlockCondition: 'Mark at least one Library game as Playing.',
    priority: 43,
    colorVariant: 'primary',
    target: 1,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && game.status === 'Playing').length,
  },
  {
    id: 'metadata-master',
    title: 'Metadata Master',
    icon: 'database-sparkles',
    description: 'A well-maintained collection.',
    unlockCondition: `Enrich metadata for ${metadataMasterTarget} Library games.`,
    priority: 42,
    colorVariant: 'mixed',
    target: metadataMasterTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && (game.metadataSource || game.metadataUpdatedAt || game.rawgId || game.hltbId)).length,
  },
  {
    id: 'art-conservator',
    title: 'Art Conservator',
    icon: 'image-frame',
    description: 'Artwork coverage is under control.',
    unlockCondition: `Assign artwork to ${artConservatorTarget} Library games.`,
    priority: 41,
    colorVariant: 'secondary',
    target: artConservatorTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library' && hasAssignedArtwork(game)).length,
  },
  {
    id: 'queue-commander',
    title: 'Queue Commander',
    icon: 'list-ordered',
    description: 'Quest Queue is actively managed.',
    unlockCondition: `Configure at least ${queueCommanderTarget} queue platforms.`,
    priority: 40,
    colorVariant: 'primary',
    target: queueCommanderTarget,
    getProgress: (_games, queueState) => queueState?.activePlatforms.length ?? 0,
  },
  {
    id: 'century-club',
    title: 'Century Club',
    icon: 'badge-100',
    description: 'A major collection milestone.',
    unlockCondition: `Keep ${centuryClubTarget} games in your Library.`,
    priority: 39,
    colorVariant: 'mixed',
    target: centuryClubTarget,
    getProgress: (games) => games.filter((game) => game.collectionType === 'library').length,
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

  if (selectedActiveBadgeId) {
    const selectedAchievement = unlocked.find((achievement) => achievement.id === selectedActiveBadgeId);
    if (selectedAchievement) return selectedAchievement;
  }

  return unlocked[0] ?? null;
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

function hasAssignedArtwork(game: Game) {
  const coverImage = game.coverImage.trim();
  return Boolean(game.artworkSource || game.artworkUpdatedAt || (coverImage && !coverImage.startsWith('data:image/svg+xml')));
}
