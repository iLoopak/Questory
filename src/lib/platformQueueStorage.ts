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
  activePlatforms: GamePlatform[];
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

export const suggestedQueuePlatforms: GamePlatform[] = [
  'Steam',
  'PS5',
  'Switch',
  'Switch 2',
  'Retroid',
  'Steam Deck',
  'Legion Go',
  'PC',
  'PS4',
  'Xbox Series X|S',
  'Android',
  'Other',
];

const defaultActiveLimits = new Map<GamePlatform, number>([
  ['PS5', 1],
  ['PS4', 1],
  ['Switch', 1],
  ['Switch 2', 1],
  ['Steam', 2],
  ['Steam Deck', 2],
  ['Retroid', 3],
  ['Legion Go', 2],
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
  activePlatforms: [],
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
      ...suggestedQueuePlatforms,
      ...games.map((game) => game.platform),
      ...state.entries.map((entry) => entry.targetPlatform),
      ...state.settings.map((setting) => setting.platform),
      ...state.activePlatforms,
    ]),
  ).sort((first, second) => first.localeCompare(second));
}

export function getActiveQueuePlatforms(state: PlatformQueueState): GamePlatform[] {
  return [...state.activePlatforms];
}

export function addActiveQueuePlatform(state: PlatformQueueState, platform: GamePlatform): PlatformQueueState {
  const normalizedPlatform = normalizePlatformName(platform);
  if (!normalizedPlatform || state.activePlatforms.includes(normalizedPlatform)) {
    return state;
  }

  return normalizePlatformQueueState({
    ...state,
    activePlatforms: [...state.activePlatforms, normalizedPlatform],
  });
}

export function hideQueuePlatform(state: PlatformQueueState, platform: GamePlatform): PlatformQueueState {
  return normalizePlatformQueueState({
    ...state,
    activePlatforms: state.activePlatforms.filter((activePlatform) => activePlatform !== platform),
  });
}

export function removeQueuePlatform(state: PlatformQueueState, platform: GamePlatform): PlatformQueueState {
  return normalizePlatformQueueState({
    ...state,
    activePlatforms: state.activePlatforms.filter((activePlatform) => activePlatform !== platform),
    entries: state.entries.filter((entry) => entry.targetPlatform !== platform),
    settings: state.settings.filter((setting) => setting.platform !== platform),
  });
}

export function renameQueuePlatform(state: PlatformQueueState, platform: GamePlatform, nextPlatform: GamePlatform): PlatformQueueState {
  const normalizedNextPlatform = normalizePlatformName(nextPlatform);
  if (!normalizedNextPlatform || normalizedNextPlatform === platform) {
    return state;
  }

  return normalizePlatformQueueState({
    ...state,
    activePlatforms: state.activePlatforms.map((activePlatform) => (activePlatform === platform ? normalizedNextPlatform : activePlatform)),
    entries: state.entries.map((entry) =>
      entry.targetPlatform === platform
        ? {
            ...entry,
            targetPlatform: normalizedNextPlatform,
          }
        : entry,
    ),
    settings: state.settings.map((setting) =>
      setting.platform === platform
        ? {
            ...setting,
            platform: normalizedNextPlatform,
          }
        : setting,
    ),
  });
}

export function moveQueuePlatform(state: PlatformQueueState, platform: GamePlatform, direction: 'up' | 'down'): PlatformQueueState {
  const currentIndex = state.activePlatforms.indexOf(platform);
  if (currentIndex < 0) {
    return state;
  }

  const nextIndex = direction === 'up' ? Math.max(0, currentIndex - 1) : Math.min(state.activePlatforms.length - 1, currentIndex + 1);
  if (nextIndex === currentIndex) {
    return state;
  }

  const activePlatforms = [...state.activePlatforms];
  const [activePlatform] = activePlatforms.splice(currentIndex, 1);
  activePlatforms.splice(nextIndex, 0, activePlatform);

  return normalizePlatformQueueState({
    ...state,
    activePlatforms,
  });
}

export function setActiveQueuePlatforms(state: PlatformQueueState, platforms: GamePlatform[]): PlatformQueueState {
  return normalizePlatformQueueState({
    ...state,
    activePlatforms: platforms,
  });
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
    activePlatforms: state.activePlatforms.includes(targetPlatform) ? state.activePlatforms : [...state.activePlatforms, targetPlatform],
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
    activePlatforms: state.activePlatforms.includes(targetPlatform) ? state.activePlatforms : [...state.activePlatforms, targetPlatform],
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
  const entries = Array.isArray(parsedState.entries) ? parsedState.entries.filter(isQueueEntry) : [];
  const settings = Array.isArray(parsedState.settings) ? parsedState.settings.filter(isQueueSetting) : [];
  const hasSavedActivePlatforms = Array.isArray(parsedState.activePlatforms);
  const activePlatforms = hasSavedActivePlatforms
    ? parsedState.activePlatforms?.filter((platform): platform is GamePlatform => typeof platform === 'string') ?? []
    : Array.from(new Set([...defaultQueuePlatforms, ...entries.map((entry) => entry.targetPlatform), ...settings.map((setting) => setting.platform)]));

  return normalizeQueuePositions({
    activePlatforms: normalizePlatformList(activePlatforms),
    entries,
    schemaVersion: platformQueueSchemaVersion,
    settings,
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
    activePlatforms: normalizePlatformList(state.activePlatforms),
    schemaVersion: platformQueueSchemaVersion,
    entries: Array.from(groupedEntries.entries()).flatMap(([, entries]) =>
      entries.sort(compareQueueEntries).map((entry, index) => ({
        ...entry,
        queuePosition: index + 1,
      })),
    ),
  };
}

function normalizePlatformList(platforms: GamePlatform[]): GamePlatform[] {
  return Array.from(new Set(platforms.map(normalizePlatformName).filter((platform): platform is GamePlatform => Boolean(platform))));
}

function normalizePlatformName(platform: GamePlatform) {
  return platform.trim() as GamePlatform;
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
