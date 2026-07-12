import type { Game, GamePlatform } from '../types/game';
import { loadLocalJson, savePersistedJson } from './localPersistence';
import { getStorageAdapter } from './storageAdapter';
import { resolveDefaultPlatformArtwork } from './platformArtwork';

const STORAGE_KEY = 'questshelf.platformQueues.v1';
const platformQueueSchemaVersion = 2;

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

export type PersistedPlatformPlanItem = {
  expectedCompletionDate?: string;
  estimatedPlaytime?: number | null;
  gameId: string;
  queueNotes?: string;
  queuePriority?: QueuePriority;
  queuedAt?: string;
};

export type PersistedPlatformPlan = {
  gameIds: string[];
  id: string;
  items?: PersistedPlatformPlanItem[];
  platform: GamePlatform;
};

export type PersistedPlatformQueueState = {
  activePlatforms: GamePlatform[];
  plans: PersistedPlatformPlan[];
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

export const platformArtworkPresetOptions = [
  'Aurora',
  'Grid',
  'Glow',
  'Waves',
  'Neon',
  'Stars',
  'Circuit',
  'Horizon',
  'Pixel',
  'Rings',
  'Diagonal',
] as const;
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
  const state = loadLocalJson(STORAGE_KEY, emptyQueueState, normalizePlatformQueueState);
  migrateLegacyPlatformQueueStorage(state);
  return state;
}

export function savePlatformQueueState(state: PlatformQueueState) {
  savePersistedJson(STORAGE_KEY, serializePlatformQueueState(state));
}

export function normalizePlatformQueuePersistedState(value: unknown): PersistedPlatformQueueState {
  return serializePlatformQueueState(normalizePlatformQueueState(value));
}

export function serializePlatformQueueState(state: PlatformQueueState): PersistedPlatformQueueState {
  const normalized = normalizePlatformQueueState(state);
  const groupedEntries = new Map<GamePlatform, PlatformQueueEntry[]>();

  normalized.entries.forEach((entry) => {
    const entries = groupedEntries.get(entry.targetPlatform) ?? [];
    entries.push(entry);
    groupedEntries.set(entry.targetPlatform, entries);
  });

  return {
    activePlatforms: normalized.activePlatforms,
    plans: Array.from(groupedEntries.entries()).map(([platform, entries]) => ({
      gameIds: [...entries].sort(compareQueueEntries).map((entry) => entry.gameId),
      id: getPlatformPlanId(platform),
      items: [...entries].sort(compareQueueEntries).map((entry) => ({
        expectedCompletionDate: entry.expectedCompletionDate,
        estimatedPlaytime: entry.estimatedPlaytime,
        gameId: entry.gameId,
        queueNotes: entry.queueNotes || undefined,
        queuePriority: entry.queuePriority === 'normal' ? undefined : entry.queuePriority,
        queuedAt: entry.queuedAt,
      })),
      platform,
    })),
    schemaVersion: platformQueueSchemaVersion,
    settings: normalized.settings,
  };
}


function migrateLegacyPlatformQueueStorage(state: PlatformQueueState) {
  const storedValue = getStorageAdapter().readLocal(STORAGE_KEY);
  if (!storedValue) {
    return;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<PlatformQueueState> & Partial<PersistedPlatformQueueState>;
    if (!Array.isArray(parsedValue.entries) || Array.isArray(parsedValue.plans)) {
      return;
    }

    const persistedState = serializePlatformQueueState(state);
    savePersistedJson(STORAGE_KEY, persistedState);

    const verifiedValue = getStorageAdapter().readLocal(STORAGE_KEY);
    if (!verifiedValue) {
      return;
    }
    normalizePlatformQueueState(JSON.parse(verifiedValue));
  } catch {
    // Leave the existing payload untouched so the migration can retry on a later load/write.
  }
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
  return getPlatformQueueSetting(state, platform)?.artworkUrl ?? resolveDefaultPlatformArtwork(platform) ?? '';
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
  const existingEntry = findPlatformQueueEntry(state.entries, game.id, targetPlatform);
  const nextEntries = state.entries.filter((entry) => !isSamePlatformPlanEntry(entry, game.id, targetPlatform));
  const targetEntries = nextEntries.filter((entry) => entry.targetPlatform === targetPlatform);
  const entry: PlatformQueueEntry = {
    expectedCompletionDate: existingEntry?.expectedCompletionDate,
    estimatedPlaytime: game.expectedPlaytime ?? existingEntry?.estimatedPlaytime ?? null,
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
  const existingEntry = findPlatformQueueEntry(state.entries, game.id, targetPlatform);
  const nextEntries = state.entries.filter((entry) => !isSamePlatformPlanEntry(entry, game.id, targetPlatform));
  const entry: PlatformQueueEntry = {
    expectedCompletionDate: existingEntry?.expectedCompletionDate,
    estimatedPlaytime: game.expectedPlaytime ?? existingEntry?.estimatedPlaytime ?? null,
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

/**
 * Put a previously removed entry back, keeping the position it held (AS-04 undo).
 *
 * Unlike `addGameToPlatformQueue` this does not mint a new entry: the before-image is reinserted
 * as it was, notes, priority and `queuedAt` included, and the surrounding entries renumber around
 * its old position.
 */
export function restorePlatformQueueEntry(state: PlatformQueueState, entry: PlatformQueueEntry): PlatformQueueState {
  const otherEntries = state.entries.filter(
    (currentEntry) => !isSamePlatformPlanEntry(currentEntry, entry.gameId, entry.targetPlatform),
  );

  // The restored entry goes first so that when it ties with the entry that took its place (the
  // rest shifted up when it was removed), it sorts back into its old slot rather than behind it.
  return normalizeQueuePositions({
    ...state,
    activePlatforms: state.activePlatforms.includes(entry.targetPlatform)
      ? state.activePlatforms
      : [...state.activePlatforms, entry.targetPlatform],
    entries: [entry, ...otherEntries],
  });
}

export function removeGameFromPlatformQueue(state: PlatformQueueState, gameId: string, targetPlatform?: GamePlatform): PlatformQueueState {
  return normalizeQueuePositions({
    ...state,
    entries: state.entries.filter((entry) => !isSamePlatformPlanEntry(entry, gameId, targetPlatform)),
  });
}

export function removeCurrentlyPlayingFromPlatformQueue(state: PlatformQueueState, games: Game[]): PlatformQueueState {
  const playingGamePlatforms = getCurrentlyPlayingPlatformKeys(games);

  if (playingGamePlatforms.size === 0) {
    return normalizePlatformQueueState(state);
  }

  return normalizeQueuePositions({
    ...state,
    entries: state.entries.filter((entry) => !playingGamePlatforms.has(getPlatformPlanEntryKey(entry.gameId, entry.targetPlatform))),
  });
}

/**
 * The Plan entries a user can actually see and act on.
 *
 * AS-07: an entry whose `gameId` no longer resolves is an ORPHAN — deleting a game leaves its Plan
 * entry behind. Those entries used to be counted, summed and virtualized like any other, while the
 * row itself rendered `null`: a phantom count and a blank row. They are excluded here, at the one
 * selector every visible surface already goes through.
 *
 * They are NOT deleted. The persisted entry survives, so restoring or re-importing the game brings
 * its Plan position back, and `getOrphanedPlatformQueueEntries` can report them.
 */
export function getVisiblePlatformQueueEntries(state: PlatformQueueState, games: Game[]): PlatformQueueEntry[] {
  const playingGamePlatforms = getCurrentlyPlayingPlatformKeys(games);
  const knownGameIds = new Set(games.map((game) => game.id));

  return state.entries.filter(
    (entry) =>
      knownGameIds.has(entry.gameId) &&
      !playingGamePlatforms.has(getPlatformPlanEntryKey(entry.gameId, entry.targetPlatform)),
  );
}

/** Persisted Plan entries whose game no longer exists. Kept for recovery, reported for diagnostics. */
export function getOrphanedPlatformQueueEntries(state: PlatformQueueState, games: Game[]): PlatformQueueEntry[] {
  const knownGameIds = new Set(games.map((game) => game.id));
  return state.entries.filter((entry) => !knownGameIds.has(entry.gameId));
}

/** Entry counts for diagnostics: what is persisted, what is visible, and what is dangling. */
export function getPlatformQueueEntryCounts(state: PlatformQueueState, games: Game[]) {
  const visible = getVisiblePlatformQueueEntries(state, games).length;
  const orphaned = getOrphanedPlatformQueueEntries(state, games).length;

  return { persisted: state.entries.length, visible, orphaned };
}

export function moveQueueEntry(state: PlatformQueueState, gameId: string, direction: 'top' | 'up' | 'down', targetPlatform?: GamePlatform): PlatformQueueState {
  const entry = state.entries.find((queueEntry) => isSamePlatformPlanEntry(queueEntry, gameId, targetPlatform));
  if (!entry) {
    return state;
  }

  const platformEntries = state.entries
    .filter((queueEntry) => queueEntry.targetPlatform === entry.targetPlatform)
    .sort(compareQueueEntries);
  const currentIndex = platformEntries.findIndex((queueEntry) => queueEntry === entry);

  if (currentIndex < 0) {
    return state;
  }

  const nextPlatformEntries = [...platformEntries];
  const [targetEntry] = nextPlatformEntries.splice(currentIndex, 1);
  const nextIndex =
    direction === 'top' ? 0 : direction === 'up' ? Math.max(0, currentIndex - 1) : Math.min(nextPlatformEntries.length, currentIndex + 1);

  if (nextIndex === currentIndex) {
    return state;
  }

  nextPlatformEntries.splice(nextIndex, 0, targetEntry);

  const reorderedPlatformEntries = nextPlatformEntries.map((queueEntry, index) => ({
    ...queueEntry,
    queuePosition: index + 1,
  }));
  const otherEntries = state.entries.filter((queueEntry) => queueEntry.targetPlatform !== entry.targetPlatform);

  return normalizeQueuePositions({
    ...state,
    entries: [...otherEntries, ...reorderedPlatformEntries],
  });
}

export function moveQueueEntryToPlatform(
  state: PlatformQueueState,
  gameId: string,
  targetPlatform: GamePlatform,
  sourcePlatform?: GamePlatform,
): PlatformQueueState {
  const entry = state.entries.find((queueEntry) => isSamePlatformPlanEntry(queueEntry, gameId, sourcePlatform));
  if (!entry) {
    return state;
  }

  const nextEntries = state.entries
    .filter((queueEntry) => !isSamePlatformPlanEntry(queueEntry, gameId, targetPlatform))
    .map((queueEntry) =>
      queueEntry === entry
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

const platformArtworkPresetPatterns: Record<PlatformArtworkPreset, string> = {
  Aurora: '<path d="M0 95C80 40 140 150 230 55C285 0 330 20 360 10V120H0Z" fill="white" fill-opacity="0.14"/><path d="M0 42C64 6 126 67 184 34C249 -3 288 2 360 36" fill="none" stroke="white" stroke-opacity="0.16" stroke-width="10" stroke-linecap="round"/>',
  Grid: '<path d="M0 42H360M0 84H360M90 0V120M180 0V120M270 0V120" stroke="white" stroke-opacity="0.12" stroke-width="2"/><path d="M0 60H360M180 0V120" stroke="white" stroke-opacity="0.18" stroke-width="1"/>',
  Glow: '<circle cx="280" cy="35" r="110" fill="white" fill-opacity="0.16"/><circle cx="78" cy="100" r="72" fill="white" fill-opacity="0.08"/>',
  Waves: '<path d="M-12 78C28 54 58 54 98 78S168 102 208 78S278 54 318 78S388 102 428 78" fill="none" stroke="white" stroke-opacity="0.22" stroke-width="8"/><path d="M-12 101C28 77 58 77 98 101S168 125 208 101S278 77 318 101S388 125 428 101" fill="none" stroke="white" stroke-opacity="0.12" stroke-width="6"/>',
  Neon: '<path d="M36 98L122 30L185 72L276 18L334 50" fill="none" stroke="white" stroke-opacity="0.34" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 98L122 30L185 72L276 18L334 50" fill="none" stroke="white" stroke-opacity="0.16" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>',
  Stars: '<g fill="white" fill-opacity="0.42"><circle cx="46" cy="24" r="2"/><circle cx="82" cy="88" r="1.6"/><circle cx="132" cy="42" r="1.8"/><circle cx="196" cy="24" r="1.4"/><circle cx="236" cy="84" r="2.2"/><circle cx="306" cy="46" r="1.7"/><circle cx="334" cy="96" r="1.3"/></g><path d="M280 18L286 29L298 31L289 39L291 51L280 45L269 51L271 39L262 31L274 29Z" fill="white" fill-opacity="0.16"/>',
  Circuit: '<path d="M18 94H82V66H148V36H236V74H342" fill="none" stroke="white" stroke-opacity="0.18" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><g fill="white" fill-opacity="0.24"><circle cx="82" cy="94" r="5"/><circle cx="148" cy="66" r="5"/><circle cx="236" cy="36" r="5"/><circle cx="342" cy="74" r="5"/></g>',
  Horizon: '<path d="M0 78H360V120H0Z" fill="#020617" fill-opacity="0.26"/><circle cx="286" cy="78" r="37" fill="white" fill-opacity="0.18"/><path d="M0 78H360" stroke="white" stroke-opacity="0.2" stroke-width="2"/><path d="M0 104C60 86 112 91 174 105C239 120 295 114 360 96" fill="none" stroke="white" stroke-opacity="0.15" stroke-width="5"/>',
  Pixel: '<path d="M248 18H270V40H248ZM292 18H314V40H292ZM270 40H292V62H270ZM226 62H248V84H226ZM314 62H336V84H314ZM270 84H292V106H270ZM58 26H74V42H58ZM90 58H106V74H90ZM42 82H58V98H42Z" fill="white" fill-opacity="0.16"/>',
  Rings: '<circle cx="282" cy="60" r="24" fill="none" stroke="white" stroke-opacity="0.26" stroke-width="5"/><circle cx="282" cy="60" r="46" fill="none" stroke="white" stroke-opacity="0.16" stroke-width="5"/><circle cx="282" cy="60" r="68" fill="none" stroke="white" stroke-opacity="0.09" stroke-width="5"/>',
  Diagonal: '<path d="M-28 126L88 10M28 134L144 18M84 142L200 26M140 150L256 34M196 158L312 42M252 166L368 50" stroke="white" stroke-opacity="0.16" stroke-width="10"/><path d="M-16 24L48 -40M286 148L396 38" stroke="white" stroke-opacity="0.1" stroke-width="22"/>',
};

function getSafePlatformArtworkAccentColor(accentColor: string) {
  return /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : '#2563eb';
}

export function createPlatformArtworkPreset(_platform: GamePlatform, accentColor: string, preset: PlatformArtworkPreset) {
  const safeAccentColor = getSafePlatformArtworkAccentColor(accentColor);
  const pattern = platformArtworkPresetPatterns[preset] ?? platformArtworkPresetPatterns.Aurora;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#020617" stop-opacity="0.15"/><stop offset="1" stop-color="#020617" stop-opacity="0.68"/></linearGradient><radialGradient id="v" cx="78%" cy="10%" r="75%"><stop stop-color="white" stop-opacity="0.16"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs><rect width="360" height="120" fill="${safeAccentColor}"/><rect width="360" height="120" fill="url(#v)"/><rect width="360" height="120" fill="url(#g)"/>${pattern}<rect width="360" height="120" fill="#020617" fill-opacity="0.08"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function getQueueSummary(state: PlatformQueueState, games: Game[]): PlatformQueueSummary {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const visibleEntries = getVisiblePlatformQueueEntries(state, games);
  const now = Date.now();
  const ageDays = visibleEntries.map((entry) => Math.max(0, Math.round((now - new Date(entry.queuedAt).getTime()) / 86400000)));
  const platformCounts = new Map<GamePlatform, number>();

  visibleEntries.forEach((entry) => {
    platformCounts.set(entry.targetPlatform, (platformCounts.get(entry.targetPlatform) ?? 0) + 1);
  });

  return {
    averageQueueAgeDays: ageDays.length > 0 ? Math.round(ageDays.reduce((sum, age) => sum + age, 0) / ageDays.length) : 0,
    estimatedBacklogHours: visibleEntries.reduce((sum, entry) => {
      const game = gamesById.get(entry.gameId);
      return sum + (entry.estimatedPlaytime ?? game?.expectedPlaytime ?? 0);
    }, 0),
    platformSizes: Array.from(platformCounts.entries())
      .map(([platform, count]) => ({ count, platform }))
      .sort((first, second) => second.count - first.count || first.platform.localeCompare(second.platform)),
    queuedCount: visibleEntries.length,
  };
}

export function compareQueueEntries(first: PlatformQueueEntry, second: PlatformQueueEntry) {
  return first.queuePosition - second.queuePosition || first.queuedAt.localeCompare(second.queuedAt);
}

export function normalizePlatformQueueState(value: unknown): PlatformQueueState {
  const parsedState = value && typeof value === 'object' ? (value as Partial<PlatformQueueState> & Partial<PersistedPlatformQueueState>) : {};
  const entries = Array.isArray(parsedState.entries)
    ? parsedState.entries.filter(isQueueEntry)
    : Array.isArray(parsedState.plans)
      ? entriesFromPersistedPlans(parsedState.plans)
      : [];
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


function entriesFromPersistedPlans(plans: PersistedPlatformPlan[]): PlatformQueueEntry[] {
  return plans.flatMap((plan) => {
    if (!plan || typeof plan !== 'object' || typeof plan.platform !== 'string' || !Array.isArray(plan.gameIds)) {
      return [];
    }

    const platform = normalizePlatformName(plan.platform);
    const itemsByGameId = new Map(
      (Array.isArray(plan.items) ? plan.items : [])
        .filter((item): item is PersistedPlatformPlanItem => Boolean(item) && typeof item === 'object' && typeof item.gameId === 'string')
        .map((item) => [item.gameId.trim(), item]),
    );

    return plan.gameIds
      .filter((gameId): gameId is string => typeof gameId === 'string' && Boolean(gameId.trim()))
      .map((gameId, index) => {
        const normalizedGameId = gameId.trim();
        const item = itemsByGameId.get(normalizedGameId);
        return {
          expectedCompletionDate: typeof item?.expectedCompletionDate === 'string' ? item.expectedCompletionDate : undefined,
          estimatedPlaytime: typeof item?.estimatedPlaytime === 'number' ? item.estimatedPlaytime : item?.estimatedPlaytime === null ? null : null,
          gameId: normalizedGameId,
          queueNotes: typeof item?.queueNotes === 'string' ? item.queueNotes : '',
          queuePosition: index + 1,
          queuePriority: isQueuePriority(item?.queuePriority) ? item.queuePriority : 'normal',
          queuedAt: typeof item?.queuedAt === 'string' ? item.queuedAt : new Date(0).toISOString(),
          targetPlatform: platform,
        } satisfies PlatformQueueEntry;
      });
  });
}

function getPlatformPlanId(platform: GamePlatform) {
  return `platform:${normalizePlatformName(platform).toLowerCase()}`;
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

  dedupePlatformQueueEntries(state.entries).forEach((entry) => {
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


function dedupePlatformQueueEntries(entries: PlatformQueueEntry[]): PlatformQueueEntry[] {
  const canonicalEntries = new Map<string, PlatformQueueEntry>();

  entries.forEach((entry) => {
    const normalizedEntry = {
      ...entry,
      gameId: entry.gameId.trim(),
      targetPlatform: normalizePlatformName(entry.targetPlatform),
    };
    const entryKey = getPlatformPlanEntryKey(normalizedEntry.gameId, normalizedEntry.targetPlatform);
    const currentEntry = canonicalEntries.get(entryKey);

    canonicalEntries.set(entryKey, currentEntry ? mergePlatformQueueEntries(currentEntry, normalizedEntry) : normalizedEntry);
  });

  return Array.from(canonicalEntries.values());
}

function mergePlatformQueueEntries(currentEntry: PlatformQueueEntry, duplicateEntry: PlatformQueueEntry): PlatformQueueEntry {
  const firstEntry = compareQueueEntries(currentEntry, duplicateEntry) <= 0 ? currentEntry : duplicateEntry;
  const secondEntry = firstEntry === currentEntry ? duplicateEntry : currentEntry;

  return {
    ...firstEntry,
    expectedCompletionDate: firstEntry.expectedCompletionDate ?? secondEntry.expectedCompletionDate,
    estimatedPlaytime: firstEntry.estimatedPlaytime ?? secondEntry.estimatedPlaytime ?? null,
    queueNotes: firstEntry.queueNotes || secondEntry.queueNotes || '',
    queuePriority: firstEntry.queuePriority === 'normal' ? secondEntry.queuePriority : firstEntry.queuePriority,
    queuedAt: firstEntry.queuedAt <= secondEntry.queuedAt ? firstEntry.queuedAt : secondEntry.queuedAt,
  };
}

function findPlatformQueueEntry(entries: PlatformQueueEntry[], gameId: string, targetPlatform?: GamePlatform) {
  return entries.find((entry) => isSamePlatformPlanEntry(entry, gameId, targetPlatform));
}

function isSamePlatformPlanEntry(entry: PlatformQueueEntry, gameId: string, targetPlatform?: GamePlatform) {
  if (entry.gameId !== gameId) {
    return false;
  }

  return targetPlatform ? normalizePlatformName(entry.targetPlatform) === normalizePlatformName(targetPlatform) : true;
}

function getPlatformPlanEntryKey(gameId: string, targetPlatform: GamePlatform) {
  return `${gameId}::${normalizePlatformName(targetPlatform).toLowerCase()}`;
}

function getCurrentlyPlayingPlatformKeys(games: Game[]) {
  return new Set(
    games
      .filter((game) => game.status === 'Playing')
      .map((game) => getPlatformPlanEntryKey(game.id.trim(), game.platform)),
  );
}

function normalizePlatformList(platforms: GamePlatform[]): GamePlatform[] {
  return Array.from(new Set(platforms.map(normalizePlatformName).filter((platform): platform is GamePlatform => Boolean(platform))));
}

function normalizePlatformName(platform: GamePlatform) {
  return platform.trim() as GamePlatform;
}

function isQueuePriority(value: unknown): value is QueuePriority {
  return typeof value === 'string' && queuePriorityOptions.includes(value as QueuePriority);
}

function isQueueEntry(value: unknown): value is PlatformQueueEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<PlatformQueueEntry>;
  return typeof entry.gameId === 'string' && typeof entry.targetPlatform === 'string' && typeof entry.queuedAt === 'string';
}

function normalizeQueueSetting(setting: Partial<PlatformQueueSettings> & Pick<PlatformQueueSettings, 'platform'>): PlatformQueueSettings {
  const platform = normalizePlatformName(setting.platform);

  return {
    accentColor: isValidAccentColor(setting.accentColor) ? setting.accentColor : undefined,
    artworkUrl: normalizePlatformArtworkUrl(setting.artworkUrl),
    maxActiveGames: Math.max(1, Math.min(25, Math.round(setting.maxActiveGames || defaultActiveLimits.get(platform) || defaultActiveGameLimit))),
    platform,
    platformTag: typeof setting.platformTag === 'string' && setting.platformTag.trim() ? setting.platformTag.trim() : undefined,
  };
}

function normalizePlatformArtworkUrl(artworkUrl: unknown) {
  if (typeof artworkUrl !== 'string') {
    return undefined;
  }

  const trimmedArtworkUrl = artworkUrl.trim();
  if (!trimmedArtworkUrl || isTemporaryBrowserArtworkUrl(trimmedArtworkUrl)) {
    return undefined;
  }

  return trimmedArtworkUrl;
}

function isTemporaryBrowserArtworkUrl(artworkUrl: string) {
  return artworkUrl.startsWith('blob:') || artworkUrl.startsWith('filesystem:');
}

function isValidAccentColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

function hashPlatformName(platform: GamePlatform) {
  return Array.from(platform).reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function isQueueSetting(value: unknown): value is Partial<PlatformQueueSettings> & Pick<PlatformQueueSettings, 'platform'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const setting = value as Partial<PlatformQueueSettings>;
  return typeof setting.platform === 'string';
}
