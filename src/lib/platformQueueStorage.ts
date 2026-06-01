import type { Game, GamePlatform } from '../types/game';
import { loadLocalJson, savePersistedJson } from './localPersistence';

const STORAGE_KEY = 'questshelf.platformQueues.v1';
const platformQueueSchemaVersion = 1;

export const queuePriorityOptions = ['low', 'normal', 'high'] as const;
export type QueuePriority = (typeof queuePriorityOptions)[number];

export type PlatformQueueEntry = {
  expectedCompletionDate?: string;
  estimatedPlaytime?: number | null;
  gameId: string;
  queueNotes: string;
  queuePosition: number;
  queuePriority: QueuePriority;
  queuedAt: string;
  targetPlatform: GamePlatform;
};

export type PlatformQueueSettings = {
  maxActiveGames: number;
  platform: GamePlatform;
};

export type PlatformQueueState = {
  entries: PlatformQueueEntry[];
  schemaVersion: typeof platformQueueSchemaVersion;
  settings: PlatformQueueSettings[];
};

export type PlatformQueueSummary = {
  averageQueueAgeDays: number;
  estimatedBacklogHours: number;
  platformSizes: Array<{ count: number; platform: GamePlatform }>;
  queuedCount: number;
};

export const defaultQueuePlatforms: GamePlatform[] = [
  'Steam',
  'PC',
  'PS5',
  'PS4',
  'Switch',
  'Switch 2',
  'PSP',
  'PS Vita',
  'PS2',
  'PS1',
  'Wii',
  'Wii U',
  'GameCube',
  'Game Boy Advance',
  'Game Boy Color',
  'Game Boy',
  'SNES',
  'NES',
  'Nintendo 64',
  'Nintendo DS',
  'Sega Genesis / Mega Drive',
  'Master System',
  'Game Gear',
  'Other',
];

const defaultActiveLimits = new Map<GamePlatform, number>([
  ['PS5', 1],
  ['PS4', 1],
  ['Switch', 1],
  ['Switch 2', 1],
  ['Steam', 2],
  ['PC', 2],
  ['PSP', 3],
  ['PS Vita', 3],
  ['Game Boy Advance', 3],
  ['Game Boy Color', 3],
  ['Game Boy', 3],
  ['SNES', 3],
  ['NES', 3],
  ['Nintendo 64', 3],
  ['Nintendo DS', 3],
]);

const emptyQueueState: PlatformQueueState = {
  entries: [],
  schemaVersion: platformQueueSchemaVersion,
  settings: [],
};

export function loadPlatformQueueState(): PlatformQueueState {
  return loadLocalJson(STORAGE_KEY, emptyQueueState, normalizePlatformQueueState);
}

export function savePlatformQueueState(state: PlatformQueueState) {
  savePersistedJson(STORAGE_KEY, normalizePlatformQueueState(state));
}

export function getQueuePlatforms(games: Game[], state: PlatformQueueState): GamePlatform[] {
  return Array.from(
    new Set([
      ...defaultQueuePlatforms,
      ...games.map((game) => game.platform),
      ...state.entries.map((entry) => entry.targetPlatform),
      ...state.settings.map((setting) => setting.platform),
    ]),
  ).sort((first, second) => first.localeCompare(second));
}

export function getPlatformMaxActiveGames(state: PlatformQueueState, platform: GamePlatform) {
  const savedSetting = state.settings.find((setting) => setting.platform === platform);
  return savedSetting?.maxActiveGames ?? defaultActiveLimits.get(platform) ?? 2;
}

export function addGameToPlatformQueue(
  state: PlatformQueueState,
  game: Game,
  targetPlatform: GamePlatform,
  options: Partial<Pick<PlatformQueueEntry, 'queueNotes' | 'queuePriority'>> = {},
): PlatformQueueState {
  const existingEntry = state.entries.find((entry) => entry.gameId === game.id);
  const nextEntries = state.entries.filter((entry) => entry.gameId !== game.id);
  const targetEntries = nextEntries.filter((entry) => entry.targetPlatform === targetPlatform);
  const entry: PlatformQueueEntry = {
    expectedCompletionDate: existingEntry?.expectedCompletionDate,
    estimatedPlaytime: game.averagePlaytime ?? game.expectedPlaytime ?? existingEntry?.estimatedPlaytime ?? null,
    gameId: game.id,
    queueNotes: options.queueNotes ?? existingEntry?.queueNotes ?? '',
    queuePosition: targetEntries.length + 1,
    queuePriority: options.queuePriority ?? existingEntry?.queuePriority ?? 'normal',
    queuedAt: existingEntry?.queuedAt ?? new Date().toISOString(),
    targetPlatform,
  };

  return normalizeQueuePositions({
    ...state,
    entries: [...nextEntries, entry],
  });
}

export function removeGameFromPlatformQueue(state: PlatformQueueState, gameId: string): PlatformQueueState {
  return normalizeQueuePositions({
    ...state,
    entries: state.entries.filter((entry) => entry.gameId !== gameId),
  });
}

export function moveQueueEntry(state: PlatformQueueState, gameId: string, direction: 'top' | 'up' | 'down'): PlatformQueueState {
  const entry = state.entries.find((queueEntry) => queueEntry.gameId === gameId);
  if (!entry) {
    return state;
  }

  const platformEntries = state.entries
    .filter((queueEntry) => queueEntry.targetPlatform === entry.targetPlatform)
    .sort(compareQueueEntries);
  const currentIndex = platformEntries.findIndex((queueEntry) => queueEntry.gameId === gameId);

  if (currentIndex < 0) {
    return state;
  }

  const nextPlatformEntries = [...platformEntries];
  const [targetEntry] = nextPlatformEntries.splice(currentIndex, 1);
  const nextIndex =
    direction === 'top' ? 0 : direction === 'up' ? Math.max(0, currentIndex - 1) : Math.min(nextPlatformEntries.length, currentIndex + 1);
  nextPlatformEntries.splice(nextIndex, 0, targetEntry);

  const otherEntries = state.entries.filter((queueEntry) => queueEntry.targetPlatform !== entry.targetPlatform);

  return normalizeQueuePositions({
    ...state,
    entries: [...otherEntries, ...nextPlatformEntries],
  });
}

export function moveQueueEntryToPlatform(
  state: PlatformQueueState,
  gameId: string,
  targetPlatform: GamePlatform,
): PlatformQueueState {
  const entry = state.entries.find((queueEntry) => queueEntry.gameId === gameId);
  if (!entry) {
    return state;
  }

  const nextEntries = state.entries.map((queueEntry) =>
    queueEntry.gameId === gameId
      ? {
          ...queueEntry,
          targetPlatform,
        }
      : queueEntry,
  );

  return normalizeQueuePositions({
    ...state,
    entries: nextEntries,
  });
}

export function updatePlatformQueueSetting(
  state: PlatformQueueState,
  platform: GamePlatform,
  maxActiveGames: number,
): PlatformQueueState {
  const boundedLimit = Math.max(1, Math.min(10, Math.round(maxActiveGames)));
  const settings = state.settings.filter((setting) => setting.platform !== platform);

  return {
    ...state,
    schemaVersion: platformQueueSchemaVersion,
    settings: [...settings, { maxActiveGames: boundedLimit, platform }],
  };
}

export function getQueueSummary(state: PlatformQueueState, games: Game[]): PlatformQueueSummary {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const now = Date.now();
  const ageDays = state.entries.map((entry) => Math.max(0, Math.round((now - new Date(entry.queuedAt).getTime()) / 86400000)));
  const platformCounts = new Map<GamePlatform, number>();

  state.entries.forEach((entry) => {
    platformCounts.set(entry.targetPlatform, (platformCounts.get(entry.targetPlatform) ?? 0) + 1);
  });

  return {
    averageQueueAgeDays: ageDays.length > 0 ? Math.round(ageDays.reduce((sum, age) => sum + age, 0) / ageDays.length) : 0,
    estimatedBacklogHours: state.entries.reduce((sum, entry) => {
      const game = gamesById.get(entry.gameId);
      return sum + (entry.estimatedPlaytime ?? game?.averagePlaytime ?? game?.expectedPlaytime ?? 0);
    }, 0),
    platformSizes: Array.from(platformCounts.entries())
      .map(([platform, count]) => ({ count, platform }))
      .sort((first, second) => second.count - first.count || first.platform.localeCompare(second.platform)),
    queuedCount: state.entries.length,
  };
}

export function compareQueueEntries(first: PlatformQueueEntry, second: PlatformQueueEntry) {
  return first.queuePosition - second.queuePosition || first.queuedAt.localeCompare(second.queuedAt);
}

export function normalizePlatformQueueState(value: unknown): PlatformQueueState {
  const parsedState = value && typeof value === 'object' ? (value as Partial<PlatformQueueState>) : {};

  return normalizeQueuePositions({
    entries: Array.isArray(parsedState.entries) ? parsedState.entries.filter(isQueueEntry) : [],
    schemaVersion: platformQueueSchemaVersion,
    settings: Array.isArray(parsedState.settings) ? parsedState.settings.filter(isQueueSetting) : [],
  });
}

function normalizeQueuePositions(state: PlatformQueueState): PlatformQueueState {
  const groupedEntries = new Map<GamePlatform, PlatformQueueEntry[]>();

  state.entries.forEach((entry) => {
    const entries = groupedEntries.get(entry.targetPlatform) ?? [];
    entries.push(entry);
    groupedEntries.set(entry.targetPlatform, entries);
  });

  return {
    ...state,
    schemaVersion: platformQueueSchemaVersion,
    entries: Array.from(groupedEntries.entries()).flatMap(([, entries]) =>
      entries.sort(compareQueueEntries).map((entry, index) => ({
        ...entry,
        queuePosition: index + 1,
      })),
    ),
  };
}

function isQueueEntry(value: unknown): value is PlatformQueueEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<PlatformQueueEntry>;
  return typeof entry.gameId === 'string' && typeof entry.targetPlatform === 'string' && typeof entry.queuedAt === 'string';
}

function isQueueSetting(value: unknown): value is PlatformQueueSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const setting = value as Partial<PlatformQueueSettings>;
  return typeof setting.platform === 'string' && typeof setting.maxActiveGames === 'number';
}
