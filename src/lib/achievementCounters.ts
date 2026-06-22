import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.achievementCounters.v1';

export type PlayingStreak = {
  gameId: string;
  since: string;
};

export type AchievementCounters = {
  activeDays: string[];
  nightOwlUnlocked: boolean;
  earlyBirdUnlocked: boolean;
  justBrowsingOpens: number;
  backupExportedEver: boolean;
  backupImportedEver: boolean;
  questRunnerRuns: number;
  questRunnerObstaclesDodged: number;
  questRunnerBestScore: number;
  questRunnerShardsCollected: number;
  libraryFirstCreatedAt: string | null;
  playingStreak: PlayingStreak | null;
};

const defaultCounters: AchievementCounters = {
  activeDays: [],
  nightOwlUnlocked: false,
  earlyBirdUnlocked: false,
  justBrowsingOpens: 0,
  backupExportedEver: false,
  backupImportedEver: false,
  questRunnerRuns: 0,
  questRunnerObstaclesDodged: 0,
  questRunnerBestScore: 0,
  questRunnerShardsCollected: 0,
  libraryFirstCreatedAt: null,
  playingStreak: null,
};

export function loadAchievementCounters(): AchievementCounters {
  return loadLocalJson(STORAGE_KEY, defaultCounters, normalizeAchievementCounters);
}

export function saveAchievementCounters(counters: AchievementCounters): void {
  savePersistedJson(STORAGE_KEY, counters);
}

export function normalizeAchievementCounters(value: unknown): AchievementCounters {
  const v = value && typeof value === 'object' ? (value as Partial<AchievementCounters>) : {};

  let playingStreak: PlayingStreak | null = null;
  const raw = v.playingStreak;
  if (raw && typeof raw === 'object') {
    const { gameId, since } = raw as Partial<PlayingStreak>;
    if (typeof gameId === 'string' && typeof since === 'string') {
      playingStreak = { gameId, since };
    }
  }

  return {
    activeDays: Array.isArray(v.activeDays)
      ? v.activeDays.filter((d): d is string => typeof d === 'string')
      : [],
    nightOwlUnlocked: Boolean(v.nightOwlUnlocked),
    earlyBirdUnlocked: Boolean(v.earlyBirdUnlocked),
    justBrowsingOpens: toNonNegInt(v.justBrowsingOpens),
    backupExportedEver: Boolean(v.backupExportedEver),
    backupImportedEver: Boolean(v.backupImportedEver),
    questRunnerRuns: toNonNegInt(v.questRunnerRuns),
    questRunnerObstaclesDodged: toNonNegInt(v.questRunnerObstaclesDodged),
    questRunnerBestScore: toNonNegInt(v.questRunnerBestScore),
    questRunnerShardsCollected: toNonNegInt(v.questRunnerShardsCollected),
    libraryFirstCreatedAt:
      typeof v.libraryFirstCreatedAt === 'string' ? v.libraryFirstCreatedAt : null,
    playingStreak,
  };
}

function toNonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}
