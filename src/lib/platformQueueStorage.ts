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
  accentColor?: string;
  artworkUrl?: string;
  maxActiveGames: number;
  platform: GamePlatform;
  platformTag?: string;
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

export const platformAccentPalette = [
  '#2563eb',
  '#dc2626',
  '#06b6d4',
  '#8b5cf6',
  '#22c55e',
  '#f97316',
  '#e11d48',
  '#14b8a6',
] as const;

const defaultPlatformAccentColors = new Map<GamePlatform, string>([
  ['Steam', '#1b4b73'],
  ['Steam Deck', '#2563eb'],
  ['Switch', '#e60012'],
  ['Switch 2', '#e60012'],
  ['Retroid', '#8b5cf6'],
  ['Legion Go', '#06b6d4'],
  ['PC', '#22c55e'],
  ['PS5', '#2f6bff'],
  ['PS4', '#2f6bff'],
  ['Xbox Series X|S', '#107c10'],
  ['Android', '#3ddc84'],
]);

export const platformArtworkPresetOptions = ['Aurora', 'Grid', 'Glow'] as const;
export type PlatformArtworkPreset = (typeof platformArtworkPresetOptions)[number];

const defaultActiveGameLimit = 3;

const defaultActiveLimits = new Map<GamePlatform, number>([
  ['Steam', 4],
  ['Steam Deck', 4],
  ['Retroid', 4],
  ['Legion Go', 4],
  ['PC', 4],
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
  const savedSetting = getPlatformQueueSetting(state, platform);
  return savedSetting?.maxActiveGames ?? defaultActiveLimits.get(platform) ?? defaultActiveGameLimit;
}

export function getPlatformQueueSetting(state: PlatformQueueState, platform: GamePlatform) {
  return state.settings.find((setting) => setting.platform === platform);
}

export function getPlatformAccentColor(state: PlatformQueueState, platform: GamePlatform) {
  const savedColor = getPlatformQueueSetting(state, platform)?.accentColor;
  return isValidAccentColor(savedColor) ? savedColor : getDefaultPlatformAccentColor(platform);
}

export function getDefaultPlatformAccentColor(platform: GamePlatform) {
  return defaultPlatformAccentColors.get(platform) ?? platformAccentPalette[Math.abs(hashPlatformName(platform)) % platformAccentPalette.length];
}

export function getPlatformArtworkUrl(state: PlatformQueueState, platform: GamePlatform) {
  return getPlatformQueueSetting(state, platform)?.artworkUrl ?? '';
}

export function getPlatformTag(state: PlatformQueueState, platform: GamePlatform) {
  return getPlatformQueueSetting(state, platform)?.platformTag ?? '';
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

export function addGameToPlatformQueueTop(
  state: PlatformQueueState,
  game: Game,
  targetPlatform: GamePlatform,
  options: Partial<Pick<PlatformQueueEntry, 'queueNotes' | 'queuePriority'>> = {},
): PlatformQueueState {
  const existingEntry = state.entries.find((entry) => entry.gameId === game.id);
  const nextEntries = state.entries.filter((entry) => entry.gameId !== game.id);
  const entry: PlatformQueueEntry = {
    expectedCompletionDate: existingEntry?.expectedCompletionDate,
    estimatedPlaytime: game.averagePlaytime ?? game.expectedPlaytime ?? existingEntry?.estimatedPlaytime ?? null,
    gameId: game.id,
    queueNotes: options.queueNotes ?? existingEntry?.queueNotes ?? '',
    queuePosition: 0,
    queuePriority: options.queuePriority ?? existingEntry?.queuePriority ?? 'normal',
    queuedAt: existingEntry?.queuedAt ?? new Date().toISOString(),
    targetPlatform,
  };

  return normalizeQueuePositions({
    ...state,
    activePlatforms: state.activePlatforms.includes(targetPlatform) ? state.activePlatforms : [...state.activePlatforms, targetPlatform],
    entries: [entry, ...nextEntries],
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
  const boundedLimit = Math.max(1, Math.min(25, Math.round(maxActiveGames)));
  return upsertPlatformQueueSetting(state, platform, { maxActiveGames: boundedLimit });
}

export function updatePlatformQueueVisualSettings(
  state: PlatformQueueState,
  platform: GamePlatform,
  changes: Partial<Pick<PlatformQueueSettings, 'accentColor' | 'artworkUrl' | 'platformTag'>>,
): PlatformQueueState {
  return upsertPlatformQueueSetting(state, platform, changes);
}

export function createPlatformArtworkPreset(platform: GamePlatform, accentColor: string, preset: PlatformArtworkPreset) {
  const safePlatform = platform.replace(/[<&>"]/g, '');
  const pattern = preset === 'Grid' ? '<path d="M0 42H360M0 84H360M90 0V120M180 0V120M270 0V120" stroke="white" stroke-opacity="0.12" stroke-width="2"/>' : preset === 'Glow' ? '<circle cx="280" cy="35" r="110" fill="white" fill-opacity="0.16"/>' : '<path d="M0 95C80 40 140 150 230 55C285 0 330 20 360 10V120H0Z" fill="white" fill-opacity="0.14"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120"><rect width="360" height="120" fill="${accentColor}"/><rect width="360" height="120" fill="url(#g)"/><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#020617" stop-opacity="0.15"/><stop offset="1" stop-color="#020617" stop-opacity="0.65"/></linearGradient></defs>${pattern}<text x="18" y="74" fill="white" fill-opacity="0.9" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800">${safePlatform}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
    settings: settings.map(normalizeQueueSetting),
  });
}

function upsertPlatformQueueSetting(
  state: PlatformQueueState,
  platform: GamePlatform,
  changes: Partial<PlatformQueueSettings>,
): PlatformQueueState {
  const currentSetting = getPlatformQueueSetting(state, platform);
  const settings = state.settings.filter((setting) => setting.platform !== platform);
  return normalizePlatformQueueState({
    ...state,
    settings: [
      ...settings,
      normalizeQueueSetting({
        maxActiveGames: defaultActiveLimits.get(platform) ?? defaultActiveGameLimit,
        ...currentSetting,
        ...changes,
        platform,
      }),
    ],
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

function normalizeQueueSetting(setting: PlatformQueueSettings): PlatformQueueSettings {
  return {
    accentColor: isValidAccentColor(setting.accentColor) ? setting.accentColor : undefined,
    artworkUrl: typeof setting.artworkUrl === 'string' && setting.artworkUrl.trim() ? setting.artworkUrl.trim() : undefined,
    maxActiveGames: Math.max(1, Math.min(25, Math.round(setting.maxActiveGames || defaultActiveLimits.get(setting.platform) || defaultActiveGameLimit))),
    platform: normalizePlatformName(setting.platform),
    platformTag: typeof setting.platformTag === 'string' && setting.platformTag.trim() ? setting.platformTag.trim() : undefined,
  };
}

function isValidAccentColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

function hashPlatformName(platform: GamePlatform) {
  return Array.from(platform).reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function isQueueSetting(value: unknown): value is PlatformQueueSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const setting = value as Partial<PlatformQueueSettings>;
  return typeof setting.platform === 'string' && typeof setting.maxActiveGames === 'number';
}
